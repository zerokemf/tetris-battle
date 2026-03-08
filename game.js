// ==================== 7-Bag 方塊系統 ====================
const PIECES = 'IJLOSTZ';
const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
};
const COLORS = {
    I: '#00ffff', O: '#ffff00', T: '#a000f0',
    S: '#00d800', Z: '#f00000', J: '#0000f0', L: '#f0a000'
};

// ==================== SRS 踢牆數據庫 (Wall Kick Data) ====================
const SRS_KICK_DATA = {
    JLSTZ: {
        '0->1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
        '1->0': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
        '1->2': [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]],
        '2->1': [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
        '2->3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
        '3->2': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
        '3->0': [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
        '0->3': [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]]
    },
    I: {
        '0->1': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2]],
        '1->0': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2]],
        '1->2': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1]],
        '2->1': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1]],
        '2->3': [[0,0], [ 2,0], [-1,0], [ 2,-1], [-1, 2]],
        '3->2': [[0,0], [-2,0], [ 1,0], [-2, 1], [ 1,-2]],
        '3->0': [[0,0], [ 1,0], [-2,0], [ 1, 2], [-2,-1]],
        '0->3': [[0,0], [-1,0], [ 2,0], [-1,-2], [ 2, 1]]
    }
};

class Bag7 {
    constructor() { this.bag = []; this.refill(); }
    refill() { this.bag = [...PIECES].sort(() => Math.random() - 0.5); }
    next() { if (this.bag.length === 0) this.refill(); return this.bag.pop(); }
}

// ==================== 方塊類 ====================
class Piece {
    constructor(type, board) {
        this.type = type;
        this.shape = SHAPES[type].map(r => [...r]);
        this.color = COLORS[type];
        this.board = board;
        this.x = 3;
        this.y = 0;
        this.rotIndex = 0; // 🌟 追蹤目前旋轉狀態
    }

    getGhostY() {
        let ghostY = this.y;
        while (this.board.valid(this, this.x, ghostY + 1)) ghostY++;
        return ghostY;
    }

    move(dx, dy) {
        if (this.board.valid(this, this.x + dx, this.y + dy)) {
            this.x += dx;
            this.y += dy;
            return true;
        }
        return false;
    }

    hardDrop() {
        this.y = this.getGhostY();
        this.board.lockPiece();
    }
}

// ==================== 粒子特效 ====================
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10 - 2;
        this.gravity = 0.15;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.life = 1;
    }
    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/3, this.y - this.size/3, this.size*0.66, this.size*0.66);
        ctx.restore();
    }
}

// ==================== 渲染器 ====================
class GameRenderer {
    constructor(boardId, fxId) {
        this.boardCanvas = document.getElementById(boardId);
        this.boardCtx = this.boardCanvas.getContext('2d');
        this.fxCanvas = document.getElementById(fxId);
        this.fxCtx = this.fxCanvas.getContext('2d');
        this.blockSize = 36;
        this.particles = [];
        this.resize();
    }

    resize() {
        const container = this.boardCanvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        // 计算最大可能的blockSize，保持10:20比例
        const maxBlockWidth = Math.floor(containerRect.width / 10);
        const maxBlockHeight = Math.floor(containerRect.height / 20);
        let blockSize = Math.min(maxBlockWidth, maxBlockHeight);
        
        // 确保blockSize至少为1，且是整数
        blockSize = Math.max(1, Math.floor(blockSize));
        
        // 设置精确的画布尺寸（10x20网格）
        const canvasWidth = blockSize * 10;
        const canvasHeight = blockSize * 20;
        
        this.boardCanvas.width = canvasWidth;
        this.boardCanvas.height = canvasHeight;
        this.fxCanvas.width = canvasWidth;
        this.fxCanvas.height = canvasHeight;
        this.blockSize = blockSize;
    }

    clear() {
        this.boardCtx.fillStyle = '#0a0a15';
        this.boardCtx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
        this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    }

