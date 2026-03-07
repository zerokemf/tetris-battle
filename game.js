// ==================== 粒子类 ====================
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10 - 2;
        this.gravity = 0.15;
        this.friction = 0.96;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.baseLife = Math.random() * 0.5 + 0.5;
        this.life = this.baseLife;
    }

    update() {
        this.vy += this.gravity;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        const alpha = this.life / this.baseLife;
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.shadowBlur = 10 * alpha;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.restore();
    }
}

// ==================== 方块类 ====================
class Piece {
    constructor(type, board) {
        this.type = type;
        this.shape = SHAPES[type].map(r => [...r]);
        this.color = COLORS[type];
        this.board = board;
        this.x = 3;
        this.y = 0;
    }

    // 计算 Ghost Piece 落点
    getGhostY() {
        let ghostY = this.y;
        while (this.board.valid(this, this.x, ghostY + 1)) {
            ghostY++;
        }
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

// ==================== 渲染器类 ====================
class GameRenderer {
    constructor(boardId, fxId) {
        this.boardCanvas = document.getElementById(boardId);
        this.boardCtx = this.boardCanvas.getContext('2d');
        this.fxCanvas = document.getElementById(fxId);
        this.fxCtx = this.fxCanvas.getContext('2d');
        this.blockSize = 30;
        this.particles = [];
    }
    
    drawGrid() {
        this.boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        this.boardCtx.lineWidth = 1;
        for (let x = 0; x <= 300; x += this.blockSize) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(x, 0);
            this.boardCtx.lineTo(x, 600);
            this.boardCtx.stroke();
        }
        for (let y = 0; y <= 600; y += this.blockSize) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(0, y);
            this.boardCtx.lineTo(300, y);
            this.boardCtx.stroke();
        }
    }
    
    clear() {
        this.boardCtx.fillStyle = '#0a0a15';
        this.boardCtx.fillRect(0, 0, 300, 600);
        this.fxCtx.clearRect(0, 0, 300, 600);
    }
    
    // 通用的画方块函数
    drawMatrix(matrix, offsetX, offsetY, color, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const drawX = (offsetX + x) * this.blockSize;
                    const drawY = (offsetY + y) * this.blockSize;
                    
                    this.boardCtx.save();
                    
                    if (isGhost) {
                        // Ghost Piece: 半透明 + 发光边框
                        this.boardCtx.globalAlpha = 0.3;
                        this.boardCtx.strokeStyle = color;
                        this.boardCtx.lineWidth = 2;
                        this.boardCtx.shadowBlur = 10;
                        this.boardCtx.shadowColor = color;
                        this.boardCtx.strokeRect(drawX + 1, drawY + 1, this.blockSize - 2, this.blockSize - 2);
                        this.boardCtx.fillStyle = color;
                        this.boardCtx.globalAlpha = 0.1;
                        this.boardCtx.fillRect(drawX, drawY, this.blockSize, this.blockSize);
                    } else {
                        // 真实方块: 高饱和度 + 霓虹边缘
                        this.boardCtx.fillStyle = color;
                        this.boardCtx.shadowBlur = 5;
                        this.boardCtx.shadowColor = color;
                        this.boardCtx.fillRect(drawX, drawY, this.blockSize, this.blockSize);
                        this.boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                        this.boardCtx.lineWidth = 1;
                        this.boardCtx.strokeRect(drawX, drawY, this.blockSize, this.blockSize);
                    }
                    
                    this.boardCtx.restore();
                }
            });
        });
    }
    
    render(grid, piece) {
        this.clear();
        this.drawGrid();
        
        // 画已固定的方块堆
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                if (grid[r][c]) {
                    this.drawMatrix([[1]], c, r, COLORS[grid[r][c]] || COLORS[grid[r][c][0]], false);
                }
            }
        }
        
        if (piece) {
            // 1. 先画 Ghost Piece (底层)
            const ghostY = piece.getGhostY();
            this.drawMatrix(piece.shape, piece.x, ghostY, piece.color, true);
            
            // 2. 再画真实方块 (上层)
            this.drawMatrix(piece.shape, piece.x, piece.y, piece.color, false);
        }
        
        this.updateParticles();
    }
    
    spawnParticles(x, y, color) {
        for (let i = 0; i < 15; i++) {
            this.particles.push(new Particle(
                x * this.blockSize + this.blockSize / 2,
                y * this.blockSize + this.blockSize / 2,
                color
            ));
        }
    }
    
    updateParticles() {
        this.fxCtx.save();
        this.fxCtx.globalCompositeOperation = 'lighter';
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            this.particles[i].draw(this.fxCtx);
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        this.fxCtx.restore();
    }
    
    renderPreview(canvas, type) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!type || !SHAPES[type]) return;
        const shape = SHAPES[type];
        const size = canvas.width / 5;
        const ox = (canvas.width - shape[0].length * size) / 2;
        const oy = (canvas.height - shape.length * size) / 2;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    ctx.fillStyle = COLORS[type];
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = COLORS[type];
                    ctx.fillRect(ox + c * size, oy + r * size, size - 1, size - 1);
                }
            }
        }
    }
}

