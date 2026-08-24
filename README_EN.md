# 🎮 Tetris Battle — SRS Edition

> A Tetris-style puzzle game built with modern web technologies, featuring full SRS (Super Rotation System) support, rich visual effects, and a synthesized audio engine.

**Play now:** https://zerokemf.github.io/tetris-battle

---

## 📋 Table of Contents

- [Highlights](#-highlights)
- [Controls](#-controls)
- [Scoring](#-scoring)
- [Technical Specs](#-technical-specs)
- [Dev Notes](#-dev-notes)

---

## ✨ Highlights

### 🎯 Core Mechanics

| Feature | Description |
|---------|-------------|
| **7-Bag Randomizer** | Fair piece distribution using the 7-bag shuffle algorithm |
| **SRS Super Rotation** | Complete JLSTZ and I-piece kick offset data for all 8 rotation transitions |
| **Ghost Piece** | Shows exactly where the piece will land |
| **Lock Delay** | 0.5s grace period on ground contact with Move Reset (max 15 resets/piece) |
| **Hold System** | Swap the current piece with the held piece (once per drop) |
| **3-Piece Next Queue** | Preview the next three upcoming pieces |
| **ONLINE P2P Friend Rooms** | Create a six-character room code and play a friend over encrypted WebRTC data channels |
| **Fair Online Randomizer** | A shared seed gives both peers the same deterministic 7-Bag sequence |

### 🎨 Visual Effects

- **High-Saturation Ink Clash Theme** — Exact five-color system: `#f65200`, `#53a8ff`, `#edc524`, `#50f6e9`, `#ff7056`, set against deep black-green surfaces and bold outlines
- **Real Gameplay Background Video** — Recorded from this build's AI-vs-AI Battle, with MP4/WebM and a poster fallback
- **Power-Aware Lifecycle** — Video plays only on the menu, pauses in-game/when hidden, and becomes a static poster for Reduced Motion
- **Particle Clear Effects** — Particle count scales with clear tier; Tetris adds a star-burst
- **Screen Shake** — Activates on Double and above
- **Block Gradients & Highlights** — Each block has a 3D-style linear gradient
- **Combo Counter** — Real-time display of consecutive clear multiplier

### 🌐 ONLINE P2P Friend Rooms

- GitHub Pages remains a static deployment; no self-hosted backend is required
- Vendored Trystero 0.25.3 (MIT) uses public Nostr relays for signaling
- After matchmaking, board snapshots, attacks, and results travel directly over encrypted WebRTC DataChannels
- Rooms accept exactly two players; a third peer receives an explicit room-full response
- Includes READY state, synchronized countdown, shared seed, attacks, host-authoritative results, disconnect handling, and rematches

**Limits:** rooms disappear when the host leaves; matchmaking signals pass through public Nostr relays, and WebRTC may reveal public network-address information to the other player, so room codes should be shared only with trusted friends. Strict NAT/corporate firewalls can prevent connections; there is no central anti-cheat authority, so this mode is for friend matches rather than ranked or prize play.
- **Full-Screen Flash** — Triple triggers orange flash, Tetris triggers coral flash

### 🔊 Web Audio Sound Engine

All sounds synthesized in real-time using the Web Audio API — no external audio files required:

- Move (280Hz short blip)
- Rotate (400→500Hz glide)
- Soft land (gentle contact tone)
- Hard drop (low-frequency square-wave thud)
- Line clear (pitch and chord count scale with tier)
- Hold (600→700Hz swap tone)
- Game over (descending arpeggio)

---

## ⌨️ Controls

| Key | Action |
|-----|--------|
| `←` / `→` | Move left / right |
| `↓` | Soft drop (accelerate fall) |
| `Space` | Hard drop (instant land) |
| `Z` | Rotate counter-clockwise (CCW) |
| `X` or `↑` | Rotate clockwise (CW) |
| `C` | Hold piece |
| `P` | Pause / Resume |

### Lock Delay Mechanics

1. Timer starts the moment the piece touches the ground (0.5s)
2. A successful move or rotation resets the timer (Move Reset)
3. Each piece can reset the timer up to **15 times** — prevents infinite stalling
4. Hard Drop **locks immediately**, bypassing Lock Delay entirely

---

## 🏆 Scoring

### Base Score

| Lines Cleared | Name | Base Points |
|---------------|------|-------------|
| 1 line | SINGLE | 100 × level |
| 2 lines | DOUBLE | 300 × level |
| 3 lines | TRIPLE | 500 × level |
| 4 lines | TETRIS | 800 × level |

### Combo Bonus

```
Combo Bonus = 50 × (combo count - 1) × level
```

Example: At level 1, a streak of 3 combos = 50 × 2 × 1 = 100 bonus points

### Level & Speed

- Level increases every **10 lines** cleared
- Gravity interval decreases from 1000ms down to a minimum of 80ms
- Maximum speed reached at level 11+ (80ms/gravity tick)

---

## 🛠 Technical Specs

### File Structure

```
tetris-battle/
├── index.html          # Game page and video markup
├── style.css           # Core layout and responsive rules
├── ink-theme.css       # Ink Clash design system and component theme
├── game.js             # Game core, AI, P2P bridge, audio and Canvas rendering
├── online-battle.js    # Room codes, Trystero, sync, results and rematches
├── video-background.js # Menu video lifecycle
├── vendor/             # Pinned Trystero Nostr bundle and MIT license
├── assets/             # MP4, WebM and poster media
└── test/               # Logic, browser, P2P, security and video-asset tests
```

### Tech Stack

- **Language:** Vanilla JavaScript (ES6+)
- **Rendering:** HTML5 Canvas 2D (dual-layer: game board + FX particle layer)
- **Audio:** Web Audio API (real-time synthesis, zero external dependencies)
- **Fonts:** Google Fonts — Orbitron (titles), Rajdhani (UI)
- **Responsive:** devicePixelRatio-aware; adapts to any window size

### Performance Optimizations

- Particle removal via swap-and-pop (O(1) deletion)
- Avoids per-particle `save()`/`restore()` and `shadowBlur`
- Canvas resize detection only re-allocates buffers on actual dimension changes
- Line clear compaction via write-pointer, zero GC allocation

---

## 📝 Dev Notes

### SRS Kick Table (Implemented)

Full NRS (New Rotation System) compliance — 8 kick test pairs for both JLSTZ and I pieces, ensuring correct wall/floor kicks during rotation.

### 7-Bag Randomizer

```
Each bag contains all 7 piece types exactly once, shuffled randomly
Bag refills automatically when empty, guaranteeing long-term fairness
```

### Sound Synthesis Strategy

Oscillators generated with `OscillatorNode` + `GainNode`, with volume decay via `exponentialRampToValueAtTime` for natural envelope shaping. All sounds stay within 50ms–300ms to avoid disrupting gameplay.

---

## 🎯 Quick Start

```bash
# Open directly in browser
open index.html

# Or use a local server (recommended for full font loading)
npx serve .
```

Deployed on GitHub Pages — static files from the `main` branch serve directly with no build step required.

---

*Made with 💜 — Classic Tetris gameplay, rebuilt with modern web tech*
