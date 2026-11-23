# FerryLite 全策略组检查 · 2026-11-22

检查覆盖当前网页的国内和海外模式、电脑版和 Nikki 路由器版。国内 137 个可选应用全部生成检查；基础全选配置各有 156 个策略组，海外配置各有 21 个策略组。另覆盖 VPS 合并、美国家宽、台湾家宽、交易所精简、自定义 12 国、全部关闭和逐个应用启用。

## 本轮发现并修复

1. Claude 的 3 条原生 IP 路由在所选节点仅支持 TCP 时，UDP 会落到后续出口；现已补齐防回落。
2. Test、国外、国内、其他兜底组也存在相同问题；现按选定组转发，节点无法承载 UDP 时拒绝，不会偷偷直连。
3. 台湾住宅上游原本固定首项为拒绝，即使订阅已有台湾节点仍不能连接；现在默认选台湾节点，地区为空仍拒绝。已有客户端保存的选择需手动核对。
4. 海外日本网站 28 个域名和台湾影音 1 个播放域名缺少 UDP 保护；已补齐，原 V77 有意设置的前置限制保持。
5. 新增站点/域名缺少 UDP 保护；删除域名或 IP 后又会残留对应保护；现在新增和删除同步处理。
6. 内置分类新增站点曾允许选择未生成的国家出口；现只显示存在的六个地区，自定义组仍提供实际生成的十二国。
7. 自定义国家组与内置国家组使用不同命名匹配，漏掉洛杉矶、西雅图、东京、大阪等节点；现六个共同地区使用同一套规则。
8. 补充 9 个服务入口：Grok 3 个、Gate API/图片 3 个、KuCoin 1 个、WhatsApp 短链接 1 个、Discord 附件上传 1 个。Discord 上传端点已在官网公开 CSP 中核对。

## 验证结果

- 69 项 JavaScript 测试及 49 项 Rust 测试通过；包括真实 Mihomo 海外 UDP 回归，无跳过。
- 312 项生成/引用/默认值检查通过，保存了 20 份合成场景清单。
- 海外 64 种分类启用组合通过，关闭分类后对应规则与保护移除。
- Mihomo 1.19.34 实际内核执行 2128 个 TCP 域名路由探针，四种配置均无未解释偏差。两个 Graph API 探针按已明确的共享策略走 Facebook，原自动预期 WhatsApp 已经人工复核。
- 附加内核验证：Claude TCP/UDP 12 个、国内兜底 TCP/UDP 24 个、海外 TCP/UDP 24 个；另验证台湾中转有无节点 4 组合、海外空地区 4 组合。
- 当前导出的 50 个公开规则集 URL 均返回成功；公共规则内容使用检查时下载的缓存快照。
- 网页实际点击新增站点、查看可选地区、生成并下载合成 YAML；检查导出 TUN 保持开启。

## 使用边界

这些是生成逻辑、规则顺序与真实内核分流检查，并非逐个登录 137 个服务。测试代理全部在本机，不开启测试 TUN、不改系统代理、不读取真实节点口令。实际机场质量、地区解锁、账号状态、校园网和 Parsec NAT 条件仍需真实设备验证。

规则集是持续变化的数据，不能保证永久无遗漏。上游列表中的共享云根域、统计服务、商城地区域名、其他产品和旧域名不应全部强塞入某个服务组；审计保留这些差异，不将每个差异都判为故障。Facebook/WhatsApp 的 Graph API、Google 与 Gemini/YouTube、Microsoft 与 GitHub 等重叠按现有特定服务优先规则处理。

TikTok 仍使用当前 catalog 路由和 UDP 防回落；源码旧 QUIC 限制在这些域名上已被前置规则遮挡，本轮未启用额外限制。国内 Parsec 串流保持默认直连，可手动选 UDP 可用出口；本轮不声称解决所有真实 NAT/防火墙错误码。

新网页只影响重新生成的 YAML；已下载配置需要重新生成并导入。客户端保存的策略组选择可能覆盖文件初始默认值。

## 逐组清单

以下规则数是直接指向该组的规则数；地区、自动、手动、住宅和 VPS 组往往由上层策略组引用，直接规则为 0 属正常。默认值是在无客户端历史选择时的初始出口。

### 国内：完整应用与基础组

