// ==================== TETRIS BATTLE - Enhanced Edition ====================

// ==================== Constants ====================
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
    I: { base: '#00f3ff', light: '#80f9ff', dark: '#009aa3', glow: 'rgba(0,243,255,0.6)' },
    O: { base: '#ffe14d', light: '#fff0a0', dark: '#b89e20', glow: 'rgba(255,225,77,0.6)' },
    T: { base: '#b44dff', light: '#d49fff', dark: '#7a20b8', glow: 'rgba(180,77,255,0.6)' },
    S: { base: '#39ff14', light: '#8fff78', dark: '#22a00a', glow: 'rgba(57,255,20,0.6)' },
    Z: { base: '#ff2d55', light: '#ff7e97', dark: '#b81e3a', glow: 'rgba(255,45,85,0.6)' },
    J: { base: '#2d7fff', light: '#7eb3ff', dark: '#1a50b0', glow: 'rgba(45,127,255,0.6)' },
    L: { base: '#ff8c2d', light: '#ffba7e', dark: '#b86010', glow: 'rgba(255,140,45,0.6)' }
};

const TIER_COLORS = {
    1: { color: '#d0e0ff', glow: 'rgba(208,224,255,0.5)', name: 'SINGLE' },
    2: { color: '#00f3ff', glow: 'rgba(0,243,255,0.6)', name: 'DOUBLE' },
    3: { color: '#b44dff', glow: 'rgba(180,77,255,0.7)', name: 'TRIPLE' },
    4: { color: '#ff2d95', glow: 'rgba(255,45,149,0.8)', name: 'TETRIS!' }
};

const SRS_KICK_DATA = {
    JLSTZ: {
        '0->1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
        '1->0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
        '1->2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
        '2->1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
        '2->3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
        '3->2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
        '3->0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
        '0->3': [[0,0],[1,0],[1,-1],[0,2],[1,2]]
    },
    I: {
        '0->1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
        '1->0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
        '1->2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
        '2->1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
        '2->3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
        '3->2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
        '3->0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
        '0->3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]]
    }
};

const COLS = 10, ROWS = 20, EMPTY = 0;
const MAX_PARTICLES = 120;

// ==================== 7-Bag System ====================
class Bag7 {
    constructor() { this.bag = []; this.refill(); }
    refill() { this.bag = [...PIECES].sort(() => Math.random() - 0.5); }
    next() { if (this.bag.length === 0) this.refill(); return this.bag.pop(); }
}

// ==================== Piece ====================
class Piece {
    constructor(type, board) {
        this.type = type;
        this.shape = SHAPES[type].map(r => [...r]);
        this.color = COLORS[type];
        this.board = board;
        this.x = 3;
        this.y = type === 'I' ? -1 : 0;
        this.rotIndex = 0;
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
        let distance = 0;
        while (this.board.valid(this, this.x, this.y + 1)) {
            this.y++;
            distance++;
        }
        this.board.score += distance * 2;
        this.board.lockPiece();
        return distance;
    }
}

// ==================== Lightweight Particle ====================
class Particle {
    constructor(x, y, color, vx, vy, size, life, decay, gravity) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.life = life;
        this.decay = decay;
        this.gravity = gravity;
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
}

// ==================== Renderer ====================
class GameRenderer {
    constructor(boardId, fxId) {
        this.boardCanvas = document.getElementById(boardId);
        this.boardCtx = this.boardCanvas.getContext('2d');
        this.fxCanvas = document.getElementById(fxId);
        this.fxCtx = this.fxCanvas.getContext('2d');
        this.blockSize = 36;
        this.particles = [];
        this.flashLines = [];
        this.screenFlash = 0;
        this.screenFlashColor = '#fff';
        this.displayWidth = 0;
        this.displayHeight = 0;
        this._lastW = 0;
        this._lastH = 0;
        this.resize();
    }