    drawGrid() {
        this.boardCtx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.boardCtx.lineWidth = 1;
        const cols = 10, rows = 20;
        for (let x = 0; x <= cols; x++) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(x * this.blockSize, 0);
            this.boardCtx.lineTo(x * this.blockSize, this.boardCanvas.height);
            this.boardCtx.stroke();
        }
        for (let y = 0; y <= rows; y++) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(0, y * this.blockSize);
            this.boardCtx.lineTo(this.boardCanvas.width, y * this.blockSize);
            this.boardCtx.stroke();
        }
    }

    drawMatrix(matrix, offsetX, offsetY, color, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((val, x) => {
                if (val) {
                    const px = (offsetX + x) * this.blockSize;
                    const py = (offsetY + y) * this.blockSize;
                    this.boardCtx.save();
                    if (isGhost) {
                        // 更明显的幽灵方块：半透明填充 + 粗边框
                        this.boardCtx.globalAlpha = 0.2;
                        this.boardCtx.fillStyle = color;
                        this.boardCtx.fillRect(px + 2, py + 2, this.blockSize - 4, this.blockSize - 4);
                        
                        this.boardCtx.globalAlpha = 0.8;
                        this.boardCtx.strokeStyle = '#ffffff'; // 白色边框更醒目
                        this.boardCtx.lineWidth = 3;
                        this.boardCtx.strokeRect(px + 2, py + 2, this.blockSize - 4, this.blockSize - 4);
                    } else {
                        this.boardCtx.fillStyle = color;
                    this.boardCtx.fillRect(px, py, this.blockSize, this.blockSize);
                    // 经典立体效果 - 高光和阴影
                    this.boardCtx.fillStyle = 'rgba(255,255,255,0.3)';
                    this.boardCtx.fillRect(px + 2, py + 2, this.blockSize - 4, 3);
                    this.boardCtx.fillRect(px + 2, py + 2, 3, this.blockSize - 4);
                    this.boardCtx.fillStyle = 'rgba(0,0,0,0.3)';
                    this.boardCtx.fillRect(px + this.blockSize - 5, py + 2, 3, this.blockSize - 4);
                    this.boardCtx.fillRect(px + 2, py + this.blockSize - 5, this.blockSize - 4, 3);
                        this.boardCtx.lineWidth = 1;
                        this.boardCtx.strokeRect(px, py, this.blockSize, this.blockSize);
                    }
                    this.boardCtx.restore();
                }
            });
        });
    }

    render(grid, piece) {
        this.resize();
        this.clear();
        this.drawGrid();
        
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                if (grid[r][c]) {
                    const color = COLORS[grid[r][c].toUpperCase()] || grid[r][c];
                    this.drawMatrix([[1]], c, r, color, false);
                }
            }
        }

        if (piece) {
            const ghostY = piece.getGhostY();
            this.drawMatrix(piece.shape, piece.x, ghostY, piece.color, true);
            this.drawMatrix(piece.shape, piece.x, piece.y, piece.color, false);
        }

        this.fxCtx.save();
        this.fxCtx.globalCompositeOperation = 'lighter';
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            this.particles[i].draw(this.fxCtx);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        this.fxCtx.restore();
    }

    spawnParticles(x, y, color) {
        for (let i = 0; i < 12; i++) {
            this.particles.push(new Particle(
                x * this.blockSize + this.blockSize/2,
                y * this.blockSize + this.blockSize/2,
                color
            ));
        }
    }

    renderPreview(canvas, type) {
        const ctx = canvas.getContext('2d');
        // 根據容器尺寸設置canvas像素尺寸
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        
        // 設置canvas像素尺寸（使用容器尺寸）
        canvas.width = containerWidth;
        canvas.height = containerHeight;
        
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        if (!type || !SHAPES[type]) return;
        const shape = SHAPES[type];
        // 根據形狀寬高計算大小，確保置中且不超過畫布
        const shapeW = shape[0].length;
        const shapeH = shape.length;
        // 限制最大尺寸，避免O方塊過大
        const maxBlockSize = Math.min(w, h) * 0.3;
        const sizeX = (w - 4) / shapeW;
        const sizeY = (h - 4) / shapeH;
        let size = Math.min(sizeX, sizeY);
        size = Math.min(size, maxBlockSize);
        const ox = (w - shapeW * size) / 2;
        const oy = (h - shapeH * size) / 2;
        for (let r = 0; r < shapeH; r++) {
            for (let c = 0; c < shapeW; c++) {
                if (shape[r][c]) {
                    ctx.fillStyle = COLORS[type];
                    
                    
                    ctx.fillRect(ox + c * size, oy + r * size, size - 1, size - 1);
                }
            }
        }
    }
}

// ==================== 游戏核心 ====================
const COLS = 10, ROWS = 20, EMPTY = 0;
let bag = new Bag7();

class Tetris {
    constructor() {
        this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.stars = 5;
        this.piece = null;
        this.next = null;
        this.hold = null;
        this.canHold = true;
        this.over = false;
        this.interval = 1000;
        this.lastTime = 0;
        
        this.renderer = new GameRenderer('board1', 'fx1');
        this.holdCanvas = document.getElementById('hold1');
        this.nextCanvas = document.getElementById('next1');
    }

