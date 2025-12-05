// === AYARLAR ===
const BOARD_SIZE = 8;

// === GLOBAL STATE ===
let board = [];
let score = 0;
let highScore = 0;
let isGameOver = false;

// Seçili parça
let selectedPiece = null;   // DOM elemanı
let selectedShape = null;   // Matris (2D array)

// Power-up: Satır Sil
let clearRowCharges = 1;
let clearRowMode = false;

// Power-up: Parça Yenile
let rerollCharges = 1;

// Power-up: Undo
let undoCharges = 1;
let lastState = null;

// Satır/sütun temizleme serisi (art arda clear)
let clearStreak = 0;

// Drag & Drop
let isDragging = false;
let dragShape = null;
let dragPieceEl = null;
let dragPreviewEl = null;
let dragPointerId = null;

// Sesler
let sndPlace = null;
let sndClear = null;
let sndCombo = null;
let sndGameOver = null;

// === PARÇA ŞEKİLLERİ ===
const PIECES = [
  // Kare 2x2
  [
    [1, 1],
    [1, 1]
  ],

  // Yatay 3'lü
  [
    [1, 1, 1]
  ],

  // Dikey 2'li
  [
    [1],
    [1]
  ],

  // L parçası
  [
    [1, 0],
    [1, 0],
    [1, 1]
  ],

  // T parçası
  [
    [1, 1, 1],
    [0, 1, 0]
  ],

  // Tek kare
  [
    [1]
  ]
];

// === ELEMENT TİPLERİ ===
function getRandomElementType() {
  const r = Math.random();
  if (r < 0.07) return 'fire';   // %7 ateş
  if (r < 0.14) return 'water';  // %7 su
  return 'normal';               // %86 normal
}

function getColorForType(type) {
  switch (type) {
    case 'fire':
      return '#ff7043';
    case 'water':
      return '#42a5f5';
    default:
      return '#4a8';
  }
}

// === BAŞLANGIÇ ===
window.addEventListener('DOMContentLoaded', () => {
  // Sesleri al
  sndPlace    = document.getElementById('snd-place');
  sndClear    = document.getElementById('snd-clear');
  sndCombo    = document.getElementById('snd-combo');
  sndGameOver = document.getElementById('snd-gameover');

  const savedHigh = localStorage.getItem('bb_high_score');
  if (savedHigh) {
    const parsed = parseInt(savedHigh, 10);
    highScore = isNaN(parsed) ? 0 : parsed;
  }

  initBoard();
  renderBoard();
  generatePieces();
  setupPowerups();
  updateScore();
});

function playSound(audioEl, volume = 1) {
  if (!audioEl) return;
  try {
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.volume = volume;
    audioEl.play().catch(() => {});
  } catch (e) {
    console.warn('Ses çalınamadı:', e);
  }
}


// === TAHTA OLUŞTUR ===
function initBoard() {
  board = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push(null);
    }
    board.push(row);
  }
}

// === TAHTAYI ÇİZ ===
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cellEl = document.createElement('div');
      cellEl.classList.add('board-cell');

      if (board[y][x] !== null) {
        const type = board[y][x].type || 'normal';
        cellEl.style.background = board[y][x].color || getColorForType(type);

        if (board[y][x].justPlaced) {
          cellEl.classList.add('placed');
          board[y][x].justPlaced = false;
        }
      }

      // Satır sil modu hover
      if (clearRowMode && clearRowCharges > 0) {
        cellEl.addEventListener('mouseenter', () => {
          highlightRow(y, true);
        });
        cellEl.addEventListener('mouseleave', () => {
          highlightRow(y, false);
        });
      }

      cellEl.addEventListener('click', () => {
        if (isGameOver) return;

        // Satır sil modu
        if (clearRowMode && clearRowCharges > 0) {
          saveState();
          clearRowAt(y);
          return;
        }

        if (!selectedShape) return;
        tryPlacePiece(x, y);
      });

      boardEl.appendChild(cellEl);
    }
  }
}

