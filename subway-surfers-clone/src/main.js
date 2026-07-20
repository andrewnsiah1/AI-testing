import * as THREE from 'three';
import { Player } from './player.js';
import { World } from './world.js';
import { ObstacleManager } from './obstacles.js';
import { CoinManager } from './coins.js';
import { RunSession } from './session.js';
import { CATEGORIES, getServiceById, getRandomService } from './services.js';
import { fetchLaneQuiz, askAboutService } from './quizApi.js';
import { getDifficultyForScore } from './difficulty.js';
import { QuizGateManager } from './quizGates.js';

// Game state
let gameState = 'start'; // 'start', 'playing', 'over'
let score = 0;
let coins = 0;
let speed = 0.255;
const MAX_SPEED = 0.5;
const SPEED_INCREMENT = 0.00003;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 150);

// Camera — behind and above the player, looking forward (+Z)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, -10);
camera.lookAt(0, 1, 20);

// Renderer
const container = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 15, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);

// Educational run tracking
const session = new RunSession();

// Game objects
const player = new Player(scene);
const world = new World(scene);
const obstacleManager = new ObstacleManager(scene);
const coinManager = new CoinManager(scene, obstacleManager, (service) => {
  session.recordCollection(service.id);
});
const quizGateManager = new QuizGateManager(scene);

// In-run lane-quiz state
const LANE_QUIZ_MIN_INTERVAL_SCORE = 120; // min score gap between lane quizzes
const LANE_QUIZ_MAX_INTERVAL_SCORE = 220; // max score gap between lane quizzes
const LANE_QUIZ_CLEAR_DISTANCE = 25; // road ahead of the player must be free of obstacles this far
// 'idle' | 'loading' | 'waitingForGap' | 'active' | 'resolving' | 'resolving-answer'
let laneQuizState = 'idle';
let nextLaneQuizAt = LANE_QUIZ_MIN_INTERVAL_SCORE + Math.random() * (LANE_QUIZ_MAX_INTERVAL_SCORE - LANE_QUIZ_MIN_INTERVAL_SCORE);
let currentLaneQuiz = null; // { question, choices, correctIndex, fact, service }
let pendingLaneQuiz = null; // quiz data fetched and ready, waiting for a natural gap in traffic
let selectedLaneIndex = 1; // starts centered

// UI elements
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const gameOverEl = document.getElementById('game-over');
const startScreenEl = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');
const finalCoinsEl = document.getElementById('final-coins');
const loadingEl = document.getElementById('loading');
const continueBtn = document.getElementById('continue-btn');

const lessonScreenEl = document.getElementById('lesson-screen');
const lessonCardsEl = document.getElementById('lesson-cards');
const lessonContinueBtn = document.getElementById('lesson-continue-btn');

const summaryScreenEl = document.getElementById('summary-screen');
const summaryStatsEl = document.getElementById('summary-stats');
const summaryServicesEl = document.getElementById('summary-services');

const laneQuizLoadingEl = document.getElementById('lane-quiz-loading');
const laneQuizPopupEl = document.getElementById('lane-quiz-popup');
const laneQuizCategoryEl = document.getElementById('lane-quiz-category');
const laneQuizQuestionEl = document.getElementById('lane-quiz-question');
const laneQuizChoicesEl = document.getElementById('lane-quiz-choices');
const laneQuizResultEl = document.getElementById('lane-quiz-result');
const laneQuizResultTitleEl = document.getElementById('lane-quiz-result-title');
const laneQuizResultFactEl = document.getElementById('lane-quiz-result-fact');
const laneQuizResultHintEl = document.getElementById('lane-quiz-result-hint');

function renderServiceChips(container, serviceIds) {
  container.innerHTML = '';
  if (serviceIds.length === 0) {
    container.innerHTML = '<p style="opacity:0.6;font-size:14px;">No services collected this run.</p>';
    return;
  }
  for (const id of serviceIds) {
    const service = getServiceById(id);
    if (!service) continue;
    const chip = document.createElement('span');
    chip.className = 'service-chip';
    chip.textContent = service.name;
    chip.style.backgroundColor = `#${CATEGORIES[service.category].color.toString(16).padStart(6, '0')}`;
    container.appendChild(chip);
  }
}

