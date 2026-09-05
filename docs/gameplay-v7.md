# Gameplay v7

## Player controls
- Top-left **操作設定**: configure DAS (initial held-move delay, default130ms), ARR (repeat interval, default30ms), and seven gameplay key bindings. ARR0 slides horizontally to the wall; down remains bounded, not an instant multi-piece lock.
- Space, rotation and hold are single-shot: release before the next action. Only left/right/down auto-repeat. Blur, cancel, pause and focus into controls clear held input.
- P/M remain reserved for pause/music. Local settings pause/resume only when they own the pause. Live online settings are disabled; configure before starting.
- Coarse-pointer tablets and phones have a two-thumb pad. Board gestures remain local-board-only. No third-party touch library.

## Combat feedback
- HUD reports cleared lines, canceled incoming lines and **actually sent** lines from the existing clear transaction, not guessed multipliers.
- Height and pending garbage produce text + color warnings without shaking/reflowing the board.
- Optional validated v1 snapshot feedback allows remote combo/caption/HUD displays; does not execute remote clears or change attacks. Compatible with peers omitting new fields.
- Overlapping captions restart animation; old round timers are canceled. Reduced-motion uses static readable captions.

## Retry practice
- After a local solo/CPU defeat, choose one of the last12 valid piece-entry checkpoints (default third-most-recent). Only this round's memory is retained; reload/menu/new round clears it.
- Snapshot includes both boards, active pieces, hold/next, seeded bags, separate garbage and CPU RNG, combo/B2B/bomb state, pending attacks, AI plan and remaining gravity/lock/AI timing.
- Practice is explicitly labeled and never writes solo high-score or best-combo records. Online matches cannot rewind. Practice cannot be entered during an active non-practice match.
- These are retry checkpoints, not automatic diagnosis of the exact bad move; no server saves or shared challenge links in v7.

## Verification / release
```sh
node test/logic-test.js
node --test test/input-controls-test.js
node test/feedback-practice-test.js
node test/practice-test.js
node test/server-security-test.js
python3 test/vendor-test.py
python3 test/video-asset-test.py
# Isolated Chrome CDP ports9567 and9568 needed below.
E2E_GAME_URL=http://127.0.0.1:8778/index.html node test/upgrade-e2e.js
E2E_GAME_URL=http://127.0.0.1:8778/index.html node test/e2e-test.js
P2P_GAME_URL=http://127.0.0.1:8778/index.html node test/online-p2p-test.js
```
Push main triggers checked Pages artifact deployment. Manual workflow_dispatch is available. `scripts/build-pages.js` packages only15 public assets plus `.nojekyll` and a `release.json` commit/SHA256 manifest; no tests, screenshots, backups or repository internals. Repeat browser suites on the public URL and compare every manifest hash before delivery.
