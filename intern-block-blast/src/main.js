import { CATEGORIES, TIPS, QUIZZES } from './data.js';
import { generatePieceSet, getShapeDimensions } from './pieces.js';
import {
  createBoard,
  canPlace,
  placePiece,
  findCompletedLines,
  clearLines,
  getClearedCells,
  hasValidMove,
  calculateScore,
  BOARD_SIZE,
} from './board.js';

// ----- State -----
let board = createBoard();
let currentPieces = []; // 3 pieces in tray
let score = 0;
let level = 1;
let linesCleared = 0;
let collectedTips = { time: [], ai: [], docs: [], connect: [] };
let tipIndices = { time: 0, ai: 0, docs: 0, connect: 0 };
let dragPieceIndex = null;
let dragGhost = null;
let previewCells = [];
let sessionQuizResults = []; // Track quiz Q&A from this session
// Track quiz mastery: for each category, which question index the player is on.
// Only advances when they answer correctly. Wrong answers stay at the same index.
let quizProgress = { time: 0, ai: 0, docs: 0, connect: 0 };
let wrongQueue = []; // Questions answered wrong get queued for re-asking

// ----- DOM References -----
const screens = {
  start: document.getElementById('start-screen'),
  howTo: document.getElementById('how-to-screen'),
  game: document.getElementById('game-screen'),
  gameover: document.getElementById('gameover-screen'),
};

const boardEl = document.getElementById('game-board');
const trayEl = document.getElementById('piece-tray');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const highScoreEl = document.getElementById('high-score');

const quizModal = document.getElementById('quiz-modal');
const quizCategoryLabel = document.getElementById('quiz-category-label');
const quizQuestion = document.getElementById('quiz-question');
const quizChoices = document.getElementById('quiz-choices');
const quizFeedback = document.getElementById('quiz-feedback');
const quizContinueBtn = document.getElementById('quiz-continue-btn');

const tipsModal = document.getElementById('tips-modal');
const tipsList = document.getElementById('tips-list');

// ----- Screen Management -----
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ----- Board Rendering -----
function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (board[r][c]) {
        cell.classList.add(CATEGORIES[board[r][c]].cssClass);
      }
      boardEl.appendChild(cell);
    }
  }
}

function updateBoardCell(row, col) {
  const index = row * BOARD_SIZE + col;
  const cell = boardEl.children[index];
  if (!cell) return;

  // Remove all filled classes
  cell.className = 'cell';
  if (board[row][col]) {
    cell.classList.add(CATEGORIES[board[row][col]].cssClass);
  }
}

// ----- Piece Tray Rendering -----
function renderTray() {
  trayEl.innerHTML = '';
  currentPieces.forEach((piece, index) => {
    if (!piece) {
      // Placeholder for used piece
      const placeholder = document.createElement('div');
      placeholder.className = 'piece-container';
      placeholder.style.visibility = 'hidden';
      trayEl.appendChild(placeholder);
      return;
    }

    const container = document.createElement('div');
    container.className = 'piece-container';
    container.dataset.index = index;

    const grid = document.createElement('div');
    grid.className = 'piece-grid';
    const dims = getShapeDimensions(piece.shape);
    grid.style.gridTemplateColumns = `repeat(${dims.cols}, 28px)`;
    grid.style.gridTemplateRows = `repeat(${dims.rows}, 28px)`;

    for (let r = 0; r < dims.rows; r++) {
      for (let c = 0; c < dims.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'piece-cell';
        if (piece.shape[r][c] === 1) {
          cell.classList.add(CATEGORIES[piece.category].cssClass);
        } else {
          cell.classList.add('empty');
        }
        grid.appendChild(cell);
      }
    }

    container.appendChild(grid);
    trayEl.appendChild(container);

    // Drag events
    container.addEventListener('mousedown', (e) => startDrag(e, index));
    container.addEventListener('touchstart', (e) => startDrag(e, index), { passive: false });
  });
}

// ----- Drag & Drop -----
function startDrag(e, pieceIndex) {
  e.preventDefault();
  const piece = currentPieces[pieceIndex];
  if (!piece) return;

  dragPieceIndex = pieceIndex;

  // Create ghost
  dragGhost = document.createElement('div');
  dragGhost.className = 'drag-ghost';
  const grid = document.createElement('div');
  grid.className = 'piece-grid';
  const dims = getShapeDimensions(piece.shape);
  grid.style.gridTemplateColumns = `repeat(${dims.cols}, var(--cell-size))`;
  grid.style.gridTemplateRows = `repeat(${dims.rows}, var(--cell-size))`;

  for (let r = 0; r < dims.rows; r++) {
    for (let c = 0; c < dims.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'piece-cell';
      if (piece.shape[r][c] === 1) {
        cell.classList.add(CATEGORIES[piece.category].cssClass);
      } else {
        cell.classList.add('empty');
      }
      grid.appendChild(cell);
    }
  }

  dragGhost.appendChild(grid);
  document.body.appendChild(dragGhost);

  // Mark piece as dragging
  const containers = trayEl.querySelectorAll('.piece-container');
  containers[pieceIndex]?.classList.add('dragging');

  // Position ghost
  const clientX = e.clientX || e.touches[0].clientX;
  const clientY = e.clientY || e.touches[0].clientY;
  positionGhost(clientX, clientY, dims);

  // Bind move and end
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}

