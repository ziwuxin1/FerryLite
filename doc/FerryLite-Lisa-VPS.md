# 丽萨洛杉矶 VPS 接入

网页版在同源 `POST /api/exclusive` 验证共享代码，成功后返回三个允许的客户端节点。机场订阅仍只在浏览器处理。节点和输入的代码不写入 localStorage；刷新或 Reset 后需要重新解锁。下载的 YAML 含共享凭据，应按私密配置分发。

Vercel 项目设置以下 sensitive 环境变量（production / preview）：

- `FERRYLITE_EXCLUSIVE_CODE`：管理员指定的旧共享代码。用户明确选择保留；任何知道旧代码的人均可领取节点，不是个人身份验证。
- `FERRYLITE_LISA_VPS_JSON`：`{"version":1,"nodes":[...]}`。nodes 来自管理员本地 `student-proxy.yaml` 的 `proxies`，仅 HY2、SS2022、Reality 三个节点。不要把完整 YAML、机场订阅或服务端私钥上传。

- `FERRYLITE_HK_VPS_JSON`：`{"version":1,"nodes":[...]}`，来自香港服务器的新 `student-proxy.yaml`，只提取三个节点，服务器为 `192.238.186.43`。与洛杉矶节点分开保存，使用同一专属解锁代码。

凭据不应写进 Git、VITE_ 变量、构建参数或静态文件。接口禁止缓存，限制请求大小，并提供每个运行实例的补充尝试限制；这不是跨实例的全局限流。旧代码曾存在于历史测试源码中，删除当前测试文本不会撤销历史暴露。

解锁后，最终 YAML 追加「丽萨洛杉矶VPS」选择组，内含 HY2、SS2022、Reality，默认 HY2。ChatGPT、Claude、Perforce 美国默认使用该组；其他应用保留原来的第一出口。所有-手动加入该选项，并以所有-自动作为初始机场出口。地区自动测速组只包含机场节点；中转跳板不添加 VPS，避免改变已有地区链路。

Perforce 美国仍匹配 `perforce-maxs.ddns.me`。香港 P4 是独立可选项，P4V 服务器填写 `192.238.186.43:1888`，分流匹配 `192.238.186.43/32`。解锁香港节点后默认使用「MAXs香港VPS」，组内默认 SS2022，可切换 HY2 / Reality 或香港机场线路。香港节点不替换美国 VPS；不会导入附件中的全局 DNS、TUN、进程和 AI 规则。未配置香港环境变量时保留香港-自动作为兼容回退。自定义分组和新增网站也提供 VPS 选项。TUN 设置沿用原 PC / Nikki 模板。

先运行 `npm run build:wasm`，再执行 `npm run test:editor` 和 `npm run test:vps`。正式打包使用 `npm run build:web`，部署整个 `dist-web`（包含 `api/exclusive.mjs` 和 `package.json`），不能仅用纯静态文件服务器托管专属接口。不要部署源码仓库、桌面 YAML 或任何 .env 文件。

桌面版下一次重新构建后使用同一个 HTTPS 接口；服务端仅额外允许 Tauri 的固定本地 Origin。已发布的旧桌面安装包不会随网站更新。

客户端如果保存了之前的策略选择，可能覆盖 YAML 的初始默认值。更新订阅后检查 ChatGPT、Claude、Perforce 美国是否选择「丽萨洛杉矶VPS」。本次集成不保证特定平台解锁或中国大陆网络质量，应从学生实际网络验证。
