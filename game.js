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
    I: { base: '#50f6e9', light: '#b9fff9', dark: '#14a79d', glow: 'rgba(80,246,233,0.7)' },
    O: { base: '#edc524', light: '#fff18a', dark: '#9d7f08', glow: 'rgba(237,197,36,0.7)' },
    T: { base: '#ff7056', light: '#ffb09f', dark: '#b9321f', glow: 'rgba(255,112,86,0.7)' },
    S: { base: '#53a8ff', light: '#a9d3ff', dark: '#2164b2', glow: 'rgba(83,168,255,0.68)' },
    Z: { base: '#f65200', light: '#ff9b69', dark: '#9e3100', glow: 'rgba(246,82,0,0.72)' },
    J: { base: '#53a8ff', light: '#b5dcff', dark: '#2269b8', glow: 'rgba(83,168,255,0.7)' },
    L: { base: '#f65200', light: '#ffb06f', dark: '#9e3100', glow: 'rgba(246,82,0,0.72)' },
    G: { base: '#958537', light: '#cfbd68', dark: '#504718', glow: 'rgba(149,133,55,0.35)' },
    X: { base: '#f65200', light: '#edc524', dark: '#8a2800', glow: 'rgba(246,82,0,0.86)' }
};

const TIER_COLORS = {
    1: { color: '#fffde8', glow: 'rgba(255,253,232,0.55)', name: 'SINGLE' },
    2: { color: '#50f6e9', glow: 'rgba(80,246,233,0.72)', name: 'DOUBLE' },
    3: { color: '#f65200', glow: 'rgba(246,82,0,0.78)', name: 'TRIPLE' },
    4: { color: '#ff7056', glow: 'rgba(255,112,86,0.88)', name: 'TETRIS!' }
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
const BOMB_MILESTONE_LINES = 10;  // every N lines cleared, next outgoing attack becomes a bomb

// Tetris Battle attack table (garbage lines sent)
const ATTACK_TABLE = [0, 0, 1, 2, 4];  // index = lines cleared
// T-Spin attack table: [normal, mini] by lines cleared (Tetris guideline / Battle style)
const TSPIN_ATTACK = [[0, 0], [2, 0], [4, 1], [6, 2]];
const TSPIN_SCORE = {
    miniNoLines: 100, miniSingle: 200, miniDouble: 400,
    noLines: 400, single: 800, double: 1200, triple: 1600
};
// Combo bonus cumulative (Tetris Battle / Tetris Friends style)
const COMBO_TABLE = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const PERFECT_CLEAR_BONUS = 10;
const B2B_BONUS = 1;

// AI difficulty profiles
const AI_PROFILES = {
    easy: {
        name: 'EASY',
        thinkDelay: 800,
        actionInterval: 500,  // slow — beatable, gives player room to breathe
        dropInterval: 900,
        errorChance: 0.12,
        weights: { height: -0.55, lines: 0.70, holes: -0.40, bumpiness: -0.20 }
    },
    normal: {
        name: 'NORMAL',
        thinkDelay: 350,      // moderate thinking time
        actionInterval: 250,  // faster than easy, still comfortable for humans
        dropInterval: 600,
        errorChance: 0.06,   // smarter than easy — knows what it's doing
        weights: { height: -0.52, lines: 0.78, holes: -0.45, bumpiness: -0.20 }
    },
    hard: {
        name: 'HARD',
        thinkDelay: 110,
        actionInterval: 110,  // fast but not unbeatable — experienced players can counter
        dropInterval: 400,
        errorChance: 0.02,   // nearly optimal play
        weights: { height: -0.52, lines: 0.88, holes: -0.55, bumpiness: -0.22, wells: -0.12 }
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
        // Last-maneuver tracking (for T-Spin detection)
        this.lastAction = null;     // 'rotate' | 'move' | 'drop' | 'hardDrop'
        this.lastKickIndex = -1;    // SRS kick test index of last successful rotation
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
            if (dx !== 0) {
                this.lastAction = 'move';
                this.lastKickIndex = -1;
            }
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
        // A zero-distance hard drop is merely a lock command. Preserve a
        // preceding successful rotation so grounded T-Spins are recognized.
        if (distance > 0) {
            this.lastAction = 'hardDrop';
            this.lastKickIndex = -1;
        }
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
        this.trails = [];
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
        ctx.fillStyle = '#020806';
        ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
        this.fxCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    drawGrid() {
        const ctx = this.boardCtx;
        const bs = this.blockSize;
        ctx.strokeStyle = 'rgba(80,246,233,0.095)';
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
        grad.addColorStop(0, '#fff18a');
        grad.addColorStop(0.4, '#ff7056');
        grad.addColorStop(1, '#8a2800');
        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, bs - 2, bs - 2);

        ctx.strokeStyle = `rgba(237,197,36,${0.4 + 0.6 * pulse})`;
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

        // FX: drop beam trails + screen flash + particles
        const fctx = this.fxCtx;
        for (let i = this.trails.length - 1; i >= 0; i--) {
            const tr = this.trails[i];
            tr.life -= 0.12;
            if (tr.life <= 0) { this.trails.splice(i, 1); continue; }
            fctx.save();
            fctx.globalAlpha = Math.min(tr.life, 1) * 0.35;
            const grad = fctx.createLinearGradient(0, tr.topY, 0, tr.botY);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(1, tr.color);
            fctx.fillStyle = grad;
            fctx.fillRect(tr.col * this.blockSize + 2, tr.topY, this.blockSize - 4, tr.botY - tr.topY);
            fctx.restore();
        }
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

    spawnClearEffect(rows, tier, isTSpin) {
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
        if (isTSpin) {
            // Purple energy burst from the center of the cleared area
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            const cx = this.displayWidth / 2;
            const cy = avgRow * bs + bs / 2;
            for (let i = 0; i < 26; i++) {
                const angle = (i / 26) * Math.PI * 2;
                const spd = 2.5 + Math.random() * 4;
                this.addParticle(cx, cy,
                    Math.random() > 0.35 ? '#53a8ff' : '#fffde8',
                    Math.cos(angle) * spd, Math.sin(angle) * spd,
                    Math.random() * 3.5 + 2, 1, 0.015, 0.05
                );
            }
            this.screenFlash = 0.35;
            this.screenFlashColor = 'rgba(83,168,255,0.24)';
        } else if (tier === 4) {
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            const cy = avgRow * bs + bs / 2;
            const cx = this.displayWidth / 2;
            for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const spd = 3 + Math.random() * 3;
                this.addParticle(cx, cy,
                    Math.random() > 0.5 ? '#ff7056' : '#edc524',
                    Math.cos(angle) * spd, Math.sin(angle) * spd,
                    Math.random() * 4 + 3, 1, 0.012, 0.06
                );
            }
            this.screenFlash = 0.4;
            this.screenFlashColor = 'rgba(255,112,86,0.28)';
        } else if (tier === 3) {
            this.screenFlash = 0.2;
            this.screenFlashColor = 'rgba(246,82,0,0.22)';
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
                Math.random() > 0.5 ? '#ff7056' : '#edc524',
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
        // Beam trail along each column the piece travels through
        const ghostY = piece.getGhostY();
        piece.shape.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val && (r === 0 || !piece.shape[r-1][c])) {
                    const col = piece.x + c;
                    const topY = (piece.y + r) * bs;
                    const botY = (ghostY + r) * bs;
                    if (botY > topY) {
                        this.trails.push({ col, topY, botY, life: 1, color: piece.color.base });
                        if (this.trails.length > 8) this.trails.shift();
                    }
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
        ctx.fillStyle = 'rgba(6,23,19,0.72)';
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

        // T-Spin detection state (set in rotate(), consumed in lockPiece())
        this._tSpin = false;
        this._tSpinMini = false;

        // Lock Delay
        this.lockDelay = 500;
        this.lockStartTime = 0;
        this.lockResets = 0;
        this.lockResetMax = 15;
        this.isLocking = false;

        // Battle: incoming garbage queue
        this.garbageQueue = [];
        this.bombLineCountdown = BOMB_MILESTONE_LINES;  // lines remaining to earn a bomb charge
        this.bombCharges = 0;                           // one charge consumed per actual outgoing attack

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

        this._lastStatSync = 0;
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
                this.piece.lastAction = 'rotate';
                this.piece.lastKickIndex = i;
                playSound('rotate');
                this.resetLockDelay();
                if (!this.isOnGround()) this.isLocking = false;
                return;
            }
        }
        this.piece.shape = oldShape;
    }

    // T-Spin detection: 3-corner rule (Tetris guideline).
    // The T piece occupies the 3x3 box around its center; if the 4 diagonal
    // corners of that box contain >=3 filled cells/walls AND the last successful
    // maneuver was a rotation, it's a T-Spin. When both "front" corners are
    // occupied it's a full T-Spin; otherwise Mini (unless kicked with the final
    // SRS kick test 4, which upgrades to full per guideline).
    detectTSpin() {
        const p = this.piece;
        if (!p || p.type !== 'T') return { spin: false, mini: false };
        if (p.lastAction !== 'rotate') return { spin: false, mini: false };

        const cx = p.x + 1, cy = p.y + 1;  // center of the T's 3x3 bounding box
        const filled = (x, y) => {
            if (x < 0 || x >= COLS || y >= ROWS) return true;  // walls & floor count
            if (y < 0) return false;                            // above field is open
            return !!this.grid[y][x];
        };
        // Diagonal corners in the piece's own frame:
        // rot 0 points up -> front corners are top-left & top-right
        const cornersByRot = [
            [[-1,-1],[1,-1],[-1,1],[1,1]],  // rot 0 (up)
            [[1,-1],[1,1],[-1,-1],[-1,1]],  // rot 1 (right)
            [[-1,1],[1,1],[-1,-1],[1,-1]],  // rot 2 (down)
            [[-1,-1],[-1,1],[1,-1],[1,1]]   // rot 3 (left)
        ];
        const [fl_, fr_, bl_, br_] = cornersByRot[p.rotIndex].map(([ox, oy]) => filled(cx+ox, cy+oy));
        const frontCount = (fl_?1:0) + (fr_?1:0);
        const total = frontCount + (bl_?1:0) + (br_?1:0);
        if (total < 3) return { spin: false, mini: false };
        const isMini = (frontCount < 2) && p.lastKickIndex !== 4;
        return { spin: true, mini: isMini };
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
        // Spawn the drop trail BEFORE dropping, so particles trace the actual path
        this.renderer.spawnDropTrail(this.piece);
        this.piece.hardDrop();
        playSound('hardDrop');
    }

    lockPiece() {
        // T-Spin detection must run BEFORE the piece is merged into the grid
        const spinResult = this.detectTSpin();
        this._tSpin = spinResult.spin;
        this._tSpinMini = spinResult.mini;
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

    updateBombMilestone(linesCleared) {
        this.bombLineCountdown -= linesCleared;
        while (this.bombLineCountdown <= 0) {
            this.bombCharges++;
            this.bombLineCountdown += BOMB_MILESTONE_LINES;
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

        const isTSpin = this._tSpin && this.piece && this.piece.type === 'T';
        const isMini = isTSpin && this._tSpinMini;

        if (linesCleared === 0) {
            this.combo = 0;
            if (isTSpin) {
                // A no-clear T-Spin scores and preserves the current B2B chain,
                // but does not advance it (only difficult line clears do).
                this.score += (isMini ? TSPIN_SCORE.miniNoLines : TSPIN_SCORE.noLines) * this.level;
                this.showActionText(isMini ? 'T-SPIN MINI' : 'T-SPIN', isMini ? 1 : 3);
                this.syncStats();
            }
            this._tSpin = false;
            this._tSpinMini = false;
            return;
        }

        this._clearedThisLock = true;

        while (newGrid.length < ROWS) newGrid.unshift(Array(COLS).fill(EMPTY));
        this.grid = newGrid;

        const tier = Math.min(linesCleared, 4);
        this.renderer.spawnClearEffect(clearedRowIndices, tier, isTSpin);
        this.triggerShake(tier);
        playSound('clear', tier);

        // Scoring
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        let baseScore = [0, 100, 300, 500, 800][tier];
        if (isTSpin) {
            baseScore = isMini
                ? [0, TSPIN_SCORE.miniSingle, TSPIN_SCORE.miniDouble, 0, 0][tier]
                : [0, TSPIN_SCORE.single, TSPIN_SCORE.double, TSPIN_SCORE.triple, 0][tier];
        }
        const comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
        this.score += baseScore * this.level + comboBonus;
        this.lines += linesCleared;
        this.level = Math.floor(this.lines / 10) + 1;
        this.interval = Math.max(80, 1000 - (this.level - 1) * 90);

        // B2B: Tetris and T-Spin clears are "difficult" clears and extend the chain
        const isDifficult = (linesCleared === 4) || isTSpin;
        if (isDifficult) {
            this.b2b++;
            this.maxB2b = Math.max(this.maxB2b, this.b2b);
        } else {
            this.b2b = 0;
        }

        // Perfect Clear detection
        const isPC = this.grid.every(row => row.every(c => !c));

        // Calculate attack (garbage to send)
        let attack = isTSpin ? TSPIN_ATTACK[tier][isMini ? 1 : 0] : ATTACK_TABLE[tier];
        if (this.b2b >= 2) attack += B2B_BONUS;
        const comboIdx = Math.min(this.combo - 1, COMBO_TABLE.length - 1);
        if (comboIdx > 0) attack += COMBO_TABLE[comboIdx];
        if (isPC) attack += PERFECT_CLEAR_BONUS;
        if (bombTriggered) attack += 4;  // bomb bonus

        // Bomb milestone: every N cleared lines earns one bomb charge.
        // Carry overflow; canceled attacks do not consume charges, and multiple
        // crossed milestones queue independently instead of collapsing to a boolean.
        this.updateBombMilestone(linesCleared);

        // Cancel incoming garbage first, then send remainder
        if (attack > 0) {
            attack = this.cancelGarbage(attack);
            if (attack > 0 && this.onAttack) {
                const chargedBomb = this.bombCharges > 0;
                const sendAsBomb = bombTriggered || chargedBomb;
                this.attackSent += attack;
                this.onAttack(attack, { tier, combo: this.combo, b2b: this.b2b, pc: isPC, bomb: sendAsBomb });
                if (chargedBomb) this.bombCharges--;
            }
        }

        // Action text
        let label = TIER_COLORS[tier].name;
        if (isPC) label = 'PERFECT!';
        else if (isTSpin && isMini) label = `T-SPIN MINI ${TIER_COLORS[tier].name}`;
        else if (isTSpin) label = `T-SPIN ${TIER_COLORS[tier].name}`;
        else if (this.b2b >= 2 && tier === 4) label = 'B2B TETRIS!';
        else if (bombTriggered) label = 'BOMB!';
        this.showActionText(label, isTSpin ? 4 : tier);
        if (this.combo >= 2) this.showCombo(this.combo);

        this._tSpin = false;
        this._tSpinMini = false;
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
        let newPiece;
        if (this.hold) {
            newPiece = new Piece(this.hold, this);
        } else {
            this.spawn();
            newPiece = this.piece;
        }
        // If the swapped/spawned piece is blocked at its entry position, it's a top-out.
        // spawn() already reports its own top-out, so don't fire the callback twice.
        if (!this.over && !this.valid(newPiece, newPiece.x, newPiece.y)) {
            this.over = true;
            if (this.onTopOut) this.onTopOut();
        }
        this.piece = newPiece;
        this.hold = t;
        this.canHold = false;
        this.isLocking = false;
        this.lockStartTime = 0;
        this.lockResets = 0;
    }

    update(time) {
        if (this.over || isPaused) return;

        // First frame after spawn: anchor gravity timer so the piece doesn't
        // insta-drop due to lastTime=0 vs large rAF timestamp
        if (this.lastTime === 0) this.lastTime = time;

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
        // Throttle DOM stat writes — no need to touch the DOM 60x per second
        const now = performance.now();
        if (now - this._lastStatSync > 120) {
            this._lastStatSync = now;
            this.syncStats();
        }
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
        this.playerKOs = 0;
        this.aiKOs = 0;

        this.player.onAttack = (lines, info) => this.handleAttack(this.player, this.ai, lines, info);
        this.ai.onAttack     = (lines, info) => this.handleAttack(this.ai,     this.player, lines, info);
        this.player.onTopOut = () => { this.aiKOs++; this.syncKO(); this.endBattle(this.ai); };
        this.ai.onTopOut     = () => { this.playerKOs++; this.syncKO(); this.endBattle(this.player); };
    }

    syncKO() {
        const kp = document.getElementById('ko-p');
        const ka = document.getElementById('ko-a');
        if (kp) kp.textContent = this.playerKOs;
        if (ka) ka.textContent = this.aiKOs;
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
            // Ignore key repeat events — only respond to initial press
            if (e.repeat) return;
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
            case 'Space': this.game.hardDrop(); break;
        }
    }
}

// ==================== High Score (localStorage) ====================
const HIGH_SCORE_KEY = 'tb-high-score';
const BEST_COMBO_KEY = 'tb-best-combo';

function loadHighScore() {
    try {
        return {
            score: parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0,
            combo: parseInt(localStorage.getItem(BEST_COMBO_KEY), 10) || 0
        };
    } catch (e) { return { score: 0, combo: 0 }; }
}

function saveHighScore(score, combo) {
    try {
        const cur = loadHighScore();
        if (score > cur.score) localStorage.setItem(HIGH_SCORE_KEY, String(score));
        if (combo > cur.combo) localStorage.setItem(BEST_COMBO_KEY, String(combo));
    } catch (e) {}
}

function updateHighScoreDisplay() {
    const hs = loadHighScore();
    const el = document.getElementById('high-score-value');
    if (el) el.textContent = hs.score.toLocaleString();
    const el2 = document.getElementById('menu-high-score');
    if (el2) el2.textContent = hs.score.toLocaleString();
}

// ==================== Game Control ====================
let game = null;
let aiGame = null;
let ai = null;
let battleManager = null;
let inputManager = null;
let running = false;
let isPaused = false;
let loopGeneration = 0;           // invalidates stale requestAnimationFrame chains
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
    updateHighScoreDisplay();
}