// Builds a single lesson card with an expandable "learn more" panel
// (overview / analogy / practical use, fetched lazily on first expand)
// and a free-text question box scoped to that service.
function buildLessonCard(service) {
  const colorHex = `#${CATEGORIES[service.category].color.toString(16).padStart(6, '0')}`;

  const card = document.createElement('div');
  card.className = 'lesson-card';
  card.style.borderLeftColor = colorHex;

  const header = document.createElement('div');
  header.className = 'lesson-card-header';

  const name = document.createElement('span');
  name.className = 'lesson-card-name';
  name.textContent = service.name;

  const category = document.createElement('span');
  category.className = 'lesson-card-category';
  category.style.color = colorHex;
  category.textContent = CATEGORIES[service.category].label;

  header.appendChild(name);
  header.appendChild(category);

  const fact = document.createElement('div');
  fact.className = 'lesson-card-fact';
  fact.textContent = service.fact;

  const toggle = document.createElement('span');
  toggle.className = 'lesson-card-toggle';
  toggle.textContent = 'Learn more ▾';

  const details = document.createElement('div');
  details.className = 'lesson-card-details';

  const detailsContent = document.createElement('div');

  const sections = [
    ['Overview', service.overview],
    ['Real-Life Analogy', service.analogy],
    ['Practical Use', service.practicalUse],
  ];

  for (const [label, text] of sections) {
    if (!text) continue;
    const section = document.createElement('div');
    section.className = 'lesson-detail-section';

    const labelEl = document.createElement('div');
    labelEl.className = 'lesson-detail-label';
    labelEl.textContent = label;

    const textEl = document.createElement('div');
    textEl.className = 'lesson-detail-text';
    textEl.textContent = text;

    section.appendChild(labelEl);
    section.appendChild(textEl);
    detailsContent.appendChild(section);
  }

  details.appendChild(detailsContent);

  // Ask-a-question form
  const askForm = document.createElement('div');
  askForm.className = 'lesson-ask-form';

  const askInput = document.createElement('input');
  askInput.className = 'lesson-ask-input';
  askInput.type = 'text';
  askInput.placeholder = `Ask a question about ${service.name}...`;

  const askBtn = document.createElement('button');
  askBtn.className = 'lesson-ask-btn';
  askBtn.textContent = 'Ask';

  askForm.appendChild(askInput);
  askForm.appendChild(askBtn);
  details.appendChild(askForm);

  const answerEl = document.createElement('div');
  answerEl.className = 'lesson-ask-answer';
  answerEl.style.display = 'none';
  details.appendChild(answerEl);

  const conversationHistory = [];

  const submitQuestion = async () => {
    const question = askInput.value.trim();
    if (!question) return;

    askBtn.disabled = true;
    askInput.disabled = true;
    answerEl.style.display = 'block';
    answerEl.textContent = 'Thinking...';

    const answer = await askAboutService(service, question, conversationHistory);

    askBtn.disabled = false;
    askInput.disabled = false;

    if (answer) {
      conversationHistory.push({ role: 'user', content: question });
      conversationHistory.push({ role: 'assistant', content: answer });
      answerEl.textContent = answer;
      askInput.value = '';
    } else {
      answerEl.textContent = 'Could not get an answer right now. Try again in a moment.';
    }
  };

  askBtn.addEventListener('click', submitQuestion);
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitQuestion();
  });

  toggle.addEventListener('click', () => {
    const isOpen = details.classList.contains('open');
    details.classList.toggle('open', !isOpen);
    toggle.textContent = isOpen ? 'Learn more ▾' : 'Show less ▴';
  });

  card.appendChild(header);
  card.appendChild(fact);
  card.appendChild(toggle);
  card.appendChild(details);

  return card;
}

