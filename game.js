// ==================== TETRIS BATTLE - Enhanced Edition with AI ====================

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
    L: { base: '#ff8c2d', light: '#ffba7e', dark: '#b86010', glow: 'rgba(255,140,45,0.6)' },
    G: { base: '#555a66', light: '#7a8290', dark: '#2e323b', glow: 'rgba(120,120,120,0.3)' },
    X: { base: '#ff2d95', light: '#ff7ab3', dark: '#a31660', glow: 'rgba(255,45,149,0.8)' }
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

// Tetris Battle attack table (garbage lines sent)
const ATTACK_TABLE = [0, 0, 1, 2, 4];  // index = lines cleared
// Combo bonus cumulative (Tetris Battle / Tetris Friends style)
const COMBO_TABLE = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const PERFECT_CLEAR_BONUS = 10;
const B2B_BONUS = 1;

// AI difficulty profiles
const AI_PROFILES = {
    easy: {
        name: 'EASY',
        thinkDelay: 800,       // long pause — player gets time to set up
        actionInterval: 500,  // slow DAS, gives player breathing room
        dropInterval: 900,
        errorChance: 0.12,   // only 12% chance to intentionally fumble (not 45%)
        weights: { height: -0.55, lines: 0.70, holes: -0.40, bumpiness: -0.20 }
    },
    normal: {
        name: 'NORMAL',
        thinkDelay: 280,      // a little extra time
        actionInterval: 160,  // moderate DAS, fair pace for humans
        dropInterval: 600,
        errorChance: 0.10,
        weights: { height: -0.50, lines: 0.75, holes: -0.35, bumpiness: -0.18 }
    },
    hard: {
        name: 'HARD',
        thinkDelay: 130,      // quick but not instant
        actionInterval: 100,  // fast DAS but achievable for experienced players
        dropInterval: 400,
        errorChance: 0.05,   // tiny chance of a slip, not perfect
        weights: { height: -0.52, lines: 0.88, holes: -0.50, bumpiness: -0.22, wells: -0.12 }
    }
};

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
        this.x = x; this.y = y; this.color = color;
        this.vx = vx; this.vy = vy; this.size = size;
        this.life = life; this.decay = decay; this.gravity = gravity;
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
        this._lastW = 0; this._lastH = 0;
        this.resize();
    }

    resize() {
        const rect = this.boardCanvas.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w === this._lastW && h === this._lastH) return;
        if (w === 0 || h === 0) return;
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

        const grad = ctx.createLinearGradient(px, py, px + bs, py + bs);
        grad.addColorStop(0, colorObj.light);
        grad.addColorStop(0.5, colorObj.base);
        grad.addColorStop(1, colorObj.dark);
        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px + 2, py + 2, bs - 4, 3);

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 1, py + 2, 2, bs - 4);

        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, bs - 1, bs - 1);
    }

    drawBombBlock(x, y) {
        const ctx = this.boardCtx;
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;
        // Pulsing bomb appearance
        const t = performance.now() * 0.005;
        const pulse = 0.5 + 0.5 * Math.sin(t);

        const grad = ctx.createRadialGradient(px + bs/2, py + bs/2, 1, px + bs/2, py + bs/2, bs);
        grad.addColorStop(0, '#ffe14d');
        grad.addColorStop(0.4, '#ff2d95');
        grad.addColorStop(1, '#6b0030');
        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        ctx.strokeStyle = `rgba(255,225,77,${0.4 + 0.6 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1.5, py + 1.5, bs - 3, bs - 3);

        // X mark
        ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px + bs * 0.3, py + bs * 0.3);
        ctx.lineTo(px + bs * 0.7, py + bs * 0.7);
        ctx.moveTo(px + bs * 0.7, py + bs * 0.3);
        ctx.lineTo(px + bs * 0.3, py + bs * 0.7);
        ctx.stroke();
    }

    drawGhostBlock(x, y, colorObj) {
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;
        const ctx = this.boardCtx;

        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colorObj.base;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        ctx.globalAlpha = 1;
        ctx.strokeStyle = colorObj.light;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 1.5, py + 1.5, bs - 3, bs - 3);

        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 3, py + 2, bs - 6, 2);
        ctx.restore();
    }

    render(grid, piece, bombCells) {
        this.resize();
        this.clear();
        this.drawGrid();

        // Draw locked blocks
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = grid[r][c];
                if (cell) {
                    if (cell === 'x') {
                        this.drawBombBlock(c, r);
                    } else {
                        const type = cell.toUpperCase();
                        const colorObj = COLORS[type] || COLORS['I'];
                        this.drawBlock(c, r, colorObj);
                    }
                }
            }
        }

        // Flash lines
        for (let i = this.flashLines.length - 1; i >= 0; i--) {
            const fl = this.flashLines[i];
            fl.life -= 0.05;
            if (fl.life <= 0) { this.flashLines.splice(i, 1); continue; }
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

        // FX: screen flash + particles
        const fctx = this.fxCtx;
        if (this.screenFlash > 0) {
            fctx.save();
            fctx.globalAlpha = this.screenFlash;
            fctx.fillStyle = this.screenFlashColor;
            fctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
            fctx.restore();
            this.screenFlash -= 0.05;
        }

        fctx.globalCompositeOperation = 'lighter';
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.life <= 0) {
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

    spawnClearEffect(rows, tier) {
        const bs = this.blockSize;
        const tierColor = TIER_COLORS[tier];
        rows.forEach(r => {
            const cy = r * bs + bs / 2;
            this.flashLines.push({ row: r, life: 1, color: tierColor.color });
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

    spawnBombExplosion(cx, cy) {
        const bs = this.blockSize;
        const px = cx * bs + bs / 2;
        const py = cy * bs + bs / 2;
        for (let i = 0; i < 40; i++) {
            const angle = (i / 40) * Math.PI * 2;
            const spd = 4 + Math.random() * 5;
            this.addParticle(px, py,
                Math.random() > 0.5 ? '#ff2d95' : '#ffe14d',
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                Math.random() * 4 + 3, 1, 0.02, 0.06
            );
        }
        this.screenFlash = 0.5;
        this.screenFlashColor = 'rgba(255,140,45,0.35)';
    }

    addParticle(x, y, color, vx, vy, size, life, decay, gravity) {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
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
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = rect.width, h = rect.height;
        if (w === 0 || h === 0) return;
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
let sharedBag = new Bag7();

class Tetris {
    constructor(config) {
        // config: { boardId, fxId, holdId, nextIds[3], statIds{score,level,lines,combo,b2b}, overlayIds, bag }
        this.config = config;
        this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.b2b = 0;
        this.maxB2b = 0;
        this.piece = null;
        this.nextQueue = [];
        this.hold = null;
        this.canHold = true;
        this.over = false;
        this.interval = 1000;
        this.lastTime = 0;
        this.attackSent = 0;
        this.bag = config.bag || sharedBag;

        // Lock Delay
        this.lockDelay = 500;
        this.lockStartTime = 0;
        this.lockResets = 0;
        this.lockResetMax = 15;
        this.isLocking = false;

        // Battle: incoming garbage queue
        this.garbageQueue = [];
        this.bombLineCountdown = 0;  // counts down until next bomb row sent

        this.renderer = new GameRenderer(config.boardId, config.fxId);
        this.holdCanvas = document.getElementById(config.holdId);
        this.nextCanvases = config.nextIds.map(id => document.getElementById(id));

        this.wrapper = this.renderer.boardCanvas.parentElement;
        this.comboDisplay = document.getElementById(config.overlayIds.combo);
        this.actionText = document.getElementById(config.overlayIds.action);

        this.comboTimer = null;
        this.actionTimer = null;

        // Callbacks for battle events
        this.onAttack = null;        // (lines, reason) - called when outgoing attack produced
        this.onTopOut = null;        // () - called when game over
    }

    spawn() {
        const nextType = this.nextQueue.length > 0 ? this.nextQueue.shift() : this.bag.next();
        this.piece = new Piece(nextType, this);
        while (this.nextQueue.length < 3) {
            this.nextQueue.push(this.bag.next());
        }
        this.canHold = true;
        this.isLocking = false;
        this.lockStartTime = 0;
        this.lockResets = 0;
        if (!this.valid(this.piece, this.piece.x, this.piece.y)) {
            this.over = true;
            if (this.onTopOut) this.onTopOut();
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
                if (!this.isOnGround()) this.isLocking = false;
                return;
            }
        }
        this.piece.shape = oldShape;
    }

    isOnGround() {
        return !this.valid(this.piece, this.piece.x, this.piece.y + 1);
    }

    resetLockDelay() {
        if (this.isLocking && this.lockResets < this.lockResetMax) {
            this.lockStartTime = performance.now();
            this.lockResets++;
        }
    }

    move(dir) {
        if (this.piece.move(dir, 0)) {
            playSound('move');
            this.resetLockDelay();
            if (!this.isOnGround()) this.isLocking = false;
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
        const clearedThisLock = this._clearedThisLock;
        this._clearedThisLock = false;
        this.spawn();
        // Apply pending garbage only if no lines were cleared this lock (and still alive)
        if (!clearedThisLock && !this.over) {
            this.applyIncomingGarbage();
        }
    }

    clearLines() {
        let linesCleared = 0;
        const newGrid = [];
        const clearedRowIndices = [];
        let bombTriggered = false;

        for (let r = 0; r < ROWS; r++) {
            if (this.grid[r].every(c => c)) {
                clearedRowIndices.push(r);
                linesCleared++;
                // Bomb: if any cell in cleared row is a bomb, trigger explosion
                if (this.grid[r].some(c => c === 'x')) {
                    bombTriggered = true;
                    this.renderer.spawnBombExplosion(COLS / 2, r);
                }
            } else {
                newGrid.push(this.grid[r]);
            }
        }

        if (linesCleared === 0) {
            this.combo = 0;
            return;
        }

        this._clearedThisLock = true;

        while (newGrid.length < ROWS) newGrid.unshift(Array(COLS).fill(EMPTY));
        this.grid = newGrid;

        const tier = Math.min(linesCleared, 4);
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

        // B2B: only Tetris (4 lines) extends B2B chain (keep simple - no T-Spin detect)
        const isDifficult = (linesCleared === 4);
        if (isDifficult) {
            this.b2b++;
            this.maxB2b = Math.max(this.maxB2b, this.b2b);
        } else {
            this.b2b = 0;
        }

        // Perfect Clear detection
        const isPC = this.grid.every(row => row.every(c => !c));

        // Calculate attack (garbage to send)
        let attack = ATTACK_TABLE[tier];
        if (this.b2b >= 2) attack += B2B_BONUS;
        const comboIdx = Math.min(this.combo - 1, COMBO_TABLE.length - 1);
        if (comboIdx > 0) attack += COMBO_TABLE[comboIdx];
        if (isPC) attack += PERFECT_CLEAR_BONUS;
        if (bombTriggered) attack += 4;  // bomb bonus

        // Bomb milestone: every 10 lines cleared, next outgoing attack becomes a bomb
        this.bombLineCountdown -= linesCleared;
        let milestoneBomb = false;
        if (this.bombLineCountdown <= 0) {
            milestoneBomb = true;
            this.bombLineCountdown = 10;
        }

        // Cancel incoming garbage first, then send remainder
        if (attack > 0) {
            attack = this.cancelGarbage(attack);
            if (attack > 0 && this.onAttack) {
                this.attackSent += attack;
                this.onAttack(attack, { tier, combo: this.combo, b2b: this.b2b, pc: isPC, bomb: bombTriggered || milestoneBomb });
            }
        }

        // Action text
        let label = TIER_COLORS[tier].name;
        if (isPC) label = 'PERFECT!';
        else if (this.b2b >= 2 && tier === 4) label = 'B2B TETRIS!';
        else if (bombTriggered) label = 'BOMB!';
        this.showActionText(label, tier);
        if (this.combo >= 2) this.showCombo(this.combo);

        this.syncStats();
    }

    // Cancel some incoming garbage. Returns remaining attack to send.
    cancelGarbage(attack) {
        while (attack > 0 && this.garbageQueue.length > 0) {
            const g = this.garbageQueue[0];
            const cancel = Math.min(attack, g.lines);
            g.lines -= cancel;
            attack -= cancel;
            if (g.lines === 0) this.garbageQueue.shift();
        }
        this.updateGarbageMeter();
        return attack;
    }

    // Receive pending garbage from opponent
    receiveGarbage(lines, isBomb) {
        if (lines <= 0) return;
        this.garbageQueue.push({ lines, isBomb: !!isBomb, time: performance.now() });
        this.updateGarbageMeter();
    }

    // Apply accumulated garbage by pushing rows up
    applyIncomingGarbage() {
        if (this.garbageQueue.length === 0) return;
        // Apply each garbage chunk. Within a chunk, the hole column stays the same.
        while (this.garbageQueue.length > 0) {
            const g = this.garbageQueue.shift();
            this.insertGarbageRows(g.lines, g.isBomb);
        }
        this.updateGarbageMeter();
    }

    insertGarbageRows(count, isBomb) {
        const holeCol = Math.floor(Math.random() * COLS);
        // Shift existing rows up by `count`
        for (let r = 0; r < ROWS - count; r++) {
            this.grid[r] = this.grid[r + count];
        }
        for (let i = 0; i < count; i++) {
            const row = Array(COLS).fill('g');
            row[holeCol] = 0;
            // Bomb: place one bomb block somewhere other than the hole
            if (isBomb) {
                let bombCol;
                do { bombCol = Math.floor(Math.random() * COLS); } while (bombCol === holeCol);
                row[bombCol] = 'x';
            }
            this.grid[ROWS - count + i] = row;
        }
        // If the falling piece now overlaps blocks, push it up; if can't, game over.
        if (this.piece) {
            let pushed = 0;
            while (!this.valid(this.piece, this.piece.x, this.piece.y)) {
                if (this.piece.y <= -2 || pushed > ROWS) {
                    this.over = true;
                    if (this.onTopOut) this.onTopOut();
                    return;
                }
                this.piece.y--;
                pushed++;
            }
        }
    }

    updateGarbageMeter() {
        if (!this.config.garbageMeterId) return;
        const meter = document.getElementById(this.config.garbageMeterId);
        if (!meter) return;
        const total = this.garbageQueue.reduce((s, g) => s + g.lines, 0);
        const bombCount = this.garbageQueue.filter(g => g.isBomb).reduce((s, g) => s + g.lines, 0);
        meter.innerHTML = '';
        for (let i = 0; i < Math.min(total, ROWS); i++) {
            const bar = document.createElement('div');
            bar.className = 'garbage-bar';
            if (i < bombCount) bar.classList.add('bomb');
            meter.appendChild(bar);
        }
    }

    triggerShake(tier) {
        if (!this.wrapper) return;
        this.wrapper.classList.remove('shake', 'shake-heavy');
        void this.wrapper.offsetWidth;
        if (tier >= 4) this.wrapper.classList.add('shake-heavy');
        else if (tier >= 2) this.wrapper.classList.add('shake');
    }

    showActionText(text, tier) {
        const el = this.actionText;
        if (!el) return;
        el.textContent = text;
        el.className = 'action-text show tier-' + tier;
        clearTimeout(this.actionTimer);
        this.actionTimer = setTimeout(() => { el.className = 'action-text hidden'; }, 1200);
    }

    showCombo(count) {
        const el = this.comboDisplay;
        if (!el) return;
        el.textContent = count + 'x COMBO';
        el.className = 'combo-display show';
        clearTimeout(this.comboTimer);
        this.comboTimer = setTimeout(() => { el.className = 'combo-display hidden'; }, 1500);
    }

    popStat(id) {
        const el = document.getElementById(id);
        if (!el) return;
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

        if (this.isLocking) {
            const elapsed = performance.now() - this.lockStartTime;
            if (elapsed >= this.lockDelay || this.lockResets >= this.lockResetMax) {
                this.lockPiece();
                this.lastTime = time;
                return;
            }
            if (!this.isOnGround()) this.isLocking = false;
        }

        if (time - this.lastTime >= this.interval) {
            if (!this.drop()) {
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
        this.syncStats();
    }

    syncStats() {
        const s = this.config.statIds;
        if (!s) return;
        if (s.score) document.getElementById(s.score).textContent = this.score.toLocaleString();
        if (s.level) document.getElementById(s.level).textContent = this.level;
        if (s.lines) document.getElementById(s.lines).textContent = this.lines;
        if (s.combo) document.getElementById(s.combo).textContent = this.combo;
        if (s.b2b)   document.getElementById(s.b2b).textContent = this.b2b;
        if (s.attack) document.getElementById(s.attack).textContent = this.attackSent;
    }
}

// ==================== Tetris AI ====================
class TetrisAI {
    constructor(game, difficulty) {
        this.game = game;
        this.difficulty = difficulty;
        this.profile = AI_PROFILES[difficulty] || AI_PROFILES.normal;
        this.plan = null;           // { x, rotIndex, useHold }
        this.thinkStart = 0;
        this.lastActionTime = 0;
        this.thinking = false;
    }

    update(time) {
        if (this.game.over || isPaused) return;
        if (!this.game.piece) return;

        // Start thinking for new plan
        if (!this.plan && !this.thinking) {
            this.thinking = true;
            this.thinkStart = time;
        }

        if (this.thinking && !this.plan) {
            if (time - this.thinkStart >= this.profile.thinkDelay) {
                this.plan = this.computeBestMove();
                this.thinking = false;
                this.lastActionTime = time;
            }
            return;
        }

        // Execute plan action-by-action
        if (this.plan && time - this.lastActionTime >= this.profile.actionInterval) {
            this.lastActionTime = time;
            this.step();
        }
    }

    step() {
        const g = this.game;
        const p = this.plan;
        if (!p || !g.piece) { this.plan = null; return; }

        // Hold if planned
        if (p.useHold && g.canHold) {
            g.holdPiece();
            this.plan = null;
            this.thinking = false;
            return;
        }

        // Match rotation
        if (g.piece.rotIndex !== p.rotIndex) {
            const before = g.piece.rotIndex;
            const diff = (p.rotIndex - g.piece.rotIndex + 4) % 4;
            if (diff === 3) g.rotate(-1);
            else g.rotate(1);
            // If rotation failed (e.g., piece pinned), abandon the plan and just drop
            if (g.piece.rotIndex === before) {
                g.hardDrop();
                this.plan = null;
                this.thinking = false;
            }
            return;
        }

        // Match x position
        if (g.piece.x !== p.x) {
            const before = g.piece.x;
            g.move(g.piece.x < p.x ? 1 : -1);
            if (g.piece.x === before) {
                // Blocked by terrain — drop where we are
                g.hardDrop();
                this.plan = null;
                this.thinking = false;
            }
            return;
        }

        // In position — hard drop
        g.hardDrop();
        this.plan = null;
        this.thinking = false;
    }

    computeBestMove() {
        const g = this.game;
        if (!g.piece) return null;

        // Evaluate the current piece's moves and (if hold available) the hold swap piece's moves
        let best = { score: -Infinity };

        best = this.evaluatePiece(g.piece.type, false, best);

        if (g.canHold) {
            const holdType = g.hold || (g.nextQueue[0] || null);
            if (holdType && holdType !== g.piece.type) {
                best = this.evaluatePiece(holdType, true, best);
            }
        }

        // Introduce error chance on easy
        if (this.profile.errorChance > 0 && Math.random() < this.profile.errorChance) {
            // Pick a random legal placement instead
            const randomType = g.piece.type;
            const shape0 = SHAPES[randomType];
            const rot = Math.floor(Math.random() * 4);
            const rotated = rotateShape(shape0, rot);
            const minX = -getLeftOffset(rotated);
            const maxX = COLS - rotated[0].length + getRightOffset(rotated);
            const randX = minX + Math.floor(Math.random() * (maxX - minX + 1));
            return { x: randX, rotIndex: rot, useHold: false };
        }

        if (best.score === -Infinity) {
            // Fallback: just hard drop at current position
            return { x: g.piece.x, rotIndex: g.piece.rotIndex, useHold: false };
        }
        return best;
    }

    evaluatePiece(type, useHold, best) {
        const g = this.game;
        const rotations = (type === 'O') ? 1 : 4;
        const shape0 = SHAPES[type];

        for (let rot = 0; rot < rotations; rot++) {
            const shape = rotateShape(shape0, rot);
            for (let x = -2; x <= COLS; x++) {
                const result = simulateDrop(g.grid, shape, x);
                if (!result) continue;
                const score = this.scoreBoard(result.grid, result.linesCleared);
                if (score > best.score) {
                    best = { score, x, rotIndex: rot, useHold };
                }
            }
        }
        return best;
    }

    scoreBoard(grid, linesCleared) {
        const w = this.profile.weights;
        const { heights, holes, bumpiness, wells } = analyzeGrid(grid);
        const agg = heights.reduce((a, b) => a + b, 0);
        let score = 0;
        score += (w.height || 0) * agg;
        score += (w.lines || 0) * linesCleared;
        score += (w.holes || 0) * holes;
        score += (w.bumpiness || 0) * bumpiness;
        if (w.wells) score += w.wells * wells;
        return score;
    }
}

// ---- AI helpers ----
function rotateShape(shape, times) {
    let s = shape.map(r => [...r]);
    for (let i = 0; i < times; i++) {
        const N = s.length;
        const out = Array.from({ length: N }, () => Array(N).fill(0));
        for (let r = 0; r < N; r++)
            for (let c = 0; c < N; c++)
                out[r][c] = s[N-1-c][r];
        s = out;
    }
    return s;
}

function getLeftOffset(shape) {
    // leftmost filled column
    for (let c = 0; c < shape[0].length; c++) {
        for (let r = 0; r < shape.length; r++) {
            if (shape[r][c]) return c;
        }
    }
    return 0;
}

function getRightOffset(shape) {
    // filled columns from right
    for (let c = shape[0].length - 1; c >= 0; c--) {
        for (let r = 0; r < shape.length; r++) {
            if (shape[r][c]) return shape[0].length - 1 - c;
        }
    }
    return 0;
}

function simulateDrop(grid, shape, x) {
    // Check left/right bounds for filled cells
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                if (x + c < 0 || x + c >= COLS) return null;
            }
        }
    }

    // Find landing row
    let y = -shape.length;
    while (true) {
        // Check if dropping further would collide
        let collides = false;
        for (let r = 0; r < shape.length && !collides; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const ny = y + 1 + r;
                    const nx = x + c;
                    if (ny >= ROWS) { collides = true; break; }
                    if (ny >= 0 && grid[ny][nx]) { collides = true; break; }
                }
            }
        }
        if (collides) break;
        y++;
        if (y > ROWS) return null;
    }

    // Build resulting grid
    const newGrid = grid.map(r => [...r]);
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                const ny = y + r, nx = x + c;
                if (ny < 0) return null;  // locked above top — invalid
                newGrid[ny][nx] = 'p';
            }
        }
    }

    // Clear full rows
    let linesCleared = 0;
    const finalGrid = [];
    for (let r = 0; r < ROWS; r++) {
        if (newGrid[r].every(c => c)) linesCleared++;
        else finalGrid.push(newGrid[r]);
    }
    while (finalGrid.length < ROWS) finalGrid.unshift(Array(COLS).fill(EMPTY));

    return { grid: finalGrid, linesCleared };
}

function analyzeGrid(grid) {
    const heights = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c]) { heights[c] = ROWS - r; break; }
        }
    }
    // Holes: empty cells below the column top
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
        const top = ROWS - heights[c];
        for (let r = top + 1; r < ROWS; r++) {
            if (!grid[r][c]) holes++;
        }
    }
    // Bumpiness
    let bumpiness = 0;
    for (let c = 0; c < COLS - 1; c++) {
        bumpiness += Math.abs(heights[c] - heights[c+1]);
    }
    // Wells (deep gaps between pillars)
    let wells = 0;
    for (let c = 0; c < COLS; c++) {
        const left = c === 0 ? ROWS : heights[c-1];
        const right = c === COLS-1 ? ROWS : heights[c+1];
        const depth = Math.min(left, right) - heights[c];
        if (depth > 2) wells += depth;
    }
    return { heights, holes, bumpiness, wells };
}

// ==================== Battle Manager ====================
class BattleManager {
    constructor(player, ai) {
        this.player = player;       // Tetris instance
        this.ai = ai;               // Tetris instance (AI-controlled)
        this.winner = null;

        this.player.onAttack = (lines, info) => this.handleAttack(this.player, this.ai, lines, info);
        this.ai.onAttack     = (lines, info) => this.handleAttack(this.ai,     this.player, lines, info);
        this.player.onTopOut = () => { this.endBattle(this.ai); };
        this.ai.onTopOut     = () => { this.endBattle(this.player); };
    }

    handleAttack(from, to, lines, info) {
        // Small telegraph delay before applying (feels fair)
        // Mark as bomb when: (any B2B extension while hot) OR explicit bomb trigger
        const bomb = info.bomb || info.b2b >= 3 || info.pc;
        to.receiveGarbage(lines, bomb);
    }

    endBattle(winner) {
        if (this.winner) return;
        this.winner = winner;
        // Propagate to global
        battleEnded = true;
        battleWinner = winner;
    }
}

// ==================== Tone.js Audio Engine ====================
const MUSIC_MELODY = [
    ['E5', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['C5', 1], ['B4', 1],
    ['A4', 2], ['A4', 1], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 3], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 2], ['REST', 2],
    ['D5', 3], ['F5', 1], ['A5', 2], ['G5', 1], ['F5', 1],
    ['E5', 3], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 2], ['REST', 2]
];

const MUSIC_BASS = [
    ['E3', 4], ['B2', 4], ['E3', 4], ['B2', 4],
    ['A2', 4], ['E3', 4], ['A2', 4], ['E3', 4],
    ['D3', 4], ['A2', 4], ['E3', 4], ['B2', 4],
    ['A2', 4], ['E3', 4], ['B2', 4], ['E3', 4]
];

const MUSIC_BPM = 150;
const MUSIC_EIGHTH_SEC = 60 / MUSIC_BPM / 2;

let musicEnabled = (typeof localStorage !== 'undefined' && localStorage.getItem('tb-music') === 'off') ? false : true;
let musicPlaying = false;
let toneReady = false;
let toneInitPromise = null;
let audioNodes = null;

async function initAudio() {
    if (toneReady) return;
    if (typeof Tone === 'undefined') return;
    if (toneInitPromise) return toneInitPromise;
    toneInitPromise = (async () => {
        try {
            await Tone.start();
            buildAudioGraph();
            setupMusicParts();
            toneReady = true;
        } catch (e) {
            console.warn('Tone.js init failed', e);
        }
    })();
    return toneInitPromise;
}

function buildAudioGraph() {
    const musicReverb = new Tone.Reverb({ decay: 3.5, wet: 0.22 }).toDestination();
    const musicMaster = new Tone.Gain(0.55).connect(musicReverb);

    const leadDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.15, wet: 0.18 }).connect(musicMaster);
    const leadChorus = new Tone.Chorus({ frequency: 2.5, delayTime: 2.5, depth: 0.5, wet: 0.4 }).start().connect(leadDelay);
    const lead = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.008, decay: 0.2, sustain: 0.35, release: 0.3 }
    }).connect(leadChorus);
    lead.volume.value = -8;

    const bassFilter = new Tone.Filter({ frequency: 600, type: 'lowpass', Q: 1 }).connect(musicMaster);
    const bass = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.15 },
        filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.2, baseFrequency: 120, octaves: 2.5 }
    }).connect(bassFilter);
    bass.volume.value = -11;

    const pad = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.6, decay: 0.3, sustain: 0.4, release: 1.4 }
    }).connect(musicMaster);
    pad.volume.value = -24;

    const sfxReverb = new Tone.Reverb({ decay: 0.9, wet: 0.12 }).toDestination();
    const sfxMaster = new Tone.Gain(0.8).connect(sfxReverb);

    const sfxMove = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 }}).connect(sfxMaster);
    sfxMove.volume.value = -18;

    const sfxRotate = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.003, decay: 0.08, sustain: 0, release: 0.08 }}).connect(sfxMaster);
    sfxRotate.volume.value = -14;

    const sfxDrop = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 }}).connect(sfxMaster);
    sfxDrop.volume.value = -8;

    const sfxHold = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.3 }}).connect(sfxMaster);
    sfxHold.volume.value = -14;

    const sfxClear = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.7 }}).connect(sfxMaster);
    sfxClear.volume.value = -12;

    const sfxOverFilter = new Tone.Filter({ frequency: 1200, type: 'lowpass' }).connect(sfxMaster);
    const sfxOver = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 1.5 }, filterEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.2, release: 1.2, baseFrequency: 1000, octaves: -3 }}).connect(sfxOverFilter);
    sfxOver.volume.value = -8;

    audioNodes = {
        music: { master: musicMaster, reverb: musicReverb, lead, bass, pad },
        sfx: { move: sfxMove, rotate: sfxRotate, drop: sfxDrop, hold: sfxHold, clear: sfxClear, over: sfxOver }
    };
}

function setupMusicParts() {
    if (!audioNodes) return;
    Tone.Transport.bpm.value = MUSIC_BPM;

    const melodyEvents = [];
    let t = 0;
    for (const [note, len] of MUSIC_MELODY) {
        if (note !== 'REST') melodyEvents.push({ time: t, note, dur: len * MUSIC_EIGHTH_SEC * 0.92 });
        t += len * MUSIC_EIGHTH_SEC;
    }
    const loopLen = t;

    const bassEvents = [];
    t = 0;
    for (const [note, len] of MUSIC_BASS) {
        if (note !== 'REST') bassEvents.push({ time: t, note, dur: len * MUSIC_EIGHTH_SEC * 0.95 });
        t += len * MUSIC_EIGHTH_SEC;
    }

    const padEvents = [
        { time: 0.0,  chord: ['A3', 'C4', 'E4'] },
        { time: 1.6,  chord: ['A3', 'C4', 'E4'] },
        { time: 3.2,  chord: ['E3', 'G#3', 'B3'] },
        { time: 4.8,  chord: ['A3', 'C4', 'E4'] },
        { time: 6.4,  chord: ['D3', 'F3', 'A3'] },
        { time: 8.0,  chord: ['A3', 'C4', 'E4'] },
        { time: 9.6,  chord: ['E3', 'G#3', 'B3'] },
        { time: 11.2, chord: ['A3', 'C4', 'E4'] }
    ];

    const melodyPart = new Tone.Part((time, ev) => {
        audioNodes.music.lead.triggerAttackRelease(ev.note, ev.dur, time, 0.65);
    }, melodyEvents);
    melodyPart.loop = true; melodyPart.loopEnd = loopLen;

    const bassPart = new Tone.Part((time, ev) => {
        audioNodes.music.bass.triggerAttackRelease(ev.note, ev.dur, time, 0.6);
    }, bassEvents);
    bassPart.loop = true; bassPart.loopEnd = loopLen;

    const padPart = new Tone.Part((time, ev) => {
        audioNodes.music.pad.triggerAttackRelease(ev.chord, 1.4, time, 0.4);
    }, padEvents);
    padPart.loop = true; padPart.loopEnd = loopLen;

    melodyPart.start(0); bassPart.start(0); padPart.start(0);

    audioNodes.music.melodyPart = melodyPart;
    audioNodes.music.bassPart = bassPart;
    audioNodes.music.padPart = padPart;
}

function playSound(type, tier) {
    if (!toneReady || !audioNodes) return;
    try {
        const sfx = audioNodes.sfx;
        if (type === 'move') sfx.move.triggerAttackRelease('A5', '64n');
        else if (type === 'rotate') {
            const now = Tone.now();
            sfx.rotate.triggerAttackRelease('E5', '32n', now);
            sfx.rotate.triggerAttackRelease('A5', '32n', now + 0.04);
        } else if (type === 'hardDrop') sfx.drop.triggerAttackRelease('C2', '8n');
        else if (type === 'hold') {
            const now = Tone.now();
            sfx.hold.triggerAttackRelease('E6', '16n', now);
            sfx.hold.triggerAttackRelease('A6', '16n', now + 0.06);
        } else if (type === 'clear') {
            tier = tier || 1;
            const chordsByTier = {
                1: [['C5', 'E5'], ['D5', 'F5']],
                2: [['C5', 'E5', 'G5'], ['E5', 'G5', 'B5']],
                3: [['C5', 'E5', 'G5'], ['F5', 'A5', 'C6'], ['G5', 'B5', 'D6']],
                4: [['C5', 'E5', 'G5'], ['E5', 'G5', 'B5'], ['G5', 'B5', 'D6'], ['C6', 'E6', 'G6']]
            };
            const seq = chordsByTier[tier] || chordsByTier[1];
            const base = Tone.now();
            seq.forEach((c, i) => { sfx.clear.triggerAttackRelease(c, '4n', base + i * 0.09); });
        } else if (type === 'over') {
            const now = Tone.now();
            sfx.over.triggerAttackRelease('A3', '1n', now);
            sfx.over.frequency.cancelScheduledValues(now);
            sfx.over.frequency.setValueAtTime(220, now);
            sfx.over.frequency.exponentialRampToValueAtTime(55, now + 1.6);
        }
    } catch(e) {}
}

function startMusic() {
    if (!musicEnabled) return;
    initAudio().then(() => {
        if (!toneReady || !audioNodes) return;
        if (musicPlaying) return;
        musicPlaying = true;
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        const now = Tone.now();
        const g = audioNodes.music.master.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(0.55, now + 0.4);
        Tone.Transport.start();
        updateMusicButton();
    });
}

function stopMusic() {
    if (!toneReady || !audioNodes) { musicPlaying = false; updateMusicButton(); return; }
    if (!musicPlaying) { updateMusicButton(); return; }
    musicPlaying = false;
    const now = Tone.now();
    const g = audioNodes.music.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.3);
    setTimeout(() => { if (!musicPlaying && toneReady) { try { Tone.Transport.stop(); } catch(e) {} }}, 400);
    updateMusicButton();
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    try { localStorage.setItem('tb-music', musicEnabled ? 'on' : 'off'); } catch(e) {}
    if (musicEnabled) { if (running && !isPaused) startMusic(); }
    else stopMusic();
    updateMusicButton();
}

function updateMusicButton() {
    const btn = document.getElementById('music-toggle');
    const label = document.getElementById('music-label');
    if (!btn) return;
    btn.classList.toggle('muted', !musicEnabled);
    btn.classList.toggle('playing', musicEnabled && musicPlaying);
    if (label) label.textContent = musicEnabled ? 'MUSIC' : 'MUTED';
    btn.setAttribute('aria-pressed', musicEnabled ? 'true' : 'false');
}

document.addEventListener('DOMContentLoaded', updateMusicButton);

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
        this._kd = e => {
            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
            if (!this.keys[e.code]) {
                this.keys[e.code] = true;
                this.keyTimers[e.code] = 0;
                this.triggerAction(e.code);
            }
        };
        this._ku = e => { this.keys[e.code] = false; this.keyTimers[e.code] = 0; };
        window.addEventListener('keydown', this._kd);
        window.addEventListener('keyup', this._ku);
    }

    destroy() {
        window.removeEventListener('keydown', this._kd);
        window.removeEventListener('keyup', this._ku);
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
        if (!this.game || this.game.over || isPaused) return;
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
let aiGame = null;
let ai = null;
let battleManager = null;
let inputManager = null;
let running = false;
let isPaused = false;
let currentMode = 'solo';       // 'solo' | 'battle'
let currentDifficulty = 'normal';
let battleEnded = false;
let battleWinner = null;

// Solo config
const SOLO_CONFIG = {
    boardId: 'board1', fxId: 'fx1', holdId: 'hold1',
    nextIds: ['next1', 'next2', 'next3'],
    statIds: { score: 'score1', level: 'level1', lines: 'sent1', combo: 'combo1' },
    overlayIds: { combo: 'combo-display', action: 'action-text' }
};

// Battle player config
const BATTLE_PLAYER_CONFIG = {
    boardId: 'p-board', fxId: 'p-fx', holdId: 'p-hold',
    nextIds: ['p-next1', 'p-next2', 'p-next3'],
    statIds: { score: 'p-score', lines: 'p-lines', combo: 'p-combo', b2b: 'p-b2b', attack: 'atk-p' },
    overlayIds: { combo: 'p-combo-display', action: 'p-action-text' },
    garbageMeterId: 'p-garbage-meter'
};

// Battle AI config
const BATTLE_AI_CONFIG = {
    boardId: 'a-board', fxId: 'a-fx', holdId: 'a-hold',
    nextIds: ['a-next1', 'a-next2', 'a-next3'],
    statIds: { score: 'a-score', lines: 'a-lines', combo: 'a-combo', b2b: 'a-b2b', attack: 'atk-a' },
    overlayIds: { combo: 'a-combo-display', action: 'a-action-text' },
    garbageMeterId: 'a-garbage-meter'
};

function chooseMode(mode) {
    currentMode = mode;
    if (mode === 'solo') {
        startGame();
    } else {
        document.getElementById('mode-section').classList.add('hidden');
        document.getElementById('difficulty-section').classList.remove('hidden');
    }
}

function showModeSelect() {
    document.getElementById('mode-section').classList.remove('hidden');
    document.getElementById('difficulty-section').classList.add('hidden');
}

function chooseDifficulty(diff) {
    currentDifficulty = diff;
    startGame();
}

function startGame() {
    initAudio();
    sharedBag = new Bag7();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.remove('show');

    // Swap layouts via body class
    document.body.classList.remove('mode-solo', 'mode-battle');
    document.body.classList.add(currentMode === 'battle' ? 'mode-battle' : 'mode-solo');

    battleEnded = false;
    battleWinner = null;

    if (currentMode === 'battle') {
        // Each player gets an independent 7-bag (fair randomness per player)
        game = new Tetris({ ...BATTLE_PLAYER_CONFIG, bag: new Bag7() });
        aiGame = new Tetris({ ...BATTLE_AI_CONFIG, bag: new Bag7() });
        game.spawn();
        aiGame.spawn();
        battleManager = new BattleManager(game, aiGame);
        ai = new TetrisAI(aiGame, currentDifficulty);

        const diffLabel = AI_PROFILES[currentDifficulty].name;
        const dd = document.getElementById('difficulty-display');
        if (dd) dd.textContent = diffLabel;

        if (inputManager) inputManager.destroy();
        inputManager = new InputManager(game);

        const so = document.getElementById('p-status-overlay');
        if (so) so.classList.add('hidden');
        const so2 = document.getElementById('a-status-overlay');
        if (so2) so2.classList.add('hidden');
    } else {
        game = new Tetris(SOLO_CONFIG);
        aiGame = null;
        ai = null;
        battleManager = null;
        game.spawn();

        if (inputManager) inputManager.destroy();
        inputManager = new InputManager(game);

        const so = document.getElementById('status-overlay');
        if (so) so.classList.add('hidden');
    }

    running = true;
    isPaused = false;
    startMusic();
    // Ensure renderers resize after layout switch
    requestAnimationFrame(() => {
        if (game) game.renderer.resize();
        if (aiGame) aiGame.renderer.resize();
        loop();
    });
}

function backMenu() {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('menu').classList.remove('hidden');
    showModeSelect();
    running = false;
    if (inputManager) { inputManager.destroy(); inputManager = null; }
    stopMusic();
    document.body.classList.remove('mode-battle');
    document.body.classList.add('mode-solo');
}

function togglePause() {
    if (!running) return;
    isPaused = !isPaused;
    const overlayIds = currentMode === 'battle'
        ? ['p-status-overlay', 'a-status-overlay']
        : ['status-overlay'];
    overlayIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = isPaused ? 'PAUSED' : '';
        el.classList.toggle('hidden', !isPaused);
    });
    const btns = ['pause-btn', 'battle-pause-btn'];
    btns.forEach(id => { const b = document.getElementById(id); if (b) b.textContent = isPaused ? 'RESUME' : 'PAUSE'; });
    if (isPaused) { stopMusic(); }
    else {
        if (game) game.lastTime = performance.now();
        if (aiGame) aiGame.lastTime = performance.now();
        if (inputManager) inputManager.lastTime = performance.now();
        startMusic();
        loop();
    }
}

function loop(time = 0) {
    if (!running || isPaused) return;
    inputManager.update();
    if (game) { game.update(time); game.render(); }
    if (aiGame) {
        if (ai) ai.update(time);
        aiGame.update(time);
        aiGame.render();
    }

    if (currentMode === 'solo') {
        if (game.over) { endSolo(); return; }
    } else {
        if (battleEnded) { endBattle(); return; }
    }
    requestAnimationFrame(loop);
}

function endSolo() {
    running = false;
    stopMusic();
    playSound('over');
    document.getElementById('gameover-title').textContent = 'GAME OVER';
    document.getElementById('gameover-sub').textContent = '';
    document.getElementById('final-stats-solo').classList.remove('hidden');
    document.getElementById('final-stats-battle').classList.add('hidden');
    document.getElementById('final-score').textContent = game.score.toLocaleString();
    document.getElementById('final-lines').textContent = game.lines;
    document.getElementById('final-level').textContent = game.level;
    document.getElementById('final-combo').textContent = game.maxCombo;
    document.getElementById('gameover').classList.add('show');
}

function endBattle() {
    running = false;
    stopMusic();
    playSound('over');
    const youWin = battleWinner === game;
    document.getElementById('gameover-title').textContent = youWin ? 'VICTORY' : 'DEFEAT';
    document.getElementById('gameover-sub').textContent = youWin
        ? `You defeated the ${AI_PROFILES[currentDifficulty].name} CPU!`
        : `The ${AI_PROFILES[currentDifficulty].name} CPU defeated you.`;
    document.getElementById('final-stats-solo').classList.add('hidden');
    document.getElementById('final-stats-battle').classList.remove('hidden');
    document.getElementById('final-atk').textContent = game.attackSent;
    document.getElementById('final-bl').textContent = game.lines;
    document.getElementById('final-bcombo').textContent = game.maxCombo;
    document.getElementById('final-bb2b').textContent = game.maxB2b;
    document.getElementById('gameover').classList.add('show');
}

document.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') { toggleMusic(); return; }
    if (!running) return;
    if (e.key === 'p' || e.key === 'P') togglePause();
});

document.addEventListener('click', () => { document.body.focus(); });
document.body.setAttribute('tabindex', '-1');

// ==================== Touch Controls ====================
(function initTouchControls() {
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0, touchMoved = false;

    document.addEventListener('touchstart', e => {
        if (!running || isPaused || !game) return;
        const t = e.touches[0];
        touchStartX = t.clientX; touchStartY = t.clientY;
        touchStartTime = Date.now(); touchMoved = false;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!running || isPaused || !game) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const threshold = 30;

        if (Math.abs(dx) > threshold) {
            game.move(dx > 0 ? 1 : -1);
            touchStartX = t.clientX; touchMoved = true;
        }
        if (dy > threshold) { game.drop(); touchStartY = t.clientY; touchMoved = true; }
        if (dy < -threshold) { game.rotate(1); touchStartY = t.clientY; touchMoved = true; }
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', e => {
        if (!running || isPaused || !game) return;
        if (!touchMoved && Date.now() - touchStartTime < 200) game.hardDrop();
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
    if (aiGame && aiGame.renderer) {
        aiGame.renderer.resize();
        if (running && !isPaused) aiGame.render();
    }
});
