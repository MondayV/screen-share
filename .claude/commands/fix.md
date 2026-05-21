# 指令：精简皮肤系统，仅保留深色和赛博朋克

## 目标
- 删除项目中的 default.css、journal.css、pixel.css 皮肤文件
- 更新皮肤切换组件，只显示“深色”和“赛博朋克”两个选项
- 更新 theme store 或相关配置，确保默认皮肤为深色
- 不破坏现有功能（OBS WebSocket、串流、播放）
- 保持所有样式引用正确

## 执行步骤

### 1. 删除多余皮肤文件
- 定位到 `src/renderer/src/styles/themes/` 目录
- 删除以下文件：
  - `default.css`
  - `journal.css`
  - `pixel.css`
- 保留 `dark.css` 和 `cyberpunk.css`

### 2. 更新皮肤切换组件
- 找到皮肤切换组件（可能在 `SettingsModal.svelte` 或独立组件中）
- 修改皮肤列表，仅包含：
  - `{ value: 'dark', label: '深色' }`
  - `{ value: 'cyberpunk', label: '赛博朋克' }`
- 确保切换逻辑不变，仍然通过 `data-theme` 属性和 `localStorage` 持久化

### 3. 更新默认皮肤设置
- 在 theme store (`theme.ts`) 或初始化代码中，将默认值改为 `'dark'`
- 确保首次启动时应用深色皮肤
- 如果 `localStorage` 中没有存储的皮肤，默认使用 `'dark'`

### 4. 检查样式导入
- 移除 `main.ts` 或 `App.svelte` 中对已删除皮肤文件的导入语句
- 确保仅导入 `dark.css` 和 `cyberpunk.css`

### 5. 重新构建与验证
- 清理：`rm -rf release out`
- 构建：`npm run build:win`
- 验证：
  - 启动应用，默认显示深色皮肤
  - 在设置中切换到赛博朋克皮肤，界面立即变化（霓虹效果）
  - 切换回深色，恢复暗色风格
  - 关闭应用再打开，保留上次选择的皮肤

## 注意事项
- 不要删除 `themes/` 目录本身
- 保留 `theme.ts` store 逻辑，仅修改皮肤列表