// Shows a lesson card for every unique service collected this run.
// This is the actual teaching moment — no time pressure, no scoring,
// just the facts before the quiz tests retention.
// Calls onDone() when the player continues past the lesson.
function showLesson(onDone) {
  const uniqueIds = session.getUniqueServiceIds();
  if (uniqueIds.length === 0) {
    onDone();
    return;
  }

  lessonCardsEl.innerHTML = '';
  for (const id of uniqueIds) {
    const service = getServiceById(id);
    if (!service) continue;
    lessonCardsEl.appendChild(buildLessonCard(service));
  }

  lessonScreenEl.style.display = 'flex';

  lessonContinueBtn.onclick = () => {
    lessonScreenEl.style.display = 'none';
    onDone();
  };
}

function showSummary() {
  const uniqueIds = session.getUniqueServiceIds();
  summaryStatsEl.textContent = `Score: ${Math.floor(score)} · Coins: ${coins} · Unique services discovered: ${uniqueIds.length}`;
  renderServiceChips(summaryServicesEl, uniqueIds);
  summaryScreenEl.style.display = 'flex';
}

const LANE_LABELS = ['LEFT', 'CENTER', 'RIGHT'];

function scheduleNextLaneQuiz(currentScore) {
  nextLaneQuizAt =
    currentScore +
    LANE_QUIZ_MIN_INTERVAL_SCORE +
    Math.random() * (LANE_QUIZ_MAX_INTERVAL_SCORE - LANE_QUIZ_MIN_INTERVAL_SCORE);
}

function renderLaneQuizChoices() {
  laneQuizChoicesEl.innerHTML = '';
  currentLaneQuiz.choices.forEach((choice, index) => {
    const el = document.createElement('div');
    el.className = 'lane-quiz-choice' + (index === selectedLaneIndex ? ' selected' : '');
    const tag = document.createElement('span');
    tag.className = 'lane-tag';
    tag.textContent = LANE_LABELS[index];
    const text = document.createElement('span');
    text.textContent = choice;
    el.appendChild(tag);
    el.appendChild(text);
    laneQuizChoicesEl.appendChild(el);
  });
}

function showLaneQuizPopup() {
  const service = currentLaneQuiz.service;
  const colorHex = `#${CATEGORIES[service.category].color.toString(16).padStart(6, '0')}`;
  laneQuizCategoryEl.textContent = `${service.name} · ${CATEGORIES[service.category].label}`;
  laneQuizCategoryEl.style.color = colorHex;
  laneQuizQuestionEl.textContent = currentLaneQuiz.question;
  renderLaneQuizChoices();
  laneQuizPopupEl.style.display = 'block';
}

// Kicks off loading a lane quiz in the background. Gameplay (including
// obstacle/coin spawning) continues completely normally while this loads.
// Once loaded, the quiz is held in `pendingLaneQuiz` until a natural gap
// opens up in front of the player — it never forces the road to clear.
async function triggerLaneQuiz(currentScore) {
  laneQuizState = 'loading';

  const collected = session.getUniqueServiceIds();
  const service =
    collected.length > 0
      ? getServiceById(collected[Math.floor(Math.random() * collected.length)])
      : getRandomService();

  const difficulty = getDifficultyForScore(currentScore);
  const dynamic = await fetchLaneQuiz(service, difficulty);
  const quiz = dynamic || service.laneQuiz;

  if (!quiz || gameState !== 'playing') {
    laneQuizState = 'idle';
    scheduleNextLaneQuiz(currentScore);
    return;
  }

  pendingLaneQuiz = { ...quiz, service };
  laneQuizState = 'waitingForGap';
}

// Called every frame while a quiz is loaded and waiting for a clear stretch
// of road. Stops new obstacle/coin spawns (so a gap can actually form) but
// does not remove anything already on the road — it just waits.
function tryPresentPendingLaneQuiz() {
  if (!obstacleManager.isClearAhead(LANE_QUIZ_CLEAR_DISTANCE)) return;

  // Clean up anything that has already passed/reached the player so nothing
  // stale is left sitting on top of them while the world is frozen — this
  // never touches obstacles still ahead, only ones already behind.
  obstacleManager.removeAtOrBehind(2);
  coinManager.removeAtOrBehind(2);

  currentLaneQuiz = pendingLaneQuiz;
  pendingLaneQuiz = null;
  selectedLaneIndex = player.currentLane;
  laneQuizState = 'active';

  quizGateManager.spawnGates(currentLaneQuiz.correctIndex);
  showLaneQuizPopup();
}

