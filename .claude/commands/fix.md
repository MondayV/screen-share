# 指令：恢复正确的“深色”与“赛博朋克”皮肤，删除错误生成的皮肤

## 问题
- AI 误将默认皮肤设置为了赛博朋克，且生成了一个全黑的深色皮肤，覆盖了原本正确的 `dark.css`。
- 需要恢复到：**深色（原 dark.css）** 和 **赛博朋克（原 cyberpunk.css）**，并确保**默认使用深色**。

## 修复目标
1. 用正确的 CSS 覆盖 `dark.css`（深色）和 `cyberpunk.css`（赛博朋克）。
2. 删除其他多余的皮肤文件（如果存在）。
3. 确保 `theme.ts` store 中默认值为 `'dark'`。
4. 确认皮肤切换组件只显示“深色”和“赛博朋克”两个选项。
5. 不破坏现有功能。

## 修复步骤（AI 必须严格执行）

### 1. 删除多余皮肤文件
- 检查 `src/renderer/src/styles/themes/` 目录，删除以下文件（如果存在）：
  - `default.css`
  - `journal.css`
  - `pixel.css`
  - 以及任何 AI 新生成的、不在下列两项中的主题文件
- **只保留** `dark.css` 和 `cyberpunk.css`

### 2. 用正确内容覆盖 `dark.css`
```css
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
3. 用正确内容覆盖 cyberpunk.css
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
  --neon-glow: 0 0 10px var(--accent-primary);
  --neon-glow-secondary: 0 0 10px var(--accent-secondary);
}
4. 更新 theme.ts 默认值
打开 src/renderer/src/stores/theme.ts（或存放主题 store 的文件）

确保初始化时默认值设置为 'dark'，例如：

ts
const saved = localStorage.getItem('app-theme') || 'dark';
export const theme = writable<string>(saved);
5. 更新皮肤切换组件
找到皮肤选择下拉框/按钮组

确保选项只包含两个：

{ value: 'dark', label: '深色' }

{ value: 'cyberpunk', label: '赛博朋克' }

删除任何对已删除皮肤（default, journal, pixel）的引用

6. 检查样式导入
在 main.ts 或 App.svelte 中，只保留对 dark.css 和 cyberpunk.css 的导入

删除对已删除皮肤的导入语句

7. 重新构建并验证
清理：rm -rf release out

构建：npm run build:win

验证：

启动应用，界面显示为深色风格（紫蓝配色），而不是全黑或赛博朋克

在设置中切换到“赛博朋克”，界面立即变为黑底霓虹风格

切换回“深色”，恢复暗色风格

关闭应用再打开，保留上次选择的皮肤

验收标准
应用默认使用正确的深色皮肤（dark.css）

赛博朋克皮肤显示霓虹蓝粉效果

皮肤切换即时生效，无残留的其他主题文件