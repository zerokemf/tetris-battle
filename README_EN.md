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

### 🎨 Visual Effects

- **Neon Cyberpunk Theme** — Vivid neon colors against a deep dark background
- **Particle Clear Effects** — Particle count scales with clear tier; Tetris adds a star-burst
- **Screen Shake** — Activates on Double and above
- **Block Gradients & Highlights** — Each block has a 3D-style linear gradient
- **Combo Counter** — Real-time display of consecutive clear multiplier
- **Full-Screen Flash** — Triple triggers purple flash, Tetris triggers pink flash

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
├── index.html   # Game page (HTML + minimal CSS injection points)
├── style.css    # Styles (Neon theme, animations, layout)
└── game.js      # Game core (36KB, all logic and rendering)
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