    resize() {
        const rect = this.boardCanvas.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        // Only resize if dimensions actually changed
        if (w === this._lastW && h === this._lastH) return;
        this._lastW = w;
        this._lastH = h;
        const dpr = window.devicePixelRatio || 1;
        this.boardCanvas.width = w * dpr;
        this.boardCanvas.height = h * dpr;
        this.fxCanvas.width = w * dpr;
        this.fxCanvas.height = h * dpr;
        this.boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.displayWidth = w;
        this.displayHeight = h;
        this.blockSize = w / COLS;
    }

    clear() {
        const ctx = this.boardCtx;
        ctx.fillStyle = '#090d1c';
        ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
        this.fxCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    drawGrid() {
        const ctx = this.boardCtx;
        const bs = this.blockSize;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(x * bs, 0);
            ctx.lineTo(x * bs, this.displayHeight);
            ctx.stroke();
        }
        for (let y = 1; y < ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * bs);
            ctx.lineTo(this.displayWidth, y * bs);
            ctx.stroke();
        }
    }

    drawBlock(x, y, colorObj) {
        const ctx = this.boardCtx;
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;

        // Main fill with gradient
        const grad = ctx.createLinearGradient(px, py, px + bs, py + bs);
        grad.addColorStop(0, colorObj.light);
        grad.addColorStop(0.5, colorObj.base);
        grad.addColorStop(1, colorObj.dark);
        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px + 2, py + 2, bs - 4, 3);

        // Left highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 1, py + 2, 2, bs - 4);

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, bs - 1, bs - 1);
    }

    drawGhostBlock(x, y, colorObj) {
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;
        const ctx = this.boardCtx;

        ctx.save();
        // Visible fill
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colorObj.base;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        // Bright solid border
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colorObj.light;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 1.5, py + 1.5, bs - 3, bs - 3);

        // Top highlight
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 3, py + 2, bs - 6, 2);
        ctx.restore();
    }

    render(grid, piece) {
        this.resize();
        this.clear();
        this.drawGrid();

        // Draw locked blocks
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    const type = grid[r][c].toUpperCase();
                    const colorObj = COLORS[type] || COLORS['I'];
                    this.drawBlock(c, r, colorObj);
                }
            }
        }

        // Flash lines (clearing animation)
        for (let i = this.flashLines.length - 1; i >= 0; i--) {
            const fl = this.flashLines[i];
            fl.life -= 0.05;
            if (fl.life <= 0) {
                this.flashLines.splice(i, 1);
                continue;
            }
            const ctx = this.boardCtx;
            ctx.save();
            ctx.globalAlpha = fl.life * 0.7;
            ctx.fillStyle = fl.color;
            ctx.fillRect(0, fl.row * this.blockSize, this.displayWidth, this.blockSize);
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = fl.life * 0.4;
            ctx.fillRect(0, fl.row * this.blockSize + this.blockSize * 0.3, this.displayWidth, this.blockSize * 0.4);
            ctx.restore();
        }

        // Draw piece
        if (piece) {
            const ghostY = piece.getGhostY();
            if (ghostY !== piece.y) {
                piece.shape.forEach((row, r) => {
                    row.forEach((val, c) => {
                        if (val) this.drawGhostBlock(piece.x + c, ghostY + r, piece.color);
                    });
                });
            }
            piece.shape.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val && piece.y + r >= 0) {
                        this.drawBlock(piece.x + c, piece.y + r, piece.color);
                    }
                });
            });
        }

        // FX layer - particles
        const fctx = this.fxCtx;

        // Screen flash
        if (this.screenFlash > 0) {
            fctx.save();
            fctx.globalAlpha = this.screenFlash;
            fctx.fillStyle = this.screenFlashColor;
            fctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
            fctx.restore();
            this.screenFlash -= 0.05;
        }

        // Batch-draw particles (no per-particle save/restore or shadowBlur)
        fctx.globalCompositeOperation = 'lighter';
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.life <= 0) {
                // Fast swap-remove
                this.particles[i] = this.particles[this.particles.length - 1];
                this.particles.pop();
                continue;
            }
            fctx.globalAlpha = Math.min(p.life, 1);
            fctx.fillStyle = p.color;
            fctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        }
        fctx.globalAlpha = 1;
        fctx.globalCompositeOperation = 'source-over';
    }

    // Spawn particles scaled by tier (with hard cap)
    spawnClearEffect(rows, tier) {
        const bs = this.blockSize;
        const tierColor = TIER_COLORS[tier];

        rows.forEach(r => {
            const cy = r * bs + bs / 2;

            // Line flash
            this.flashLines.push({ row: r, life: 1, color: tierColor.color });

            // Particles per row: tier1=8, tier2=14, tier3=18, tier4=24
            const count = [0, 8, 14, 18, 24][tier];
            for (let i = 0; i < count; i++) {
                const cx = Math.random() * this.displayWidth;
                const speed = 1 + tier * 0.5;
                this.addParticle(cx, cy, tierColor.color,
                    (Math.random() - 0.5) * 8 * speed,
                    (Math.random() - 0.5) * 6 * speed - tier * 1.5,
                    Math.random() * (2 + tier) + 1.5,
                    1, 0.02, 0.12
                );
            }
        });

        // Tetris: star burst
        if (tier === 4) {
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            const cy = avgRow * bs + bs / 2;
            const cx = this.displayWidth / 2;
            for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const spd = 3 + Math.random() * 3;
                this.addParticle(cx, cy,
                    Math.random() > 0.5 ? '#ff2d95' : '#ffe14d',
                    Math.cos(angle) * spd, Math.sin(angle) * spd,
                    Math.random() * 4 + 3, 1, 0.012, 0.06
                );
            }
            this.screenFlash = 0.4;
            this.screenFlashColor = 'rgba(255,45,149,0.25)';
        } else if (tier === 3) {
            this.screenFlash = 0.2;
            this.screenFlashColor = 'rgba(180,77,255,0.15)';
        }
    }

    addParticle(x, y, color, vx, vy, size, life, decay, gravity) {
        if (this.particles.length >= MAX_PARTICLES) {
            // Replace oldest
            this.particles.shift();
        }
        this.particles.push(new Particle(x, y, color, vx, vy, size, life, decay, gravity));
    }

    spawnDropTrail(piece) {
        const bs = this.blockSize;
        piece.shape.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val) {
                    const px = (piece.x + c) * bs + bs / 2;
                    const py = (piece.y + r) * bs + bs / 2;
                    this.addParticle(px, py, piece.color.base,
                        (Math.random() - 0.5) * 3, -Math.random() * 2 - 1,
                        Math.random() * 2 + 1, 0.6, 0.04, 0.15
                    );
                }
            });
        });
    }

    spawnLockFlash(piece) {
        const bs = this.blockSize;
        piece.shape.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val) {
                    const px = (piece.x + c) * bs + bs / 2;
                    const py = (piece.y + r) * bs + bs / 2;
                    this.addParticle(px, py, '#fff',
                        0, 0, bs * 0.4, 0.4, 0.06, 0
                    );
                }
            });
        });
    }

    renderPreview(canvas, type, opacity) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = rect.width, h = rect.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(8,12,26,0.6)';
        ctx.fillRect(0, 0, w, h);

        if (!type || !SHAPES[type]) return;
        const shape = SHAPES[type];
        const colorObj = COLORS[type];
        const size = Math.min(w / (shape[0].length + 1), h / (shape.length + 1));
        const ox = (w - shape[0].length * size) / 2;
        const oy = (h - shape.length * size) / 2;

        ctx.globalAlpha = opacity !== undefined ? opacity : 1;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const px = ox + c * size;
                    const py = oy + r * size;
                    const grad = ctx.createLinearGradient(px, py, px + size, py + size);
                    grad.addColorStop(0, colorObj.light);
                    grad.addColorStop(0.5, colorObj.base);
                    grad.addColorStop(1, colorObj.dark);
                    ctx.fillStyle = grad;
                    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.fillRect(px + 2, py + 2, size - 4, 2);
                }
            }
        }
        ctx.globalAlpha = 1;
    }
}

