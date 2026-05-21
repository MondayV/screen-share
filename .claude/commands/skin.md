# 指令：删除深色皮肤，保留“默认（控件原生）”与“赛博朋克”

## 目标
1. 移除 `dark.css`（深色）皮肤，让应用在无主题时直接显示控件原生颜色。
2. 将原来的“深色”选项更名为“默认”，内部标识仍可用 `'dark'` 或改用 `'default'`（由 AI 选择最简单的方式）。
3. 保留完整的赛博朋克 `cyberpunk.css`（3.0 代码雨版）。
4. 更新皮肤切换组件，只显示“默认”和“赛博朋克”两个选项。
5. 默认皮肤选中“默认”。

## 修改步骤

### 1. 删除 `dark.css` 或创建空的 `default.css`
- 如果 `src/renderer/src/styles/themes/dark.css` 存在，**删除**它。
- 可选：新建 `src/renderer/src/styles/themes/default.css`，内容为空（确保回退到原生控件样式）。
- 如果项目中有全局样式依赖于 `[data-theme="dark"]`，确保不存在此类依赖。

### 2. 更新主题 Store（theme.ts）
- 找到主题 store 文件（通常是 `src/renderer/src/stores/theme.ts`）。
- 将默认值修改为 `'default'`（或之前 `'dark'` 对应的值，但需与皮肤选项匹配）。
- 皮肤列表更新为：
  ```ts
  const themes = [
    { id: 'default', name: '默认' },
    { id: 'cyberpunk', name: '赛博朋克' }
  ];
3. 更新皮肤切换组件
定位到皮肤选择的下拉框或按钮组（可能在 SettingsModal.svelte 中）。

修改选项为“默认”和“赛博朋克”。

确保切换时正确设置 data-theme 属性。

4. 清理样式导入
在 src/renderer/src/main.ts 或 App.svelte 中，移除对 dark.css 的导入。

如果新建了 default.css，可以导入它，或完全不导入主题 CSS（让原生样式生效）。

仅保留 cyberpunk.css 的导入。

5. 重新构建与验证
清理构建：rm -rf release out

重新构建：npm run build:win

启动应用，验证：

默认皮肤下，所有控件显示原生颜色（Bulma 默认风格或系统默认）。

切换到赛博朋克皮肤，代码雨、全息弹窗、霓虹灯效均生效。

皮肤选择可在设置中正常切换，重启后保留选择。