| 策略组 | 类型 | 初始出口 | 直接规则数 | 空组策略 |
| --- | --- | --- | ---: | --- |
| Claude | select | 美国-自动 | 31 | 由所选出口决定 |
| ChatGPT | select | 美国-自动 | 437 | 由所选出口决定 |
| Gemini | select | 美国-自动 | 15 | 由所选出口决定 |
| Perplexity | select | 美国-自动 | 6 | 由所选出口决定 |
| Meta AI | select | 美国-自动 | 4 | 由所选出口决定 |
| Copilot | select | 美国-自动 | 3 | 由所选出口决定 |
| TapNow | select | 香港-自动 | 1 | 由所选出口决定 |
| Midjourney | select | 美国-自动 | 1 | 由所选出口决定 |
| Grok | select | 美国-自动 | 5 | 由所选出口决定 |
| Cursor | select | 美国-自动 | 5 | 由所选出口决定 |
| Max's Academy 官网 | select | 香港-自动 | 1 | 由所选出口决定 |
| Google | select | 香港-自动 | 2 | 由所选出口决定 |
| Apple | select | 直连 | 1 | 由所选出口决定 |
| Microsoft | select | 直连 | 1 | 由所选出口决定 |
| YouTube | select | 香港-自动 | 11 | 由所选出口决定 |
| Netflix | select | 香港-自动 | 11 | 由所选出口决定 |
| Disney+ | select | 香港-自动 | 11 | 由所选出口决定 |
| HBO Max | select | 香港-自动 | 8 | 由所选出口决定 |
| Spotify | select | 香港-自动 | 12 | 由所选出口决定 |
| Twitch | select | 香港-自动 | 3 | 由所选出口决定 |
| Robinhood | select | 美国-自动 | 1 | 由所选出口决定 |
| 微牛 Webull | select | 美国-自动 | 3 | 由所选出口决定 |
| 盈透 IBKR | select | 美国-自动 | 3 | 由所选出口决定 |
| 嘉信 Schwab | select | 美国-自动 | 2 | 由所选出口决定 |
| 富达 Fidelity | select | 美国-自动 | 2 | 由所选出口决定 |
| E*TRADE | select | 美国-自动 | 2 | 由所选出口决定 |
| Vanguard 先锋 | select | 美国-自动 | 1 | 由所选出口决定 |
| 美林 Merrill | select | 美国-自动 | 2 | 由所选出口决定 |
| Coinbase | select | 美国-自动 | 3 | 由所选出口决定 |
| Kraken | select | 美国-自动 | 2 | 由所选出口决定 |
| Gemini 交易所 | select | 美国-自动 | 1 | 由所选出口决定 |
| Crypto.com | select | 美国-自动 | 1 | 由所选出口决定 |
| Binance 币安 | select | 台湾-自动 | 6 | 由所选出口决定 |
| OKX 欧易 | select | 台湾-自动 | 11 | 由所选出口决定 |
| Bybit | select | 台湾-自动 | 6 | 由所选出口决定 |
| KuCoin | select | 台湾-自动 | 2 | 由所选出口决定 |
| Gate.io | select | 台湾-自动 | 5 | 由所选出口决定 |
| Bitget | select | 台湾-自动 | 1 | 由所选出口决定 |
| Perforce 美国 | select | 美国-自动 | 1 | 由所选出口决定 |
| Perforce 香港 | select | 香港-自动 | 1 | 由所选出口决定 |
| Parsec 远程桌面 | select | 美国-自动 | 5 | 由所选出口决定 |
| TikTok | select | 美国-自动 | 14 | 由所选出口决定 |
| Telegram | select | 香港-自动 | 29 | 由所选出口决定 |
| Twitter(X) | select | 香港-自动 | 8 | 由所选出口决定 |
| WhatsApp | select | 香港-自动 | 5 | 由所选出口决定 |
| Facebook | select | 香港-自动 | 12 | 由所选出口决定 |
| Instagram | select | 香港-自动 | 2 | 由所选出口决定 |
| Discord | select | 香港-自动 | 6 | 由所选出口决定 |
| Reddit | select | 香港-自动 | 4 | 由所选出口决定 |
| GitHub | select | 香港-自动 | 11 | 由所选出口决定 |
| GitLab | select | 香港-自动 | 4 | 由所选出口决定 |
| Stack Overflow | select | 香港-自动 | 3 | 由所选出口决定 |
| npm | select | 香港-自动 | 2 | 由所选出口决定 |
| Docker Hub | select | 香港-自动 | 4 | 由所选出口决定 |
| PyPI | select | 香港-自动 | 2 | 由所选出口决定 |
| Hugging Face | select | 香港-自动 | 3 | 由所选出口决定 |
| Vercel | select | 香港-自动 | 2 | 由所选出口决定 |
| Netlify | select | 香港-自动 | 2 | 由所选出口决定 |
| Jira / Atlassian | select | 香港-自动 | 2 | 由所选出口决定 |
| Bitbucket | select | 香港-自动 | 1 | 由所选出口决定 |
| Replit | select | 香港-自动 | 1 | 由所选出口决定 |
| ArtStation | select | 香港-自动 | 3 | 由所选出口决定 |
| Pinterest | select | 香港-自动 | 2 | 由所选出口决定 |
| Behance | select | 香港-自动 | 1 | 由所选出口决定 |
| Sketchfab | select | 香港-自动 | 1 | 由所选出口决定 |
| CGTrader | select | 香港-自动 | 1 | 由所选出口决定 |
| TurboSquid | select | 香港-自动 | 1 | 由所选出口决定 |
| Quixel Megascans | select | 香港-自动 | 1 | 由所选出口决定 |
| Gumroad | select | 香港-自动 | 1 | 由所选出口决定 |
| DeviantArt | select | 香港-自动 | 2 | 由所选出口决定 |
| Dribbble | select | 香港-自动 | 2 | 由所选出口决定 |
| Adobe Creative Cloud | select | 香港-自动 | 6 | 由所选出口决定 |
| Unreal Engine | select | 香港-自动 | 1 | 由所选出口决定 |
| FAB | select | 香港-自动 | 1 | 由所选出口决定 |
| Unity | select | 美国-自动 | 2 | 由所选出口决定 |
| The Rookies | select | 香港-自动 | 1 | 由所选出口决定 |
| Figma | select | 香港-自动 | 1 | 由所选出口决定 |
| Chase 大通 | select | 美国-自动 | 2 | 由所选出口决定 |
| Bank of America | select | 美国-自动 | 2 | 由所选出口决定 |
| Wells Fargo | select | 美国-自动 | 1 | 由所选出口决定 |
| Citibank 花旗 | select | 美国-自动 | 3 | 由所选出口决定 |
| Capital One | select | 美国-自动 | 1 | 由所选出口决定 |
| American Express | select | 美国-自动 | 2 | 由所选出口决定 |
| Discover | select | 美国-自动 | 1 | 由所选出口决定 |
| U.S. Bank | select | 美国-自动 | 1 | 由所选出口决定 |
| PNC | select | 美国-自动 | 1 | 由所选出口决定 |
| Ally Bank | select | 美国-自动 | 1 | 由所选出口决定 |
| Shellpoint Mortgage | select | 美国-自动 | 1 | 由所选出口决定 |
| NewRez | select | 美国-自动 | 1 | 由所选出口决定 |
| Rocket Mortgage / Quicken | select | 美国-自动 | 2 | 由所选出口决定 |
| Mr. Cooper | select | 美国-自动 | 1 | 由所选出口决定 |
| PennyMac | select | 美国-自动 | 2 | 由所选出口决定 |
| Freedom Mortgage | select | 美国-自动 | 1 | 由所选出口决定 |
| loanDepot | select | 美国-自动 | 1 | 由所选出口决定 |
| SoFi | select | 美国-自动 | 1 | 由所选出口决定 |
| SLS 贷款服务 | select | 美国-自动 | 1 | 由所选出口决定 |
| Carrington | select | 美国-自动 | 1 | 由所选出口决定 |
| Sallie Mae | select | 美国-自动 | 1 | 由所选出口决定 |
| Navient | select | 美国-自动 | 1 | 由所选出口决定 |
| State Farm | select | 美国-自动 | 1 | 由所选出口决定 |
| GEICO | select | 美国-自动 | 1 | 由所选出口决定 |
| Progressive | select | 美国-自动 | 1 | 由所选出口决定 |
| Allstate | select | 美国-自动 | 1 | 由所选出口决定 |
| USAA | select | 美国-自动 | 1 | 由所选出口决定 |
| Liberty Mutual | select | 美国-自动 | 2 | 由所选出口决定 |
| Farmers | select | 美国-自动 | 2 | 由所选出口决定 |
| Nationwide | select | 美国-自动 | 1 | 由所选出口决定 |
| Travelers | select | 美国-自动 | 1 | 由所选出口决定 |
| American Family | select | 美国-自动 | 1 | 由所选出口决定 |
| Erie | select | 美国-自动 | 1 | 由所选出口决定 |
| The Hartford | select | 美国-自动 | 1 | 由所选出口决定 |
| Mercury | select | 美国-自动 | 1 | 由所选出口决定 |
| Lemonade | select | 美国-自动 | 1 | 由所选出口决定 |
| Hippo | select | 美国-自动 | 1 | 由所选出口决定 |
| Amazon | select | 美国-自动 | 5 | 由所选出口决定 |
| eBay | select | 美国-自动 | 3 | 由所选出口决定 |
| Walmart | select | 美国-自动 | 2 | 由所选出口决定 |
| Best Buy | select | 美国-自动 | 1 | 由所选出口决定 |
| Target | select | 美国-自动 | 1 | 由所选出口决定 |
| Costco | select | 美国-自动 | 1 | 由所选出口决定 |
| Newegg | select | 美国-自动 | 1 | 由所选出口决定 |
| Home Depot | select | 美国-自动 | 1 | 由所选出口决定 |
| Expedia | select | 美国-自动 | 1 | 由所选出口决定 |
| IRS 国税局 | select | 美国-自动 | 1 | 由所选出口决定 |
| USPS 邮政 | select | 美国-自动 | 1 | 由所选出口决定 |
| USCIS 移民局 | select | 美国-自动 | 1 | 由所选出口决定 |
| SSA 社保 | select | 美国-自动 | 1 | 由所选出口决定 |
| ID.me | select | 美国-自动 | 1 | 由所选出口决定 |
| Login.gov | select | 美国-自动 | 1 | 由所选出口决定 |
| Steam | select | 香港-自动 | 19 | 由所选出口决定 |
| Epic Games | select | 香港-自动 | 6 | 由所选出口决定 |
| EA | select | 香港-自动 | 6 | 由所选出口决定 |
| Blizzard 暴雪 | select | 香港-自动 | 9 | 由所选出口决定 |
| Ubisoft 育碧 | select | 香港-自动 | 29 | 由所选出口决定 |
| PlayStation | select | 香港-自动 | 5 | 由所选出口决定 |
| Nintendo 任天堂 | select | 香港-自动 | 5 | 由所选出口决定 |
| Riot 拳头 | select | 香港-自动 | 7 | 由所选出口决定 |
| 台湾影音-机场 | url-test | (按订阅节点) | 0 | REJECT |
| 台湾影音 | select | 台湾影音-机场 | 5 | 由所选出口决定 |
| 订阅更新-Audit | fallback | 直连 | 0 | 由所选出口决定 |
| AI公共服务 | select | ChatGPT | 20 | 由所选出口决定 |
| Parsec 串流 | select | 直连 | 4 | 由所选出口决定 |
| Test | select | 直连 | 1 | 由所选出口决定 |
| 国外 | select | 香港-自动 | 2 | 由所选出口决定 |
| 国内 | select | 直连 | 4 | 由所选出口决定 |
| 其他 | select | 香港-自动 | 2 | 由所选出口决定 |
| 所有-手动 | select | (按订阅节点) | 0 | REJECT |
| 所有-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 香港-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 台湾-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 日本-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 新加坡-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 韩国-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 美国-自动 | url-test | (按订阅节点) | 0 | REJECT |
| 美国-中转 | url-test | (按订阅节点) | 0 | REJECT |
| 其他-自动 | url-test | (按订阅节点) | 0 | REJECT |

