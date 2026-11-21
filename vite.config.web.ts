import { defineConfig } from "vite";

// 浏览器前端构建。build:web 随后打包 api/exclusive.mjs；专属解锁需要 Node 服务端。
export default defineConfig({
  root: "web",
  base: "/",
  server: {
    port: 1430,
    fs: {
      // 需要读 ../src（共享代码）与 ../node_modules。
      allow: [".."],
    },
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
