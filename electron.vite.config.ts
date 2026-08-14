import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.ts'
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      // sandbox 下只能 require('electron')，其余依赖必须内联打包，
      // 因此禁用 electron-vite 5 默认注入的 externalizeDeps
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
          cursors: 'src/preload/cursors.ts'
        },
        // 仅外部化 electron 与 Node 内建模块
        external: ['electron', /^electron\/.+/, 'node:electron']
      }
    },
    plugins: []
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/renderer/index.html',
          cursors: 'src/renderer/cursors.html'
        }
      }
    },
    plugins: [
      svelte({
        // 显式声明 preprocess，避免依赖 svelte.config.mjs 的隐式加载
        preprocess: vitePreprocess()
      })
    ]
  }
})
