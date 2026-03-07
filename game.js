// ==================== 粒子类 (处理炸裂特效) ====================
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
        // 核心亮点 (白色)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        
        // 外部光晕 (粒子颜色)
        ctx.shadowBlur = 10 * alpha;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.restore();
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
        for (let x = 0; x <= this.boardCanvas.width; x += this.blockSize) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(x, 0);
            this.boardCtx.lineTo(x, this.boardCanvas.height);
            this.boardCtx.stroke();
        }
        for (let y = 0; y <= this.boardCanvas.height; y += this.blockSize) {
            this.boardCtx.beginPath();
            this.boardCtx.moveTo(0, y);
            this.boardCtx.lineTo(this.boardCanvas.width, y);
            this.boardCtx.stroke();
        }
    }
    
    clear() {
        this.boardCtx.fillStyle = '#0a0a15';
        this.boardCtx.fillRect(0, 0, 300, 600);
        this.fxCtx.clearRect(0, 0, 300, 600);
    }
    
    drawBlock(x, y, color) {
        const ctx = this.boardCtx;
        const px = x * this.blockSize, py = y * this.blockSize;
        
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, this.blockSize - 2, this.blockSize - 2);
        
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(px + 1, py + 1, this.blockSize - 2, 3);
        ctx.fillRect(px + 1, py + 1, 3, this.blockSize - 2);
        
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px + this.blockSize - 4, py + 1, 3, this.blockSize - 2);
        ctx.fillRect(px + 1, py + this.blockSize - 4, this.blockSize - 2, 3);
    }
    
    render(grid, piece) {
        this.clear();
        this.drawGrid();
        
        for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 10; c++) {
                if (grid[r][c]) {
                    this.drawBlock(c, r, COLORS[grid[r][c]] || COLORS[grid[r][c][0]]);
                }
            }
        }
        
        if (piece) {
            for (let r = 0; r < piece.shape.length; r++) {
                for (let c = 0; c < piece.shape[r].length; c++) {
                    if (piece.shape[r][c]) {
                        this.drawBlock(piece.x + c, piece.y + r, COLORS[piece.type]);
                    }
                }
            }
        }
        
        this.updateAndDrawParticles();
    }
    
    // 触发霓虹炸裂特效
    triggerLineClearEffect(rowIndices, blockColors) {
        rowIndices.forEach(row => {
            for (let col = 0; col < 10; col++) {
                const centerX = col * this.blockSize + this.blockSize / 2;
                const centerY = row * this.blockSize + this.blockSize / 2;
                const color = blockColors[col] || '#00f3ff';
                
                for (let i = 0; i < 12; i++) {
                    this.particles.push(new Particle(centerX, centerY, color));
                }
            }
        });
    }
    
    spawnParticles(x, y, color) {
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(
                x * this.blockSize + this.blockSize / 2,
                y * this.blockSize + this.blockSize / 2,
                color
            ));
        }
    }
    
    // 粒子特效渲染系统
    updateAndDrawParticles() {
        this.fxCtx.save();
        this.fxCtx.globalCompositeOperation = 'lighter'; // 制造加色发光效果
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            this.particles[i].draw(this.fxCtx);
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        
        this.fxCtx.restore();
    }
    
    renderPreview(canvas, type) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, 80, 80);
        
        if (!type || !SHAPES[type]) return;
        
        const shape = SHAPES[type];
        const size = 15;
        const ox = type === 'O' ? 20 : type === 'I' ? 10 : 25;
        const oy = type === 'I' ? 15 : type === 'O' ? 25 : 20;
        
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                    ctx.fillStyle = COLORS[type];
                    ctx.fillRect(ox + c * size, oy + r * size, size - 1, size - 1);
                }
            }
        }
    }
}

// ==================== 游戏常数 ====================
const COLS = 10, ROWS = 20;
const EMPTY = 0;

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
    I: 'rgb(0, 243, 255)', O: 'rgb(255, 221, 0)', T: 'rgb(204, 102, 255)',
    S: 'rgb(102, 255, 102)', Z: 'rgb(255, 68, 102)', J: 'rgb(68, 136, 255)', L: 'rgb(255, 153, 51)',
    garbage: 'rgb(85, 85, 102)'
};

