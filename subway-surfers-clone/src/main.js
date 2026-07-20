import * as THREE from 'three';
import { Player } from './player.js';
import { World } from './world.js';
import { ObstacleManager } from './obstacles.js';
import { CoinManager } from './coins.js';
import { OrbManager } from './orbs.js';
import { Cop } from './cop.js';
import { RunSession } from './session.js';
import {
  CATEGORIES,
  SERVICES,
  CATEGORY_QUIZZES,
  getServiceById,
  getRandomService,
  getStaticNoteFallback,
} from './services.js';
import { fetchLaneQuiz, fetchOrbNote, askAboutService } from './quizApi.js';
import { getDifficultyForScore, getDifficultyForServiceLevel } from './difficulty.js';
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
const coinManager = new CoinManager(scene, obstacleManager);
const orbManager = new OrbManager(scene, obstacleManager);
const quizGateManager = new QuizGateManager(scene);
const cop = new Cop(scene);

// In-run lane-quiz state
const LANE_QUIZ_MIN_INTERVAL_SCORE = 120; // min score gap between lane quizzes
const LANE_QUIZ_MAX_INTERVAL_SCORE = 220; // max score gap between lane quizzes
const LANE_QUIZ_CLEAR_DISTANCE = 25; // road ahead of the player must be free of obstacles this far
const ORB_LEAD_SCORE = 70; // how much earlier (in score) the notes orb spawns before its quiz, giving the player time to grab it
// 'idle' | 'loading' | 'waitingForGap' | 'active' | 'resolving' | 'resolving-answer'
let laneQuizState = 'idle';
let nextLaneQuizAt = LANE_QUIZ_MIN_INTERVAL_SCORE + Math.random() * (LANE_QUIZ_MAX_INTERVAL_SCORE - LANE_QUIZ_MIN_INTERVAL_SCORE);
let currentLaneQuiz = null; // { question, choices, correctIndex, fact, service }
let pendingLaneQuiz = null; // quiz data fetched and ready, waiting for a natural gap in traffic
let selectedLaneIndex = 1; // starts centered

// The service the *next* (or current pending) lane quiz will be about. Chosen
// up front so the notes orb tied to it can spawn well ahead of the quiz —
// collecting the orb unlocks notes for that exact service, but the question
// gets asked either way.
let pendingOrbService = null;
let orbSpawnedForCycle = false;
let nextOrbSpawnAt = 0;

// Tracks the last quiz's question text and service ID so we never show the
// exact same question (or even the same service) back-to-back.
let lastQuizQuestion = '';
let lastQuizServiceId = '';

// Strike/lives system: hitting a jump/slide obstacle (barrier/overhead) OR
// answering a lane quiz wrong is a "strike" — the first one just triggers
// the stumble/shock animation and play continues (and the cop starts
// chasing). Any SECOND strike, of either kind, in either order, ends the
// run — a second jump/slide graze plays the fall-back death animation
// instead of the regular stumble. Running into a train always ends the run
// immediately regardless of strikes.
let strikeCount = 0; // 0 = no strikes yet, 1 = next failure of any kind ends the run
let stumbleActive = false; // true while the obstacle-stumble/death animation freezes gameplay
// Consecutive CORRECT lane-quiz answers while the cop is chasing. Reaching 2
// in a row calls off the chase: strikes reset to 0 and the cop fades out.
// Any wrong answer resets this back to 0.
let consecutiveCorrectAnswers = 0;

// Prefetch for the orb's note: kicked off the instant the orb spawns (well
// before the player can reach it) so the toast can show the finished note
// immediately on pickup instead of a loading state. Keyed to the service it
// was fetched for so a stale result never gets applied to the wrong pickup.
// `pendingOrbNoteResult` is filled in once the fetch actually settles, so
// collection can check synchronously whether it's already done.
let pendingOrbNotePromise = null;
let pendingOrbNoteServiceId = null;
let pendingOrbNoteResult = undefined; // undefined = not settled yet, null = settled with no result

