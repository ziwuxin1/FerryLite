# FerryLite 小渡 · 网页版

在线使用：https://ferrylite.cc/

首页为产品介绍、下载和更新日志；点击「开始生成 YAML」进入 `/app`。`/app/` 同样可访问，旧 `/flow` 地址跳转至工具。首页与工具分别加载样式和脚本，首页不初始化 WASM。深浅色偏好独立保存在 `ferry-landing-theme`，不影响分流草稿。

FerryLite 网页版与桌面版共用仓库，不需要单独安装客户端。支持配置生成、YAML 导入和源码编辑、策略组与域名管理。导出文件为 `Ferry-Desktop.yaml` 或 `Ferry-Router.yaml`。

新生成的桌面与路由器配置默认开启 HTTP/TLS/QUIC 域名嗅探，尝试识别纯 IP 连接并按现有域名规则分流；保留原目标地址，不保证所有连接均可识别。已下载的旧配置需重新生成并导入客户端才能应用此默认值。

## 本地构建

安装 Node.js 22、Rust（rustup）后，在仓库根目录执行：

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
npm ci
npm run build:web
```

`build:web` 先编译 Rust/WASM，再检查 TypeScript 和构建网页。静态产物在 `dist-web/`，WASM 临时产物在 `web/src/ferry-wasm/`，均不提交到仓库。

本地开发：首次执行 `npm run build:wasm`，然后 `npm run dev:web`。修改 Rust 引擎后重新执行 `npm run build:wasm`。

## 验证

```sh
npm run test:editor
cargo test --manifest-path ferry-core/Cargo.toml --locked
```

GitHub Actions 会验证并提供 `ferrylite-web` 构建产物。静态托管只上传 `dist-web/` 内容；其中 `vercel.json` 提供 Vercel 安全响应头和旧页面地址跳转。提交 GitHub 不会自动替换生产网站。

## 数据处理

订阅和代理凭据用于浏览器本地生成，不上传服务器。分流草稿保存在当前浏览器，不含订阅地址和代理密码；导出的 YAML 包含凭据，请自行妥善保管。站点 Logo 由外部图标服务加载。专属配置代码仅控制前端显示，不是服务端权限验证。

配置页按设计交付包重做：步骤导航、导出卡片、独立 IP 动画开关和表单末尾的生成按钮。深浅主题共用偏好；APP 计数来自真实目录，生成、编辑和草稿复用现有逻辑。手机隐藏步骤导航。
