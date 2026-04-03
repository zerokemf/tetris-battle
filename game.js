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

// Rich gradient color definitions for each piece
const COLORS = {
    I: { base: '#00f3ff', light: '#80f9ff', dark: '#009aa3', glow: 'rgba(0,243,255,0.6)' },
    O: { base: '#ffe14d', light: '#fff0a0', dark: '#b89e20', glow: 'rgba(255,225,77,0.6)' },
    T: { base: '#b44dff', light: '#d49fff', dark: '#7a20b8', glow: 'rgba(180,77,255,0.6)' },
    S: { base: '#39ff14', light: '#8fff78', dark: '#22a00a', glow: 'rgba(57,255,20,0.6)' },
    Z: { base: '#ff2d55', light: '#ff7e97', dark: '#b81e3a', glow: 'rgba(255,45,85,0.6)' },
    J: { base: '#2d7fff', light: '#7eb3ff', dark: '#1a50b0', glow: 'rgba(45,127,255,0.6)' },
    L: { base: '#ff8c2d', light: '#ffba7e', dark: '#b86010', glow: 'rgba(255,140,45,0.6)' }
};

// Tier colors for clear effects
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

// ==================== 7-Bag System ====================
class Bag7 {
    constructor() { this.bag = []; this.refill(); }
    refill() { this.bag = [...PIECES].sort(() => Math.random() - 0.5); }
    next() { if (this.bag.length === 0) this.refill(); return this.bag.pop(); }
    peek(count) {
        while (this.bag.length < count) {
            const extra = [...PIECES].sort(() => Math.random() - 0.5);
            this.bag = extra.concat(this.bag);
        }
        return this.bag.slice(-count).reverse();
    }
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

// ==================== Enhanced Particle System ====================
class Particle {
    constructor(x, y, color, options = {}) {
        this.x = x;
        this.y = y;
        const speed = options.speed || 1;
        const spread = options.spread || 10;
        this.vx = (Math.random() - 0.5) * spread * speed;
        this.vy = (Math.random() - 0.5) * spread * speed - (options.upward || 0);
        this.gravity = options.gravity !== undefined ? options.gravity : 0.15;
        this.color = color;
        this.size = (Math.random() * (options.maxSize || 5) + (options.minSize || 2)) * (options.sizeScale || 1);
        this.life = options.life || 1;
        this.decay = options.decay || 0.018;
        this.type = options.type || 'square'; // square, circle, star, spark
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.2;
        this.trail = options.trail || false;
        this.prevX = x;
        this.prevY = y;
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.99;
        this.rotation += this.rotSpeed;
        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.min(this.life, 1);

        if (this.trail) {
            ctx.beginPath();
            ctx.moveTo(this.prevX, this.prevY);
            ctx.lineTo(this.x, this.y);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size * 0.5;
            ctx.stroke();
        }

        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        if (this.type === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.shadowColor = this.color;
            ctx.fill();
        } else if (this.type === 'star') {
            this.drawStar(ctx, 0, 0, 5, this.size, this.size * 0.4);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size * 3;
            ctx.shadowColor = this.color;
            ctx.fill();
        } else if (this.type === 'spark') {
            ctx.beginPath();
            ctx.moveTo(-this.size, 0);
            ctx.lineTo(0, -this.size * 0.3);
            ctx.lineTo(this.size, 0);
            ctx.lineTo(0, this.size * 0.3);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.shadowColor = this.color;
            ctx.fill();
        } else {
            // Square with inner glow
            ctx.fillStyle = '#fff';
            ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
            ctx.fillStyle = this.color;
            ctx.shadowBlur = this.size;
            ctx.shadowColor = this.color;
            ctx.fillRect(-this.size*0.35, -this.size*0.35, this.size*0.7, this.size*0.7);
        }

        ctx.restore();
    }

    drawStar(ctx, cx, cy, spikes, outerR, innerR) {
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerR);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerR);
        ctx.closePath();
    }
}

