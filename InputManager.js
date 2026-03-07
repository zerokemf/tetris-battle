// InputManager.js - 竞技级按键连发控制器
export class InputManager {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.keyTimers = {};
        
        // 核心手感参数
        this.DAS = 130; // 初始延迟 (毫秒)：130ms 是俐落的设定
        this.ARR = 30; // 连发频率 (毫秒)：每 30ms 移动一格
        
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
            case 'ArrowLeft':
                this.game.move(-1);
                break;
            case 'ArrowRight':
                this.game.move(1);
                break;
            case 'ArrowDown':
                this.game.drop();
                break;
            case 'ArrowUp':
                this.game.rotate();
                break;
            case 'KeyZ':
                this.game.rotate();
                break;
            case 'KeyC':
                this.game.holdPiece();
                break;
            case 'Space':
                this.game.hardDrop();
                this.keys['Space'] = false; // 硬降不连发
                break;
        }
    }
}