// === SKOR GÜNCELLE + HIGH SCORE ===
function updateScore() {
  const scoreEl = document.getElementById('score');
  if (scoreEl) {
    scoreEl.textContent = score;

    // Skor her güncellendiğinde minik zıplama animasyonu
    scoreEl.classList.remove('score-bump');
    // reflow için küçük hack
    void scoreEl.offsetWidth;
    scoreEl.classList.add('score-bump');
  }

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('bb_high_score', String(highScore));
  }

  const highEl = document.getElementById('high-score');
  if (highEl) {
    highEl.textContent = `En Yüksek Skor: ${highScore}`;
  }
}


// === STATE KOPYALAMA ===
function cloneBoard(b) {
  return b.map(row =>
    row.map(cell => (cell ? { ...cell } : null))
  );
}

function saveState() {
  const piecesEl = document.getElementById('pieces');
  const piecesData = [];

  if (piecesEl) {
    const pieceNodes = piecesEl.querySelectorAll('.piece');
    pieceNodes.forEach(p => {
      const idx = parseInt(p.dataset.shapeIndex, 10);
      piecesData.push(idx);
    });
  }

  lastState = {
    board: cloneBoard(board),
    score,
    clearRowCharges,
    clearRowMode: false,
    rerollCharges,
    undoCharges,
    piecesData,
    clearStreak
  };
}

function restoreState() {
  if (!lastState) return;

  board = cloneBoard(lastState.board);
  score = lastState.score;
  clearRowCharges = lastState.clearRowCharges;
  clearRowMode = lastState.clearRowMode;
  rerollCharges = lastState.rerollCharges;
  undoCharges = lastState.undoCharges;
  clearStreak = lastState.clearStreak;

  const piecesEl = document.getElementById('pieces');
  if (piecesEl) {
    piecesEl.innerHTML = '';
    selectedPiece = null;
    selectedShape = null;

    lastState.piecesData.forEach(shapeIndex => {
      const pieceEl = createPieceElement(shapeIndex);
      piecesEl.appendChild(pieceEl);
    });
  }

  renderBoard();
  updateScore();
  updatePowerupUI();
}

// === POWER-UP SETUP ===
function setupPowerups() {
  const btnClearRow = document.getElementById('pu-clear-row');
  const btnReroll   = document.getElementById('pu-reroll');
  const btnUndo     = document.getElementById('pu-undo');
  const btnReset    = document.getElementById('btn-reset');

  updatePowerupUI();

  if (btnClearRow) {
    btnClearRow.addEventListener('click', () => {
      if (isGameOver) return;
      if (clearRowCharges <= 0) return;
      clearRowMode = !clearRowMode;

      if (clearRowMode) {
        if (selectedPiece) {
          selectedPiece.classList.remove('selected');
          selectedPiece = null;
          selectedShape = null;
        }
      }

      renderBoard();

      // Ses + ufak buton animasyonu
    playSound(sndPlace, 0.5);
    btnReroll.classList.add('used-flash');
    setTimeout(() => btnReroll.classList.remove('used-flash'), 250);

      updatePowerupUI();
    });
  }

  if (btnReroll) {
    if (btnReroll) {
  btnReroll.addEventListener('click', () => {
    if (isGameOver) return;
    if (rerollCharges <= 0) return;
    saveState();
    rerollPieces();
    rerollCharges--;

    // Ses + ufak buton animasyonu
    playSound(sndPlace, 0.5);
    btnReroll.classList.add('used-flash');
    setTimeout(() => btnReroll.classList.remove('used-flash'), 250);

    updatePowerupUI();
  });
}
  }

  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (isGameOver) return;
      if (undoCharges <= 0) return;
      if (!lastState) return;
      restoreState();
      undoCharges--;
      lastState = null;

      // Ses + ufak buton animasyonu
    playSound(sndPlace, 0.5);
    btnReroll.classList.add('used-flash');
    setTimeout(() => btnReroll.classList.remove('used-flash'), 250);

      updatePowerupUI();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      resetGame();
    });
  }
}