    spawn() {
        const nextType = this.next || bag.next();
        this.piece = new Piece(nextType, this);
        this.next = bag.next();
        this.canHold = true;
        if (!this.valid(this.piece, this.piece.x, this.piece.y)) this.over = true;
    }

    valid(p, x, y) {
        for (let r = 0; r < p.shape.length; r++) {
            for (let c = 0; c < p.shape[r].length; c++) {
                if (p.shape[r][c]) {
                    const nx = x + c, ny = y + r;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
                    if (ny >= 0 && this.grid[ny][nx]) return false;
                }
            }
        }
        return true;
    }

    // 🌟 核心升級：SRS 旋轉與踢牆引擎 (dir: 1順轉, -1逆轉)
    rotate(dir = 1) {
        if (this.piece.type === 'O') return; // O方塊不旋轉

        const oldShape = this.piece.shape;
        const N = oldShape.length;
        const newShape = Array.from({ length: N }, () => Array(N).fill(0));

        // 1. 矩陣旋轉
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (dir === 1) newShape[r][c] = oldShape[N - 1 - c][r];
                else newShape[r][c] = oldShape[c][N - 1 - r];
            }
        }

        // 2. 獲取踢牆數據表
        const nextRotIndex = (this.piece.rotIndex + dir + 4) % 4;
        const kickKey = `${this.piece.rotIndex}->${nextRotIndex}`;
        const kickTable = (this.piece.type === 'I') ? SRS_KICK_DATA.I : SRS_KICK_DATA.JLSTZ;
        const tests = kickTable[kickKey];

        // 3. 執行 5 次探測
        this.piece.shape = newShape;
        for (let i = 0; i < tests.length; i++) {
            const dx = tests[i][0];
            const dy = tests[i][1];
            if (this.valid(this.piece, this.piece.x + dx, this.piece.y + dy)) {
                this.piece.x += dx;
                this.piece.y += dy;
                this.piece.rotIndex = nextRotIndex;
                play('rotate');
                return;
            }
        }

        // 4. 探測失敗，復原形狀
        this.piece.shape = oldShape;
    }

    move(dir) { if (this.piece.move(dir, 0)) play('move'); }

    drop() {
        if (this.piece.move(0, 1)) { play('drop'); return true; }
        return false;
    }

    hardDrop() { this.piece.hardDrop(); play('drop'); }

    lockPiece() {
        for (let r = 0; r < this.piece.shape.length; r++) {
            for (let c = 0; c < this.piece.shape[r].length; c++) {
                if (this.piece.shape[r][c]) {
                    const y = this.piece.y + r, x = this.piece.x + c;
                    if (y >= 0) this.grid[y][x] = this.piece.type.toLowerCase();
                }
            }
        }
        this.clearLines();
        this.spawn();
    }

    clearLines() {
        let lines = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every(c => c)) {
                for (let c = 0; c < COLS; c++) {
                    this.renderer.spawnParticles(c, r, COLORS[this.grid[r][c].toUpperCase()] || '#fff');
                }
                this.grid.splice(r, 1);
                this.grid.unshift(Array(COLS).fill(EMPTY));
                lines++;
                r++;
            }
        }
        if (lines > 0) {
            play('clear');
            this.score += [0, 100, 300, 500, 800][lines] * this.level;
            this.lines += lines;
            this.level = Math.floor(this.lines / 10) + 1;
            this.interval = Math.max(100, 1000 - (this.level - 1) * 100);
        }
    }

    holdPiece() {
        if (!this.canHold) return;
        play('hold');
        const t = this.piece.type;
        if (this.hold) { this.piece = new Piece(this.hold, this); }
        else { this.spawn(); }
        this.hold = t;
        this.canHold = false;
    }

    update(time) {
        if (this.over || isPaused) return;
        if (time - this.lastTime > this.interval) {
            if (!this.drop()) this.lockPiece();
            this.lastTime = time;
        }
    }

    render() {
        this.renderer.render(this.grid, this.piece);
        this.renderer.renderPreview(this.holdCanvas, this.hold);
        this.renderer.renderPreview(this.nextCanvas, this.next);
        
        document.getElementById('score1').textContent = this.score;
        document.getElementById('level1').textContent = this.level;
        document.getElementById('sent1').textContent = this.lines;
        document.getElementById('stars1').textContent = '★'.repeat(this.stars) + '☆'.repeat(5 - this.stars);
    }
}

