import { defineConfig } from "vite";

// 网页版（纯静态）构建：入口在 web/，但要复用仓库根 src/ 下的共享表单与样式，
// 所以 root 设在 web/ 并放开上级目录访问。产物是能丢到任何静态托管的一堆文件。
export default defineConfig({
  root: "web",
  // 相对路径：挂在 maxsacademy.com 根目录或任意子路径（/ferry/）都能跑。
  base: "./",
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