function updatePowerupUI() {
  const btnClearRow = document.getElementById('pu-clear-row');
  const btnReroll   = document.getElementById('pu-reroll');
  const btnUndo     = document.getElementById('pu-undo');

  if (btnClearRow) {
    if (clearRowCharges > 0 && !isGameOver) {
      btnClearRow.disabled = false;
      btnClearRow.textContent = clearRowMode
        ? 'Satır Sil (Satırı Seç)'
        : `Satır Sil (${clearRowCharges})`;
    } else {
      btnClearRow.disabled = true;
      btnClearRow.textContent = 'Satır Sil (0)';
    }
    btnClearRow.classList.toggle('active', clearRowMode);
  }

  if (btnReroll) {
    if (rerollCharges > 0 && !isGameOver) {
      btnReroll.disabled = false;
      btnReroll.textContent = `Parça Yenile (${rerollCharges})`;
    } else {
      btnReroll.disabled = true;
      btnReroll.textContent = 'Parça Yenile (0)';
    }
  }

  if (btnUndo) {
    if (undoCharges > 0 && !isGameOver) {
      btnUndo.disabled = false;
      btnUndo.textContent = `Geri Al (${undoCharges})`;
    } else {
      btnUndo.disabled = true;
      btnUndo.textContent = 'Geri Al (0)';
    }
  }
}

// === PARÇA OLUŞTUR ===
function createPieceElement(shapeIndex) {
  const shape = PIECES[shapeIndex];

  const pieceEl = document.createElement('div');
  pieceEl.classList.add('piece');
  pieceEl.dataset.shapeIndex = shapeIndex;

  shape.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.classList.add('piece-row');

    row.forEach(cell => {
      const cellEl = document.createElement('div');
      cellEl.classList.add('piece-cell');
      if (cell === 1) cellEl.classList.add('filled');
      rowEl.appendChild(cellEl);
    });

    pieceEl.appendChild(rowEl);
  });

  // Tıklayınca seç
  pieceEl.addEventListener('click', () => {
    if (isGameOver) return;

    if (clearRowMode) {
      clearRowMode = false;
      updatePowerupUI();
    }

    document.querySelectorAll('.piece').forEach(p => p.classList.remove('selected'));

    pieceEl.classList.add('selected');
    selectedPiece = pieceEl;
    selectedShape = shape;
  });

  // Sürükleme: pointerdown (mouse + touch + kalem)
  pieceEl.addEventListener('pointerdown', (e) => {
    if (isGameOver || clearRowMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // sadece sol klik
    e.preventDefault();
    startDragPiece(pieceEl, shape, e);
  });

  return pieceEl;
}

// === ALTTAKİ 3 PARÇAYI ÜRET ===
function generatePieces() {
  const piecesEl = document.getElementById('pieces');
  piecesEl.innerHTML = '';

  selectedPiece = null;
  selectedShape = null;

  for (let i = 0; i < 3; i++) {
    const shapeIndex = Math.floor(Math.random() * PIECES.length);
    const pieceEl = createPieceElement(shapeIndex);
    piecesEl.appendChild(pieceEl);
  }
}

// === HER YERE SIĞAR MI (GAME OVER KONTROLÜ İÇİN) ===
function canPlaceShapeAnywhere(shape) {
  const h = shape.length;
  const w = shape[0].length;

  for (let by = 0; by < BOARD_SIZE; by++) {
    for (let bx = 0; bx < BOARD_SIZE; bx++) {
      let foundPlacement = false;

      for (let oy = 0; oy < h; oy++) {
        for (let ox = 0; ox < w; ox++) {
          if (shape[oy][ox] !== 1) continue;

          const startX = bx - ox;
          const startY = by - oy;

          if (
            startX < 0 ||
            startY < 0 ||
            startX + w > BOARD_SIZE ||
            startY + h > BOARD_SIZE
          ) {
            continue;
          }

          let collision = false;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if (shape[y][x] === 1) {
                if (board[startY + y][startX + x] !== null) {
                  collision = true;
                  break;
                }
              }
            }
            if (collision) break;
          }

          if (!collision) {
            foundPlacement = true;
            break;
          }
        }
        if (foundPlacement) break;
      }

      if (foundPlacement) return true;
    }
  }

  return false;
}