// ==================== 游戏常数 ====================
const COLS = 10, ROWS = 20, EMPTY = 0;
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
    I: '#00f3ff', O: '#ffee00', T: '#9d4edd',
    S: '#33ff00', Z: '#ff0055', J: '#0066ff', L: '#ff9900',
    garbage: '#555566'
};
const PIECES = 'IJLOSTZ';

// ==================== 7-Bag 算法 ====================
class Bag7 {
    constructor() {
        this.bag = [];
        this.refill();
    }
    
    refill() {
        this.bag = [...PIECES].sort(() => Math.random() - 0.5);
    }
    
    next() {
        if (this.bag.length === 0) this.refill();
        return this.bag.pop();
    }
}

const bag = new Bag7();

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
            case 'move': osc.frequency.value = 220; osc.type = 'sine'; gain.gain.setValueAtTime(0.04, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05); break;
            case 'rotate': osc.frequency.value = 330; osc.type = 'sine'; gain.gain.setValueAtTime(0.04, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08); osc.start(); osc.stop(audioCtx.currentTime + 0.08); break;
            case 'drop': osc.frequency.value = 150; osc.type = 'square'; gain.gain.setValueAtTime(0.02, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03); osc.start(); osc.stop(audioCtx.currentTime + 0.03); break;
            case 'clear': for(let i=0;i<4;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=440+i*110;o.type='sine';g.gain.setValueAtTime(0.06,audioCtx.currentTime+i*0.08);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+i*0.08+0.15);o.start(audioCtx.currentTime+i*0.08);o.stop(audioCtx.currentTime+i*0.08+0.15);}break;
            case 'hold': osc.frequency.value = 550; osc.type = 'sine'; gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); break;
            case 'over': osc.frequency.value = 200; osc.type = 'sawtooth'; gain.gain.setValueAtTime(0.08, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); osc.start(); osc.stop(audioCtx.currentTime + 0.5); break;
        }
    } catch(e) {}
}

