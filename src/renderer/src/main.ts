import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import 'bulma/css/bulma.min.css'
import '@sweetalert2/theme-bulma/bulma.min.css'
import { mount } from 'svelte'
import App from './App.svelte'

// Svelte 5 标准挂载 API（兼容 runes/legacy 两种编译模式的组件）
const app = mount(App, {
  target: document.getElementById('app')
})

export default app