### 海外：全部策略组

| 策略组 | 类型 | 初始出口 | 直接规则数 | 空组策略 |
| --- | --- | --- | ---: | --- |
| 中国-机场 | url-test | REJECT | 0 | REJECT |
| 中国-出口 | select | 中国-机场 | 0 | 由所选出口决定 |
| 台湾-机场 | url-test | REJECT | 0 | REJECT |
| 台湾-出口 | select | 台湾-机场 | 0 | 由所选出口决定 |
| 日本-机场 | url-test | REJECT | 0 | REJECT |
| 日本-出口 | select | 日本-机场 | 0 | 由所选出口决定 |
| 香港-机场 | url-test | REJECT | 0 | REJECT |
| 香港-出口 | select | 香港-机场 | 0 | 由所选出口决定 |
| 美国-机场 | url-test | REJECT | 0 | REJECT |
| 美国-出口 | select | 美国-机场 | 0 | 由所选出口决定 |
| 新加坡-机场 | url-test | REJECT | 0 | REJECT |
| 新加坡-出口 | select | 新加坡-机场 | 0 | 由所选出口决定 |
| 韩国-机场 | url-test | REJECT | 0 | REJECT |
| 韩国-出口 | select | 韩国-机场 | 0 | 由所选出口决定 |
| 中国网站 | select | 直连 | 392 | 由所选出口决定 |
| 哔哩哔哩 | select | 直连 | 25 | 由所选出口决定 |
| 交易所 | select | 台湾-出口 | 57 | 由所选出口决定 |
| 台湾影音 | select | 台湾-出口 | 8 | 由所选出口决定 |
| 日本网站 | select | 日本-出口 | 34 | 由所选出口决定 |
| STEAM | select | 直连 | 61 | 由所选出口决定 |
| test | select | 交易所 | 8 | 由所选出口决定 |