// UI elements
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const strikeIndicatorEl = document.getElementById('strike-indicator');
const gameOverEl = document.getElementById('game-over');
const gameOverReasonEl = document.getElementById('game-over-reason');
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
const laneQuizQuestionEl = document.getElementById('lane-quiz-question');
const laneQuizChoicesEl = document.getElementById('lane-quiz-choices');
const laneQuizResultEl = document.getElementById('lane-quiz-result');
const laneQuizResultTitleEl = document.getElementById('lane-quiz-result-title');
const laneQuizResultFactEl = document.getElementById('lane-quiz-result-fact');
const laneQuizResultHintEl = document.getElementById('lane-quiz-result-hint');

const orbToastEl = document.getElementById('orb-toast');
const orbToastNameEl = document.getElementById('orb-toast-name');
const orbToastFactEl = document.getElementById('orb-toast-fact');
let orbToastTimer = null;

const laneQuizNotesToggleEl = document.getElementById('lane-quiz-notes-toggle');
const laneQuizNotesPanelEl = document.getElementById('lane-quiz-notes-panel');
const laneQuizNotesSectionsEl = document.getElementById('lane-quiz-notes-sections');
const laneQuizNoNotesEl = document.getElementById('lane-quiz-no-notes');

// Shows the toast for a service whose notes orb was just collected — the
// "micro-lesson" moment during gameplay. `noteText` is the ONE new
// incremental note just unlocked (not the static fact/overview), or a
// loading placeholder while it's still being generated.
function showOrbToast(service, noteText, isLoading) {
  if (orbToastTimer) clearTimeout(orbToastTimer);

  const colorHex = `#${CATEGORIES[service.category].color.toString(16).padStart(6, '0')}`;
  orbToastEl.style.borderColor = colorHex;
  orbToastNameEl.textContent = `${service.name} — new note`;
  orbToastNameEl.style.color = colorHex;
  orbToastFactEl.textContent = noteText;
  orbToastFactEl.style.fontStyle = isLoading ? 'italic' : 'normal';
  orbToastFactEl.style.opacity = isLoading ? '0.7' : '0.9';
  orbToastEl.classList.add('visible');

  if (!isLoading) {
    orbToastTimer = setTimeout(() => {
      orbToastEl.classList.remove('visible');
    }, 5000);
  }
}

// Appends one service's unlocked incremental notes (in the order they were
// taught) as a list under `container`, prefixed with a heading naming the
// service. Used both for the quizzed service and for other previously
// unlocked services shown alongside it.
function appendServiceNoteList(container, service, notes, heading) {
  if (notes.length === 0) return;

  const headingEl = document.createElement('div');
  headingEl.className = 'lesson-detail-label';
  headingEl.style.marginTop = '10px';
  headingEl.textContent = heading;
  container.appendChild(headingEl);

  const list = document.createElement('ul');
  list.className = 'lesson-detail-text';
  list.style.paddingLeft = '18px';
  list.style.margin = '4px 0 0';
  for (const note of notes) {
    const item = document.createElement('li');
    item.textContent = note;
    item.style.marginBottom = '4px';
    list.appendChild(item);
  }
  container.appendChild(list);
}

