# 指令：修复皮肤切换后界面样式未改变

## 问题
- 五款皮肤 CSS 文件已创建（`src/renderer/src/styles/themes/*.css`）
- `theme.ts` store 已绑定 `<html data-theme="...">`
- 切换皮肤时 `data-theme` 属性已变化，但界面样式未更新

## 排查与修复目标
1. 确保每个主题 CSS 被引入到应用中（不是仅创建文件）。
2. 确保所有 UI 组件使用 CSS 变量（`var(--xxx)`）而非硬编码颜色。
3. 确保主题 CSS 的优先级高于默认样式。

## 修改步骤（AI 必须严格按顺序完成）

### 1. 确认主题 CSS 被全局引入
- 检查 `src/renderer/src/main.ts` 或 `App.svelte` 或入口 HTML，是否导入了所有主题 CSS 文件。
- 如果没有，添加以下导入：
  ```ts
  import './styles/themes/default.css';
  import './styles/themes/dark.css';
  import './styles/themes/cyberpunk.css';
  import './styles/themes/journal.css';
  import './styles/themes/pixel.css';
确认导入路径正确（根据实际文件位置调整）。

如果使用 vite，也可以通过在 index.html 中使用 <link> 标签引入，但推荐在入口 TS 文件中导入。

2. 审查全局样式是否使用 CSS 变量
打开 src/renderer/src/styles/global.css 或主要的全局样式文件。

将硬编码的颜色、背景、边框等替换为 var(--xxx) 形式，例如：

css
body {
  background-color: var(--bg-primary, #fff);
  color: var(--text-primary, #000);
}
button {
  background: var(--accent-primary, #00f);
  border: 1px solid var(--border-color, #ccc);
}
至少替换全局基础元素（body, button, input, select, a, .card 等）。

3. 修复 Svelte 组件中的硬编码样式
搜索所有 .svelte 文件中的 <style> 块，如果包含硬编码颜色（如 color: #333），替换为 CSS 变量。

特别注意 Host.svelte、Join.svelte、SettingsModal.svelte 等核心组件。

4. 确保主题 CSS 文件使用 [data-theme="xxx"] 作用域
打开每个主题 CSS 文件（如 dark.css），确认其内容格式为：

css
[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --text-primary: #e0e0e0;
  /* ...其他变量 */
}
如果变量直接定义在 :root 中，改为上述作用域形式。

5. 测试验证
启动应用，切换皮肤，观察界面颜色是否即时变化。

打开 DevTools → Elements，检查 <html> 的 data-theme 属性是否正确切换。

检查任一元素的 computed styles，确认 CSS 变量是否生效。

注意事项
不要修改 theme.ts store 的逻辑，它本身没有问题。

如果某些第三方组件（如 Font Awesome 图标）不受皮肤影响，可忽略。