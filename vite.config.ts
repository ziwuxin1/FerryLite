import { defineConfig } from "vite";

// Tauri 期望一个固定端口；不可用则直接报错，避免连错前端。
// 详见 https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Tauri 在终端里输出 Rust 报错，这里不要清屏，方便排查。
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 不监听 Rust 侧文件，交给 cargo。
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Tauri 在 Windows 上使用 WebView2(Chromium)，目标可用较新语法。
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