// Renders the notes panel shown while a lane quiz is active. Only the
// incremental notes actually unlocked this run are shown (never the fuller
// static overview/analogy/practical-use content, which is reserved for the
// end-of-run recap). The quizzed service's notes only show if its orb was
// collected THIS run — that's the incentive to grab it. Other services
// already unlocked this run are also listed, since the question is allowed
// to build off/compare against those too.
function renderLaneQuizNotes(service) {
  laneQuizNotesSectionsEl.innerHTML = '';
  const targetNotes = session.getNotes(service.id);
  const hasNotes = targetNotes.length > 0;

  laneQuizNoNotesEl.style.display = hasNotes ? 'none' : 'block';

  if (hasNotes) {
    appendServiceNoteList(laneQuizNotesSectionsEl, service, targetNotes, service.name);
  }

  const otherUnlocked = session
    .getUnlockedServiceIds()
    .filter((id) => id !== service.id)
    .map((id) => getServiceById(id))
    .filter(Boolean);

  for (const other of otherUnlocked) {
    appendServiceNoteList(
      laneQuizNotesSectionsEl,
      other,
      session.getNotes(other.id),
      `Also unlocked: ${other.name}`
    );
  }

  laneQuizNotesSectionsEl.style.display = hasNotes || otherUnlocked.length > 0 ? 'block' : 'none';
}

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
  const uniqueIds = session.getUniqueQuizzedServiceIds();
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
  const quizzedIds = session.getUniqueQuizzedServiceIds();
  const unlockedCount = session.getUnlockedServiceIds().length;
  summaryStatsEl.textContent = `Score: ${Math.floor(score)} · Coins: ${coins} · Services quizzed: ${quizzedIds.length} · Notes unlocked: ${unlockedCount}`;
  renderServiceChips(summaryServicesEl, quizzedIds);

  // Render quiz review list
  const quizReviewEl = document.getElementById('quiz-review');
  quizReviewEl.innerHTML = '';
  const results = session.getQuizResults();

  if (results.length === 0) {
    quizReviewEl.innerHTML = '<p style="opacity:0.6; font-size:14px;">No quizzes this run.</p>';
  } else {
    for (const result of results) {
      const item = document.createElement('div');
      item.className = `quiz-review-item ${result.correct ? 'correct' : 'incorrect'}`;

      const header = document.createElement('div');
      header.className = 'quiz-review-header';

      const dot = document.createElement('span');
      dot.className = 'quiz-review-dot';
      dot.textContent = result.correct ? '✓' : '✗';

      const question = document.createElement('span');
      question.className = 'quiz-review-question';
      question.textContent = result.question;

      const toggle = document.createElement('span');
      toggle.className = 'quiz-review-toggle';
      toggle.textContent = '▾';

      header.appendChild(dot);
      header.appendChild(question);
      header.appendChild(toggle);

      const explanation = document.createElement('div');
      explanation.className = 'quiz-review-explanation';
      explanation.textContent = result.fact;

      header.addEventListener('click', () => {
        const isOpen = explanation.classList.contains('open');
        explanation.classList.toggle('open', !isOpen);
        toggle.textContent = isOpen ? '▾' : '▴';
      });

      item.appendChild(header);
      item.appendChild(explanation);
      quizReviewEl.appendChild(item);
    }
  }

  summaryScreenEl.style.display = 'flex';
}

const LANE_LABELS = ['LEFT', 'CENTER', 'RIGHT'];

