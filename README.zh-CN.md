# Ferry · YAML 配置生成器

Ferry 与网页版 **FerryLite（小渡）共用此仓库**，生成和编辑适用于 Windows / macOS / Linux 客户端，以及 OpenClash、Nikki 等路由器插件的 Clash YAML（需要 Mihomo / Clash Meta 内核）。

**在线使用：[ferrylite.cc](https://ferrylite.cc/)** · [网页版构建说明](web/README.md)

网页版使用 WASM 在浏览器本地处理订阅和代理凭据；桌面版打开直接进入生成表单。

[English](README.md) · [使用说明](doc/Ferry-1.4.3-使用说明.md)

## 功能

- 电脑版 / 路由器版分别生成对应的 TUN、DNS 和监听设置。
- 美国机场 → 美国独立家宽；台湾机场 → 台湾独立家宽 → 所选国际交易所。
- ofiii 固定默认配置，默认机场台湾。
- APP 分流与 SOCKS 分享链接填充。
- 网页导入 YAML、源码预览与编辑、校验和安全纠错。
- 自定义策略组、站点域名管理、本网站相关域名补全及 Logo。
- 浏览器自动保存分流草稿和一键 Reset；草稿不保存订阅地址或代理凭据。
- 仅生成及导出 YAML；无状态页、体检、Claude 启停或后台托盘。

生成后需导入目标客户端并核对覆写、路由。台湾家宽首次需手动选择台湾中转节点。

## 构建

需要 Node.js 22、Rust；桌面版在 Windows 构建，网页版还需 wasm-pack 和 wasm32-unknown-unknown 目标，安装步骤见网页版构建说明。

- npm ci
- npm run tauri build
- npm run build:web
- npm run test:editor
- cargo test --manifest-path ferry-core/Cargo.toml

桌面仅发布免安装 EXE，输出：src-tauri/target/release/；已禁用安装包生成。网页：dist-web/。

两端共用 ferry-core 生成逻辑。凭据用于本地生成，导出的 YAML 包含连接信息，应妥善保管。

目录：`web/` 为网页入口，`src/` 为共享表单和 YAML 编辑代码，`ferry-core/` 为 Rust 生成引擎，`ferry-wasm/` 为浏览器绑定，`src-tauri/` 为桌面外壳。GitHub Actions 会构建 `ferrylite-web` 静态网站产物；生产网站部署单独进行。

[MIT](LICENSE) © ziwuxin1
