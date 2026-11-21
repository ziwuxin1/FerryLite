# GPT / Claude 分流检查（2026-11-21）

## 结论与修复

旧 Claude provider 来自 blackmatrix7，抓取到的当前版本只有 `anthropic.com`、`claude.ai` 和共享统计主机 `cdn.usefathom.com` 三条。文件资源、Claude 新官网/Code 文档、MCP 内容等域名未被该专属组覆盖。已切换至 MetaCubeX anthropic.mrs，且在普通云服务规则之前内置审阅过的域名，不依赖远程列表是否及时更新来补齐这些域名。

旧 GPT 的 MetaCubeX openai.mrs 已覆盖主站、API、文件资源和部分 LiveKit 域名；不能把目录仅有 7 个域名误判成运行配置也仅有 7 条。但本地兜底仅有 4 个域名，编辑器目录与生成器不一致，官方列出的登录/公共依赖及纯 IP 语音连接覆盖不足。现将审阅数据集中到 `ferry-core/data/ai-routing.json`，Rust/WASM 和编辑器共用。

ChatGPT、Claude 专属域名优先于 Microsoft、Apple、测试和兜底规则；用户明确添加的自定义规则仍可覆盖。共享登录/验证/客服主机归 `AI公共服务`，默认跟随 ChatGPT，未启用 ChatGPT 时跟随 Claude。若手动把两个 AI 切到不同出口，共享主机无法凭目的域名判断由哪个网页发起，需要自行选择该共享组。没有引入 `*.auth0.com`、`*.stripe.com`、`*.sentry.io`、整个 Google Storage 或 Datadog/Sentry/Sift 关键词等宽泛匹配。

已核对官方 ChatGPT Voice IP 清单，当前快照时间为 2026-11-16，411 个前缀。仅匹配这些 IP 的 UDP 3478，不把整个云厂商 ASN 送进 GPT。维护命令 `node scripts/update-ai-voice.mjs` 更新快照，之后需重建并发布；已下载 YAML 不会自动刷新内联 IP。旧参考文件中的两个 /32 已不在当前官方语音清单中，未照搬。

Claude IP 兜底使用官方入站范围 `160.79.104.0/23`、`153.61.224.0/22`、`2607:6bc0::/48`。参考文件的 /21 为官方列出的出站范围，/32 IPv6 也宽于入站 /48；不把这些出站范围或整个 ASN 当成访问 Claude 的目标。

Mihomo 在选中的代理不支持 UDP 时会继续向下匹配。新增域名/语音规则后紧跟相同范围的 UDP 拒绝规则：支持 UDP 的代理正常使用；仅 TCP 的出口不会让这些 UDP 请求悄悄落入其他国家/直连。客户端可能改用 TCP，具体功能仍需实际验证。

## 模式边界

- 国内：普通配置按美国机场/已配置独立 IP；解锁学生 VPS 后，ChatGPT、Claude、Perforce 美国仍默认丽萨洛杉矶 VPS。HY2 / SS2022 / Reality 仍由原选择组控制，不新增自动协议切换。
- 海外：保留现行 V77 模式行为，GPT/Claude 走 `MATCH,直连`，不强制绕回 VPS。此模式与国内学生配置不同，不能拿海外导出文件证明学生默认走 VPS。
- 电脑版与路由器版均保留既有 TUN/DNS 管理方式；路由器插件和客户端持久化选择可能覆盖 YAML 初始默认值。
- 本次发布更新网站生成器。已下载文件需重新生成并导入；旧桌面安装包不会被本次网页部署更新。

## 参考来源

- https://github.com/kiki0-zz/QX_rules （QX 与 Loon GPT/Claude 文件逐项对照）
- https://github.com/2815338930/Claude- （两个 Claude 文件对照）
- https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps
- https://openai.com/chatgpt-voice.json
- https://platform.claude.com/docs/en/api/ip-addresses
- https://code.claude.com/docs/en/network-config
- https://raw.githubusercontent.com/metacubex/meta-rules-dat/meta/geo/geosite/openai.list
- https://raw.githubusercontent.com/metacubex/meta-rules-dat/meta/geo/geosite/anthropic.list
- https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Claude/Claude.list
- https://wiki.metacubex.one/config/rules/

`anthropic.sh` 和泛化 `anthropic-static` 关键词仅见于所给个人清单，未得到上述官方说明或当前 MetaCubeX 清单交叉验证，暂不自动纳入。共享监控/CDN 的域名规则无法隔离同一主机下的不同租户；只收审阅过的具体主机，并记录这个限制。官方 allowlist 是可达性要求，不等于所有第三方必须与主站同一 IP，更不能保证账户风控或所有服务永久可用。

## 验证与限制

Rust 核心、WASM、编辑器、VPS 合并、海外模式均做回归；新增 AI 测试检查域名覆盖、先后顺序、关掉 GPT 后无悬空引用、语音范围和公共域名边界。Mihomo v1.19.34 原生加载通过；隔离运行测试关闭 TUN/DNS/系统代理，使用本地模拟出口：9 个 AI/公共主机走指定 AI 出口，1 个无关域名仍走普通出口，3 个 UDP 测试在 TCP-only 出口下由专属 guard 拒绝。

这些证明规则生成、引用和匹配行为，不等于完成登录、上传、付费、语音通话或大陆真实线路测速。未登录用户账号、未调用收费模型 API、未修改用户现有客户端。服务会新增域名和语音 IP，不能声称永久或绝对完整；若某功能异常，仍需用该设备的实际连接日志确认。