// ==================== 游戏类 ====================
class Tetris {
    constructor(id) {
        this.id = id;
        this.grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.sent = 0;
        this.stars = 5;
        this.piece = null;
        this.next = null;
        this.hold = null;
        this.canHold = true;
        this.over = false;
        this.interval = 1000;
        this.lastTime = 0;
        
        this.renderer = new GameRenderer('board' + id, 'fx' + id);
        this.holdCanvas = document.getElementById('hold' + id);
        this.nextCanvas = document.getElementById('next' + id);
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
                    let nx = x + c, ny = y + r;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
                    if (ny >= 0 && this.grid[ny][nx]) return false;
                }
            }
        }
        return true;
    }
    
    rotate() {
        const old = this.piece.shape;
        const rot = old[0].map((_, i) => old.map(r => r[i]).reverse());
        this.piece.shape = rot;
        for (let o of [0, -1, 1, -2, 2]) {
            if (this.valid(this.piece, this.piece.x + o, this.piece.y)) {
                this.piece.x += o;
                play('rotate');
                return;
            }
        }
        this.piece.shape = old;
    }
    
    move(dir) {
        if (this.piece.move(dir, 0)) {
            play('move');
        }
    }
    
    drop() {
        if (this.piece.move(0, 1)) {
            play('drop');
            return true;
        }
        return false;
    }
    
    hardDrop() {
        this.piece.hardDrop();
        play('drop');
    }
    
    lockPiece() {
        for (let r = 0; r < this.piece.shape.length; r++) {
            for (let c = 0; c < this.piece.shape[r].length; c++) {
                if (this.piece.shape[r][c]) {
                    let y = this.piece.y + r, x = this.piece.x + c;
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
                    this.renderer.spawnParticles(c, r, COLORS[this.grid[r][c]]);
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
            
            if (lines >= 2) {
                const comboEl = document.getElementById('combo');
                comboEl.textContent = lines === 4 ? 'TETRIS!' : lines + ' LINES!';
                comboEl.classList.add('show');
                setTimeout(() => comboEl.classList.remove('show'), 1500);
            }
        }
    }
    
    holdPiece() {
        if (!this.canHold) return;
        play('hold');
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
        this.renderer.renderPreview(this.nextCanvas, this.next);
        
        document.getElementById('score' + this.id).textContent = this.score;
        document.getElementById('level' + this.id).textContent = this.level;
        document.getElementById('sent' + this.id).textContent = this.lines;
        
        // 星星显示
        const stars = '★'.repeat(this.stars) + '☆'.repeat(5 - this.stars);
        document.getElementById('stars1').textContent = stars;
    }
}

// ==================== 游戏控制 ====================
let game = null;
let inputManager = null;
let running = false;
let isPaused = false;

function startGame() {
    initAudio();
    bag.refill();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('pausedOverlay').classList.remove('show');
    
    game = new Tetris(1);
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
    document.getElementById('pausedOverlay').classList.toggle('show', isPaused);
    
    if (!isPaused) {
        game.lastTime = performance.now();
        inputManager.lastTime = performance.now();
        loop();
    }
}

function loop(time = 0) {
    if (!running || isPaused) return;
    
    if (inputManager) inputManager.update();
    
    game.update(time);
    game.render();
    if (game.over) {
        end();
        return;
    }
    requestAnimationFrame(loop);
}

function end() {
    running = false;
    play('over');
    document.getElementById('winner-text').textContent = '遊戲結束！';
    document.getElementById('gameover').classList.add('show');
}

// ==================== InputManager ====================
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
        window.addEventListener('keydown', (e) => {
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault();
            }
            if (!this.keys[e.code]) {
                this.keys[e.code] = true;
                this.keyTimers[e.code] = 0;
                this.triggerAction(e.code);
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keyTimers[e.code] = 0;
        });
    }

    update() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        for (const [key, isPressed] of Object.entries(this.keys)) {
            if (isPressed) {
                this.keyTimers[key] += deltaTime;
                if (this.keyTimers[key] >= this.DAS) {
                    while (this.keyTimers[key] >= this.DAS + this.ARR) {
                        this.triggerAction(key);
                        if (this.ARR === 0) {
                            this.keyTimers[key] = this.DAS;
                            break;
                        }
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
            case 'ArrowUp': case 'KeyZ': this.game.rotate(); break;
            case 'KeyC': this.game.holdPiece(); break;
            case 'Space': 
                this.game.hardDrop(); 
                this.keys['Space'] = false; 
                break;
        }
    }
}

// 键盘控制（暂停键）
document.addEventListener('keydown', e => {
    if (!running || !game) return;
    if (e.key === 'p' || e.key === 'P') {
        togglePause();
    }
});

// 雪花效果
const snow = document.createElement('div');
snow.className = 'snow';
document.body.appendChild(snow);
for (let i = 0; i < 30; i++) {
    const s = document.createElement('div');
    s.className = 'snowflake';
    s.textContent = '❄';
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDuration = Math.random() * 5 + 5 + 's';
    s.style.animationDelay = Math.random() * 10 + 's';
    s.style.fontSize = Math.random() * 10 + 10 + 'px';
    snow.appendChild(s);
}
