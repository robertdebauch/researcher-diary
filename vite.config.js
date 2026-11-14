import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Новый service worker вступает в силу при следующей загрузке,
      // без ручной чистки кэша и `skipWaiting`-костылей.
      registerType: "autoUpdate",
      // Регистрируем SW сами (src/main.jsx) — так момент регистрации под контролем.
      injectRegister: false,
      // Манифест уже лежит в public/ и подключён в index.html — не дублируем.
      manifest: false,
      workbox: {
        // Кэшируем только оболочку приложения: HTML, JS, CSS, иконки.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // Новая версия SW активируется сразу и забирает открытые вкладки:
        // без этого первый визит остаётся неуправляемым до перезагрузки.
        skipWaiting: true,
        clientsClaim: true,
        // Тайлы OpenStreetMap намеренно НЕ кэшируем: условия использования
        // тайлов запрещают массовое скачивание, а карта всё равно требует сети.
      },
    }),
  ],
  base: "/researcher-diary/",
});