// ==================== 音效 ====================
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function play(type) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        switch(type) {
            case 'move': osc.frequency.value = 220; osc.type = 'sine'; gain.gain.setValueAtTime(0.03, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05); break;
            case 'rotate': osc.frequency.value = 330; osc.type = 'sine'; gain.gain.setValueAtTime(0.03, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08); osc.start(); osc.stop(audioCtx.currentTime + 0.08); break;
            case 'drop': osc.frequency.value = 150; osc.type = 'square'; gain.gain.setValueAtTime(0.02, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03); osc.start(); osc.stop(audioCtx.currentTime + 0.03); break;
            case 'clear': for(let i=0;i<4;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=440+i*110;o.type='sine';g.gain.setValueAtTime(0.05,audioCtx.currentTime+i*0.08);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+i*0.08+0.15);o.start(audioCtx.currentTime+i*0.08);o.stop(audioCtx.currentTime+i*0.08+0.15);}break;
            case 'hold': osc.frequency.value = 550; osc.type = 'sine'; gain.gain.setValueAtTime(0.04, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); break;
            case 'over': osc.frequency.value = 200; osc.type = 'sawtooth'; gain.gain.setValueAtTime(0.06, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); break;
        }
    } catch(e) {}
}

// ==================== Input Manager ====================
class InputManager {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.keyTimers = {};
        this.DAS = 130;
        this.ARR = 30;
        this.lastTime = performance.now();
        this.initListeners();
    }
    initListeners() {
        window.addEventListener('keydown', e => {
            if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
            if (!this.keys[e.code]) {
                this.keys[e.code] = true;
                this.keyTimers[e.code] = 0;
                this.triggerAction(e.code);
            }
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            this.keyTimers[e.code] = 0;
        });
    }
    update() {
        const now = performance.now();
        const dt = now - this.lastTime;
        this.lastTime = now;
        for (const [key, pressed] of Object.entries(this.keys)) {
            if (pressed) {
                this.keyTimers[key] += dt;
                if (this.keyTimers[key] >= this.DAS) {
                    while (this.keyTimers[key] >= this.DAS + this.ARR) {
                        this.triggerAction(key);
                        if (this.ARR === 0) { this.keyTimers[key] = this.DAS; break; }
                        this.keyTimers[key] -= this.ARR;
                    }
                }
            }
        }
    }
    triggerAction(keyCode) {
        if (!this.game) return;
        switch(keyCode) {
            case 'ArrowLeft': this.game.move(-1); break;
            case 'ArrowRight': this.game.move(1); break;
            case 'ArrowDown': this.game.drop(); break;
            case 'ArrowUp': this.game.rotate(1); break; // 🌟 順轉
            case 'KeyZ': this.game.rotate(-1); break;   // 🌟 逆轉
            case 'KeyC': this.game.holdPiece(); break;
            case 'Space': this.game.hardDrop(); this.keys['Space'] = false; break;
        }
    }
}

// ==================== 游戏控制 ====================
let game = null;
let inputManager = null;
let running = false;
let isPaused = false;

function startGame() {
    initAudio();
    bag = new Bag7();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('status-overlay').classList.add('hidden');
    
    game = new Tetris();
    game.spawn();
    inputManager = new InputManager(game);
    
    running = true;
    isPaused = false;
    loop();
}

function backMenu() {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('menu').classList.remove('hidden');
    running = false;
}

function togglePause() {
    if (!running) return;
    isPaused = !isPaused;
    const overlay = document.getElementById('status-overlay');
    overlay.textContent = isPaused ? 'PAUSED' : '';
    overlay.classList.toggle('hidden', !isPaused);
    if (!isPaused) {
        game.lastTime = performance.now();
        inputManager.lastTime = performance.now();
        loop();
    }
}

function loop(time = 0) {
    if (!running || isPaused) return;
    inputManager.update();
    game.update(time);
    game.render();
    if (game.over) {
        running = false;
        play('over');
        document.getElementById('winner-text').textContent = '遊戲結束！';
        document.getElementById('gameover').classList.add('show');
        return;
    }
    requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'p' || e.key === 'P') togglePause();
});

// 雪花特效
const snow = document.createElement('div');
snow.className = 'snow';
document.body.appendChild(snow);
for (let i = 0; i < 25; i++) {
    const s = document.createElement('div');
    s.className = 'snowflake';
    s.textContent = '❄';
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDuration = Math.random() * 5 + 5 + 's';
    s.style.animationDelay = Math.random() * 10 + 's';
    s.style.fontSize = Math.random() * 10 + 10 + 'px';
    snow.appendChild(s);
}

// 視窗大小改變時調整
window.addEventListener('resize', () => {
    if (game && game.renderer) {
        game.renderer.resize();
        game.render();
    }
});
