import { defineConfig } from 'vitest/config'

// vite.config.ts とは別ファイルにする理由：
// 本体の vite.config.ts は @cloudflare/vite-plugin を読み込んでおり、
// テスト実行時に wrangler 設定の解決を試みて余計な依存が発生するため。
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