function positionGhost(clientX, clientY, dims) {
  if (!dragGhost) return;
  const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
  const offsetX = (dims.cols * cellSize) / 2;
  const offsetY = (dims.rows * cellSize) + 20; // Place above finger
  dragGhost.style.left = `${clientX - offsetX}px`;
  dragGhost.style.top = `${clientY - offsetY}px`;
}

function onDragMove(e) {
  e.preventDefault();
  const piece = currentPieces[dragPieceIndex];
  if (!piece) return;

  const clientX = e.clientX || e.touches[0].clientX;
  const clientY = e.clientY || e.touches[0].clientY;
  const dims = getShapeDimensions(piece.shape);
  positionGhost(clientX, clientY, dims);

  // Find board cell under cursor
  const boardRect = boardEl.getBoundingClientRect();
  const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
  const gap = 2;
  const totalCellSize = cellSize + gap;

  // Offset: position relative to board, adjusted so piece centers on cursor
  const ghostOffsetY = (dims.rows * cellSize) + 20;
  const relX = clientX - boardRect.left - 6; // 6 = board padding
  const relY = (clientY - ghostOffsetY + (dims.rows * cellSize) / 2) - boardRect.top - 6;

  const col = Math.round(relX / totalCellSize - dims.cols / 2 + 0.5);
  const row = Math.round(relY / totalCellSize - dims.rows / 2 + 0.5);

  // Clear preview
  clearPreview();

  // Show preview if valid
  if (canPlace(board, piece.shape, row, col)) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[0].length; c++) {
        if (piece.shape[r][c] === 1) {
          const index = (row + r) * BOARD_SIZE + (col + c);
          const cellEl = boardEl.children[index];
          if (cellEl) {
            cellEl.classList.add(CATEGORIES[piece.category].cssClass, 'preview');
            previewCells.push(cellEl);
          }
        }
      }
    }
  }
}

function clearPreview() {
  for (const cell of previewCells) {
    cell.classList.remove('preview');
    // Restore original state
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    cell.className = 'cell';
    if (board[r][c]) {
      cell.classList.add(CATEGORIES[board[r][c]].cssClass);
    }
  }
  previewCells = [];
}

function onDragEnd(e) {
  const piece = currentPieces[dragPieceIndex];
  if (!piece) {
    cleanupDrag();
    return;
  }

  const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || 0;
  const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || 0;
  const dims = getShapeDimensions(piece.shape);

  // Find drop position
  const boardRect = boardEl.getBoundingClientRect();
  const cellSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
  const gap = 2;
  const totalCellSize = cellSize + gap;

  const ghostOffsetY = (dims.rows * cellSize) + 20;
  const relX = clientX - boardRect.left - 6;
  const relY = (clientY - ghostOffsetY + (dims.rows * cellSize) / 2) - boardRect.top - 6;

  const col = Math.round(relX / totalCellSize - dims.cols / 2 + 0.5);
  const row = Math.round(relY / totalCellSize - dims.rows / 2 + 0.5);

  clearPreview();

  if (canPlace(board, piece.shape, row, col)) {
    // Place the piece
    board = placePiece(board, piece.shape, piece.category, row, col);
    currentPieces[dragPieceIndex] = null;

    renderBoard();
    renderTray();

    // Check for completed lines
    checkAndClearLines();

    // Check if we need new pieces
    if (currentPieces.every((p) => p === null)) {
      currentPieces = generatePieceSet(level);
      renderTray();
    }

    // Check game over
    if (!hasValidMove(board, currentPieces)) {
      setTimeout(() => gameOver(), 300);
    }
  }

  cleanupDrag();
}

function cleanupDrag() {
  if (dragGhost) {
    dragGhost.remove();
    dragGhost = null;
  }
  dragPieceIndex = null;
  clearPreview();

  const containers = trayEl.querySelectorAll('.piece-container');
  containers.forEach((c) => c.classList.remove('dragging'));

  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
}