// ==================== Game Core ====================
let bag = new Bag7();

class Tetris {
    constructor() {
        this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.piece = null;
        this.nextQueue = [];
        this.hold = null;
        this.canHold = true;
        this.over = false;
        this.interval = 1000;
        this.lastTime = 0;

        // Lock Delay system
        this.lockDelay = 500;       // 0.5s lock timer
        this.lockStartTime = 0;     // timestamp when lock delay started
        this.lockResets = 0;        // how many times lock has been reset
        this.lockResetMax = 15;     // max resets per piece
        this.isLocking = false;     // whether lock delay is active

        this.renderer = new GameRenderer('board1', 'fx1');
        this.holdCanvas = document.getElementById('hold1');
        this.nextCanvases = [
            document.getElementById('next1'),
            document.getElementById('next2'),
            document.getElementById('next3')
        ];

        this.wrapper = document.getElementById('canvas-wrapper');
        this.comboDisplay = document.getElementById('combo-display');
        this.actionText = document.getElementById('action-text');

        this.comboTimer = null;
        this.actionTimer = null;
    }

    spawn() {
        const nextType = this.nextQueue.length > 0 ? this.nextQueue.shift() : bag.next();
        this.piece = new Piece(nextType, this);
        while (this.nextQueue.length < 3) {
            this.nextQueue.push(bag.next());
        }
        this.canHold = true;
        this.isLocking = false;
        this.lockStartTime = 0;
        this.lockResets = 0;
        if (!this.valid(this.piece, this.piece.x, this.piece.y)) {
            this.over = true;
        }
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

    rotate(dir = 1) {
        if (this.piece.type === 'O') return;
        const oldShape = this.piece.shape;
        const N = oldShape.length;
        const newShape = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (dir === 1) newShape[r][c] = oldShape[N-1-c][r];
                else newShape[r][c] = oldShape[c][N-1-r];
            }
        }
        const nextRotIndex = (this.piece.rotIndex + dir + 4) % 4;
        const kickKey = `${this.piece.rotIndex}->${nextRotIndex}`;
        const kickTable = (this.piece.type === 'I') ? SRS_KICK_DATA.I : SRS_KICK_DATA.JLSTZ;
        const tests = kickTable[kickKey];
        this.piece.shape = newShape;
        for (let i = 0; i < tests.length; i++) {
            const dx = tests[i][0], dy = tests[i][1];
            if (this.valid(this.piece, this.piece.x + dx, this.piece.y + dy)) {
                this.piece.x += dx;
                this.piece.y += dy;
                this.piece.rotIndex = nextRotIndex;
                playSound('rotate');
                this.resetLockDelay();
                if (!this.isOnGround()) {
                    this.isLocking = false;
                }
                return;
            }
        }
        this.piece.shape = oldShape;
    }

    // Check if piece is resting on something (ground or other blocks)
    isOnGround() {
        return !this.valid(this.piece, this.piece.x, this.piece.y + 1);
    }

    // Reset lock delay timer (called on successful move/rotate while on ground)
    resetLockDelay(time) {
        if (this.isLocking && this.lockResets < this.lockResetMax) {
            this.lockStartTime = performance.now();
            this.lockResets++;
        }
    }

    move(dir) {
        if (this.piece.move(dir, 0)) {
            playSound('move');
            this.resetLockDelay();
            if (!this.isOnGround()) {
                this.isLocking = false;
            }
        }
    }

    drop() {
        if (this.piece.move(0, 1)) {
            if (this.isOnGround() && !this.isLocking) {
                this.isLocking = true;
                this.lockStartTime = performance.now();
            }
            return true;
        }
        return false;
    }

    hardDrop() {
        this.piece.hardDrop();
        this.renderer.spawnDropTrail(this.piece);
        playSound('hardDrop');
    }

    lockPiece() {
        this.renderer.spawnLockFlash(this.piece);
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
        // FIXED: Scan from top to bottom, collect full rows
        let linesCleared = 0;
        // Use a write pointer to compact the grid in-place
        // This avoids index-shifting bugs with splice
        const newGrid = [];
        const clearedRowIndices = [];

        for (let r = 0; r < ROWS; r++) {
            if (this.grid[r].every(c => c)) {
                clearedRowIndices.push(r);
                linesCleared++;
            } else {
                newGrid.push(this.grid[r]);
            }
        }

        if (linesCleared > 0) {
            // Pad top with empty rows
            while (newGrid.length < ROWS) {
                newGrid.unshift(Array(COLS).fill(EMPTY));
            }
            this.grid = newGrid;

            const tier = Math.min(linesCleared, 4);

            // Visual effects
            this.renderer.spawnClearEffect(clearedRowIndices, tier);
            this.triggerShake(tier);
            playSound('clear', tier);

            // Scoring
            const baseScore = [0, 100, 300, 500, 800][tier];
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            const comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
            this.score += baseScore * this.level + comboBonus;
            this.lines += linesCleared;
            this.level = Math.floor(this.lines / 10) + 1;
            this.interval = Math.max(80, 1000 - (this.level - 1) * 90);

            this.showActionText(TIER_COLORS[tier].name, tier);
            if (this.combo >= 2) this.showCombo(this.combo);
            this.popStat('score1');
            if (this.combo >= 2) this.popStat('combo1');
        } else {
            this.combo = 0;
        }
    }

    triggerShake(tier) {
        this.wrapper.classList.remove('shake', 'shake-heavy');
        void this.wrapper.offsetWidth;
        if (tier >= 4) this.wrapper.classList.add('shake-heavy');
        else if (tier >= 2) this.wrapper.classList.add('shake');
    }

    showActionText(text, tier) {
        const el = this.actionText;
        el.textContent = text;
        el.className = 'action-text show tier-' + tier;
        clearTimeout(this.actionTimer);
        this.actionTimer = setTimeout(() => { el.className = 'action-text hidden'; }, 1200);
    }

    showCombo(count) {
        const el = this.comboDisplay;
        el.textContent = count + 'x COMBO';
        el.className = 'combo-display show';
        clearTimeout(this.comboTimer);
        this.comboTimer = setTimeout(() => { el.className = 'combo-display hidden'; }, 1500);
    }

    popStat(id) {
        const el = document.getElementById(id);
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 300);
    }

    holdPiece() {
        if (!this.canHold) return;
        playSound('hold');
        const t = this.piece.type;
        if (this.hold) {
            this.piece = new Piece(this.hold, this);
        } else {
            this.spawn();
        }
        this.hold = t;
        this.canHold = false;
        this.isLocking = false;
        this.lockStartTime = 0;
        this.lockResets = 0;
    }

    update(time) {
        if (this.over || isPaused) return;

        // Lock delay check (independent of gravity timing)
        if (this.isLocking) {
            const elapsed = performance.now() - this.lockStartTime;
            if (elapsed >= this.lockDelay || this.lockResets >= this.lockResetMax) {
                this.lockPiece();
                this.lastTime = time;
                return;
            }
            // If piece is no longer on ground (e.g. moved off by rotation), cancel lock
            if (!this.isOnGround()) {
                this.isLocking = false;
            }
        }

        // Normal gravity
        if (time - this.lastTime >= this.interval) {
            if (!this.drop()) {
                // Piece can't move down — start lock delay if not already
                if (!this.isLocking) {
                    this.isLocking = true;
                    this.lockStartTime = performance.now();
                }
            }
            this.lastTime = time;
        }
    }

    render() {
        this.renderer.render(this.grid, this.piece);
        this.renderer.renderPreview(this.holdCanvas, this.hold);
        for (let i = 0; i < this.nextCanvases.length; i++) {
            const type = this.nextQueue[i] || null;
            this.renderer.renderPreview(this.nextCanvases[i], type, i === 0 ? 1 : 0.6);
        }
        document.getElementById('score1').textContent = this.score.toLocaleString();
        document.getElementById('level1').textContent = this.level;
        document.getElementById('sent1').textContent = this.lines;
        document.getElementById('combo1').textContent = this.combo;
    }
}