// ==================== Shockwave Effect ====================
class Shockwave {
    constructor(x, y, color, maxRadius) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 0;
        this.maxRadius = maxRadius || 150;
        this.life = 1;
        this.lineWidth = 3;
    }

    update() {
        this.radius += (this.maxRadius - this.radius) * 0.12;
        this.life -= 0.03;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth * this.life;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ==================== Enhanced Renderer ====================
class GameRenderer {
    constructor(boardId, fxId) {
        this.boardCanvas = document.getElementById(boardId);
        this.boardCtx = this.boardCanvas.getContext('2d');
        this.fxCanvas = document.getElementById(fxId);
        this.fxCtx = this.fxCanvas.getContext('2d');
        this.blockSize = 36;
        this.particles = [];
        this.shockwaves = [];
        this.flashLines = []; // { row, life, tier }
        this.screenFlash = 0;
        this.screenFlashColor = '#fff';
        this.resize();
    }

    resize() {
        const rect = this.boardCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.boardCanvas.width = rect.width * dpr;
        this.boardCanvas.height = rect.height * dpr;
        this.fxCanvas.width = rect.width * dpr;
        this.fxCanvas.height = rect.height * dpr;
        this.boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
        this.blockSize = rect.width / COLS;
    }

    clear() {
        // Dark gradient background
        const ctx = this.boardCtx;
        const grad = ctx.createLinearGradient(0, 0, 0, this.displayHeight);
        grad.addColorStop(0, '#080c1a');
        grad.addColorStop(1, '#0a0e20');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
        this.fxCtx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    }

    drawGrid() {
        const ctx = this.boardCtx;
        const bs = this.blockSize;

        // Subtle grid dots at intersections
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let x = 1; x < COLS; x++) {
            for (let y = 1; y < ROWS; y++) {
                ctx.beginPath();
                ctx.arc(x * bs, y * bs, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Very subtle column lines
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(x * bs, 0);
            ctx.lineTo(x * bs, this.displayHeight);
            ctx.stroke();
        }
    }

    drawBlock(x, y, colorObj, ctx, alpha = 1) {
        if (!ctx) ctx = this.boardCtx;
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;
        const pad = 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Main block with gradient
        const grad = ctx.createLinearGradient(px, py, px + bs, py + bs);
        grad.addColorStop(0, colorObj.light);
        grad.addColorStop(0.4, colorObj.base);
        grad.addColorStop(1, colorObj.dark);
        ctx.fillStyle = grad;

        // Rounded rect
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(px + pad + r, py + pad);
        ctx.lineTo(px + bs - pad - r, py + pad);
        ctx.quadraticCurveTo(px + bs - pad, py + pad, px + bs - pad, py + pad + r);
        ctx.lineTo(px + bs - pad, py + bs - pad - r);
        ctx.quadraticCurveTo(px + bs - pad, py + bs - pad, px + bs - pad - r, py + bs - pad);
        ctx.lineTo(px + pad + r, py + bs - pad);
        ctx.quadraticCurveTo(px + pad, py + bs - pad, px + pad, py + bs - pad - r);
        ctx.lineTo(px + pad, py + pad + r);
        ctx.quadraticCurveTo(px + pad, py + pad, px + pad + r, py + pad);
        ctx.closePath();
        ctx.fill();

        // Top-left highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(px + pad + 2, py + pad + 2, bs - pad*2 - 4, 3);

        // Outer glow
        ctx.shadowBlur = 6;
        ctx.shadowColor = colorObj.glow;
        ctx.strokeStyle = colorObj.base;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Inner shine dot
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(px + bs * 0.3, py + bs * 0.3, bs * 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawGhostBlock(x, y, colorObj) {
        const bs = this.blockSize;
        const px = x * bs;
        const py = y * bs;
        const ctx = this.boardCtx;

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = colorObj.base;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(px + 2, py + 2, bs - 4, bs - 4);
        ctx.setLineDash([]);

        // Faint fill
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = colorObj.base;
        ctx.fillRect(px + 2, py + 2, bs - 4, bs - 4);
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
            fl.life -= 0.04;
            if (fl.life <= 0) {
                this.flashLines.splice(i, 1);
                continue;
            }
            const ctx = this.boardCtx;
            ctx.save();
            ctx.globalAlpha = fl.life;
            const py = fl.row * this.blockSize;
            const grad = ctx.createLinearGradient(0, py, this.displayWidth, py);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.3, fl.color);
            grad.addColorStop(0.5, '#fff');
            grad.addColorStop(0.7, fl.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, py, this.displayWidth, this.blockSize);
            ctx.restore();
        }

        // Draw piece
        if (piece) {
            // Ghost
            const ghostY = piece.getGhostY();
            if (ghostY !== piece.y) {
                piece.shape.forEach((row, r) => {
                    row.forEach((val, c) => {
                        if (val) this.drawGhostBlock(piece.x + c, ghostY + r, piece.color);
                    });
                });
            }

            // Actual piece
            piece.shape.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val && piece.y + r >= 0) {
                        this.drawBlock(piece.x + c, piece.y + r, piece.color);
                    }
                });
            });
        }

        // FX layer
        const fctx = this.fxCtx;

        // Screen flash
        if (this.screenFlash > 0) {
            fctx.save();
            fctx.globalAlpha = this.screenFlash;
            fctx.fillStyle = this.screenFlashColor;
            fctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
            fctx.restore();
            this.screenFlash -= 0.04;
        }

        // Shockwaves
        fctx.save();
        fctx.globalCompositeOperation = 'lighter';
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            this.shockwaves[i].update();
            this.shockwaves[i].draw(fctx);
            if (this.shockwaves[i].life <= 0) this.shockwaves.splice(i, 1);
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            this.particles[i].draw(fctx);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        fctx.restore();
    }

    // Spawn particles scaled by tier
    spawnClearEffect(rows, tier) {
        const bs = this.blockSize;
        const centerX = this.displayWidth / 2;
        const particleMultiplier = [0, 1, 1.8, 3, 5][tier];
        const tierColor = TIER_COLORS[tier];

        rows.forEach(r => {
            const cy = r * bs + bs / 2;

            // Line flash
            this.flashLines.push({
                row: r,
                life: 1,
                color: tierColor.color
            });

            // Row particles
            for (let c = 0; c < COLS; c++) {
                const cx2 = c * bs + bs / 2;
                const count = Math.floor(4 * particleMultiplier);
                for (let i = 0; i < count; i++) {
                    this.particles.push(new Particle(cx2, cy, tierColor.color, {
                        speed: 0.5 + tier * 0.3,
                        spread: 6 + tier * 2,
                        upward: tier * 1.5,
                        gravity: 0.12,
                        minSize: 1.5,
                        maxSize: 3 + tier,
                        sizeScale: 0.8 + tier * 0.2,
                        decay: 0.015 + (4 - tier) * 0.003,
                        type: tier >= 3 ? (Math.random() > 0.5 ? 'star' : 'circle') : 'square'
                    }));
                }
            }

            // Spark trails for tier 2+
            if (tier >= 2) {
                for (let i = 0; i < 6 * tier; i++) {
                    this.particles.push(new Particle(
                        Math.random() * this.displayWidth,
                        cy,
                        tier >= 4 ? '#ffe14d' : tierColor.color,
                        {
                            speed: 1 + tier * 0.5,
                            spread: 15,
                            upward: 3 + tier,
                            gravity: 0.05,
                            minSize: 2,
                            maxSize: 4 + tier,
                            decay: 0.012,
                            type: 'spark',
                            trail: true
                        }
                    ));
                }
            }
        });

        // Shockwave for tier 3+
        if (tier >= 3) {
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            this.shockwaves.push(new Shockwave(
                centerX,
                avgRow * bs + bs / 2,
                tierColor.color,
                this.displayWidth * (tier === 4 ? 1.2 : 0.8)
            ));
        }

        // Tetris: extra star burst from center
        if (tier === 4) {
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            const cy = avgRow * bs + bs / 2;
            for (let i = 0; i < 40; i++) {
                const angle = (i / 40) * Math.PI * 2;
                const speed = 4 + Math.random() * 4;
                const p = new Particle(centerX, cy, Math.random() > 0.5 ? '#ff2d95' : '#ffe14d', {
                    speed: 1,
                    spread: 1,
                    gravity: 0.08,
                    minSize: 3,
                    maxSize: 7,
                    decay: 0.01,
                    type: 'star'
                });
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                this.particles.push(p);
            }

            // Second shockwave
            this.shockwaves.push(new Shockwave(centerX, cy, '#ffe14d', this.displayWidth * 1.5));

            // Screen flash
            this.screenFlash = 0.5;
            this.screenFlashColor = 'rgba(255,45,149,0.3)';
        }

        // Triple: moderate screen flash
        if (tier === 3) {
            this.screenFlash = 0.25;
            this.screenFlashColor = 'rgba(180,77,255,0.2)';
        }
    }

    // Hard drop trail effect
    spawnDropTrail(piece) {
        const bs = this.blockSize;
        piece.shape.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val) {
                    const px = (piece.x + c) * bs + bs / 2;
                    const py = (piece.y + r) * bs + bs / 2;
                    for (let i = 0; i < 3; i++) {
                        this.particles.push(new Particle(px, py, piece.color.base, {
                            speed: 0.3,
                            spread: 4,
                            upward: 2,
                            gravity: 0.2,
                            minSize: 1,
                            maxSize: 3,
                            decay: 0.04,
                            type: 'circle'
                        }));
                    }
                }
            });
        });
    }

    // Lock flash effect
    spawnLockFlash(piece) {
        const bs = this.blockSize;
        piece.shape.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val) {
                    const px = (piece.x + c) * bs + bs / 2;
                    const py = (piece.y + r) * bs + bs / 2;
                    this.particles.push(new Particle(px, py, '#fff', {
                        speed: 0,
                        spread: 0,
                        gravity: 0,
                        minSize: bs * 0.8,
                        maxSize: bs * 0.8,
                        decay: 0.08,
                        type: 'circle',
                        life: 0.5
                    }));
                }
            });
        });
    }

    renderPreview(canvas, type, opacity = 1) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const w = rect.width, h = rect.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(8,12,26,0.6)';
        ctx.fillRect(0, 0, w, h);

        if (!type || !SHAPES[type]) return;
        const shape = SHAPES[type];
        const colorObj = COLORS[type];
        const size = Math.min(w / (shape[0].length + 1), h / (shape.length + 1));
        const ox = (w - shape[0].length * size) / 2;
        const oy = (h - shape.length * size) / 2;

        ctx.save();
        ctx.globalAlpha = opacity;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    const px = ox + c * size;
                    const py = oy + r * size;
                    const pad = 1;

                    const grad = ctx.createLinearGradient(px, py, px + size, py + size);
                    grad.addColorStop(0, colorObj.light);
                    grad.addColorStop(0.4, colorObj.base);
                    grad.addColorStop(1, colorObj.dark);
                    ctx.fillStyle = grad;
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = colorObj.glow;
                    ctx.fillRect(px + pad, py + pad, size - pad*2, size - pad*2);

                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.fillRect(px + pad + 2, py + pad + 2, size - pad*2 - 4, 2);
                }
            }
        }
        ctx.restore();
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
        // Fill next queue
        while (this.nextQueue.length < 3) {
            this.nextQueue.push(bag.next());
        }
        this.canHold = true;
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
                return;
            }
        }

        this.piece.shape = oldShape;
    }

    move(dir) { if (this.piece.move(dir, 0)) playSound('move'); }

    drop() {
        if (this.piece.move(0, 1)) { return true; }
        return false;
    }

    hardDrop() {
        const dist = this.piece.hardDrop();
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
        const clearedRows = [];
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every(c => c)) {
                clearedRows.push(r);
            }
        }

        if (clearedRows.length > 0) {
            const tier = Math.min(clearedRows.length, 4);

            // Spawn tiered visual effects
            this.renderer.spawnClearEffect(clearedRows, tier);

            // Screen shake
            this.triggerShake(tier);

            // Play tiered sound
            playSound('clear', tier);

            // Remove lines (after collecting all)
            clearedRows.sort((a, b) => b - a);
            for (const row of clearedRows) {
                this.grid.splice(row, 1);
                this.grid.unshift(Array(COLS).fill(EMPTY));
            }

            // Scoring
            const baseScore = [0, 100, 300, 500, 800][tier];
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            const comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
            this.score += baseScore * this.level + comboBonus;
            this.lines += clearedRows.length;
            this.level = Math.floor(this.lines / 10) + 1;
            this.interval = Math.max(80, 1000 - (this.level - 1) * 90);

            // Show action text
            this.showActionText(TIER_COLORS[tier].name, tier);

            // Show combo
            if (this.combo >= 2) {
                this.showCombo(this.combo);
            }

            // Update stats with pop animation
            this.popStat('score1');
            if (this.combo >= 2) this.popStat('combo1');
        } else {
            this.combo = 0;
        }
    }

    triggerShake(tier) {
        this.wrapper.classList.remove('shake', 'shake-heavy');
        void this.wrapper.offsetWidth; // reflow
        if (tier >= 4) {
            this.wrapper.classList.add('shake-heavy');
        } else if (tier >= 2) {
            this.wrapper.classList.add('shake');
        }
    }

    showActionText(text, tier) {
        const el = this.actionText;
        el.textContent = text;
        el.className = 'action-text show tier-' + tier;
        clearTimeout(this.actionTimer);
        this.actionTimer = setTimeout(() => {
            el.className = 'action-text hidden';
        }, 1200);
    }

    showCombo(count) {
        const el = this.comboDisplay;
        el.textContent = count + 'x COMBO';
        el.className = 'combo-display show';
        clearTimeout(this.comboTimer);
        this.comboTimer = setTimeout(() => {
            el.className = 'combo-display hidden';
        }, 1500);
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
        for (let i = 0; i < this.nextCanvases.length; i++) {
            const type = this.nextQueue[i] || null;
            const opacity = i === 0 ? 1 : 0.6;
            this.renderer.renderPreview(this.nextCanvases[i], type, opacity);
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
            osc.frequency.value = 280;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.025, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            osc.start(t); osc.stop(t + 0.04);
        }
        else if (type === 'rotate') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 400;
            osc.frequency.exponentialRampToValueAtTime(500, t + 0.06);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.08);
        }
        else if (type === 'hardDrop') {
            // Impact sound
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 120;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.08);

            // Click
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2); gain2.connect(audioCtx.destination);
            osc2.frequency.value = 800;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.03, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
            osc2.start(t); osc2.stop(t + 0.03);
        }
        else if (type === 'clear') {
            tier = tier || 1;
            const baseFreq = 440;
            const notes = tier === 4 ? 6 : tier === 3 ? 5 : tier === 2 ? 4 : 3;

            for (let i = 0; i < notes; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);

                const freq = baseFreq + i * (40 + tier * 25);
                osc.frequency.value = freq;
                osc.type = tier >= 3 ? 'triangle' : 'sine';

                const vol = 0.04 + tier * 0.01;
                const delay = i * (0.06 + (4 - tier) * 0.01);
                const duration = 0.12 + tier * 0.04;

                gain.gain.setValueAtTime(vol, t + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, t + delay + duration);
                osc.start(t + delay);
                osc.stop(t + delay + duration);
            }

            // Tetris: add a triumphant final note
            if (tier === 4) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.value = 880;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.06, t + 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
                osc.start(t + 0.4); osc.stop(t + 0.8);
            }
        }
        else if (type === 'hold') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 600;
            osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(t); osc.stop(t + 0.1);
        }
        else if (type === 'over') {
            for (let i = 0; i < 5; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.frequency.value = 300 - i * 40;
                osc.type = 'sawtooth';
                const d = i * 0.12;
                gain.gain.setValueAtTime(0.05, t + d);
                gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.3);
                osc.start(t + d); osc.stop(t + d + 0.3);
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
    const btn = document.getElementById('pause-btn');
    btn.textContent = isPaused ? 'RESUME' : 'PAUSE';
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

// ==================== Animated Background Particles ====================
function initBgParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    const colors = ['rgba(0,243,255,0.15)', 'rgba(180,77,255,0.1)', 'rgba(255,45,149,0.08)', 'rgba(57,255,20,0.08)'];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'bg-particle';
        const size = Math.random() * 4 + 1;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 15 + 10) + 's';
        p.style.animationDelay = (Math.random() * 15) + 's';
        container.appendChild(p);
    }
}

initBgParticles();

// Handle window resize
window.addEventListener('resize', () => {
    if (game && game.renderer) {
        game.renderer.resize();
        if (running && !isPaused) game.render();
    }
});