function confirmLaneQuizAnswer() {
  if (laneQuizState !== 'active') return;
  laneQuizState = 'resolving';
  laneQuizPopupEl.style.display = 'none';
}

function showLaneQuizResult(isCorrect, fact) {
  laneQuizResultEl.className = isCorrect ? 'correct' : 'incorrect';
  laneQuizResultTitleEl.textContent = isCorrect ? 'Correct!' : 'Not quite';
  laneQuizResultFactEl.textContent = fact;
  laneQuizResultHintEl.textContent = 'Press ENTER to continue';
  laneQuizResultEl.style.display = 'block';
}

function finishLaneQuiz() {
  laneQuizResultEl.style.display = 'none';
  currentLaneQuiz = null;
  quizGateManager.clear();
  // Delay normal spawning slightly so the player isn't immediately hit
  // right after resolving, without forcibly clearing anything
  obstacleManager.lastSpawnScore = score + 15;
  coinManager.lastSpawnScore = score;
  scheduleNextLaneQuiz(score);
  laneQuizState = 'idle';
}

function handleLaneQuizResolution(evt) {
  if (evt.isCorrect) {
    score += 50;
    showLaneQuizResult(true, currentLaneQuiz.fact);
    // Wait for the player to press Enter before resuming (see keydown handler)
    laneQuizState = 'awaitingContinue';
  } else {
    // Play the shock animation first, then show the result and wait for Enter
    laneQuizState = 'resolving-answer';
    player.playShock().then(() => {
      showLaneQuizResult(false, currentLaneQuiz.fact);
      laneQuizState = 'awaitingContinue';
    });
  }
}

// Hide loading indicator after models have time to load
setTimeout(() => {
  if (loadingEl) loadingEl.style.display = 'none';
}, 8000);

// Button handlers
document.getElementById('start-btn').addEventListener('click', () => {
  gameState = 'playing';
  startScreenEl.style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'none';
  score = 0;
  coins = 0;
  speed = 0.25;
  scheduleNextLaneQuiz(0);
});

continueBtn.addEventListener('click', () => {
  gameOverEl.style.display = 'none';
  showLesson(() => {
    showSummary();
  });
});

document.getElementById('restart-btn').addEventListener('click', () => {
  summaryScreenEl.style.display = 'none';
  gameState = 'playing';
  score = 0;
  coins = 0;
  speed = 0.25;
  session.reset();
  player.reset();
  obstacleManager.reset();
  coinManager.reset();

  // Reset lane-quiz state
  laneQuizState = 'idle';
  currentLaneQuiz = null;
  pendingLaneQuiz = null;
  quizGateManager.clear();
  laneQuizPopupEl.style.display = 'none';
  laneQuizLoadingEl.style.display = 'none';
  laneQuizResultEl.style.display = 'none';
  scheduleNextLaneQuiz(0);
});

// Input handling — LEFT means go left on screen, RIGHT means go right
document.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;

  // While a lane quiz is being answered, arrow keys scroll between answer
  // choices (moving the player between lanes to preview each one) and
  // Enter confirms the selection. Jump/slide are disabled during this.
  if (laneQuizState === 'active') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      player.moveLeft();
      selectedLaneIndex = player.currentLane;
      renderLaneQuizChoices();
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      player.moveRight();
      selectedLaneIndex = player.currentLane;
      renderLaneQuizChoices();
    }
    if (e.code === 'Enter') {
      confirmLaneQuizAnswer();
    }
    return;
  }

  // Once the result banner is showing, wait for the player to press Enter
  // (confirming they've read the fact) before resuming normal play.
  if (laneQuizState === 'awaitingContinue') {
    if (e.code === 'Enter') {
      finishLaneQuiz();
    }
    return;
  }

  // Full player control stays active while a quiz is loading or waiting for
  // a clear stretch of road — real obstacles are still there to dodge.
  // Only block movement once gates are actually resolving.
  if (laneQuizState === 'resolving' || laneQuizState === 'resolving-answer') return;

  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    player.moveLeft();
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    player.moveRight();
  }
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    e.preventDefault();
    player.jump();
  }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    player.slide();
  }
});

