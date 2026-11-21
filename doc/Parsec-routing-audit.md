# Parsec：国内连接美国电脑的分流修复

已修复 FerryLite 国内模式生成器；需重新生成并导入 YAML，继续开启 TUN，并完全退出后重新打开 Parsec。已有 YAML 不会自动更新。

## 使用

1. 勾选「Parsec 远程桌面」，生成电脑版 YAML 并导入国内电脑的 Clash/Mihomo 客户端。
2. 「Parsec 远程桌面」控制登录、主机列表与后台 TCP 请求，默认美国机场，可手动选择可用节点；解锁 VPS 后也能选丽萨 VPS。
3. 「Parsec 串流」同时控制 STUN 和 UDP 画面传输，默认直连。先用默认值测试。若确实需要代理 UDP，再手动选支持 UDP 的固定出口；机场标注 UDP 并不保证支持 P2P 打洞。切换后重启 Parsec，再尝试连接。
4. 通过路由器代理，或电脑进程识别失败时，在网页展开 Parsec 的排错设置，填写美国远程电脑的公网 IP。它只匹配发往这些精确 IP 的 UDP，不会代理全部 UDP 或固定假设所有主机使用 8000 端口。地址改变后需重新生成配置。支持多个 IPv4 / IPv6。

## 错误码边界

- -6101：无法连接认证/信令服务器。检查 TCP 443、线路和服务状态。
- -800：端点请求失败；网络、DNS、代理冲突、过旧客户端等都可能造成。不要把它和 -800097 / -800098（操作系统 IPv6 被禁用）混淆。
- -6023 / -6024 / -6013：重点检查两端 UDP、STUN、防火墙与 NAT。至少一侧需要具备可达条件；美国主机侧可能需要允许 Parsec、防火墙规则或路由器端口映射。CGNAT、双重 NAT、服务故障和主机配置不能靠 YAML 保证修复。
- 不自动关闭防火墙、重置 WinHTTP、开启 UPnP 或修改学生/美国主机网络；实际排错应根据完整错误码及两端日志进行。

## 修复范围

原先只有 parsec.app / parsecgaming.com 两个域名，无法覆盖未知对端 IP 的 P2P 数据。新增 parsecusercontent.com、电脑端 parsecd.exe / parsecd 的 TCP/UDP 进程分流、精确对端 UDP 路由、STUN 的真实 DNS 回答及通过所选登录线路的 DoH 查询。保持现有 TUN、端点无关 NAT 和其他应用规则。共享 AWS / CloudFront 不做整域接管，电脑应用的相关请求由进程规则识别。路由器不生成无效的电脑进程规则。

取消 Parsec 时上述新增组、规则及 DNS 设置不生成。自定义规则仍优先；客户端原有选择和覆写也可能影响实际运行配置。海外 V77 模式本次不强制变更。

## 验证

100 项自动测试通过（Rust 47；Parsec 4；AI 8；编辑器/草稿 27；VPS 7；海外 7）。Mihomo v1.19.34 原生加载通过；隔离测试验证 4 次登录/进程 TCP 请求、1 次无关请求、3 次 STUN/对端 UDP、TCP-only 串流出口拒绝兜底。测试使用本地模拟出口，关闭测试进程的 TUN 和 DNS，不修改系统代理，没有建立真实 Parsec 会话。

网页已验证 IP 保存恢复及导出内容。尚未取得国内学生与美国主机的完整错误日志，因此不能断言原来的错误码已在实际线路上消失。

## 官方资料

- [连接要求](https://support.parsec.app/hc/en-us/articles/32381460716180-Parsec-Connectivity-Requirements)
- [-6101](https://support.parsec.app/hc/en-us/articles/32381892358164-Error-Codes-6101-Your-Network-Is-Blocking-a-Connection-to-Parsec)
- [-800](https://support.parsec.app/hc/en-us/articles/32381082464916-Error-Codes-800-Failed-request-to-an-endpoint)
- [-6023 / -6024](https://support.parsec.app/hc/en-us/articles/32381913636244-Error-Codes-6023-and-6024-Unable-To-Negotiate-A-Successful-Connection)
- [进程路径](https://support.parsec.app/hc/en-us/articles/32381836182932-Run-Parsec-App-From-Command-Line)
- [Mihomo DNS](https://wiki.metacubex.one/config/dns/)