// ==================== Sound Engine ====================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type, tier) {
    if (!audioCtx) return;
    try {
        const t = audioCtx.currentTime;
        if (type === 'move') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 280; osc.type = 'sine';
            gain.gain.setValueAtTime(0.025, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            osc.start(t); osc.stop(t + 0.04);
        } else if (type === 'rotate') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 400;
            osc.frequency.exponentialRampToValueAtTime(500, t + 0.06);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.08);
        } else if (type === 'hardDrop') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 120; osc.type = 'square';
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.08);
        } else if (type === 'clear') {
            tier = tier || 1;
            const notes = tier === 4 ? 5 : tier === 3 ? 4 : tier === 2 ? 3 : 2;
            for (let i = 0; i < notes; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.value = 440 + i * (40 + tier * 25);
                osc.type = tier >= 3 ? 'triangle' : 'sine';
                const delay = i * 0.07;
                const dur = 0.1 + tier * 0.03;
                gain.gain.setValueAtTime(0.04, t + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
                osc.start(t + delay); osc.stop(t + delay + dur);
            }
        } else if (type === 'hold') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 600;
            osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(t); osc.stop(t + 0.1);
        } else if (type === 'over') {
            for (let i = 0; i < 4; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.value = 300 - i * 50; osc.type = 'sawtooth';
                const d = i * 0.12;
                gain.gain.setValueAtTime(0.04, t + d);
                gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.25);
                osc.start(t + d); osc.stop(t + d + 0.25);
            }
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
            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
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
            case 'ArrowUp': this.game.rotate(1); break;
            case 'KeyZ': this.game.rotate(-1); break;
            case 'KeyC': this.game.holdPiece(); break;
            case 'Space': this.game.hardDrop(); this.keys['Space'] = false; break;
        }
    }
}