const PIECES = 'IJLOSTZ';

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
        this.ko = 0;
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
        this.piece = this.next || this.newPiece();
        this.next = this.newPiece();
        this.canHold = true;
        if (!this.valid(this.piece, this.piece.x, this.piece.y)) this.over = true;
    }
    
    newPiece() {
        const type = PIECES[Math.floor(Math.random() * 7)];
        return { type, shape: SHAPES[type].map(r => [...r]), x: 3, y: 0 };
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
        if (this.valid(this.piece, this.piece.x + dir, this.piece.y)) {
            this.piece.x += dir;
            play('move');
        }
    }
    
    drop() {
        if (this.valid(this.piece, this.piece.x, this.piece.y + 1)) {
            this.piece.y++;
            play('drop');
            return true;
        }
        return false;
    }
    
    hardDrop() {
        while (this.valid(this.piece, this.piece.x, this.piece.y + 1)) this.piece.y++;
        play('drop');
        this.lock();
    }
    
    lock() {
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
        let clearedRows = [];
        let clearedColors = [];
        
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every(c => c)) {
                clearedRows.push(r);
                clearedColors.push([...this.grid[r]]);
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
            // 触发额外特效
            this.renderer.triggerLineClearEffect(clearedRows, clearedColors.flat());
            
            play('clear');
            this.score += [0, 100, 300, 500, 800][lines] * this.level;
            this.lines += lines;
            this.level = Math.floor(this.lines / 10) + 1;
            this.interval = Math.max(100, 1000 - (this.level - 1) * 100);
            
            if (lines >= 2) {
                const comboEl = document.getElementById('combo');
                comboEl.textContent = lines === 4 ? 'TETRIS!' : `${lines} LINES!`;
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
            this.piece = { type: this.hold, shape: SHAPES[this.hold].map(r => [...r]), x: 3, y: 0 };
        } else {
            this.spawn();
        }
        this.hold = t;
        this.canHold = false;
    }
    
    update(time) {
        if (this.over || isPaused) return;
        if (time - this.lastTime > this.interval) {
            if (!this.drop()) this.lock();
            this.lastTime = time;
        }
    }
    
    render() {
        this.renderer.render(this.grid, this.piece);
        this.renderer.renderPreview(this.holdCanvas, this.hold);
        this.renderer.renderPreview(this.nextCanvas, this.next ? this.next.type : null);
        
        document.getElementById('score' + this.id).textContent = this.score;
        document.getElementById('level' + this.id).textContent = this.level;
        document.getElementById('sent' + this.id).textContent = 'Lines: ' + this.sent;
        document.getElementById('stars' + this.id).textContent = '⭐'.repeat(this.stars) + '☆'.repeat(5 - this.stars);
    }
}

// ==================== 游戏控制 ====================
let game = null;
let running = false;
let isPaused = false;

function startGame() {
    initAudio();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('game').classList.add('active');
    document.getElementById('pausedOverlay').classList.remove('show');
    
    game = new Tetris(1);
    game.spawn();
    
    running = true;
    isPaused = false;
    loop();
}

function backMenu() {
    document.getElementById('gameover').classList.remove('show');
    document.getElementById('game').classList.remove('active');
    document.getElementById('menu').classList.remove('hidden');
    running = false;
}

function togglePause() {
    if (!running) return;
    isPaused = !isPaused;
    document.getElementById('pausedOverlay').classList.toggle('show', isPaused);
    
    const pauseBtn = document.getElementById('pauseBtn');
    pauseBtn.classList.remove('paused-true', 'paused-false');
    pauseBtn.classList.add(`paused-${isPaused}`);
    pauseBtn.innerHTML = isPaused 
        ? '<span class="icon">▶️</span> RESUME' 
        : '<span class="icon">⏸️</span> PAUSE';
    
    if (!isPaused) {
        game.lastTime = performance.now();
        loop();
    }
}

function loop(time = 0) {
    if (!running || isPaused) return;
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
    document.getElementById('winner-text').textContent = '游戏结束！';
    document.getElementById('gameover').classList.add('show');
}

// 键盘控制
document.addEventListener('keydown', e => {
    if (!running || !game) return;
    
    if (e.key === 'p' || e.key === 'P') {
        togglePause();
        return;
    }
    
    if (isPaused) return;
    
    switch(e.key) {
        case 'ArrowLeft': game.move(-1); break;
        case 'ArrowRight': game.move(1); break;
        case 'ArrowDown': game.drop(); break;
        case 'ArrowUp': case 'z': case 'Z': game.rotate(); break;
        case 'c': case 'C': game.holdPiece(); break;
        case ' ': e.preventDefault(); game.hardDrop(); break;
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
