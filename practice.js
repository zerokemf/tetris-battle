// Local-only retry checkpoints. Never exposed through the P2P protocol or storage.
(() => {
    'use strict';
    const LIMIT = 12;
    const fields = ['score','level','lines','combo','maxCombo','b2b','maxB2b','hold','canHold',
        'interval','attackSent','bombLineCountdown','bombCharges','lockDelay','lockResets',
        'lockResetMax','isLocking','_tSpin','_tSpinMini','_clearedThisLock','clearSequence','lastClearEvent'];
    const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    let checkpoints = [], lastPiece = null, active = false, selected = 0, serial = 0;
    const el = id => document.getElementById(id);

    function snapshotBoard(board, now) {
        if (!board || !(board.bag instanceof SeededBag7)) return null;
        const values = Object.fromEntries(fields.map(key => [key, copy(board[key])]));
        const p = board.piece;
        return { values, grid: copy(board.grid), nextQueue: [...board.nextQueue],
            piece: p ? {type:p.type,shape:copy(p.shape),x:p.x,y:p.y,rotIndex:p.rotIndex,lastAction:p.lastAction,lastKickIndex:p.lastKickIndex} : null,
            bag: {state:board.bag.state,bag:[...board.bag.bag]},
            randomState: board.randomSource?.state,
            garbage: board.garbageQueue.map(item => ({...item, age: Math.max(0,now-item.time)})),
            gravityAge: board.lastTime ? Math.max(0,now-board.lastTime) : 0,
            lockAge: board.isLocking ? Math.max(0,now-board.lockStartTime) : 0 };
    }

    function restoreBoard(board, saved, now) {
        fields.forEach(key => { board[key] = copy(saved.values[key]); });
        board.grid = copy(saved.grid);
        board.nextQueue = [...saved.nextQueue];
        board.bag.state = saved.bag.state;
        board.bag.bag = [...saved.bag.bag];
        if (board.randomSource && saved.randomState !== undefined) board.randomSource.state = saved.randomState;
        board.piece = saved.piece ? Object.assign(new Piece(saved.piece.type,board),copy(saved.piece)) : null;
        board.garbageQueue = saved.garbage.map(({age,...item}) => ({...item,time:now-age}));
        board.lastTime = now-saved.gravityAge;
        board.lockStartTime = now-saved.lockAge;
        board.over = false;
        clearTimeout(board.comboTimer); clearTimeout(board.actionTimer);
        if (board.comboDisplay) board.comboDisplay.className='combo-display hidden';
        if (board.actionText) board.actionText.className='action-text hidden';
        const renderer=board.renderer;
        renderer.particles=[];renderer.trails=[];renderer.flashLines=[];renderer.screenFlash=0;
        board.updateGarbageMeter();board.syncStats();
    }

    function reset() {
        checkpoints=[];lastPiece=null;active=false;selected=0;serial=0;
        document.body.classList.remove('practice-active');
        el('practice-offer')?.classList.add('hidden');
        el('practice-bar')?.classList.add('hidden');
    }

    function capture() {
        if (active || !running || isPaused || currentMode==='online' || !game || game.over || game.piece===lastPiece) return;
        if (!game.piece || !game.valid(game.piece,game.piece.x,game.piece.y)) return;
        const now=performance.now(), player=snapshotBoard(game,now);
        if (!player) return;
        lastPiece=game.piece;
        const cpu=currentMode==='battle' ? snapshotBoard(aiGame,now) : null;
        checkpoints.push({number:++serial,mode:currentMode,difficulty:currentDifficulty,player,cpu,
            ai: ai ? {plan:copy(ai.plan),thinking:ai.thinking,thinkAge:now-ai.thinkStart,actionAge:now-ai.lastActionTime,randomState:ai.randomSource?.state} : null});
        if(checkpoints.length>LIMIT) checkpoints.shift();
    }

    function offer() {
        const visible=currentMode!=='online' && checkpoints.length>0 && (currentMode==='solo' || battleWinner!==game || active);
        el('practice-offer')?.classList.toggle('hidden',!visible);
        el('practice-bar')?.classList.add('hidden');
        if (!visible) return;
        const select=el('practice-checkpoint');
        if (!select) return;
        select.innerHTML='';
        checkpoints.forEach((checkpoint,index) => {
            const option=document.createElement('option');
            option.value=String(index);
            const back=checkpoints.length-index;
            option.textContent=`倒數第 ${back} 個局面 · ${checkpoint.player.values.lines} 行 / ${checkpoint.player.values.score} 分`;
            select.appendChild(option);
        });
        selected=active ? selected : Math.max(0,checkpoints.length-3);
        select.value=String(selected);
    }

    function retry(index) {
        // A practice reset is permitted only after a local result, or from an
        // already marked practice. Never turn an active competitive match into a rewind.
        if(currentMode==='online' || (running && !active)) return false;
        const n=Number(index);
        if (!Number.isInteger(n) || !checkpoints[n]) return false;
        const saved=checkpoints[n];
        if (saved.mode!==currentMode || !game) return false;
        selected=n;active=true;
        document.body.classList.add('practice-active');
        running=false;loopGeneration++;
        const now=performance.now();
        restoreBoard(game,saved.player,now);
        if(saved.cpu && aiGame) {
            restoreBoard(aiGame,saved.cpu,now);
            battleManager=new BattleManager(game,aiGame);battleManager.syncKO();
            ai=new TetrisAI(aiGame,saved.difficulty);
            if(saved.ai) {
                ai.plan=copy(saved.ai.plan);ai.thinking=saved.ai.thinking;
                ai.thinkStart=now-saved.ai.thinkAge;ai.lastActionTime=now-saved.ai.actionAge;
                if(ai.randomSource && saved.ai.randomState!==undefined) ai.randomSource.state=saved.ai.randomState;
            }
        }
        battleEnded=false;battleWinner=null;onlineEndReason='';
        inputManager?.reset?.();
        if(inputManager) inputManager.lastTime=now;
        el('gameover')?.classList.remove('show');el('practice-offer')?.classList.add('hidden');
        el('practice-bar')?.classList.remove('hidden');
        ['status-overlay','p-status-overlay','a-status-overlay'].forEach(id=>el(id)?.classList.add('hidden'));
        ['pause-btn','battle-pause-btn'].forEach(id=>{if(el(id))el(id).textContent='PAUSE';});
        beginGameLoop();
        return true;
    }
    window.TetrisPractice=Object.freeze({capture,reset,offer,retry,
        retrySelected:()=>retry(el('practice-checkpoint')?.value),
        repeat:()=>retry(selected),
        get active(){return active;},get count(){return checkpoints.length;}});
})();