### 自定义：十二国线路和示例组

| 策略组 | 类型 | 初始出口 | 直接规则数 | 空组策略 |
| --- | --- | --- | ---: | --- |
| 自定义线路 · 美国 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 香港 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 台湾 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 日本 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 新加坡 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 韩国 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 英国 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 德国 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 法国 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 加拿大 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 澳大利亚 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义线路 · 荷兰 | url-test | (按订阅节点) | 0 | REJECT |
| 自定义 · us | select | 自定义线路 · 美国 | 1 | 由所选出口决定 |
| 自定义 · hk | select | 自定义线路 · 香港 | 1 | 由所选出口决定 |
| 自定义 · tw | select | 自定义线路 · 台湾 | 1 | 由所选出口决定 |
| 自定义 · jp | select | 自定义线路 · 日本 | 1 | 由所选出口决定 |
| 自定义 · sg | select | 自定义线路 · 新加坡 | 1 | 由所选出口决定 |
| 自定义 · kr | select | 自定义线路 · 韩国 | 1 | 由所选出口决定 |
| 自定义 · gb | select | 自定义线路 · 英国 | 1 | 由所选出口决定 |
| 自定义 · de | select | 自定义线路 · 德国 | 1 | 由所选出口决定 |
| 自定义 · fr | select | 自定义线路 · 法国 | 1 | 由所选出口决定 |
| 自定义 · ca | select | 自定义线路 · 加拿大 | 1 | 由所选出口决定 |
| 自定义 · au | select | 自定义线路 · 澳大利亚 | 1 | 由所选出口决定 |
| 自定义 · nl | select | 自定义线路 · 荷兰 | 1 | 由所选出口决定 |

