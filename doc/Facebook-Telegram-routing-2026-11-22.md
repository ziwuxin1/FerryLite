# Facebook 图片与 Telegram 默认出口

用户报告国内电脑 TUN 下 Facebook 页面可打开、图片无法加载；同时要求 Telegram 默认香港自动。

## 已确认的配置问题和变化

- 本机缓存的旧 YAML 只有 Facebook 在线规则集，没有当前生成器的资源域名兜底；缓存文件不代表发生故障的客户端正在使用同一个版本。
- 原本已覆盖 `fbcdn.net`，因此不能把所有图片故障归因于缺少这个域名。新增本地兜底 `facebook.net`、`fbsbx.com`、`fbsbx.net` 和 Facebook 的短链接域名，规则集未成功下载时仍可分流。
- 当 Facebook 和 WhatsApp 同时启用时，`graph.facebook.com` 不再被 WhatsApp 的更具体域名提前截走；Facebook 未启用时仍保留 WhatsApp 对 Graph API 的路由。
- Facebook 网页/媒体域名的 UDP 443 使用精确逻辑规则拒绝，使支持 TCP 回退的浏览器改用 HTTPS/TCP，避开节点宣称支持 UDP、实际 QUIC 路径不通的情况。仅匹配 `facebook.com`、`facebook.net`、`fbcdn.com`、`fbcdn.net`、`fbsbx.com`、`fbsbx.net`、`fbcdn-a.akamaihd.net` 的 UDP 443；不是全局禁止 UDP，也不会改变 HY2 到 VPS 的底层传输。需要 QUIC 时可在 YAML 中删除这些带 `DST-PORT,443` 的 Facebook 兼容规则。
- Telegram 原本默认香港自动，现在界面明确显示；保留其他出口手动选择。添加官方 14 条 DC IPv4/IPv6 网段作为本地兜底，保留在线规则集用于后续更新。用户取消 Telegram 时不生成这些规则。
- 未修改用户正在使用的客户端配置，亦未更改其他模式的默认出口。

## 验证与局限

- 完整网页构建与 Rust 47 项测试通过。
- 社交专项 4 项、既有路由 3 项、VPS 合并 7 项、YAML 编辑/草稿 27 项测试通过。
- 实际 Mihomo 1.19.34 本机内核：PC / Nikki 各 19 次，共 38 次探测通过。故意将在线规则集替换为空集，验证 Facebook 主站、Graph API、图片、附件、WhatsApp、Instagram、Telegram 域名/IP 路由；验证 Facebook UDP 443 被拒绝，而同域名 UDP 8443 和无关网站 UDP 443 可到本机测试接收器。
- 测试未接管系统 TUN、未使用私人订阅、未向真实 Facebook / Telegram 账户发送请求。尚未取得用户失败图片的网络日志，尚未确认真实账号图片恢复；节点质量、DNS、浏览器缓存等仍可能造成问题。

## 用户更新步骤

刷新 FerryLite 网页 → 重新生成国内模式 YAML → 在客户端导入并启用 → 保持 TUN 与规则模式 → Telegram 选择香港自动（如果客户端记住了旧选择，需要手动切一次）→ 关闭并重新打开 Facebook 页面测试。

如果仍然没有图片，查看客户端连接记录中 `fbcdn.net`、`fbsbx.com` 是否命中 Facebook；提供失败域名、所选出口和报错信息即可，避免发送含签名/token 的完整图片 URL。可以在 Facebook 策略组切换另一条可用线路做对照，以区分分流与节点问题。

## 参考

- https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/facebook.list
- https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/telegram.list
- https://core.telegram.org/resources/cidr.txt
- https://wiki.metacubex.one/config/rules/
