# 指令：赛博朋克 3.0 —— 黑客帝国代码雨 + 全息科技界面

## 目标
彻底升级赛博朋克皮肤，实现：
1. 主界面动态代码雨背景（类似黑客帝国），取代大块暗色留白。
2. 所有卡片、弹窗、输入框增加全息玻璃效果 + 流动光边。
3. 弹窗组件（SettingsModal 等）完全赛博朋克化，与整体风格融合。
4. 不影响其他皮肤，不破坏功能。

## 技术方案
- 代码雨：使用 CSS 的 `@keyframes` 驱动重复的字符列，通过多个伪元素 `::before` / `::after` 和 `box-shadow` 实现，无需修改 HTML。
- 全息弹窗：通过 `backdrop-filter: blur(12px)`、渐变边框、内部扫描线增强科技感。
- 所有改动仅限 `cyberpunk.css`，必要时可在 `index.html` 或 `App.svelte` 中添加一个空的 `<div class="rain-container">` 供 CSS 使用（由 AI 判断）。

## 修改步骤

### 1. 替换 `cyberpunk.css`（完整代码）
用以下内容完全覆盖 `src/renderer/src/styles/themes/cyberpunk.css`：

```css
/* ========== 核心变量 ========== */
[data-theme="cyberpunk"] {
  --bg-primary: #010310;
  --bg-secondary: #0a0f1e;
  --text-primary: #c0f0ff;
  --text-secondary: #80b0cc;
  --accent-primary: #00f0ff;
  --accent-secondary: #ff007f;
  --accent-tertiary: #f0ff00;
  --border-color: rgba(0, 240, 255, 0.3);
  --shadow: 0 0 20px rgba(0, 240, 255, 0.4);
  --font-ui: 'Orbitron', sans-serif;
  --font-mono: 'Share Tech Mono', monospace;
  --transition-speed: 0.2s;
  --button-radius: 2px;
  --card-bg: rgba(10, 15, 30, 0.7);
  --input-bg: #0a0f1e;
  --input-focus-shadow: 0 0 15px rgba(0, 240, 255, 0.8);
  --scrollbar-thumb: #00f0ff;
  --scrollbar-track: #0a0f1e;
}

/* ========== 代码雨背景 ========== */
[data-theme="cyberpunk"] body {
  position: relative;
  background: var(--bg-primary);
  overflow: hidden;
}

/* 代码雨容器：在 App.svelte 最外层添加 <div class="rain-container"></div> 或在 body 前生成 */
[data-theme="cyberpunk"] .rain-container,
[data-theme="cyberpunk"] body::before {
  content: "";
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none;
  z-index: 0;
  background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 240, 255, 0.05) 2px,
      rgba(0, 240, 255, 0.05) 4px
    );
  mask-image: linear-gradient(
    to bottom,
    rgba(0,0,0,0.3) 0%,
    rgba(0,0,0,0.8) 50%,
    rgba(0,0,0,0.3) 100%
  );
}

/* 下落字符列 - 使用 box-shadow 构建 30 列 */
[data-theme="cyberpunk"] body::after {
  content: "A B C D E F 0 1 2 3 4 5 6 7 8 9 ￥ $ % # @ * & !";
  position: fixed;
  top: -100%;
  left: 0;
  width: 100%;
  height: 200%;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1.2;
  color: var(--accent-primary);
  text-shadow: 0 0 5px var(--accent-primary);
  white-space: pre;
  pointer-events: none;
  z-index: 1;
  opacity: 0.6;
  animation: codeRain 12s linear infinite;
}

@keyframes codeRain {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(0%); }
}

/* 第二层代码雨（粉色，错开速度） */
[data-theme="cyberpunk"] .rain-layer-2,
[data-theme="cyberpunk"] .app-container::before {
  content: "D E F A B C 8 9 5 6 3 2 7 0 1 4 ! @ # $ % ^ & *";
  position: fixed;
  top: -100%;
  left: 30%;
  width: 40%;
  height: 200%;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--accent-secondary);
  text-shadow: 0 0 5px var(--accent-secondary);
  white-space: pre;
  pointer-events: none;
  z-index: 1;
  opacity: 0.4;
  animation: codeRain2 18s linear infinite;
}

@keyframes codeRain2 {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(50%); }
}

/* 确保应用内容在雨之上 */
[data-theme="cyberpunk"] #app,
[data-theme="cyberpunk"] .app-container {
  position: relative;
  z-index: 2;
}

/* ========== 全局扫描线 ========== */
[data-theme="cyberpunk"] body .scanlines {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 240, 255, 0.02) 3px,
    rgba(0, 240, 255, 0.02) 6px
  );
  pointer-events: none;
  z-index: 3;
}

/* ========== 按钮：脉冲光环 + 扫描光条 ========== */
[data-theme="cyberpunk"] button {
  position: relative;
  overflow: hidden;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: bold;
  border: 2px solid var(--border-color);
  background: rgba(0, 240, 255, 0.05);
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.2);
  transition: all 0.3s;
}
[data-theme="cyberpunk"] button::after {
  content: "";
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(0,240,255,0.4), transparent);
  transition: left 0.5s;
}
[data-theme="cyberpunk"] button:hover::after {
  left: 100%;
}
[data-theme="cyberpunk"] button:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 0 30px var(--accent-primary), 0 0 10px var(--accent-secondary);
  color: var(--accent-tertiary);
}

/* ========== 输入框：全息下划线 ========== */
[data-theme="cyberpunk"] input,
[data-theme="cyberpunk"] select,
[data-theme="cyberpunk"] textarea {
  background: var(--input-bg);
  border: none;
  border-bottom: 2px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 12px;
  transition: border-color 0.3s, box-shadow 0.3s;
}
[data-theme="cyberpunk"] input:focus,
[data-theme="cyberpunk"] select:focus,
[data-theme="cyberpunk"] textarea:focus {
  outline: none;
  border-bottom-color: var(--accent-primary);
  box-shadow: 0 10px 20px -10px rgba(0, 240, 255, 0.5);
}

/* ========== 卡片 / 弹窗：全息玻璃 + 扫描线 ========== */
[data-theme="cyberpunk"] .card,
[data-theme="cyberpunk"] .modal-content,
[data-theme="cyberpunk"] .settings-panel,
[data-theme="cyberpunk"] dialog,
[data-theme="cyberpunk"] [role="dialog"] {
  background: rgba(5, 10, 25, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid transparent;
  border-image: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary), var(--accent-tertiary)) 1;
  box-shadow: 0 0 40px rgba(0, 240, 255, 0.2), inset 0 0 30px rgba(0, 240, 255, 0.05);
  position: relative;
}
[data-theme="cyberpunk"] .card::before,
[data-theme="cyberpunk"] .modal-content::before,
[data-theme="cyberpunk"] .settings-panel::before,
[data-theme="cyberpunk"] dialog::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 240, 255, 0.03) 2px,
    rgba(0, 240, 255, 0.03) 4px
  );
  pointer-events: none;
}

/* ========== 通知消息：流光边框 ========== */
[data-theme="cyberpunk"] .notification,
[data-theme="cyberpunk"] .alert {
  border-left: 4px solid var(--accent-secondary);
  background: rgba(255, 0, 127, 0.1);
  box-shadow: 0 0 15px rgba(255, 0, 127, 0.3);
}

/* ========== 标题：故障效果 ========== */
[data-theme="cyberpunk"] h1 {
  text-shadow:
    0 0 10px var(--accent-primary),
    2px 2px 0 var(--accent-secondary),
    -2px -2px 0 var(--accent-primary);
  animation: glitch 2.5s infinite;
}

/* ========== 滚动条 ========== */
[data-theme="cyberpunk"] ::-webkit-scrollbar {
  width: 6px;
}
[data-theme="cyberpunk"] ::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
[data-theme="cyberpunk"] ::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
  box-shadow: 0 0 8px var(--accent-primary);
}

/* ========== 动画 ========== */
@keyframes glitch {
  0%, 100% { text-shadow: 0 0 10px #0ff, 2px 2px 0 #f0f, -2px -2px 0 #0ff; }
  15% { text-shadow: -2px 2px 0 #f0f, 2px -2px 0 #0ff; }
  30% { text-shadow: 2px -2px 0 #0ff, -2px 2px 0 #f0f; }
  45% { text-shadow: -2px 0 0 #f0f, 2px 0 0 #0ff; }
  60% { text-shadow: 0 0 5px #0ff, 0 0 20px #0ff; }
  75% { text-shadow: 0 0 10px #f0f, 0 0 5px #0ff; }
}
2. 添加代码雨容器（可选，增强效果）
如果仅用 body::after 达不到理想的字符列密度，可让 AI 在 App.svelte 或 index.html 中添加一个空的 <div class="rain-layer-2"> 容器，CSS 会自动应用第二层代码雨。AI 会自动判断是否需要添加。

3. 检查弹窗组件
AI 需扫描项目中的弹窗/模态框组件（如 SettingsModal.svelte），确保它们使用了通用类名（如 .modal-content）或在 CSS 中通过 dialog、[role="dialog"] 选择器覆盖，以保证赛博朋克皮肤下弹窗也能呈现全息玻璃效果。