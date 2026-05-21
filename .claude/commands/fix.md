# 指令：恢复并适配完整皮肤样式

## 目标
将之前已存储的五款皮肤 CSS（默认、深色、赛博朋克、手账涂鸦、像素比特）完整适配到当前项目，要求：
- 切换皮肤后所有界面元素（按钮、输入框、面板、文字、背景等）即时变化
- 每种皮肤拥有独特的风格（如赛博朋克的霓虹灯效、手账的贴纸风格）
- 不破坏现有功能（OBS WebSocket、串流、播放）
- 所有样式使用 CSS 变量 (`var(--xxx)`) 并通过 `[data-theme="xxx"]` 作用域

## 前置条件
- `src/renderer/src/styles/themes/` 目录已存在，可能包含简版主题文件
- `theme.ts` store 已正常切换 `data-theme` 属性

## 修改步骤

### 1. 替换完整皮肤 CSS 文件
AI 需要使用以下完整版 CSS 内容**覆盖** `themes/` 目录下同名文件。请为每个皮肤单独创建/覆盖文件：

#### `default.css` (默认 - 原项目白底蓝调)
```css
[data-theme="default"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #363636;
  --text-secondary: #7a7a7a;
  --accent-primary: #00d1b2;
  --accent-secondary: #3273dc;
  --border-color: #dbdbdb;
  --shadow: 0 2px 4px rgba(0,0,0,0.1);
  --font-ui: 'Segoe UI', sans-serif;
  --font-mono: 'Consolas', monospace;
  --transition-speed: 0.2s;
  --button-radius: 4px;
  --card-bg: #ffffff;
  --input-bg: #ffffff;
  --input-focus-shadow: 0 0 0 2px rgba(0,209,178,0.3);
  --scrollbar-thumb: #b0b0b0;
  --scrollbar-track: #f0f0f0;
}
dark.css (深色 - 科技蓝紫暗调)
css
[data-theme="dark"] {
  --bg-primary: #1e1e2e;
  --bg-secondary: #2a2a3a;
  --text-primary: #e0e0ff;
  --text-secondary: #a0a0cc;
  --accent-primary: #7b68ee;
  --accent-secondary: #ff6b9d;
  --border-color: #3e3e5e;
  --shadow: 0 2px 8px rgba(0,0,0,0.5);
  --font-ui: 'Inter', sans-serif;
  --font-mono: 'Fira Code', monospace;
  --transition-speed: 0.2s;
  --button-radius: 6px;
  --card-bg: #2a2a3a;
  --input-bg: #1e1e2e;
  --input-focus-shadow: 0 0 0 2px rgba(123,104,238,0.4);
  --scrollbar-thumb: #5a5a8a;
  --scrollbar-track: #2a2a3a;
}
cyberpunk.css (赛博朋克 - 黑底霓虹)
css
[data-theme="cyberpunk"] {
  --bg-primary: #0a0a1a;
  --bg-secondary: #141428;
  --text-primary: #e0e0ff;
  --text-secondary: #b0b0dd;
  --accent-primary: #00f0ff;
  --accent-secondary: #ff007f;
  --border-color: rgba(0, 240, 255, 0.3);
  --shadow: 0 0 12px rgba(0, 240, 255, 0.3);
  --font-ui: 'Orbitron', sans-serif;
  --font-mono: 'Share Tech Mono', monospace;
  --transition-speed: 0.15s;
  --button-radius: 2px;
  --card-bg: rgba(10, 10, 26, 0.9);
  --input-bg: #0a0a1a;
  --input-focus-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
  --scrollbar-thumb: #00f0ff;
  --scrollbar-track: #1a1a2e;
  /* 额外特效 */
  --neon-glow: 0 0 10px var(--accent-primary);
  --neon-glow-secondary: 0 0 10px var(--accent-secondary);
}
journal.css (手账涂鸦 - 暖黄纸底)
css
[data-theme="journal"] {
  --bg-primary: #fff8e7;
  --bg-secondary: #ffeacc;
  --text-primary: #4a3b2f;
  --text-secondary: #7a6b5f;
  --accent-primary: #ff8c94;
  --accent-secondary: #6bc9f2;
  --border-color: #e8d5c4;
  --shadow: 2px 2px 0 rgba(0,0,0,0.05);
  --font-ui: 'Nunito', sans-serif;
  --font-mono: 'Courier Prime', monospace;
  --transition-speed: 0.2s;
  --button-radius: 25px;
  --card-bg: #ffffff;
  --input-bg: #ffffff;
  --input-focus-shadow: 0 0 0 2px #ff8c94;
  --scrollbar-thumb: #ffb0b8;
  --scrollbar-track: #fff0e0;
}
pixel.css (像素比特 - 8bit 街机)
css
[data-theme="pixel"] {
  --bg-primary: #1a1a2e;
  --bg-secondary: #2a2a3e;
  --text-primary: #ffffff;
  --text-secondary: #ccccff;
  --accent-primary: #00d4ff;
  --accent-secondary: #ff6b9d;
  --border-color: #ffffff;
  --shadow: 4px 4px 0 #000000;
  --font-ui: 'Press Start 2P', cursive;
  --font-mono: 'Silkscreen', monospace;
  --transition-speed: 0s;
  --button-radius: 0px;
  --card-bg: #2a2a3e;
  --input-bg: #1a1a2e;
  --input-focus-shadow: 4px 4px 0 #00d4ff;
  --scrollbar-thumb: #00d4ff;
  --scrollbar-track: #1a1a2e;
  image-rendering: pixelated;
}
2. 确保全局样式使用变量
修改 src/renderer/src/styles/global.css（或同等全局样式文件），将所有硬编码颜色替换为变量：

css
body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ui);
  transition: background-color var(--transition-speed), color var(--transition-speed);
}

button {
  background: var(--accent-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--button-radius);
  box-shadow: var(--shadow);
  font-family: var(--font-ui);
  transition: all var(--transition-speed);
}

input, select, textarea {
  background: var(--input-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--button-radius);
  font-family: var(--font-ui);
}

input:focus {
  box-shadow: var(--input-focus-shadow);
  outline: none;
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow);
  border-radius: var(--button-radius);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
}
::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
3. 更新所有 Svelte 组件中的硬编码样式
AI 需扫描 src/renderer/src/*.svelte 文件，将 <style> 块中的硬编码颜色替换为 CSS 变量。重点关注：

Host.svelte

Join.svelte

SettingsModal.svelte

App.svelte

其他自定义组件

4. 移除任何与主题冲突的固定样式
检查是否有全局样式覆盖了主题变量，例如直接给 body 设置了背景色。将它们移除，确保主题变量优先级最高。

5. 重新构建并测试
清理：rm -rf release out

构建：npm run build:win

测试：启动应用，在设置中切换五款皮肤，确认所有界面元素随主题变化，包括按钮圆角、字体、阴影、输入框发光效果等。

验收标准
赛博朋克皮肤显示霓虹光晕、扫描线背景（如有）

手账涂鸦皮肤显示贴纸按钮、手写字体

像素皮肤使用8bit字体、硬阴影、无过渡动画

深色和默认皮肤保持原有风格

所有功能不受影响