// === GAME OVER KONTROLÜ ===
function checkGameOver() {
  const piecesEl = document.getElementById('pieces');
  if (!piecesEl) return;

  const pieceNodes = piecesEl.querySelectorAll('.piece');
  if (pieceNodes.length === 0) return; // yeni parça gelecek zaten

  // Her parça için board'a sığıyor mu?
  for (const p of pieceNodes) {
    const idx = parseInt(p.dataset.shapeIndex, 10);
    const shape = PIECES[idx];
    if (canPlaceShapeAnywhere(shape)) {
      return; // en az bir hamle var
    }
  }

  // Hiç hamle yok, ama elinde power-up var mı?
  if (clearRowCharges > 0 || rerollCharges > 0 || undoCharges > 0) {
    console.log('Hamle yok ama power-up hakkı var, oyun devam ediyor.');
    return;
  }

  // Gerçek game over
  isGameOver = true;
  updatePowerupUI();

  playSound(sndGameOver, 0.8);

  setTimeout(() => {
    alert(`Oyun bitti! Skorun: ${score}`);
  }, 50);
}

// === PARÇAYI YERLEŞTİRME (PİVOT MANTIĞI) ===
function tryPlacePiece(boardX, boardY) {
  if (!selectedShape) return;
  if (isGameOver) return;

  const h = selectedShape.length;
  const w = selectedShape[0].length;

  let startX = null;
  let startY = null;
  let foundPlacement = false;

  // Pivot arama: içindeki her 1 için dene
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      if (selectedShape[oy][ox] !== 1) continue;

      const candidateStartX = boardX - ox;
      const candidateStartY = boardY - oy;

      if (
        candidateStartX < 0 ||
        candidateStartY < 0 ||
        candidateStartX + w > BOARD_SIZE ||
        candidateStartY + h > BOARD_SIZE
      ) {
        continue;
      }

      let collision = false;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (selectedShape[y][x] === 1) {
            if (board[candidateStartY + y][candidateStartX + x] !== null) {
              collision = true;
              break;
            }
          }
        }
        if (collision) break;
      }

      if (!collision) {
        startX = candidateStartX;
        startY = candidateStartY;
        foundPlacement = true;
        break;
      }
    }
    if (foundPlacement) break;
  }

  if (!foundPlacement) {
    console.log('Yerleştirilemedi (pivot yok)');
    return;
  }

  // Geçerli hamle → state kaydet
  saveState();

  let placedCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (selectedShape[y][x] === 1) {
        const type = getRandomElementType();
        board[startY + y][startX + x] = {
          type,
          color: getColorForType(type),
          justPlaced: true
        };
        placedCount++;
      }
    }
  }

  // Parça yerleştirme sesi
  playSound(sndPlace, 0.7);

  // Yerleştirme puanı: kaç kare koyduysan o kadar
  score += placedCount;

  // Satır/sütun temizleme + bonuslar
  const bonus = clearCompletedLines();
  score += bonus;

  updateScore();

  // seçili parçayı sil
  if (selectedPiece) {
    selectedPiece.remove();
  }
  selectedPiece = null;
  selectedShape = null;

  renderBoard();

  // parçalar bitti ise yenilerini üret
  if (document.querySelectorAll('.piece').length === 0) {
    generatePieces();
  }

  // animasyon bittikten sonra game over kontrolü
  setTimeout(() => {
    checkGameOver();
  }, 220);
}

// === SATIR SİLME ===
function clearRowAt(rowY) {
  const cells = document.querySelectorAll('.board-cell');
  let cleared = 0;

  for (let x = 0; x < BOARD_SIZE; x++) {
    if (board[rowY][x] !== null) {
      const cell = cells[rowY * BOARD_SIZE + x];
      if (cell) cell.classList.add('clearing');
    }
  }

  setTimeout(() => {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[rowY][x] !== null) {
        board[rowY][x] = null;
        cleared++;
      }
    }

    if (cleared > 0) {
      const bonus = cleared * 2;
      score += bonus;
      updateScore();
    }

    clearRowCharges--;
    clearRowMode = false;

    updatePowerupUI();
    renderBoard();

    setTimeout(() => {
      checkGameOver();
    }, 220);
  }, 180);
}