### 住宅代理：新增组

| 策略组 | 类型 | 初始出口 | 直接规则数 | 空组策略 |
| --- | --- | --- | ---: | --- |
| 台湾-中转 | select | (按订阅节点) | 0 | REJECT |
| 交易所-台湾家宽 | select | 台湾独立IP | 2 | 由所选出口决定 |

### VPS：新增组

| 策略组 | 类型 | 初始出口 | 直接规则数 | 空组策略 |
| --- | --- | --- | ---: | --- |
| 丽萨洛杉矶VPS | select | 🇺🇸 丽萨洛杉矶VPS · HY2 | 0 | 由所选出口决定 |

VPS 解锁后：Claude、ChatGPT、Perforce 美国默认丽萨洛杉矶 VPS；Telegram 默认香港自动。VPS 三协议组仍是手动选择，HY2 位于首位，并不自动切换协议。

## 参考

- [Mihomo 路由规则和 UDP 跳过行为](https://wiki.metacubex.one/config/rules/)
- [Mihomo 策略组与空组回退](https://wiki.metacubex.one/config/proxy-groups/)
- [Telegram 官方 IP 列表](https://core.telegram.org/resources/cidr.txt)
- [Gate 官方 API 地址](https://www.gate.com/docs/developers/apiv4/en/)
- [WhatsApp 官方短链接说明](https://faq.whatsapp.com/5913398998672934)
- [Discord 官网公开 CSP](https://discord.com/app)
- [MetaCubeX 规则源](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geosite)
- [Blackmatrix 规则源](https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Clash)