// Touch/swipe support
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

document.addEventListener('touchend', (e) => {
  if (gameState !== 'playing') return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 50) player.moveRight();
    else if (dx < -50) player.moveLeft();
  } else {
    if (dy < -50) player.jump();
    else if (dy > 50) player.slide();
  }
});

// Game over
function gameOver() {
  gameState = 'over';
  gameOverEl.style.display = 'block';
  finalScoreEl.textContent = Math.floor(score);
  finalCoinsEl.textContent = coins;

  // Defensive cleanup in case a lane quiz was mid-flight
  laneQuizState = 'idle';
  pendingLaneQuiz = null;
  laneQuizPopupEl.style.display = 'none';
  laneQuizLoadingEl.style.display = 'none';
  laneQuizResultEl.style.display = 'none';
  quizGateManager.clear();
}

// Collision detection
function checkCollisions() {
  const playerBox = player.getCollider();

  const obstacles = obstacleManager.getColliders();
  for (const obstacleBox of obstacles) {
    if (playerBox.intersectsBox(obstacleBox)) {
      gameOver();
      return;
    }
  }

  const coinColliders = coinManager.getColliders();
  for (let i = coinColliders.length - 1; i >= 0; i--) {
    if (playerBox.intersectsBox(coinColliders[i].box)) {
      coins++;
      coinManager.collect(coinColliders[i].index);
    }
  }
}

const GATE_APPROACH_SPEED = 0.35; // speed used while running toward the gates to answer — brisk, feels like the player is running forward

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  if (gameState === 'playing') {
    if (laneQuizState === 'idle' || laneQuizState === 'loading') {
      // Normal play — a quiz may be silently loading in the background
      speed = Math.min(speed + SPEED_INCREMENT, MAX_SPEED);

      score += speed * 0.5;
      scoreEl.textContent = Math.floor(score);
      coinsEl.textContent = `Coins: ${coins}`;

      world.update(speed);
      obstacleManager.update(speed, score);
      coinManager.update(speed, score);
      checkCollisions();

      if (laneQuizState === 'idle' && score >= nextLaneQuizAt) {
        triggerLaneQuiz(score);
      }
    } else if (laneQuizState === 'waitingForGap') {
      // Quiz is ready — keep playing normally but stop new spawns so a
      // natural gap can open up ahead of the player. Nothing is removed.
      speed = Math.min(speed + SPEED_INCREMENT, MAX_SPEED);

      score += speed * 0.5;
      scoreEl.textContent = Math.floor(score);
      coinsEl.textContent = `Coins: ${coins}`;

      world.update(speed);
      obstacleManager.update(speed, score, false);
      coinManager.update(speed, score, false);
      checkCollisions();

      tryPresentPendingLaneQuiz();
    } else if (laneQuizState === 'resolving') {
      // Popup answered — the whole scene moves together at the same speed
      // (world, obstacles, coins, and the gates) so it reads as the player
      // running forward into their answer, not a gate crawling up to them.
      // Real obstacles/coins already near the player were cleared before
      // the popup opened, so nothing else is in play here.
      world.update(GATE_APPROACH_SPEED);
      obstacleManager.update(GATE_APPROACH_SPEED, score, false);
      coinManager.update(GATE_APPROACH_SPEED, score, false);
      const events = quizGateManager.update(GATE_APPROACH_SPEED, player.currentLane);
      for (const evt of events) {
        handleLaneQuizResolution(evt);
      }
    }
    // 'active', 'resolving-answer', and 'awaitingContinue' states: world is
    // fully frozen, only the player animates (running in place / shock
    // animation), and 'awaitingContinue' waits for the player to press Enter

    player.update();
  }

  renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