// === SATIR/SÜTUN TEMİZLEME + PUAN ===
function clearCompletedLines() {
  let fullRows = [];
  let fullCols = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    let full = true;
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === null) {
        full = false;
        break;
      }
    }
    if (full) fullRows.push(y);
  }

  for (let x = 0; x < BOARD_SIZE; x++) {
    let full = true;
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (board[y][x] === null) {
        full = false;
        break;
      }
    }
    if (full) fullCols.push(x);
  }

  if (fullRows.length === 0 && fullCols.length === 0) {
    clearStreak = 0;
    return 0;
  }

  const toClear = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    toClear[y] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      toClear[y][x] = false;
    }
  }

  fullRows.forEach(rowY => {
    for (let x = 0; x < BOARD_SIZE; x++) {
      toClear[rowY][x] = true;
    }
  });

  fullCols.forEach(colX => {
    for (let y = 0; y < BOARD_SIZE; y++) {
      toClear[y][colX] = true;
    }
  });

  const baseClear = toClear.map(row => row.slice());

  // Element etkileri
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (baseClear[y][x] && board[y][x] !== null) {
        const type = board[y][x].type || 'normal';

        if (type === 'fire') {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
                toClear[ny][nx] = true;
              }
            }
          }
        } else if (type === 'water') {
          for (let dy = -2; dy <= 2; dy++) {
            const ny = y + dy;
            if (ny >= 0 && ny < BOARD_SIZE) {
              toClear[ny][x] = true;
            }
          }
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < BOARD_SIZE) {
              toClear[y][nx] = true;
            }
          }
        }
      }
    }
  }

  const cells = document.querySelectorAll('.board-cell');
  let clearedCells = 0;
  let extraFromElements = 0;

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (toClear[y][x] && board[y][x] !== null) {
        const cell = cells[y * BOARD_SIZE + x];
        if (cell) cell.classList.add('clearing');
        clearedCells++;

        if (!baseClear[y][x]) {
          extraFromElements++;
        }
      }
    }
  }

  const lineCount = fullRows.length + fullCols.length;
  let bonusScore = 0;

  // 1) Kırılan toplam blok sayısı kadar puan
  bonusScore += clearedCells;

  // 2) Combo: aynı hamlede 2+ çizgi
  if (lineCount >= 2) {
    bonusScore += 100;
  }

  // 3) Element bonusu
  if (extraFromElements > 0) {
    bonusScore += 150;
  }

  // 4) Streak: art arda clear
  clearStreak++;
  if (clearStreak >= 2) {
    bonusScore += 500;
  }

    // Ses: satır/sütun kırılma + combo/streak
  if (lineCount > 0) {
    if (lineCount >= 2 || clearStreak >= 2) {
      playSound(sndCombo, 0.85);  // büyük temizlik/kombo için
    } else {
      playSound(sndClear, 0.8);   // tek satır/sütun için
    }
  }

  setTimeout(() => {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (toClear[y][x] && board[y][x] !== null) {
          board[y][x] = null;
        }
      }
    }
    renderBoard();
  }, 180);

  console.log(
    `Satır: ${fullRows.length}, Sütun: ${fullCols.length}, ` +
    `Temizlenen hücre: ${clearedCells}, Element ekstra: ${extraFromElements}, ` +
    `Streak: ${clearStreak}, Bonus Puan: ${bonusScore}`
  );

  return bonusScore;
}

// === SATIR HIGHLIGHT ===
function highlightRow(rowY, active) {
  const cells = document.querySelectorAll('.board-cell');
  for (let x = 0; x < BOARD_SIZE; x++) {
    const cell = cells[rowY * BOARD_SIZE + x];
    if (!cell) continue;
    if (active) cell.classList.add('row-target');
    else cell.classList.remove('row-target');
  }
}

// === PARÇA YENİLE ===
function rerollPieces() {
  const piecesEl = document.getElementById('pieces');
  if (!piecesEl) return;

  piecesEl.innerHTML = '';
  selectedPiece = null;
  selectedShape = null;

  generatePieces();
}

// === OYUNU SIFIRLA ===
function resetGame() {
  isGameOver = false;
  score = 0;
  clearRowCharges = 1;
  rerollCharges = 1;
  undoCharges = 1;
  clearRowMode = false;
  lastState = null;
  selectedPiece = null;
  selectedShape = null;
  clearStreak = 0;

  initBoard();
  renderBoard();
  generatePieces();
  updatePowerupUI();
  updateScore();
}

