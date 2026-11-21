# 内置图标检查 — 2026-11-21

- 检查全部 138 条站点预设及网页 137 个应用条目（含新增的 Claude）。Perforce 两项明确共用 perforce.com；域名列表首项不一定适合作为品牌图标。
- 本站缓存已验证的图标，资源映射见 src/site-icon-assets.json。原文件直接复制，未进行图像像素修改。
- 图标来源：icon.horse；Midjourney、Binance、npm、Unreal Engine、Carrington、ID.me、Perforce 的替代图标来自 Google favicon 服务；OpenAI、Claude、Midjourney、Cursor 的 SVG 来自 @lobehub/icons-static-svg（jsDelivr）。商标属于各品牌。
- 去除统一白色背景/边框，按资源特征做 CSS 明暗适配；白底资源在深色/浅色模式分别混合显示，深色单色标志随主题反色。
- SLS 图标源仅返回占位图，备用源返回 404；使用透明文字 SLS，避免假称已找到品牌标志。
- Claude 原本由核心固定生成，这次只补默认启用的可见入口和域名管理；不额外生成第二个 Claude 策略组。全选/反选、分类选择和旧草稿恢复不关闭这个固定入口。
- 自定义域名继续尝试第三方图标，加载失败显示文字；不保证任意外部网站拥有可用 favicon。