// ==================== Game Control ====================
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
    document.getElementById('pause-btn').textContent = isPaused ? 'RESUME' : 'PAUSE';
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
        playSound('over');
        document.getElementById('final-score').textContent = game.score.toLocaleString();
        document.getElementById('final-lines').textContent = game.lines;
        document.getElementById('final-level').textContent = game.level;
        document.getElementById('final-combo').textContent = game.maxCombo;
        document.getElementById('gameover').classList.add('show');
        return;
    }
    requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'p' || e.key === 'P') togglePause();
});

// Ensure focus
document.addEventListener('click', () => { document.body.focus(); });
document.body.setAttribute('tabindex', '-1');

// ==================== Touch Controls ====================
(function initTouchControls() {
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0, touchMoved = false;

    document.addEventListener('touchstart', e => {
        if (!running || isPaused || !game) return;
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();
        touchMoved = false;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!running || isPaused || !game) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const threshold = 30;

        if (Math.abs(dx) > threshold) {
            game.move(dx > 0 ? 1 : -1);
            touchStartX = t.clientX;
            touchMoved = true;
        }
        if (dy > threshold) {
            game.drop();
            touchStartY = t.clientY;
            touchMoved = true;
        }
        if (dy < -threshold) {
            game.rotate(1);
            touchStartY = t.clientY;
            touchMoved = true;
        }
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', e => {
        if (!running || isPaused || !game) return;
        if (!touchMoved && Date.now() - touchStartTime < 200) {
            game.hardDrop();
        }
    }, { passive: true });
})();

// ==================== Background Particles ====================
(function initBgParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    const colors = ['rgba(0,243,255,0.12)', 'rgba(180,77,255,0.08)', 'rgba(255,45,149,0.06)'];
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'bg-particle';
        const size = Math.random() * 3 + 1;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 15 + 12) + 's';
        p.style.animationDelay = (Math.random() * 15) + 's';
        container.appendChild(p);
    }
})();

window.addEventListener('resize', () => {
    if (game && game.renderer) {
        game.renderer.resize();
        if (running && !isPaused) game.render();
    }
});