function scheduleNextLaneQuiz(currentScore) {
  nextLaneQuizAt =
    currentScore +
    LANE_QUIZ_MIN_INTERVAL_SCORE +
    Math.random() * (LANE_QUIZ_MAX_INTERVAL_SCORE - LANE_QUIZ_MIN_INTERVAL_SCORE);

  // Pick which service the next quiz will cover right away (rather than at
  // trigger time) so its notes orb can spawn with a head start, well before
  // the question itself appears.
  pendingOrbService = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  orbSpawnedForCycle = false;
  nextOrbSpawnAt = Math.max(0, nextLaneQuizAt - ORB_LEAD_SCORE);

  // Start fetching the orb's teaching note immediately — well before the
  // orb even appears on screen — so by the time the player collects it the
  // note is already resolved and the toast never shows a loading state.
  prefetchOrbNote(pendingOrbService);
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
  // Deliberately doesn't reveal which service/category the question is
  // about — the player has to actually read the notes/question rather than
  // pattern-matching on a label, and it keeps which orb the quiz will draw
  // on unpredictable.
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

  // Which service the quiz asks about is NOT locked to the orb that just
  // spawned — that would make it predictable ("the last orb is always the
  // quiz"). Instead it's picked randomly from the freshest orb's service
  // PLUS every service the player has unlocked notes for earlier in the
  // run, so old orbs stay just as relevant as the newest one and the
  // player can't tell in advance which pickup will actually get quizzed.
  const freshOrbService = pendingOrbService || getRandomService();
  const historyServiceIds = session.getUnlockedServiceIds().filter((id) => id !== freshOrbService.id);
  const candidates = [freshOrbService, ...historyServiceIds.map((id) => getServiceById(id)).filter(Boolean)];

  // Avoid picking the same service as the previous quiz when possible (the
  // question itself is almost always different since it's AI-generated, but
  // same-service-back-to-back still feels repetitive). If there's only one
  // candidate we have no choice — but with 2+ we can always pick something
  // different.
  let service;
  if (candidates.length > 1) {
    const filtered = candidates.filter((s) => s.id !== lastQuizServiceId);
    service = filtered.length > 0
      ? filtered[Math.floor(Math.random() * filtered.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    service = candidates[0];
  }

  orbManager.clear(); // no longer relevant once the quiz itself is loading
  // If the player never reached the orb, its prefetched note (if any) is
  // wasted work but harmless — clear the bookkeeping so it can't leak into
  // a future, unrelated collection.
  pendingOrbNotePromise = null;
  pendingOrbNoteServiceId = null;
  pendingOrbNoteResult = undefined;

  // The incremental notes the player actually unlocked for this exact
  // service this run — this is what determines how deep the question is
  // allowed to go, and it's the ONLY content it may draw on for this
  // service. Other previously-unlocked services can be referenced
  // (comparisons) but never exceeded either.
  const targetNotes = session.getNotes(service.id);
  const hasNotes = targetNotes.length > 0;
  const otherUnlocked = session
    .getUnlockedServiceIds()
    .filter((id) => id !== service.id)
    .map((id) => ({ service: getServiceById(id), notes: session.getNotes(id) }))
    .filter((o) => o.service);

  const difficulty = getDifficultyForServiceLevel(session.getServiceDifficulty(service.id));
  const dynamic = await fetchLaneQuiz(service, difficulty, targetNotes, otherUnlocked);
  // Static fallback must respect the same rule: only ask a service-specific
  // question if the player actually unlocked notes for it this run.
  const staticFallback = hasNotes ? service.laneQuiz : CATEGORY_QUIZZES[service.category];
  const quiz = dynamic || staticFallback;

  if (!quiz || gameState !== 'playing') {
    laneQuizState = 'idle';
    scheduleNextLaneQuiz(currentScore);
    return;
  }

  // Ensure quiz always has a `fact` field (static fallbacks may not have
  // one) — use the service's one-liner as a reasonable fallback.
  if (!quiz.fact) {
    quiz.fact = service.fact || 'No explanation available.';
  }

  // Never show the exact same question text back-to-back (can happen when
  // the backend is down and the static fallback is the only option for a
  // given service). If it would repeat, skip this quiz cycle entirely —
  // the next one will pick a different service.
  if (quiz.question === lastQuizQuestion) {
    laneQuizState = 'idle';
    scheduleNextLaneQuiz(currentScore);
    return;
  }

  lastQuizQuestion = quiz.question;
  lastQuizServiceId = service.id;
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

  session.recordQuizzed(currentLaneQuiz.service.id);
  renderLaneQuizNotes(currentLaneQuiz.service);
  laneQuizNotesPanelEl.classList.remove('open');
  laneQuizNotesToggleEl.textContent = 'View notes ▾';

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
    session.recordQuizResult(currentLaneQuiz.question, true, currentLaneQuiz.fact, currentLaneQuiz.service.name, currentLaneQuiz.service.id);
    registerCorrectAnswerForChase();
    showLaneQuizResult(true, currentLaneQuiz.fact);
    laneQuizState = 'awaitingContinue';
  } else {
    session.recordQuizResult(currentLaneQuiz.question, false, currentLaneQuiz.fact, currentLaneQuiz.service.name, currentLaneQuiz.service.id);
    laneQuizState = 'resolving-answer';
    player.playShock().then(() => {
      if (registerStrike()) {
        gameOver('Answered wrong one too many times.');
        return;
      }
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
document.getElementById('how-to-play-btn').addEventListener('click', () => {
  startScreenEl.style.display = 'none';
  document.getElementById('rules-screen').style.display = 'flex';
});

document.getElementById('rules-start-btn').addEventListener('click', () => {
  document.getElementById('rules-screen').style.display = 'none';
  if (loadingEl) loadingEl.style.display = 'none';
  gameState = 'playing';
  score = 0;
  coins = 0;
  speed = 0.25;
  strikeCount = 0;
  stumbleActive = false;
  consecutiveCorrectAnswers = 0;
  cop.reset();
  updateStrikeIndicator();
  scheduleNextLaneQuiz(0);
});

laneQuizNotesToggleEl.addEventListener('click', () => {
  const isOpen = laneQuizNotesPanelEl.classList.contains('open');
  laneQuizNotesPanelEl.classList.toggle('open', !isOpen);
  laneQuizNotesToggleEl.textContent = isOpen ? 'View notes ▾' : 'Hide notes ▴';
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
  strikeCount = 0;
  stumbleActive = false;
  consecutiveCorrectAnswers = 0;
  cop.reset();
  updateStrikeIndicator();
  session.reset();
  player.reset();
  obstacleManager.reset();
  coinManager.reset();
  orbManager.reset();
  pendingOrbNotePromise = null;
  pendingOrbNoteServiceId = null;
  pendingOrbNoteResult = undefined;

  // Reset lane-quiz state
  laneQuizState = 'idle';
  currentLaneQuiz = null;
  pendingLaneQuiz = null;
  quizGateManager.clear();
  laneQuizPopupEl.style.display = 'none';
  laneQuizLoadingEl.style.display = 'none';
  laneQuizResultEl.style.display = 'none';
  orbToastEl.classList.remove('visible');
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

// Updates the small HUD line showing whether the player is one mistake away
// from ending the run.
function updateStrikeIndicator() {
  strikeIndicatorEl.textContent = strikeCount > 0 ? 'One more mistake ends the run!' : '';
}

// Records a strike (a jump/slide obstacle graze, or a wrong quiz answer).
// The first strike is a warning — the run continues, and the cop starts
// chasing. A second strike, of EITHER kind, in ANY order, ends the run.
// Returns true if this strike just ended the run.
function registerStrike() {
  strikeCount++;
  consecutiveCorrectAnswers = 0; // any failure resets the "answer 2 right" progress
  if (strikeCount >= 2) {
    return true;
  }
  updateStrikeIndicator();
  cop.activate();
  return false;
}

// Called after a CORRECT lane-quiz answer while the cop is chasing (i.e.
// the player already has a strike). Two correct answers in a row calls off
// the chase entirely: strikes reset to zero and the cop fades out.
function registerCorrectAnswerForChase() {
  if (strikeCount === 0) return; // cop isn't chasing, nothing to do
  consecutiveCorrectAnswers++;
  if (consecutiveCorrectAnswers >= 2) {
    strikeCount = 0;
    consecutiveCorrectAnswers = 0;
    updateStrikeIndicator();
    cop.deactivate();
  }
}

// Game over. `reason` is a short player-facing explanation shown on the
// game-over screen (e.g. "Hit by a train" vs "Two strikes").
function gameOver(reason) {
  gameState = 'over';
  gameOverEl.style.display = 'block';
  gameOverReasonEl.textContent = reason || '';
  finalScoreEl.textContent = Math.floor(score);
  finalCoinsEl.textContent = coins;

  // Defensive cleanup in case a lane quiz was mid-flight
  laneQuizState = 'idle';
  pendingLaneQuiz = null;
  laneQuizPopupEl.style.display = 'none';
  laneQuizLoadingEl.style.display = 'none';
  laneQuizResultEl.style.display = 'none';
  quizGateManager.clear();
  orbManager.clear();
}

// Collision detection
function checkCollisions() {
  const playerBox = player.getCollider();

  // Obstacle collisions — blocked during stumble invulnerability so the
  // same cluster can't double-hit, but coin/orb collection still works.
  if (!stumbleActive) {
    const obstacles = obstacleManager.getColliders();
    for (const { box, type, obstacle } of obstacles) {
      if (!playerBox.intersectsBox(box)) continue;

      if (type === 'train') {
        gameState = 'dying';
        player.playFallBackDeath().then(() => {
          gameOver('Hit by a train.');
        });
        return;
      }

      obstacleManager.remove(obstacle);
      stumbleActive = true;
      const isFatal = strikeCount >= 1;

      if (isFatal) {
        gameState = 'dying';
        player.playFallBackDeath().then(() => {
          gameOver('Stumbled one too many times.');
        });
      } else {
        player.playStumble().then(() => {
          stumbleActive = false;
          if (gameState !== 'playing') return;
          registerStrike();
        });
      }
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

  const orbBox = orbManager.getCollider();
  if (orbBox && playerBox.intersectsBox(orbBox)) {
    const service = orbManager.collect();
    if (service) {
      collectOrbNote(service);
    }
  }
}

// Kicks off fetching the orb's incremental note the instant it spawns —
// well before the player can reach it (see ORB_LEAD_SCORE) — so by the time
// they actually collect it, the note is usually already sitting ready and
// the toast can show finished text immediately instead of a loading state.
function prefetchOrbNote(service) {
  const priorNotes = session.getNotes(service.id);
  pendingOrbNoteServiceId = service.id;
  pendingOrbNoteResult = undefined;
  const promise = fetchOrbNote(service, priorNotes);
  pendingOrbNotePromise = promise;

  promise.then((result) => {
    // Only record the result if this prefetch is still the current one
    // (e.g. hasn't been superseded by a reset/new cycle in the meantime).
    if (pendingOrbNotePromise === promise) {
      pendingOrbNoteResult = result;
    }
  });
}

// Handles collecting a service's notes orb: resolves the prefetched note
// (which was kicked off the moment the quiz cycle was scheduled — well
// before the orb even appeared on screen). By the time the player reaches
// the orb, the note should always already be resolved so the toast shows
// instantly with no loading state. Falls back to a static note if the
// fetch failed entirely.
async function collectOrbNote(service) {
  const priorNotes = session.getNotes(service.id);
  const isPrefetchedForThisService = pendingOrbNoteServiceId === service.id && pendingOrbNotePromise;

  let dynamicNote;
  if (isPrefetchedForThisService && pendingOrbNoteResult !== undefined) {
    // Already resolved (the expected path).
    dynamicNote = pendingOrbNoteResult;
  } else if (isPrefetchedForThisService) {
    // Still in flight (very unlikely given the head start) — silently await.
    dynamicNote = await pendingOrbNotePromise;
  } else {
    // No prefetch at all (shouldn't happen, but handle gracefully).
    dynamicNote = await fetchOrbNote(service, priorNotes);
  }

  pendingOrbNotePromise = null;
  pendingOrbNoteServiceId = null;
  pendingOrbNoteResult = undefined;

  const note = dynamicNote || getStaticNoteFallback(service, priorNotes.length);

  if (note) {
    session.addNote(service.id, note);
    showOrbToast(service, note, false);
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

      if (!orbSpawnedForCycle && pendingOrbService && score >= nextOrbSpawnAt) {
        orbManager.spawn(pendingOrbService);
        orbSpawnedForCycle = true;
      }
      orbManager.update(speed);

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
      orbManager.update(speed);
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
    cop.update(player);
  }

  // 'dying' state: world is frozen, only the player's death animation plays
  if (gameState === 'dying') {
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
