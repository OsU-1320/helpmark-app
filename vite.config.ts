import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    workbox: {
      // 新SWを即座にアクティブ化し、全タブを即制御する（デプロイ直後の旧キャッシュ問題を防ぐ）
      clientsClaim: true,
      skipWaiting: true,
      // ライセンス表記（静的ページ）は、アプリの画面ではなくファイルそのものを開く
      navigateFallbackDenylist: [/^\/licenses\.html$/],
    },
    manifest: {
      name: 'ヘルプマークNET',
      short_name: 'ヘルプマークNET',
      description:
        'ヘルプマーク所持者がNFCタップで支援を要請し、対応可能なサポーターにだけ通知が届くPWA',
      lang: 'ja',
      start_url: '/',
      display: 'standalone',
      background_color: '#FAFAF8',
      theme_color: '#E5001A',
      icons: [
        {
          src: 'favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: 'icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/maskable-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: 'icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
  }), cloudflare()],
})