// ----- Line Clearing -----
function checkAndClearLines() {
  const { rows, cols } = findCompletedLines(board);
  const totalLines = rows.length + cols.length;

  if (totalLines === 0) return;

  // Animate clearing
  const clearedCells = getClearedCells(rows, cols);
  for (const key of clearedCells) {
    const [r, c] = key.split(',').map(Number);
    const index = r * BOARD_SIZE + c;
    const cellEl = boardEl.children[index];
    if (cellEl) cellEl.classList.add('clearing');
  }

  // After animation, clear the board
  setTimeout(() => {
    board = clearLines(board, { rows, cols });
    linesCleared += totalLines;

    // Score
    const lineScore = calculateScore(totalLines);
    score += lineScore;
    scoreEl.textContent = score;

    // Level up every 5 lines
    const newLevel = Math.floor(linesCleared / 5) + 1;
    if (newLevel > level) {
      level = newLevel;
      levelEl.textContent = level;
    }

    // Unlock tips for each cleared line
    for (let i = 0; i < totalLines; i++) {
      unlockTip();
    }

    // Trigger quiz every 3 lines
    if (linesCleared > 0 && linesCleared % 3 === 0) {
      setTimeout(() => showQuiz(), 200);
    }

    renderBoard();
  }, 350);
}

// ----- Tips System -----
function unlockTip() {
  // Rotate through categories
  const cats = Object.keys(TIPS);
  const cat = cats[linesCleared % cats.length];
  const idx = tipIndices[cat];

  if (idx < TIPS[cat].length) {
    collectedTips[cat].push(TIPS[cat][idx]);
    tipIndices[cat]++;
    updateTipsCount();
  }
}

function updateTipsCount() {
  const total = Object.values(collectedTips).reduce((sum, arr) => sum + arr.length, 0);
}

// ----- Quiz System -----
function showQuiz() {
  let quiz;
  let cat;

  // First, re-ask questions the player got wrong
  if (wrongQueue.length > 0) {
    const retryItem = wrongQueue.shift();
    quiz = retryItem.quiz;
    cat = retryItem.category;
  } else {
    // Pick a category that still has unanswered questions
    const cats = Object.keys(QUIZZES);
    const available = cats.filter((c) => quizProgress[c] < QUIZZES[c].length);

    if (available.length === 0) {
      // All questions mastered — don't show a quiz
      return;
    }

    cat = available[Math.floor(Math.random() * available.length)];
    quiz = QUIZZES[cat][quizProgress[cat]];
  }

  quizCategoryLabel.textContent = CATEGORIES[cat].label;
  quizQuestion.textContent = quiz.question;
  quizChoices.innerHTML = '';
  quizFeedback.className = 'quiz-feedback hidden';
  quizFeedback.textContent = '';
  quizContinueBtn.classList.add('hidden');

  quiz.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => answerQuiz(i, quiz, btn, cat));
    quizChoices.appendChild(btn);
  });

  quizModal.classList.remove('hidden');
}

function answerQuiz(choiceIndex, quiz, clickedBtn, category) {
  const buttons = quizChoices.querySelectorAll('.quiz-choice-btn');
  buttons.forEach((btn) => (btn.disabled = true));

  const isCorrect = choiceIndex === quiz.correctIndex;

  // Track this quiz result for end-of-session takeaways
  sessionQuizResults.push({
    category,
    question: quiz.question,
    correct: isCorrect,
    explanation: quiz.explanation,
  });

  if (isCorrect) {
    clickedBtn.classList.add('correct');
    quizFeedback.className = 'quiz-feedback correct';
    quizFeedback.textContent = `✅ Correct! ${quiz.explanation}`;
    score += 200;
    scoreEl.textContent = score;
    // Advance to next (deeper) question in this category
    if (quizProgress[category] < QUIZZES[category].length) {
      quizProgress[category]++;
    }
  } else {
    clickedBtn.classList.add('incorrect');
    buttons[quiz.correctIndex].classList.add('correct');
    quizFeedback.className = 'quiz-feedback incorrect';
    quizFeedback.textContent = `❌ Not quite. ${quiz.explanation}`;
    // Queue this question to be re-asked later
    wrongQueue.push({ quiz, category });
  }

  quizFeedback.classList.remove('hidden');
  quizContinueBtn.classList.remove('hidden');
}

quizContinueBtn.addEventListener('click', () => {
  quizModal.classList.add('hidden');
});

// ----- Tips Modal -----
document.getElementById('tips-btn').addEventListener('click', () => {
  showTipsModal('time');
  tipsModal.classList.remove('hidden');
});

document.getElementById('close-tips-btn').addEventListener('click', () => {
  tipsModal.classList.add('hidden');
});

document.querySelectorAll('.tip-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tip-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    showTipsModal(tab.dataset.category);
  });
});

