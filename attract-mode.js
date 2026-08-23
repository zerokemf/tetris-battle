// ==================== ARCADE ATTRACT MODE ====================
// A lightweight SVG Tetris simulation that runs only behind the main menu.
// Two desktop side boards plus one portrait-only board use 7-bag pieces,
// legal landings, simple AI placement and real line clears — like an arcade
// cabinet before coin-in.
(() => {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const COLS = 10;
    const ROWS = 20;
    const STEP_MS = 360;
    const TYPES = 'IJLOSTZ';
    const COLORS = {
        I: '#00f3ff', O: '#ffe14d', T: '#b44dff', S: '#39ff14',
        Z: '#ff2d55', J: '#2d7fff', L: '#ff8c2d'
    };
    const BASE_SHAPES = {
        I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        O: [[1,1],[1,1]],
        T: [[0,1,0],[1,1,1],[0,0,0]],
        S: [[0,1,1],[1,1,0],[0,0,0]],
        Z: [[1,1,0],[0,1,1],[0,0,0]],
        J: [[1,0,0],[1,1,1],[0,0,0]],
        L: [[0,0,1],[1,1,1],[0,0,0]]
    };

    const svg = document.getElementById('attract-svg');
    const root = document.getElementById('attract-mode');
    if (!svg || !root) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileLayout = window.matchMedia('(max-width: 768px)');
    let timer = 0;
    let running = false;
    let tickCount = 0;

    function el(name, attrs = {}) {
        const node = document.createElementNS(NS, name);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }

    function rotate(shape) {
        const n = shape.length;
        return Array.from({ length: n }, (_, r) =>
            Array.from({ length: n }, (_, c) => shape[n - 1 - c][r])
        );
    }

    function shapeKey(shape) {
        return shape.map(row => row.join('')).join('/');
    }

    function rotationsFor(type) {
        const out = [];
        const seen = new Set();
        let shape = BASE_SHAPES[type].map(row => [...row]);
        for (let i = 0; i < 4; i++) {
            const key = shapeKey(shape);
            if (!seen.has(key)) { seen.add(key); out.push(shape); }
            shape = rotate(shape);
        }
        return out;
    }

    const ROTATIONS = Object.fromEntries([...TYPES].map(type => [type, rotationsFor(type)]));

    function makeRng(seed) {
        let value = seed >>> 0;
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    class DemoBoard {
        constructor({ id, x, y, block, seed, speedOffset = 0 }) {
            this.id = id;
            this.x = x;
            this.y = y;
            this.block = block;
            this.rng = makeRng(seed);
            this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
            this.bag = [];
            this.active = null;
            this.flashLife = 0;
            this.delay = speedOffset;
            this.pieces = 0;

            this.group = el('g', { class: `attract-board attract-board-${id}`, transform: `translate(${x} ${y})` });
            this.group.appendChild(el('rect', {
                class: 'attract-board-shell', x: -10, y: -10,
                width: COLS * block + 20, height: ROWS * block + 20, rx: 12
            }));
            this.gridLines = el('g', { class: 'attract-grid-lines' });
            for (let c = 1; c < COLS; c++) {
                this.gridLines.appendChild(el('line', { x1: c * block, y1: 0, x2: c * block, y2: ROWS * block }));
            }
            for (let r = 1; r < ROWS; r++) {
                this.gridLines.appendChild(el('line', { x1: 0, y1: r * block, x2: COLS * block, y2: r * block }));
            }
            this.group.appendChild(this.gridLines);
            this.settledGroup = el('g', { class: 'attract-settled' });
            this.activeGroup = el('g', { class: 'attract-active' });
            this.flash = el('rect', {
                class: 'attract-line-flash', x: 0, y: 0,
                width: COLS * block, height: block
            });
            this.group.append(this.settledGroup, this.activeGroup, this.flash);
            svg.appendChild(this.group);

            // Start with a believable low stack instead of an empty board.
            for (let i = 0; i < 14; i++) this.placeInstantly();
            this.spawn();
            this.renderSettled();
            this.renderActive(false);
        }

        nextType() {
            if (!this.bag.length) {
                this.bag = [...TYPES];
                for (let i = this.bag.length - 1; i > 0; i--) {
                    const j = Math.floor(this.rng() * (i + 1));
                    [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
                }
            }
            return this.bag.pop();
        }

        valid(shape, x, y, grid = this.grid) {
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (!shape[r][c]) continue;
                    const nx = x + c;
                    const ny = y + r;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
                    if (ny >= 0 && grid[ny][nx]) return false;
                }
            }
            return true;
        }

        landingY(shape, x) {
            let y = -shape.length;
            while (this.valid(shape, x, y + 1)) y++;
            return y;
        }

        simulate(type, shape, x, y) {
            const grid = this.grid.map(row => [...row]);
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (!shape[r][c]) continue;
                    const ny = y + r;
                    if (ny < 0) return null;
                    grid[ny][x + c] = type;
                }
            }
            let lines = 0;
            const kept = grid.filter(row => {
                if (row.every(Boolean)) { lines++; return false; }
                return true;
            });
            while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
            return { grid: kept, lines };
        }

        analyze(grid) {
            const heights = Array(COLS).fill(0);
            let holes = 0;
            for (let c = 0; c < COLS; c++) {
                let seen = false;
                for (let r = 0; r < ROWS; r++) {
                    if (grid[r][c]) {
                        if (!seen) heights[c] = ROWS - r;
                        seen = true;
                    } else if (seen) holes++;
                }
            }
            let bumpiness = 0;
            for (let c = 0; c < COLS - 1; c++) bumpiness += Math.abs(heights[c] - heights[c + 1]);
            return { height: heights.reduce((a, b) => a + b, 0), maxHeight: Math.max(...heights), holes, bumpiness };
        }

        choosePlacement(type) {
            let best = null;
            for (const shape of ROTATIONS[type]) {
                for (let x = -1; x < COLS; x++) {
                    const y = this.landingY(shape, x);
                    const result = this.simulate(type, shape, x, y);
                    if (!result) continue;
                    const a = this.analyze(result.grid);
                    const score = result.lines * 14 - a.holes * 8 - a.height * 0.38 -
                        a.bumpiness * 0.55 - a.maxHeight * 0.4 + this.rng() * 0.9;
                    if (!best || score > best.score) best = { type, shape, x, y, score, result };
                }
            }
            return best;
        }

        spawn() {
            const type = this.nextType();
            let placement = this.choosePlacement(type);
            if (!placement) {
                // Cabinet demos never remain topped out: fade-reset to a fresh round.
                this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
                placement = this.choosePlacement(type);
                this.group.classList.add('attract-reset');
                setTimeout(() => this.group.classList.remove('attract-reset'), 650);
            }
            this.active = { ...placement, currentY: -placement.shape.length };
            this.pieces++;
        }

        lockActive() {
            const { type, shape, x, currentY } = this.active;
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c] && currentY + r >= 0) this.grid[currentY + r][x + c] = type;
                }
            }
            const fullRows = [];
            this.grid.forEach((row, index) => { if (row.every(Boolean)) fullRows.push(index); });
            if (fullRows.length) {
                const flashRow = fullRows[fullRows.length - 1];
                this.flash.setAttribute('y', flashRow * this.block);
                this.flash.classList.remove('is-flashing');
                // Force animation restart for repeated clears.
                void this.flash.getBoundingClientRect();
                this.flash.classList.add('is-flashing');
                this.grid = this.grid.filter((_, index) => !fullRows.includes(index));
                while (this.grid.length < ROWS) this.grid.unshift(Array(COLS).fill(null));
            }
            this.renderSettled();
            this.spawn();
            this.renderActive(false);
        }

        placeInstantly() {
            const type = this.nextType();
            const placement = this.choosePlacement(type);
            if (!placement) return;
            this.grid = placement.result.grid;
        }

        step() {
            if (this.delay > 0) { this.delay--; return; }
            if (!this.active) this.spawn();
            if (this.active.currentY < this.active.y) {
                this.active.currentY++;
                this.renderActive(true);
            } else {
                this.lockActive();
            }
        }

        renderSettled() {
            this.settledGroup.replaceChildren();
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const type = this.grid[r][c];
                    if (!type) continue;
                    this.settledGroup.appendChild(this.blockRect(c, r, type, 'settled-block'));
                }
            }
        }

        renderActive(animate) {
            const { type, shape, x, currentY } = this.active;
            this.activeGroup.classList.toggle('is-stepping', animate);
            this.activeGroup.replaceChildren();
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (!shape[r][c]) continue;
                    // Blocks stay local to the piece; the SVG group moves smoothly.
                    this.activeGroup.appendChild(this.blockRect(c, r, type, 'active-block'));
                }
            }
            this.activeGroup.setAttribute('transform', `translate(${x * this.block} ${currentY * this.block})`);
        }

        blockRect(c, r, type, className) {
            return el('rect', {
                class: `${className} piece-${type}`,
                x: c * this.block + 1,
                y: r * this.block + 1,
                width: this.block - 2,
                height: this.block - 2,
                rx: Math.max(1, this.block * 0.12),
                fill: COLORS[type]
            });
        }
    }

    // Left and right demo boards frame the menu without sitting behind controls.
    const boards = [
        new DemoBoard({ id: 'left', x: 58, y: 205, block: 20, seed: 0x51A7, speedOffset: 0 }),
        new DemoBoard({ id: 'right', x: 1182, y: 155, block: 20, seed: 0xB477, speedOffset: 2 }),
        // Center board is hidden on desktop and revealed only in the portrait crop.
        new DemoBoard({ id: 'mobile', x: 620, y: 185, block: 20, seed: 0xA11E, speedOffset: 1 })
    ];

    function visibleBoards() {
        return mobileLayout.matches
            ? boards.filter(board => board.id === 'mobile')
            : boards.filter(board => board.id !== 'mobile');
    }

    function tick() {
        if (!document.body.classList.contains('at-menu') || document.hidden) return;
        visibleBoards().forEach(board => board.step());
        tickCount++;
        root.dataset.ticks = String(tickCount);
    }

    function start() {
        // Keep the invariant local: no caller can start a timer outside the menu,
        // in a hidden tab, or when reduced motion is requested.
        if (running || reducedMotion.matches || document.hidden || !document.body.classList.contains('at-menu')) return;
        running = true;
        root.classList.add('is-running');
        timer = window.setInterval(tick, STEP_MS);
    }

    function stop() {
        if (!running) return;
        running = false;
        root.classList.remove('is-running');
        window.clearInterval(timer);
        timer = 0;
    }

    function syncActivity() {
        const shouldRun = !reducedMotion.matches && !document.hidden && document.body.classList.contains('at-menu');
        if (shouldRun) start();
        else stop();
        root.classList.toggle('is-static', reducedMotion.matches);
    }

    if (typeof reducedMotion.addEventListener === 'function') {
        reducedMotion.addEventListener('change', syncActivity);
    } else if (typeof reducedMotion.addListener === 'function') {
        reducedMotion.addListener(syncActivity);
    }
    document.addEventListener('visibilitychange', syncActivity);
    new MutationObserver(syncActivity).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    syncActivity();

    // Read-only diagnostics for browser regression tests.
    window.__attractMode = Object.freeze({
        get running() { return running; },
        get ticks() { return tickCount; },
        get boards() { return boards.length; },
        get activeBoards() { return visibleBoards().length; }
    });
})();
