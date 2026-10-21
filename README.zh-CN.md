<div align="center">

<img src="assets/logo.png" alt="Ferry" width="116" />

# Ferry

**专为回国设计的智能分流，稳稳处理美国急事。**

Smart split‑routing built for going back to China.

![版本](https://img.shields.io/badge/version-1.1.2-ff5c8a)
![平台](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)
![框架](https://img.shields.io/badge/framework-Tauri%202-24C8DB)
![技术栈](https://img.shields.io/badge/stack-Rust%20%2B%20TS-f74c00)
![许可](https://img.shields.io/badge/license-MIT-22c55e)

[English](README.md) · 中文

</div>

---

**Ferry** 帮助回国 / 国内用户低封号风险地稳定访问 **Claude** 及美国专属服务（银行、券商、保险、政府门户…）—— 把流量链式中转到一条干净的美国**住宅** IP 出口。

```text
你的电脑 → ClashMi（本地代理, TUN） → 机场美国节点 → 美国住宅静态IP（干净出口） → 目标
启动前：Ferry 经「Claude 组路径」实测真实出口 IP，与基准 IP 相等才放行。
```

## ✨ 功能

- **每个 APP 独立分流** —— 每个应用（Claude、银行、券商、流媒体、开发者工具、Parsec…）生成自己的可选策略组，在 zashboard 里逐个切换出口。
- **一键体检** —— 检查 Clash API、真实出口 IP == 基准 IP、链路延迟 / 稳定性。
- **出口 IP 校准** —— 住宅代理常「入口域名 ≠ 真实出口 IP」，一键把回显 IP 设为基准。
- **分享链接导入** —— 粘贴 `socks://` 链接，自动填好 服务器 / 端口 / 账号 / 密码。
- **起停 Claude** —— CLI / 桌面 App / 网页；安全关闭只结束 Claude，不动浏览器和 ClashMi。

## ⬇️ 下载

到 [**Releases**](../../releases/latest) 拿最新版：

| 文件 | 用途 |
|---|---|
| `Ferry-x.y.z.exe` | **单文件免安装** —— 双击直接运行（需 WebView2，Win10/11 自带）。 |
| `Ferry-x.y.z-setup.exe` | 安装版，带开始菜单快捷方式。 |

## 🌐 网页版（只生成配置）

不想装桌面版、或者在 Mac / Linux 上，可以用网页版：填表 → 浏览器里直接算出成品 `yaml` → 下载 → 导入你自己的 Clash 客户端。

- **纯静态，没有后端。** 机场订阅链接和独立 IP 的账号密码只在你这台机器的浏览器内存里参与计算，不经过任何服务器。
- **生成逻辑与桌面版同源。** 两端都用 `ferry-core` 这一份 Rust 实现，网页版跑的是它编译出来的 WASM，分流规则改一处两端同时生效。
- **做不到的部分：** 链路体检、出口 IP 校验、Claude 一键启停都要操作本机端口与进程，浏览器没有这个能力，这些功能请用桌面版。

## 🔧 从源码构建

环境：Node 18+、Rust（stable）。桌面版需要 Windows；网页版任意平台。

```powershell
npm install

# 桌面版 → src-tauri/target/release/（便携 exe + NSIS 安装包）
npm run tauri build

# 网页版 → dist-web/（一堆静态文件，丢到任意静态托管即可）
npm run build:web
```

网页版首次构建要先装 WASM 工具链（`build:web` 会自动调用 `build:wasm`）：

```powershell
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

本地预览网页版：`npm run dev:web`。

## 🧱 原理

仓库分三块：`ferry-core`（纯配置生成逻辑，无任何 IO）、`src-tauri`（桌面版外壳）、`ferry-wasm` + `web`（网页版）。
桌面版是单个 Tauri `.exe`（Rust 后端 + 原生 TypeScript 前端）：

- **配置生成器**用文本锚点把你的机场订阅 + 住宅 IP 节点注入 Clash 模板（绝不 `load→dump`，保住注释与锚点），产出可直接导入的 `yaml`。
- **状态盘**做启动前体检，然后起 / 安全关 Claude。
- 路由按规则走，每个 APP 一个可选策略组，出口（美国住宅 / 机场美国 / 香港 / 台湾 / …）在 zashboard 里自己选。

## 📄 许可

[MIT](LICENSE) © ziwuxin1