function chooseDifficulty(diff) {
    currentDifficulty = diff;
    startGame();
}

function startGame() {
    initAudio();
    sharedBag = new Bag7();
    document.body.classList.remove('at-menu');
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
    const generation = ++loopGeneration;
    startMusic();
    // Ensure renderers resize after layout switch. The generation token keeps
    // a queued frame from an older game session from reviving its loop.
    requestAnimationFrame(() => {
        if (generation !== loopGeneration || !running) return;
        if (game) game.renderer.resize();
        if (aiGame) aiGame.renderer.resize();
        loop(0, generation);
    });
}

function backMenu() {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('menu').classList.remove('hidden');
    document.body.classList.add('at-menu');
    showModeSelect();
    running = false;
    loopGeneration++;  // invalidate any frame already queued by the previous game
    if (inputManager) { inputManager.destroy(); inputManager = null; }
    stopMusic();
    document.body.classList.remove('mode-battle');
    document.body.classList.add('mode-solo');
    updateHighScoreDisplay();
}

function togglePause() {
    if (!running) return;
    isPaused = !isPaused;
    // Invalidate the frame that may already be queued. On resume, only the
    // new generation below is allowed to continue the animation chain.
    const generation = ++loopGeneration;
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
        loop(0, generation);
    }
}

function loop(time = 0, generation = loopGeneration) {
    if (generation !== loopGeneration || !running || isPaused) return;
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
    requestAnimationFrame(nextTime => loop(nextTime, generation));
}

function endSolo() {
    running = false;
    stopMusic();
    playSound('over');
    document.getElementById('gameover-title').textContent = 'GAME OVER';
    const hs = loadHighScore();
    const isNewRecord = game.score > hs.score;
    saveHighScore(game.score, game.maxCombo);
    document.getElementById('gameover-sub').textContent = isNewRecord ? '🏆 NEW HIGH SCORE!' : '';
    document.getElementById('gameover-sub').classList.toggle('new-record', isNewRecord);
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

// Auto-pause when the tab/window loses focus — no more cheap deaths while alt-tabbed
document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !isPaused) togglePause();
});
window.addEventListener('blur', () => {
    if (running && !isPaused) togglePause();
});

document.addEventListener('click', () => { document.body.focus(); });
document.body.setAttribute('tabindex', '-1');

// Init menu high-score display
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateMusicButton(); updateHighScoreDisplay(); });
} else {
    updateMusicButton();
    updateHighScoreDisplay();
}

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
    const colors = ['rgba(80,246,233,0.18)', 'rgba(83,168,255,0.13)', 'rgba(255,112,86,0.12)'];
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
