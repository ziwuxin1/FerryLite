# Claude 一键启动器

> 配置生成器 + 链路体检仪表盘 + Claude 起停开关。Windows / Tauri。

帮助国内学生稳定、低封号风险地使用 Claude。核心链路：

```
学生电脑 → ClashMi(本地代理, TUN) → 机场美国节点 → 美国独立家宽静态IP(纯净出口) → Claude
启动前：软件经「Claude 组路径」实测出口 IP == 基准 IP，相等才放行。
```

完整设计见 [doc/2026-06-11-claude-launcher-design.md](doc/2026-06-11-claude-launcher-design.md)。
学生用法见 [doc/学生使用说明.md](doc/学生使用说明.md)。

## 它做什么 / 不做什么

**做**：把老师的 Clash 模板注入合成成学生可用的成品 yaml；启动 Claude 前实测出口 IP；一键起 / 一键安全关 Claude（CLI / 桌面 App / 网页）；体检独立 IP 出口链路的延迟与稳定性；跳 ping0.cc 看 IP 纯净度。

**不做**：不接管代理、不自动开 TUN、不切节点（这些在 ClashMi/zashboard 手动完成）；不算 IP 信誉分；不测机场节点延迟；不号称抹除记录。

## 架构

单个 Tauri `.exe`，双击运行：

- **前端（`src/`，原生 TS + Vite）**：两个页面——「配置生成」表单页、「状态盘」主页。只发指令、收结果。
- **后端（`src-tauri/src/`，Rust）**：所有系统级操作。

| 模块 | 文件 | 职责 |
|---|---|---|
| 配置生成 | `yaml_inject.rs` | 文本锚点注入 + 校验（**不** load→dump，保住注释与锚点） |
| 本地配置 | `config.rs` | `config.json` 读写（设计 §4） |
| 体检 | `health.rs` | 查 ClashMi、出口 IP 验证（多源 + 智能诊断）、链路延迟/稳定性 |
| 起 Claude | `launch.rs` | CLI（新开 PowerShell 注入代理环境变量）/ 桌面 App |
| 安全关闭 | `shutdown.rs` | 按 PID 杀 CLI 进程树 + 按进程名杀桌面 App |
| 命令层 | `commands.rs` / `lib.rs` | Tauri 命令注册、共享状态、插件 |

## 项目结构

```
.
├── index.html              # 前端入口
├── src/                    # 前端（TS）
│   ├── main.ts             # 视图路由（config <-> dashboard）
│   ├── api.ts              # invoke 强类型封装
│   ├── dom.ts              # el()/toast() 助手
│   ├── views/              # config-view / dashboard-view
│   └── components/         # shutdown-dialog
├── src-tauri/              # 后端（Rust）
│   ├── src/                # 各模块 + commands + lib
│   ├── templates/MAXs_template_anchored.yaml   # 带注入锚点的模板（编译期嵌入）
│   ├── Cargo.toml / tauri.conf.json / capabilities/
├── scripts/gen-icon.mjs    # 零依赖生成源图标 PNG（CI 用）
└── .github/workflows/build.yml   # 云端产出 Windows exe
```

## 本地开发

前置：Node 18+、Rust（stable）、Windows。

```powershell
npm install
npm run icons          # 生成图标（首次必须；产出 src-tauri/icons/）
npm run tauri dev      # 开发运行
```

后端单元测试（注入/校验/回显域名对齐共 14 项）：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

## 构建

无需本地装全工具链：推到 GitHub 即由 [Actions](.github/workflows/build.yml) 在 Windows runner 产出：

- `claude-launcher-portable-exe` —— 免安装单 exe（依赖系统 WebView2，Win11 自带）。
- `claude-launcher-setup` —— NSIS 安装包。

本地构建：`npm run icons && npm run tauri build`。

## 模板注入锚点（维护者）

`templates/MAXs_template_anchored.yaml` = 老师的 `MAXs_20260609_01.yaml` + 4 个文本锚点。老师换模板时，在新 yaml 对应位置补这 4 个锚点即可，软件零改动：

| 锚点 | 位置 | 注入内容 |
|---|---|---|
| `<<AIRPORT_SUBSCRIPTION_URL>>` | `proxy-providers.Nice.url` 的值 | 学生的机场订阅链接 |
| `# <<INJECT_PROXY_NODE>>` | `proxies:` 段 `拒绝` 之后 | 美国独立IP 节点（账密代理 + `dialer-proxy: 美国-自动`） |
| `# <<CLAUDE_GROUP>>` | `proxy-groups:` 里原 Claude 行 | 显式 Claude 组（美国独立IP 置首位） |
| `# <<INJECT_VERIFY_RULES>>` | `rules:` 段 `MATCH,其他` 之前 | 4 条 `DOMAIN,<回显域名>,Claude` 规则 |

## 安全模型

不管学生在 zashboard 怎么选节点，**启动 Claude 前实测出口 IP 是否 == 基准 IP，不等则红灯拦截**。验证请求经由与 Claude 完全相同的路径（注入规则强制回显域名走 Claude 组），任何错配（选错节点 / NovProxy 未连通 / Claude 组被改）都会被发现。比对标准只能是基准 IP，不放宽成「只要是美国 IP」。

## 待实测确认的开放技术点（设计 §7.3）

1. **协议与 TLS**：端口 443 且协议 http 时，对端若为 HTTPS 代理可能需 `tls: true`（已做成生成器勾选项）。
2. **基准为域名**：回显 IP 与域名解析出的 IP 集合比对（已实现）；NovProxy 给 IP 字面量为主路径。
3. **`dialer-proxy` + TUN(gvisor) + `endpoint-independent-nat`**：链式代理在该 TUN 栈下需实测确认稳定。
4. **Claude 桌面 App 进程名**：默认 `Claude.exe`，可在 `config.json` 的 `claudeDesktopProcess` / `claudeDesktopPath` 覆盖。
5. **exe 签名**：第一期不签名；学生需放行 SmartScreen / 杀软（见学生说明）。
