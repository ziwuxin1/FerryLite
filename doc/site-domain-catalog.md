# 站点关联域名补全

2026-10-28：`src/site-catalog.ts` 收录 137 个站点预设，覆盖生成器全部 135 个内置 APP，另含 Claude 与 FerryLite。135 个公开补全建议；两个专属 APP 仍只在解锁后的管理面板启用名称补全。

生成器每个 APP 的域名管理、导入 YAML 的编辑器共用 `completeSiteDomains`。支持完整显示名称、内部键名、已登记别名、主域名和子域名网址。已知站点统一使用 DOMAIN-SUFFIX；同名服务通过明确名称区分，例如 Gemini 与 Gemini 交易所。网址按最具体的已知后缀匹配，避免 Gemini 被 Google 抢先识别。

## 收录边界

- 主域名覆盖其下真实存在的 API、静态资源、CDN 子域名及所有端口，不猜测 `api.`、`cdn.` 等主机名。
- 跨主域资源使用人工筛选的已知清单，不整批导入第三方品牌列表；排除各国官网、品牌保护域名、招聘宣传站及无关产品。地区标记的实际资源 CDN（如 TikTok 播放 CDN）可以保留，它们不是各国站点。
- 不使用 amazonaws.com、cloudfront.net、akamaized.net 等共享基础设施根域；已知服务专用桶、CDN 主机使用完整主机名。网站托管平台的全租户根域也不自动加入。
- 内置主域和原有跨域配置参考 `ferry-core/src/lib.rs`；新补充的资源参考各条目 `sources` 中的 MetaCubeX / blackmatrix7 维护列表，逐项挑选。源清单本身不能证明实时完整性。例：[Netflix](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/netflix.list)、[GitHub](https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/github.list)。
- 未识别的网站只规范用户输入的域名，不声称自动发现跨域依赖，也不收集用户连接记录。未收录的资源可手工补充。
- 这次更新只调整输入网站名称时的补全清单，保留已有远程 RULE-SET 绑定；外部规则集仍独立更新。用户导入的现有规则不会被自动删改。

## 维护与验证

新增站点时更新 `SITE_CATALOG` 的 key、name、aliases、domains 和 sources。保持主站域名在首位供图标使用；新增 API/CDN 主机必须有来源依据。不要用盲目后缀替换或按国家列表扩展。

`npm run test:editor` 检查每个 UI APP 都有预设、名称和网址识别、专属项隐藏、各国站点及共享 CDN 排除、所有预设写入 YAML 的有效性，以及原有数据保留和台湾保护规则优先级。