// === DRAG & DROP (POINTER EVENTS) ===
function startDragPiece(pieceEl, shape, event) {
  isDragging = true;
  dragShape = shape;
  dragPieceEl = pieceEl;
  dragPointerId = event.pointerId || null;

  document.querySelectorAll('.piece').forEach(p => p.classList.remove('selected'));
  pieceEl.classList.add('selected');
  selectedPiece = pieceEl;
  selectedShape = shape;

  dragPreviewEl = pieceEl.cloneNode(true);
  dragPreviewEl.classList.add('drag-preview');
  dragPreviewEl.style.position = 'fixed';
  dragPreviewEl.style.pointerEvents = 'none';
  dragPreviewEl.style.opacity = '0.85';
  dragPreviewEl.style.zIndex = '9999';
  document.body.appendChild(dragPreviewEl);

  updateDragPosition(event);
  updateGhostFromEvent(event);

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!isDragging) return;
  if (dragPointerId !== null && e.pointerId !== dragPointerId) return;

  updateDragPosition(e);
  updateGhostFromEvent(e);
}

function onPointerUp(e) {
  if (!isDragging) return;
  if (dragPointerId !== null && e.pointerId !== dragPointerId) return;

  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);

  if (dragPreviewEl) {
    dragPreviewEl.remove();
    dragPreviewEl = null;
  }

  const cell = getBoardCellFromClient(e.clientX, e.clientY);
  if (cell && selectedShape) {
    const [bx, by] = cell;
    tryPlacePiece(bx, by);
  }

  isDragging = false;
  dragShape = null;
  dragPieceEl = null;
  dragPointerId = null;

  clearGhostPreview();
}

function updateDragPosition(e) {
  if (!dragPreviewEl) return;
  dragPreviewEl.style.left = (e.clientX - dragPreviewEl.offsetWidth / 2) + 'px';
  dragPreviewEl.style.top  = (e.clientY - dragPreviewEl.offsetHeight / 2) + 'px';
}

function getBoardCellFromClient(clientX, clientY) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return null;

  const rect = boardEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return null;
  }

  const cellW = rect.width / BOARD_SIZE;
  const cellH = rect.height / BOARD_SIZE;

  const bx = Math.floor(x / cellW);
  const by = Math.floor(y / cellH);

  if (bx < 0 || bx >= BOARD_SIZE || by < 0 || by >= BOARD_SIZE) return null;
  return [bx, by];
}

// === GHOST PREVIEW ===
function clearGhostPreview() {
  document.querySelectorAll('.board-cell').forEach(c => {
    c.classList.remove('ghost-valid', 'ghost-invalid');
  });
}

function updateGhostFromEvent(e) {
  updateGhostPreview(e.clientX, e.clientY);
}

function updateGhostPreview(clientX, clientY) {
  clearGhostPreview();

  if (!isDragging || !selectedShape || isGameOver) return;

  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  const rect = boardEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const cellW = rect.width / BOARD_SIZE;
  const cellH = rect.height / BOARD_SIZE;

  const bx = Math.floor(x / cellW);
  const by = Math.floor(y / cellH);

  const h = selectedShape.length;
  const w = selectedShape[0].length;

  let startX = null;
  let startY = null;
  let foundPlacement = false;

  // tryPlacePiece ile aynı pivot mantığı
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      if (selectedShape[oy][ox] !== 1) continue;

      const candidateStartX = bx - ox;
      const candidateStartY = by - oy;

      if (
        candidateStartX < 0 ||
        candidateStartY < 0 ||
        candidateStartX + w > BOARD_SIZE ||
        candidateStartY + h > BOARD_SIZE
      ) {
        continue;
      }

      let collision = false;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          if (selectedShape[yy][xx] === 1) {
            if (board[candidateStartY + yy][candidateStartX + xx] !== null) {
              collision = true;
              break;
            }
          }
        }
        if (collision) break;
      }

      if (!collision) {
        startX = candidateStartX;
        startY = candidateStartY;
        foundPlacement = true;
        break;
      }
    }
    if (foundPlacement) break;
  }

  if (!foundPlacement) {
    return;
  }

  const cells = document.querySelectorAll('.board-cell');

  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (selectedShape[yy][xx] === 1) {
        const tx = startX + xx;
        const ty = startY + yy;
        if (tx >= 0 && tx < BOARD_SIZE && ty >= 0 && ty < BOARD_SIZE) {
          const cell = cells[ty * BOARD_SIZE + tx];
          if (cell) {
            cell.classList.add('ghost-valid');
          }
        }
      }
    }
  }
}
