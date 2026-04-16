# 🎮 Tetris Battle — SRS Edition

> 俄羅斯方塊對戰遊戲，基於現代 SRS（Super Rotation System）標準，搭載完整視覺效果與音效系統。

**馬上遊玩：** https://zerokemf.github.io/tetris-battle

---

## 📋 目錄

- [特色亮點](#-特色亮點)
- [操作說明](#-操作說明)
- [計分系統](#-計分系統)
- [技術規格](#-技術規格)
- [開發札記](#-開發札記)

---

## ✨ 特色亮點

### 🎯 核心機制

| 功能 | 說明 |
|------|------|
| **7-Bag 隨機生成** | 公平分配杜林洗牌演算法，杜绝不均衡問題 |
| **SRS 超旋轉系統** | 完整 JLSTZ 與 I 型方塊的 8 種旋轉偏移資料 |
| **Ghost Piece** | 軟著陸預覽，清楚顯示方塊落地位置 |
| **Lock Delay** | 方塊觸地後 0.5 秒鎖定延遲，支援 Move Reset（每塊最多 15 次） |
| **Hold 系統** | 隨時交換當前方塊與暫存方塊（每塊限用一次） |
| **3 格 Next 預覽** | 領先看到即將到來的三個方塊 |

### 🎨 視覺效果

- **Neon Cyberpunk 主題** — 霓虹色彩與深色背景的強烈對比
- **粒子消除特效** — 消除行數越多，粒子數量遞增（Tetris 附加星空爆炸）
- **畫面震動** — Double 以上觸發場景震撼效果
- **方塊漸層與高光** — 每格方塊自帶 3D 感的線性漸層
- **Combo 計數器** — 連續消除即時顯示倍數
- **全螢幕閃光** — Triple 紫光、Tetris 粉光

### 🔊 Web Audio 音效

全程使用 Web Audio API 即時合成，無需任何外部音效檔案：

- 移動（280Hz 短促提示音）
- 旋轉（400→500Hz 滑音）
- 軟落地（柔和接觸音效）
- 硬落地（方波低頻撞擊）
- 消除（根據 tier 遞增音高與和弦數）
- Hold（600→700Hz 交換音）
- 遊戲結束（下行琶音）

---

## ⌨️ 操作說明

| 按鍵 | 動作 |
|------|------|
| `←` / `→` | 左右移動 |
| `↓` | 軟 Drop（加速下落） |
| `Space` | 硬 Drop（直接落地） |
| `Z` | 逆時針旋轉（CCW） |
| `X` 或 `↑` | 順時針旋轉（CW） |
| `C` | Hold（暫存方塊） |
| `P` | 暫停 / 繼續 |

### Lock Delay 機制

1. 方塊觸地後，計時器啟動（0.5 秒）
2. 成功左右移動或旋轉 → 計時器重置（Move Reset）
3. 每塊方塊最多重置 **15 次**，防止無限拖延
4. Hard Drop **立即鎖定**，不受 Lock Delay 影響

---

## 🏆 計分系統

### 基礎分數

| 消除層數 | 名稱 | 基礎分 |
|---------|------|--------|
| 1 行 | SINGLE | 100 × 等級 |
| 2 行 | DOUBLE | 300 × 等級 |
| 3 行 | TRIPLE | 500 × 等級 |
| 4 行 | TETRIS | 800 × 等級 |

### Combo 獎勵

```
Combo Bonus = 50 × (combo 倍數 - 1) × 等級
```

例如：等級 1 時，連續 3 Combo = 50 × 2 × 1 = 100 分

### 等級與速度

- 每消除 **10 行** 升一等
- 等級遞增：間隔從 1000ms 遞減至最低 80ms
- 最高速度在等級 11+ 達成（80ms/gravity tick）

---

## 🛠 技術規格

### 檔案結構

```
tetris-battle/
├── index.html   # 遊戲主頁（HTML + 少量 CSS 注入點）
├── style.css    # 樣式表（Neon 主題、動畫、版面）
└── game.js      # 遊戲核心（36KB，含所有遊戲邏輯與渲染）
```

### 技術棧

- **語言：** 原生 JavaScript（ES6+）
- **渲染：** HTML5 Canvas 2D（雙層：遊戲層 + FX 粒子層）
- **音效：** Web Audio API（即時合成，無外部依賴）
- **字體：** Google Fonts — Orbitron（標題）、Rajdhani（UI）
- **響應式：** DPI 自適應（devicePixelRatio），視窗任意大小皆可

### 效能優化

- 粒子系統 swap-remove 替換，O(1) 刪除
- 避免 per-particle `save()`/`restore()` 與 `shadowBlur`
- 畫布尺寸變更偵測，只在實際改變時重新分配緩衝
- 清除行以 write-pointer 原地压縮，零垃圾產生

---

## 📝 開發札記

### SRS Kick Table（已實作）

完整實作了 NRS（New Rotation System）標準，包含 JLSTZ 與 I 各自 8 組 kick 資料，確保方塊在牆邊與地板旋轉時有正確的位移補償。

### 7-Bag Randomizer

```
每袋包含完整 7 種方塊各一個，洗牌後依序發放
袋空時自動重新填充，確保所有方塊長期均勻分布
```

### 音效合成策略

使用 `OscillatorNode` + `GainNode` 即時產生波形，通過 `exponentialRampToValueAtTime` 達成自然的音量遞減，避免點擊噪音。所有音效時長控制在 50ms~300ms 之間，不干擾遊戲體驗。

---

## 🎯 快速開始

```bash
# 直接用瀏覽器開啟
open index.html

# 或使用本地伺服器（推薦，可獲得完整字體載入）
npx serve .
```

部署在 GitHub Pages：`main` 分支的靜態檔案可直接托管，無需任何建置流程。

---

*Made with 💜 — 參考經典 Tetris 玩法，採用現代網頁技術重建*