function showTipsModal(category) {
  tipsList.innerHTML = '';
  const tips = collectedTips[category];

  if (tips.length === 0) {
    tipsList.innerHTML = `<div class="no-tips">No tips collected yet. Clear lines to unlock tips!</div>`;
    return;
  }

  tips.forEach((tip) => {
    const card = document.createElement('div');
    card.className = `tip-card cat-${category}`;
    card.textContent = tip;
    tipsList.appendChild(card);
  });
}

// ----- Game Over -----
function gameOver() {
  // Update high score
  const prev = parseInt(localStorage.getItem('blockblast-highscore') || '0');
  if (score > prev) {
    localStorage.setItem('blockblast-highscore', score);
  }

  document.getElementById('final-score').textContent = score;
  document.getElementById('final-lines').textContent = linesCleared;
  const totalTips = Object.values(collectedTips).reduce((sum, arr) => sum + arr.length, 0);
  document.getElementById('final-tips').textContent = totalTips;

  const gameoverTips = document.getElementById('gameover-tips');
  gameoverTips.innerHTML = '';

  // Show quiz results from this session
  if (sessionQuizResults.length > 0) {
    const quizHeader = document.createElement('h4');
    quizHeader.textContent = '🧠 Quiz Results:';
    gameoverTips.appendChild(quizHeader);

    sessionQuizResults.forEach(({ category, question, correct, explanation }) => {
      const card = document.createElement('div');
      card.className = `tip-card cat-${category}`;
      card.innerHTML = `<strong>${correct ? '✅' : '❌'} ${question}</strong><br><span style="opacity:0.85">${explanation}</span>`;
      gameoverTips.appendChild(card);
    });
  }

  // Show ALL tips collected this session
  if (totalTips > 0) {
    const tipsHeader = document.createElement('h4');
    tipsHeader.textContent = `💡 All Tips Collected (${totalTips}):`;
    tipsHeader.style.marginTop = sessionQuizResults.length > 0 ? '16px' : '0';
    gameoverTips.appendChild(tipsHeader);

    Object.entries(collectedTips).forEach(([cat, tips]) => {
      tips.forEach((text) => {
        const card = document.createElement('div');
        card.className = `tip-card cat-${cat}`;
        card.textContent = text;
        gameoverTips.appendChild(card);
      });
    });
  }

  showScreen('gameover');
  stopMusic();
}

// ----- Music -----
let bgm = null;
function startMusic() {
  if (!bgm) {
    bgm = new Audio('./music/bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.3;
  }
  bgm.play().catch(() => {});
}
function stopMusic() {
  if (bgm) { bgm.pause(); bgm.currentTime = 0; }
}

// ----- Game Init -----
function startGame() {
  board = createBoard();
  score = 0;
  level = 1;
  linesCleared = 0;
  collectedTips = { time: [], ai: [], docs: [], connect: [] };
  tipIndices = { time: 0, ai: 0, docs: 0, connect: 0 };
  quizProgress = { time: 0, ai: 0, docs: 0, connect: 0 };
  wrongQueue = [];
  sessionQuizResults = [];

  scoreEl.textContent = '0';
  levelEl.textContent = '1';
  highScoreEl.textContent = localStorage.getItem('blockblast-highscore') || '0';

  currentPieces = generatePieceSet(level);
  renderBoard();
  renderTray();
  showScreen('game');
  startMusic();
}

// ----- Event Listeners -----
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('how-to-btn').addEventListener('click', () => showScreen('howTo'));
document.getElementById('back-to-start-btn').addEventListener('click', () => showScreen('start'));
document.getElementById('back-to-menu-btn').addEventListener('click', () => {
  window.location.href = '../';
});
document.getElementById('play-again-btn').addEventListener('click', startGame);
document.getElementById('main-menu-btn').addEventListener('click', () => {
  window.location.href = '../';
});

document.getElementById('pause-btn').addEventListener('click', pauseGame);

const pauseModal = document.getElementById('pause-modal');

function pauseGame() {
  if (!screens.game.classList.contains('active')) return;
  pauseModal.classList.remove('hidden');
  if (bgm) bgm.pause();
}

function resumeGame() {
  pauseModal.classList.add('hidden');
  if (bgm) bgm.play().catch(() => {});
}

document.getElementById('pause-continue-btn').addEventListener('click', resumeGame);
document.getElementById('pause-menu-btn').addEventListener('click', () => {
  stopMusic();
  window.location.href = '../';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!pauseModal.classList.contains('hidden')) {
      resumeGame();
    } else if (screens.game.classList.contains('active')) {
      pauseGame();
    }
  }
});

// Initialize
showScreen('start');
