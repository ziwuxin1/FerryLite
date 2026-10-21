//! 模块1 核心：配置生成器的「文本锚点注入 + 校验」。见设计 §6.1。
//!
//! 关键纪律：**绝不** 用 yaml 库 load→dump（会丢注释 `# 快猫`/`# 火烧` 与 YAML 锚点
//! `&default`/`*default`）。这里只做按锚点的纯文本替换；serde_yaml 仅用于「注入后语法体检」。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// 带锚点标记的模板（编译期嵌入 exe，运行时自包含，无需外部文件）。
pub const TEMPLATE: &str = include_str!("../templates/MAXs_template_anchored.yaml");

/// 纯回国模式模板：人在国外，国内→回国节点、其余→直连，去掉所有翻墙地区组。
/// 只含 3 个锚点（机场 / 各国内 App 组 / 各国内 App 规则），其余锚点在此模板里不存在，
/// inject() 对应的 replace() 自然成为 no-op。
pub const TEMPLATE_BACKCN: &str =
    include_str!("../templates/MAXs_template_backcn_anchored.yaml");

/// 出口 IP 验证回显域名。注入为「强制走 Claude 组」的规则；health 模块据此构造回显请求。
/// 二者主机名必须严格一致（见 health::ECHO_URLS）。
pub const VERIFY_DOMAINS: [&str; 4] = ["api.ipify.org", "ifconfig.me", "ip.sb", "ipinfo.io"];

const ANCHOR_PROVIDERS: &str = "# <<INJECT_PROXY_PROVIDERS>>";
const ANCHOR_PROXY_NODE: &str = "# <<INJECT_PROXY_NODE>>";
const ANCHOR_CLAUDE_GROUP: &str = "# <<CLAUDE_GROUP>>";
const ANCHOR_TOP_RULES: &str = "# <<INJECT_TOP_RULES>>";
const ANCHOR_VERIFY_RULES: &str = "# <<INJECT_VERIFY_RULES>>";
const ANCHOR_SPLIT_RULES: &str = "# <<INJECT_SPLIT_RULES>>";
const ANCHOR_SPLIT_GROUPS: &str = "# <<INJECT_SPLIT_GROUPS>>";

/// 残留检测用的「内部 token」（替换成功后不应再出现）。
const ANCHOR_TOKENS: [&str; 7] = [
    "INJECT_PROXY_PROVIDERS",
    "INJECT_PROXY_NODE",
    "CLAUDE_GROUP",
    "INJECT_TOP_RULES",
    "INJECT_VERIFY_RULES",
    "INJECT_SPLIT_RULES",
    "INJECT_SPLIT_GROUPS",
];

/// 一个机场订阅（proxy-provider）。可多个；其节点经 include-all 自动并入各筛选组。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Airport {
    /// provider 名（YAML key，需唯一，如 Nice）。
    pub name: String,
    /// 订阅链接。
    pub url: String,
}

/// 一个独立 IP 节点（账密代理）。多 IP 预留：节点以「列表」建模，将来加节点不必重构。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndependentNode {
    /// 节点名（默认「美国独立IP」）。
    pub name: String,
    /// 协议：socks5 / http。
    pub protocol: String,
    pub server: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    /// 仅 http 有意义：对端为 HTTPS 代理时置 true（设计 §7.3.1）。
    #[serde(default)]
    pub tls: Option<bool>,
    /// 实际出口IP(基准·可选)：住宅代理常「入口网关域名 ≠ 真实出口IP」(如 nc.30z.net 网关解析
    /// 12.105.83.107、实际出口 12.30.23.172)。填了就用它当出口校验基准；留空=用 server。
    #[serde(default)]
    pub exit_ip: Option<String>,
    /// 链式中转的上游组名（默认「美国-自动」）。挂组名而非具体节点，换节点不断链。
    pub dialer_proxy: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInput {
    pub airports: Vec<Airport>,
    pub independent_nodes: Vec<IndependentNode>,
    /// 傻瓜式分流（APP 级）：每个启用的 APP 一项；relay=true 走独立IP(含中转)、false 走机场美国节点。空=全按默认规则。
    #[serde(default)]
    pub split_apps: Vec<SplitApp>,
    /// 纯回国模式：人在国外，国内→回国节点、其余→直连，去掉所有翻墙地区组。
    /// 为 true 时用 TEMPLATE_BACKCN，且只处理回国类 App（其余 App / 独立IP 忽略）。
    #[serde(default)]
    pub back_cn_only: bool,
    /// DNS 覆写开关（默认开）：true=dns.enable: true（fake-ip 接管 DNS）；
    /// false=dns.enable: false（机场公告要求关闭 DNS 覆写时用，解析交回系统/上游）。
    #[serde(default = "default_dns_override")]
    pub dns_override: bool,
}

fn default_dns_override() -> bool {
    true
}

/// 分流的单个 APP 选择。key=APP 标识；name=该 APP 的策略组名（zashboard 里显示，用户逐个切换出口）；
/// relay=默认是否走独立IP（true→默认「美国独立IP」，false→默认机场美国/香港/台湾，均可在 zashboard 改）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitApp {
    pub key: String,
    pub name: String,
    pub relay: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub yaml: String,
    pub mixed_port: u16,
    pub proxy_endpoint: String,
    pub clash_api_url: String,
    pub clash_secret: String,
    pub exit_basis_ip: String,
    pub suggested_file_name: String,
}

/// 生成成品（注入 + 校验 + 解析回元信息）。模块1 的对外入口。
pub fn generate(input: &GenerateInput) -> Result<GenerateResult, String> {
    let yaml = inject(input)?;
    let (mixed_port, clash_api_url, clash_secret) = parse_meta(&yaml)?;
    let proxy_endpoint = format!("http://127.0.0.1:{mixed_port}");
    let exit_basis_ip = input
        .independent_nodes
        .first()
        .map(|n| {
            // 优先用「实际出口IP」(住宅代理网关≠出口时手填)；留空才退回 server。
            let e = n.exit_ip.as_deref().unwrap_or("").trim();
            if e.is_empty() {
                n.server.trim().to_string()
            } else {
                e.to_string()
            }
        })
        .unwrap_or_default();
    Ok(GenerateResult {
        yaml,
        mixed_port,
        proxy_endpoint,
        clash_api_url,
        clash_secret,
        exit_basis_ip,
        suggested_file_name: "Ferry.yaml".to_string(),
    })
}

/// 文本锚点注入（4 处）。
pub fn inject(input: &GenerateInput) -> Result<String, String> {
    validate_input(input)?;

    // 机场 provider 块：首块由模板的 2 空格缩进承接，后续块 join 补 2 空格。
    let providers_block = input
        .airports
        .iter()
        .map(build_provider_block)
        .collect::<Vec<_>>()
        .join("\n  ");

    // 独立 IP 可选：有则注入节点、Claude 默认走它；无则 Claude 走机场美国节点，
    // 并清掉模板各组对「美国独立IP」的引用（否则 mihomo 报错该节点不存在）。
    let has_indep = !input.independent_nodes.is_empty();
    let primary = input
        .independent_nodes
        .first()
        .map(|n| n.name.trim().to_string())
        .unwrap_or_else(|| "美国-自动".to_string());
    let node_block = input
        .independent_nodes
        .iter()
        .map(build_node_line)
        .collect::<Vec<_>>()
        .join("\n  ");

    // 纯回国模式用专属模板；其缺少的锚点（独立IP节点 / Claude组 / 顶部&验证规则）对应的 replace() 为 no-op。
    let back = input.back_cn_only;
    let template = if back { TEMPLATE_BACKCN } else { TEMPLATE };

    let mut yaml = template
        .replace(ANCHOR_PROVIDERS, &providers_block)
        .replace(ANCHOR_PROXY_NODE, &node_block)
        .replace(ANCHOR_CLAUDE_GROUP, &build_claude_group(has_indep, &primary))
        .replace(ANCHOR_SPLIT_GROUPS, &build_split_groups(&input.split_apps, has_indep, back))
        .replace(ANCHOR_TOP_RULES, &build_top_rules())
        .replace(ANCHOR_SPLIT_RULES, &build_split_rules(&input.split_apps, back))
        .replace(ANCHOR_VERIFY_RULES, &build_verify_rules());

    // 纯回国模板本就不含「美国独立IP」引用；非回国且无独立IP 时才需清理模板里的占位引用。
    if !has_indep && !back {
        yaml = strip_independent_refs(&yaml);
    }

    // DNS 覆写关闭（机场调线路后公告要求）：dns.enable → false，mihomo 不再接管 DNS
    // （fake-ip 失效，域名解析交回系统/上游）。默认保持 true 不动。
    if !input.dns_override {
        yaml = set_dns_enable(&yaml, false)?;
    }

    post_validate(&yaml)?;
    Ok(yaml)
}

/// 顶级键行判定：非缩进、非注释、非空 → 一个新顶级段开始。
/// （dns 段内部有列首注释 `# 快猫` 与空行，须跳过而不视为段结束。）
fn is_top_level_key(text: &str) -> bool {
    !text.is_empty() && !text.starts_with(' ') && !text.starts_with('\t') && !text.starts_with('#')
}

/// 在顶级 `dns:` 段内定位 `enable:` 行，返回行下标（基于 split_inclusive('\n') 的行序）。
fn find_dns_enable_index(lines: &[&str]) -> Option<usize> {
    let mut in_dns = false;
    for (i, raw) in lines.iter().enumerate() {
        let text = raw.trim_end_matches(['\r', '\n']);
        if is_top_level_key(text) {
            in_dns = text == "dns:";
            continue;
        }
        if in_dns && text.trim_start().starts_with("enable:") {
            return Some(i);
        }
    }
    None
}

/// DNS 覆写开关：把顶级 dns 段的 `enable:` 行改成目标值。
/// 与本模块纪律一致：纯文本行替换，绝不 load→dump（保注释与 YAML 锚点）。
pub fn set_dns_enable(yaml: &str, enable: bool) -> Result<String, String> {
    let lines: Vec<&str> = yaml.split_inclusive('\n').collect();
    let idx = find_dns_enable_index(&lines)
        .ok_or_else(|| "未找到 dns 段的 enable 行（此 yaml 可能不是本工具生成的）".to_string())?;
    let text = lines[idx].trim_end_matches(['\r', '\n']);
    let ending = &lines[idx][text.len()..];
    let indent = &text[..text.len() - text.trim_start().len()];
    let mut out = String::with_capacity(yaml.len() + 1);
    for (i, line) in lines.iter().enumerate() {
        if i == idx {
            out.push_str(indent);
            out.push_str(if enable { "enable: true" } else { "enable: false" });
            out.push_str(ending);
        } else {
            out.push_str(line);
        }
    }
    Ok(out)
}

/// 读取 yaml 的 DNS 覆写状态：顶级 dns 段 enable 的值（无 dns 段/无 enable 行视为关）。
pub fn parse_dns_override(yaml: &str) -> bool {
    let lines: Vec<&str> = yaml.split_inclusive('\n').collect();
    match find_dns_enable_index(&lines) {
        Some(i) => lines[i].contains("true"),
        None => false,
    }
}

fn build_provider_block(airport: &Airport) -> String {
    // 首行不带缩进（由模板/join 提供 2 空格）；内部行带绝对缩进。
    format!(
        "{name}:\n    url: \"{url}\"\n    type: http\n    interval: 86400\n    health-check:\n      enable: true\n      url: https://www.gstatic.com/generate_204\n      interval: 300\n    proxy: 直连",
        name = airport.name.trim(),
        url = airport.url.trim(),
    )
}

fn build_node_line(node: &IndependentNode) -> String {
    let mut s = format!(
        "- {{name: {name}, type: {proto}, server: {server}, port: {port}, username: {user}, password: {pass}, dialer-proxy: {dialer}",
        name = node.name.trim(),
        proto = node.protocol.trim(),
        server = yaml_dq(node.server.trim()),
        port = node.port,
        user = yaml_dq(&node.username),
        pass = yaml_dq(&node.password),
        dialer = node.dialer_proxy.trim(),
    );
    if node.protocol.trim() == "http" && node.tls.unwrap_or(false) {
        s.push_str(", tls: true");
    }
    // 独立IP=美国住宅 → 加美国国旗图标（zashboard 在下拉里显示）。
    s.push_str(", icon: \"https://gh-proxy.com/raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/us.svg\"");
    s.push('}');
    s
}

fn build_claude_group(has_indep: bool, primary: &str) -> String {
    if has_indep {
        // 美国独立IP 置首位 → 配合 profile.store-selected，新配置默认选中它。各 APP 组由 build_split_groups 另行注入。
        format!(
            "- {{name: Claude, type: select, proxies: [{primary}, 直连, 所有-手动, 所有-自动, 香港-自动, 台湾-自动, 日本-自动, 新加坡-自动, 韩国-自动, 美国-自动, 其他-自动, 拒绝]}}"
        )
    } else {
        // 无独立 IP：Claude 走机场美国节点。
        "- {name: Claude, type: select, proxies: [美国-自动, 直连, 所有-手动, 所有-自动, 香港-自动, 台湾-自动, 日本-自动, 新加坡-自动, 韩国-自动, 其他-自动, 拒绝]}".to_string()
    }
}

/// 无独立 IP 时，删掉模板各策略组里对「美国独立IP」的引用（节点未注入，留着会让 mihomo 报错）。
fn strip_independent_refs(yaml: &str) -> String {
    yaml.replace(",美国独立IP", "")
        .replace("美国独立IP,", "")
        .replace(", 美国独立IP", "")
        .replace("美国独立IP, ", "")
}

fn build_top_rules() -> String {
    // 置顶规则（必须在 RULE-SET,TEST 之前命中，否则回显域名被 Check.list 抢去走机场）：
    //   验证回显域名 → Claude（→ 美国独立IP），供出口 IP 校验。
    VERIFY_DOMAINS
        .iter()
        .map(|d| format!("- DOMAIN,{d},Claude"))
        .collect::<Vec<_>>()
        .join("\n  ")
}

fn build_verify_rules() -> String {
    // 验证回显规则已移到置顶（build_top_rules），底部不再注入（否则被 RULE-SET,TEST 抢先匹配）。
    String::new()
}

/// 回国类 App 集合（国外访问国内）：默认出口=回国-自动；纯回国模式下也只处理这些 App。
/// 注意 `allcn`（全部国内网站）在此集合内，但纯回国模式会单独排除它（模板已含 China→回国 兜底）。
const BACK_APPS: &[&str] = &[
    "netease", "qqmusic", "bilibili", "iqiyi", "youku", "qqvideo", "mgtv", "migu", "ximalaya",
    "douyin", "weread", "xiaohongshu", "weibo", "zhihu", "kuaishou", "baidu", "qq", "wangyi",
    "douban", "kugou", "kuwo", "allcn",
];

/// 傻瓜式分流（APP 级）：把每个启用 APP 的域名规则置顶路由到「该 APP 自己的策略组」（组名=app.name，
/// 在 Claude/TEST/兜底之前命中）。每组默认出口由 build_split_groups 按 relay/类别预选，用户可在 zashboard 逐个切换。
/// 复用模板已有 rule-provider 名（带 ` / Domain`/` / IP` 后缀）；无 provider 的站点内联 DOMAIN-SUFFIX。
fn build_split_rules(apps: &[SplitApp], back_cn_only: bool) -> String {
    let mut rules: Vec<String> = Vec::new();
    for app in apps {
        let key = app.key.as_str();
        // 纯回国模式：只生成回国类 App 的规则；allcn 跳过（模板已含 China→回国 兜底）；其余 App 忽略。
        if back_cn_only && (!BACK_APPS.contains(&key) || key == "allcn") {
            continue;
        }
        let t = app.name.as_str(); // 目标 = 该 APP 自己的策略组（组名即 app.name）
        match key {
            // 核心 AI 服务：RULE-SET（外部维护）+ 内联域名兜底（规则集源失效时分流不静默丢失）。
            "chatgpt" => {
                rules.push(format!("- RULE-SET,ChatGPT / Domain,{t}"));
                // sora.com 为 Sora 独立域名，外部规则集未必收录，内联补上。
                for d in ["openai.com", "chatgpt.com", "oaistatic.com", "sora.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "gemini" => {
                rules.push(format!("- RULE-SET,Gemini / Domain,{t}"));
                rules.push(format!("- DOMAIN-SUFFIX,gemini.google.com,{t}"));
            }
            "perplexity" => {
                rules.push(format!("- RULE-SET,Perplexity / Domain,{t}"));
                rules.push(format!("- DOMAIN-SUFFIX,perplexity.ai,{t}"));
            }
            "metaai" => {
                rules.push(format!("- RULE-SET,Meta AI / Domain,{t}"));
                rules.push(format!("- DOMAIN-SUFFIX,meta.ai,{t}"));
            }
            "copilot" => {
                rules.push(format!("- RULE-SET,Copilot / Domain,{t}"));
                rules.push(format!("- DOMAIN-SUFFIX,copilot.microsoft.com,{t}"));
            }
            "tapnow" => rules.push(format!("- DOMAIN-SUFFIX,tapnow.ai,{t}")),
            // 自家官网：DOMAIN-SUFFIX 一条覆盖 www / 裸域 / 全部子域。
            "maxsacademy" => rules.push(format!("- DOMAIN-SUFFIX,maxsacademy.com,{t}")),
            "midjourney" => rules.push(format!("- DOMAIN-SUFFIX,midjourney.com,{t}")),
            "grok" => {
                for d in ["grok.com", "x.ai"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "cursor" => {
                for d in ["cursor.com", "cursor.sh"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "instagram" => {
                for d in ["instagram.com", "cdninstagram.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "discord" => {
                // discord.media 是语音服务域名，缺了会「能聊天不能语音」。
                for d in ["discord.com", "discordapp.com", "discord.gg", "discordapp.net", "discord.media"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "reddit" => {
                for d in ["reddit.com", "redd.it", "redditstatic.com", "redditmedia.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "youtube" => rules.push(format!("- RULE-SET,Youtube / Domain,{t}")),
            "netflix" => {
                rules.push(format!("- RULE-SET,Netflix / Domain,{t}"));
                rules.push(format!("- RULE-SET,Netflix / IP,{t},no-resolve"));
            }
            "disney" => rules.push(format!("- RULE-SET,Disney / Domain,{t}")),
            "hbo" => rules.push(format!("- RULE-SET,HBO / Domain,{t}")),
            "spotify" => rules.push(format!("- RULE-SET,Spotify / Domain,{t}")),
            "tiktok" => {
                // 拦 TikTok QUIC（UDP 443）：同 1.2.5 B站手法 —— App 用 QUIC 直连做区域检测
                // 会绕过 TCP 代理泄漏真实 IP，拦掉逼它回退 TCP 走代理。
                for d in ["tiktok.com", "tiktokv.com", "tiktokcdn.com"] {
                    rules.push(format!("- AND,((NETWORK,UDP),(DOMAIN-SUFFIX,{d})),REJECT-DROP"));
                }
                rules.push(format!("- RULE-SET,TikTok / Domain,{t}"));
            }
            "binance" => rules.push(format!("- RULE-SET,Binance / Domain,{t}")),
            "okx" => rules.push(format!("- RULE-SET,OKX / Domain,{t}")),
            "bybit" => rules.push(format!("- RULE-SET,Bybit / Domain,{t}")),
            "coinbase" => {
                for d in ["coinbase.com", "coinbase.net", "cbhq.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "kraken" => {
                for d in ["kraken.com", "krakenfx.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "cryptocom" => rules.push(format!("- DOMAIN-SUFFIX,crypto.com,{t}")),
            "geminiex" => rules.push(format!("- DOMAIN-SUFFIX,gemini.com,{t}")),
            "kucoin" => rules.push(format!("- DOMAIN-SUFFIX,kucoin.com,{t}")),
            "gate" => {
                for d in ["gate.io", "gate.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "bitget" => rules.push(format!("- DOMAIN-SUFFIX,bitget.com,{t}")),
            "artstation" => {
                for d in ["artstation.com", "artstation.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "pinterest" => {
                for d in ["pinterest.com", "pinimg.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "behance" => rules.push(format!("- DOMAIN-SUFFIX,behance.net,{t}")),
            "sketchfab" => rules.push(format!("- DOMAIN-SUFFIX,sketchfab.com,{t}")),
            "cgtrader" => rules.push(format!("- DOMAIN-SUFFIX,cgtrader.com,{t}")),
            "turbosquid" => rules.push(format!("- DOMAIN-SUFFIX,turbosquid.com,{t}")),
            "quixel" => rules.push(format!("- DOMAIN-SUFFIX,quixel.com,{t}")),
            "gumroad" => rules.push(format!("- DOMAIN-SUFFIX,gumroad.com,{t}")),
            "deviantart" => {
                for d in ["deviantart.com", "wixmp.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "dribbble" => rules.push(format!("- DOMAIN-SUFFIX,dribbble.com,{t}")),
            "adobe" => {
                for d in ["adobe.com", "adobe.io", "typekit.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "unrealengine" => rules.push(format!("- DOMAIN-SUFFIX,unrealengine.com,{t}")),
            "fab" => rules.push(format!("- DOMAIN-SUFFIX,fab.com,{t}")),
            "unity" => {
                for d in ["unity.com", "unity3d.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "chase" => {
                for d in ["chase.com", "jpmorganchase.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "boa" => {
                for d in ["bankofamerica.com", "bofa.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "wellsfargo" => rules.push(format!("- DOMAIN-SUFFIX,wellsfargo.com,{t}")),
            "citi" => {
                for d in ["citi.com", "citibank.com", "citicards.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "capitalone" => rules.push(format!("- DOMAIN-SUFFIX,capitalone.com,{t}")),
            "amex" => {
                for d in ["americanexpress.com", "aexp.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "discover" => rules.push(format!("- DOMAIN-SUFFIX,discover.com,{t}")),
            "usbank" => rules.push(format!("- DOMAIN-SUFFIX,usbank.com,{t}")),
            "pnc" => rules.push(format!("- DOMAIN-SUFFIX,pnc.com,{t}")),
            "ally" => rules.push(format!("- DOMAIN-SUFFIX,ally.com,{t}")),
            "shellpoint" => rules.push(format!("- DOMAIN-SUFFIX,shellpointmtg.com,{t}")),
            "newrez" => rules.push(format!("- DOMAIN-SUFFIX,newrez.com,{t}")),
            "rocket" => {
                for d in ["rocketmortgage.com", "quickenloans.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "mrcooper" => rules.push(format!("- DOMAIN-SUFFIX,mrcooper.com,{t}")),
            "pennymac" => {
                for d in ["pennymac.com", "pennymacusa.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "freedommtg" => rules.push(format!("- DOMAIN-SUFFIX,freedommortgage.com,{t}")),
            "loandepot" => rules.push(format!("- DOMAIN-SUFFIX,loandepot.com,{t}")),
            "sofi" => rules.push(format!("- DOMAIN-SUFFIX,sofi.com,{t}")),
            "sls" => rules.push(format!("- DOMAIN-SUFFIX,sls.net,{t}")),
            "carrington" => rules.push(format!("- DOMAIN-SUFFIX,carringtonms.com,{t}")),
            "salliemae" => rules.push(format!("- DOMAIN-SUFFIX,salliemae.com,{t}")),
            "navient" => rules.push(format!("- DOMAIN-SUFFIX,navient.com,{t}")),
            "statefarm" => rules.push(format!("- DOMAIN-SUFFIX,statefarm.com,{t}")),
            "geico" => rules.push(format!("- DOMAIN-SUFFIX,geico.com,{t}")),
            "progressive" => rules.push(format!("- DOMAIN-SUFFIX,progressive.com,{t}")),
            "allstate" => rules.push(format!("- DOMAIN-SUFFIX,allstate.com,{t}")),
            "usaa" => rules.push(format!("- DOMAIN-SUFFIX,usaa.com,{t}")),
            "libertymutual" => {
                for d in ["libertymutual.com", "libertymutualgroup.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "farmers" => {
                for d in ["farmers.com", "farmersinsurance.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "nationwide" => rules.push(format!("- DOMAIN-SUFFIX,nationwide.com,{t}")),
            "travelers" => rules.push(format!("- DOMAIN-SUFFIX,travelers.com,{t}")),
            "amfam" => rules.push(format!("- DOMAIN-SUFFIX,amfam.com,{t}")),
            "erie" => rules.push(format!("- DOMAIN-SUFFIX,erieinsurance.com,{t}")),
            "thehartford" => rules.push(format!("- DOMAIN-SUFFIX,thehartford.com,{t}")),
            "mercury" => rules.push(format!("- DOMAIN-SUFFIX,mercuryinsurance.com,{t}")),
            "lemonade" => rules.push(format!("- DOMAIN-SUFFIX,lemonade.com,{t}")),
            "hippo" => rules.push(format!("- DOMAIN-SUFFIX,hippo.com,{t}")),
            "schwab" => {
                for d in ["schwab.com", "schwabcdn.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "fidelity" => {
                for d in ["fidelity.com", "fmr.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "etrade" => {
                for d in ["etrade.com", "etrade.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "vanguard" => rules.push(format!("- DOMAIN-SUFFIX,vanguard.com,{t}")),
            "merrill" => {
                for d in ["merrilledge.com", "ml.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "amazon" => rules.push(format!("- RULE-SET,Amazon / Domain,{t}")),
            "ebay" => {
                for d in ["ebay.com", "ebayimg.com", "ebaystatic.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "walmart" => {
                for d in ["walmart.com", "walmartimages.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "bestbuy" => rules.push(format!("- DOMAIN-SUFFIX,bestbuy.com,{t}")),
            "target" => rules.push(format!("- DOMAIN-SUFFIX,target.com,{t}")),
            "costco" => rules.push(format!("- DOMAIN-SUFFIX,costco.com,{t}")),
            "newegg" => rules.push(format!("- DOMAIN-SUFFIX,newegg.com,{t}")),
            "homedepot" => rules.push(format!("- DOMAIN-SUFFIX,homedepot.com,{t}")),
            "irs" => rules.push(format!("- DOMAIN-SUFFIX,irs.gov,{t}")),
            "usps" => rules.push(format!("- DOMAIN-SUFFIX,usps.com,{t}")),
            "uscis" => rules.push(format!("- DOMAIN-SUFFIX,uscis.gov,{t}")),
            "ssa" => rules.push(format!("- DOMAIN-SUFFIX,ssa.gov,{t}")),
            "idme" => rules.push(format!("- DOMAIN-SUFFIX,id.me,{t}")),
            "logingov" => rules.push(format!("- DOMAIN-SUFFIX,login.gov,{t}")),
            "steam" => rules.push(format!("- RULE-SET,Steam / Domain,{t}")),
            "epic" => rules.push(format!("- RULE-SET,Epic / Domain,{t}")),
            "ea" => rules.push(format!("- RULE-SET,EA / Domain,{t}")),
            "blizzard" => rules.push(format!("- RULE-SET,Blizzard / Domain,{t}")),
            "ubisoft" => rules.push(format!("- RULE-SET,UBI / Domain,{t}")),
            "playstation" => rules.push(format!("- RULE-SET,PlayStation / Domain,{t}")),
            "nintendo" => rules.push(format!("- RULE-SET,Nintend / Domain,{t}")),
            "riot" => {
                for d in ["riotgames.com", "leagueoflegends.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "telegram" => {
                rules.push(format!("- RULE-SET,Telegram / Domain,{t}"));
                rules.push(format!("- RULE-SET,Telegram / IP,{t},no-resolve"));
            }
            "twitter" => rules.push(format!("- RULE-SET,Twitter / Domain,{t}")),
            "whatsapp" => rules.push(format!("- RULE-SET,WhatsApp / Domain,{t}")),
            "facebook" => rules.push(format!("- RULE-SET,Facebook / Domain,{t}")),
            "github" => rules.push(format!("- RULE-SET,GitHub / Domain,{t}")),
            "gitlab" => rules.push(format!("- DOMAIN-SUFFIX,gitlab.com,{t}")),
            "stackoverflow" => {
                for d in ["stackoverflow.com", "stackexchange.com", "sstatic.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "npm" => {
                for d in ["npmjs.com", "npmjs.org"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "dockerhub" => {
                for d in ["docker.com", "docker.io"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "pypi" => {
                for d in ["pypi.org", "pythonhosted.org"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "huggingface" => rules.push(format!("- DOMAIN-SUFFIX,huggingface.co,{t}")),
            "vercel" => {
                for d in ["vercel.com", "vercel.app"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "netlify" => {
                for d in ["netlify.com", "netlify.app"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "atlassian" => {
                for d in ["atlassian.com", "atlassian.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "bitbucket" => rules.push(format!("- DOMAIN-SUFFIX,bitbucket.org,{t}")),
            "replit" => rules.push(format!("- DOMAIN-SUFFIX,replit.com,{t}")),
            "google" => {
                rules.push(format!("- RULE-SET,Google / Domain,{t}"));
                rules.push(format!("- RULE-SET,Google / IP,{t},no-resolve"));
            }
            // Google Play 必须在 google 之前命中（catalog 里已置于 google 上方），否则 play.google.com 被 geosite:google 抢走。
            "googleplay" => {
                for d in ["play.google.com", "play.googleapis.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "twitch" => {
                for d in ["twitch.tv", "ttvnw.net", "jtvnw.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "therookies" => rules.push(format!("- DOMAIN-SUFFIX,therookies.co,{t}")),
            "figma" => rules.push(format!("- DOMAIN-SUFFIX,figma.com,{t}")),
            "expedia" => rules.push(format!("- DOMAIN-SUFFIX,expedia.com,{t}")),
            "apple" => rules.push(format!("- RULE-SET,Apple / Domain,{t}")),
            "microsoft" => rules.push(format!("- RULE-SET,Microsoft / Domain,{t}")),
            "perforce" => rules.push(format!("- DOMAIN,perforce-maxs.ddns.me,{t}")),
            "parsec" => {
                for d in ["parsec.app", "parsecgaming.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "robinhood" => rules.push(format!("- DOMAIN-SUFFIX,robinhood.com,{t}")),
            "webull" => {
                for d in ["webull.com", "webullfintech.com", "webullbroker.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "ibkr" => {
                for d in ["interactivebrokers.com", "ibkr.com", "ibkrguides.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            // 回国分流（国外访问国内 · 走回国节点）：国内 App 域名先命中 → 回国组，不被 China→国内→直连 抢走。
            "netease" => {
                for d in ["music.163.com", "126.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "qqmusic" => {
                for d in ["y.qq.com", "music.qq.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "bilibili" => {
                // 番剧需完整：biliapi.com(.com 后缀=番剧 API) + 视频 CDN 各后缀（参考 elysias123/bilibili-rule）。
                for d in [
                    "bilibili.com", "biliapi.net", "biliapi.com", "hdslb.com",
                    "bilivideo.com", "bilivideo.cn", "acgvideo.com",
                ] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "iqiyi" => {
                for d in ["iqiyi.com", "iqiyipic.com", "qy.net"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "youku" => {
                for d in ["youku.com", "ykimg.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "qqvideo" => rules.push(format!("- DOMAIN-SUFFIX,v.qq.com,{t}")),
            "mgtv" => {
                for d in ["mgtv.com", "hitv.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "migu" => {
                for d in ["migu.cn", "miguvideo.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "ximalaya" => {
                for d in ["ximalaya.com", "xmcdn.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "douyin" => {
                for d in ["douyin.com", "douyinpic.com", "amemv.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "weread" => rules.push(format!("- DOMAIN-SUFFIX,weread.qq.com,{t}")),
            "xiaohongshu" => {
                for d in ["xiaohongshu.com", "xhscdn.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "weibo" => {
                for d in ["weibo.com", "weibo.cn", "sinaimg.cn"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "zhihu" => {
                for d in ["zhihu.com", "zhimg.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "kuaishou" => {
                for d in ["kuaishou.com", "gifshow.com", "kwimgs.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            // 百度（搜索 + 网盘）：百度系主域较广，置于 China 兜底之前即可命中回国组。
            "baidu" => {
                for d in ["baidu.com", "bdstatic.com", "bdimg.com", "baidupcs.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            // QQ（含微信等腾讯系）：qq.com 较广，但排在 qqmusic/qqvideo/weread 的具体域名之后，故那几个仍走各自组。
            "qq" => {
                for d in ["qq.com", "qlogo.cn"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            // 网易（新闻/邮箱）：163.com 较广，排在 netease(music.163.com) 之后，网易云音乐仍走自己组。
            "wangyi" => {
                for d in ["163.com", "163.net", "126.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "douban" => {
                for d in ["douban.com", "doubanio.com"] {
                    rules.push(format!("- DOMAIN-SUFFIX,{d},{t}"));
                }
            }
            "kugou" => rules.push(format!("- DOMAIN-SUFFIX,kugou.com,{t}")),
            "kuwo" => rules.push(format!("- DOMAIN-SUFFIX,kuwo.cn,{t}")),
            // 全部国内网站（可选 · 默认关）：复用模板已有 China geosite/geoip 规则集，整体指向回国组。
            // 注入点在底部 China→国内 之前，勾上即「所有 .cn + 中国 IP → 回国节点」。
            "allcn" => {
                rules.push(format!("- RULE-SET,China / Domain,{t}"));
                rules.push(format!("- RULE-SET,China / IP,{t},no-resolve"));
            }
            _ => {}
        }
    }
    rules.join("\n  ")
}

/// 策略组图标：用 icon.horse 按域名取每个 APP 的真实 logo（zashboard 渲染 `icon` 字段）。
/// 之前用 Google favicon，但 Google 抓不到小红书/抖音等国内站（返回地球占位图）；icon.horse 对
/// 国内外站点都能正确返回图标（实测覆盖小红书/抖音/知乎/阿里云盘等）。如要换源改这两行即可。
const FAVICON_PREFIX: &str = "https://icon.horse/icon/";
const FAVICON_SUFFIX: &str = "";

/// APP key → 取图标用的代表域名（与 build_split_rules 的路由域名一致或同品牌主域）。
const ICON_DOMAINS: &[(&str, &str)] = &[
    ("chatgpt", "openai.com"),
    ("gemini", "gemini.google.com"),
    ("perplexity", "perplexity.ai"),
    ("metaai", "meta.ai"),
    ("copilot", "copilot.microsoft.com"),
    ("tapnow", "tapnow.ai"),
    ("maxsacademy", "maxsacademy.com"),
    ("midjourney", "midjourney.com"),
    ("grok", "grok.com"),
    ("cursor", "cursor.com"),
    ("instagram", "instagram.com"),
    ("discord", "discord.com"),
    ("reddit", "reddit.com"),
    ("google", "google.com"),
    ("googleplay", "play.google.com"),
    ("twitch", "twitch.tv"),
    ("therookies", "therookies.co"),
    ("figma", "figma.com"),
    ("expedia", "expedia.com"),
    ("apple", "apple.com"),
    ("microsoft", "microsoft.com"),
    ("youtube", "youtube.com"),
    ("netflix", "netflix.com"),
    ("disney", "disneyplus.com"),
    ("hbo", "max.com"),
    ("spotify", "spotify.com"),
    ("robinhood", "robinhood.com"),
    ("webull", "webull.com"),
    ("ibkr", "interactivebrokers.com"),
    ("schwab", "schwab.com"),
    ("fidelity", "fidelity.com"),
    ("etrade", "etrade.com"),
    ("vanguard", "vanguard.com"),
    ("merrill", "merrilledge.com"),
    ("coinbase", "coinbase.com"),
    ("kraken", "kraken.com"),
    ("geminiex", "gemini.com"),
    ("cryptocom", "crypto.com"),
    ("binance", "binance.com"),
    ("okx", "okx.com"),
    ("bybit", "bybit.com"),
    ("kucoin", "kucoin.com"),
    ("gate", "gate.io"),
    ("bitget", "bitget.com"),
    ("perforce", "perforce.com"),
    ("parsec", "parsec.app"),
    ("tiktok", "tiktok.com"),
    ("telegram", "telegram.org"),
    ("twitter", "x.com"),
    ("whatsapp", "whatsapp.com"),
    ("facebook", "facebook.com"),
    ("github", "github.com"),
    ("gitlab", "gitlab.com"),
    ("stackoverflow", "stackoverflow.com"),
    ("npm", "npmjs.com"),
    ("dockerhub", "docker.com"),
    ("pypi", "pypi.org"),
    ("huggingface", "huggingface.co"),
    ("vercel", "vercel.com"),
    ("netlify", "netlify.com"),
    ("atlassian", "atlassian.com"),
    ("bitbucket", "bitbucket.org"),
    ("replit", "replit.com"),
    ("artstation", "artstation.com"),
    ("pinterest", "pinterest.com"),
    ("behance", "behance.net"),
    ("sketchfab", "sketchfab.com"),
    ("cgtrader", "cgtrader.com"),
    ("turbosquid", "turbosquid.com"),
    ("quixel", "quixel.com"),
    ("gumroad", "gumroad.com"),
    ("deviantart", "deviantart.com"),
    ("dribbble", "dribbble.com"),
    ("adobe", "adobe.com"),
    ("unrealengine", "unrealengine.com"),
    ("fab", "fab.com"),
    ("unity", "unity.com"),
    ("chase", "chase.com"),
    ("boa", "bankofamerica.com"),
    ("wellsfargo", "wellsfargo.com"),
    ("citi", "citi.com"),
    ("capitalone", "capitalone.com"),
    ("amex", "americanexpress.com"),
    ("discover", "discover.com"),
    ("usbank", "usbank.com"),
    ("pnc", "pnc.com"),
    ("ally", "ally.com"),
    ("shellpoint", "shellpointmtg.com"),
    ("newrez", "newrez.com"),
    ("rocket", "rocketmortgage.com"),
    ("mrcooper", "mrcooper.com"),
    ("pennymac", "pennymac.com"),
    ("freedommtg", "freedommortgage.com"),
    ("loandepot", "loandepot.com"),
    ("sofi", "sofi.com"),
    ("sls", "sls.net"),
    ("carrington", "carringtonms.com"),
    ("salliemae", "salliemae.com"),
    ("navient", "navient.com"),
    ("statefarm", "statefarm.com"),
    ("geico", "geico.com"),
    ("progressive", "progressive.com"),
    ("allstate", "allstate.com"),
    ("usaa", "usaa.com"),
    ("libertymutual", "libertymutual.com"),
    ("farmers", "farmers.com"),
    ("nationwide", "nationwide.com"),
    ("travelers", "travelers.com"),
    ("amfam", "amfam.com"),
    ("erie", "erieinsurance.com"),
    ("thehartford", "thehartford.com"),
    ("mercury", "mercuryinsurance.com"),
    ("lemonade", "lemonade.com"),
    ("hippo", "hippo.com"),
    ("amazon", "amazon.com"),
    ("ebay", "ebay.com"),
    ("walmart", "walmart.com"),
    ("bestbuy", "bestbuy.com"),
    ("target", "target.com"),
    ("costco", "costco.com"),
    ("newegg", "newegg.com"),
    ("homedepot", "homedepot.com"),
    ("irs", "irs.gov"),
    ("usps", "usps.com"),
    ("uscis", "uscis.gov"),
    ("ssa", "ssa.gov"),
    ("idme", "id.me"),
    ("logingov", "login.gov"),
    ("steam", "steampowered.com"),
    ("epic", "epicgames.com"),
    ("ea", "ea.com"),
    ("blizzard", "blizzard.com"),
    ("ubisoft", "ubisoft.com"),
    ("playstation", "playstation.com"),
    ("nintendo", "nintendo.com"),
    ("riot", "riotgames.com"),
    // 回国（国外访问国内）
    ("netease", "music.163.com"),
    ("qqmusic", "y.qq.com"),
    ("bilibili", "bilibili.com"),
    ("iqiyi", "iqiyi.com"),
    ("youku", "youku.com"),
    ("qqvideo", "v.qq.com"),
    ("mgtv", "mgtv.com"),
    ("migu", "migu.cn"),
    ("ximalaya", "ximalaya.com"),
    ("douyin", "douyin.com"),
    ("weread", "weread.qq.com"),
    ("xiaohongshu", "xiaohongshu.com"),
    ("weibo", "weibo.com"),
    ("zhihu", "zhihu.com"),
    ("kuaishou", "kuaishou.com"),
    ("baidu", "baidu.com"),
    ("qq", "qq.com"),
    ("wangyi", "163.com"),
    ("douban", "douban.com"),
    ("kugou", "kugou.com"),
    ("kuwo", "kuwo.cn"),
    // allcn（全部国内网站）无单一域名图标，留空（build_split_groups 优雅降级）。
];

fn icon_domain(key: &str) -> Option<&'static str> {
    ICON_DOMAINS.iter().find(|(k, _)| *k == key).map(|(_, d)| *d)
}

/// 每个 APP 的默认出口（select 组首位=zashboard 导入后默认选中的节点）。固定映射（用户指定）：
/// 直连=Apple/Microsoft；回国-自动=国内 App（网易云/B站/爱奇艺…，国外访问国内）；台湾-自动=离岸加密交易所；
/// 香港-自动=流媒体/社媒/开发者/设计/游戏/Google/Perforce；
/// 其余（AI/券商/银行/房贷/保险/购物/政府/美国加密/TikTok/Unity）=美国独立IP（无独立IP时退回美国-自动）。
fn default_exit(key: &str, has_indep: bool) -> &'static str {
    const HK: &[&str] = &[
        "google", "perforce", "youtube", "netflix", "disney", "hbo", "spotify", "twitch", "therookies", "figma", "tapnow", "maxsacademy",
        "telegram", "twitter", "whatsapp", "facebook", "instagram", "discord", "reddit", "github", "gitlab",
        "stackoverflow", "npm", "dockerhub", "pypi", "huggingface", "vercel",
        "netlify", "atlassian", "bitbucket", "replit", "artstation", "pinterest",
        "behance", "sketchfab", "cgtrader", "turbosquid", "quixel", "gumroad",
        "deviantart", "dribbble", "adobe", "unrealengine", "fab", "steam", "epic",
        "ea", "blizzard", "ubisoft", "playstation", "nintendo", "riot",
    ];
    const TW: &[&str] = &["binance", "okx", "bybit", "kucoin", "gate", "bitget"];
    const DIRECT: &[&str] = &["apple", "microsoft"];
    if DIRECT.contains(&key) {
        "直连"
    } else if BACK_APPS.contains(&key) {
        "回国-自动"
    } else if TW.contains(&key) {
        "台湾-自动"
    } else if HK.contains(&key) {
        "香港-自动"
    } else if has_indep {
        "美国独立IP"
    } else {
        "美国-自动"
    }
}

/// 傻瓜式分流（APP 级）：为每个启用的 APP 生成一个独立 select 策略组（组名=app.name），
/// proxies 是完整出口菜单、默认出口（首位）按 default_exit 的固定映射预选；用户在 zashboard 里逐个切换。
fn build_split_groups(apps: &[SplitApp], has_indep: bool, back_cn_only: bool) -> String {
    // 完整出口菜单（用户逐 APP 自选）。纯回国模式只保留回国相关组；无独立 IP 时去掉「美国独立IP」。
    let menu: &[&str] = if back_cn_only {
        &["回国-自动", "所有-自动", "所有-手动", "直连", "拒绝"]
    } else if has_indep {
        &[
            "美国独立IP", "美国-自动", "香港-自动", "台湾-自动", "日本-自动", "新加坡-自动",
            "韩国-自动", "回国-自动", "所有-手动", "所有-自动", "直连", "其他-自动", "拒绝",
        ]
    } else {
        &[
            "美国-自动", "香港-自动", "台湾-自动", "日本-自动", "新加坡-自动", "韩国-自动",
            "回国-自动", "所有-手动", "所有-自动", "直连", "其他-自动", "拒绝",
        ]
    };
    let mut groups: Vec<String> = Vec::new();
    for app in apps {
        let key = app.key.as_str();
        // 纯回国模式：只为回国类 App 生成组；allcn 跳过（走模板 China→回国 兜底）；其余 App 忽略。
        if back_cn_only && (!BACK_APPS.contains(&key) || key == "allcn") {
            continue;
        }
        // 默认出口（首位=zashboard 导入后默认选中）：纯回国一律回国-自动，否则按 default_exit 固定映射。
        let primary: &str = if back_cn_only { "回国-自动" } else { default_exit(key, has_indep) };
        let mut proxies: Vec<&str> = vec![primary];
        for &p in menu {
            if p != primary {
                proxies.push(p);
            }
        }
        // 图标：按域名取 favicon；无映射则不带 icon（优雅降级）。
        let icon_seg = match icon_domain(key) {
            Some(d) => format!(" icon: \"{FAVICON_PREFIX}{d}{FAVICON_SUFFIX}\","),
            None => String::new(),
        };
        groups.push(format!(
            "- {{name: \"{name}\", type: select,{icon_seg} proxies: [{list}]}}",
            name = app.name,
            list = proxies.join(", ")
        ));
    }
    groups.join("\n  ")
}

/// YAML 双引号标量：转义 `\` 与 `"`。配合 validate_input 已禁止控制字符/换行。
fn yaml_dq(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

// ---------- 校验（设计 §6.1 校验清单）----------

fn validate_input(input: &GenerateInput) -> Result<(), String> {
    if input.airports.is_empty() {
        return Err("至少需要一个机场订阅。".into());
    }
    let mut seen_names: HashSet<String> = HashSet::new();
    for (i, a) in input.airports.iter().enumerate() {
        let idx = i + 1;
        check_simple_name(&a.name, &format!("第 {idx} 个机场的名称"))?;
        let name = a.name.trim().to_string();
        if !seen_names.insert(name.clone()) {
            return Err(format!("机场名称重复：{name}（每个机场名字必须唯一）。"));
        }
        let url = a.url.trim();
        if url.is_empty() {
            return Err(format!("第 {idx} 个机场：订阅链接不能为空。"));
        }
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return Err(format!("第 {idx} 个机场：订阅链接需以 http:// 或 https:// 开头。"));
        }
        if url.contains('"') || url.chars().any(|c| c.is_control()) {
            return Err(format!("第 {idx} 个机场：订阅链接含非法字符（引号 / 控制字符 / 换行）。"));
        }
    }

    // 独立 IP 可选（用户可关掉开关、直接走机场）。为空则跳过下面的逐项校验。
    for (i, n) in input.independent_nodes.iter().enumerate() {
        let idx = i + 1;
        let proto = n.protocol.trim();
        if proto != "socks5" && proto != "http" {
            return Err(format!("第 {idx} 个节点：协议必须是 socks5 或 http。"));
        }
        check_simple_name(&n.name, &format!("第 {idx} 个节点的名称"))?;
        check_simple_name(&n.dialer_proxy, &format!("第 {idx} 个节点的 dialer-proxy 组名"))?;

        let server = n.server.trim();
        if server.is_empty() {
            return Err(format!("第 {idx} 个节点：独立 IP server 不能为空。"));
        }
        if server.contains(char::is_whitespace) || server.contains('"') {
            return Err(format!("第 {idx} 个节点：server 含非法字符（空白 / 引号）。"));
        }
        if n.port == 0 {
            return Err(format!("第 {idx} 个节点：端口非法（应为 1-65535）。"));
        }
        if n.username.is_empty() {
            return Err(format!("第 {idx} 个节点：用户名不能为空（账密模式）。"));
        }
        if n.password.is_empty() {
            return Err(format!("第 {idx} 个节点：密码不能为空（账密模式）。"));
        }
        forbid_controls(&n.username, &format!("第 {idx} 个节点的用户名"))?;
        forbid_controls(&n.password, &format!("第 {idx} 个节点的密码"))?;
    }

    // 分流 APP 组名校验：组名同时用作策略组名 + 规则目标，禁止破坏 YAML/规则的字符。
    for app in &input.split_apps {
        let name = app.name.trim();
        if name.is_empty() {
            return Err(format!("分流 APP「{}」的策略组名为空。", app.key));
        }
        if name
            .chars()
            .any(|c| matches!(c, ',' | '"' | '{' | '}' | '[' | ']') || c.is_control())
        {
            return Err(format!("分流 APP 组名含非法字符（, \" {{ }} [ ] 或控制字符）：{name}"));
        }
    }
    Ok(())
}

fn forbid_controls(s: &str, label: &str) -> Result<(), String> {
    if s.chars().any(|c| c.is_control()) {
        return Err(format!("{label}包含控制字符 / 换行，非法。"));
    }
    Ok(())
}

fn check_simple_name(s: &str, label: &str) -> Result<(), String> {
    let s = s.trim();
    if s.is_empty() {
        return Err(format!("{label}不能为空。"));
    }
    if s.chars()
        .any(|c| matches!(c, ',' | '{' | '}' | '[' | ']' | '"' | ':' | '#' | '&' | '*') || c.is_control())
    {
        return Err(format!("{label}含非法字符（, {{ }} [ ] \" : # & * 或控制字符）。"));
    }
    Ok(())
}

/// 注入后体检：锚点全部替换 + yaml 语法可解析（仅 parse，不回写）。
fn post_validate(yaml: &str) -> Result<(), String> {
    for token in ANCHOR_TOKENS {
        if yaml.contains(token) {
            return Err(format!("注入失败：锚点「{token}」未被替换（模板可能损坏）。"));
        }
    }
    serde_yaml::from_str::<serde_yaml::Value>(yaml)
        .map_err(|e| format!("注入后 yaml 语法异常：{e}"))?;
    Ok(())
}

// ---------- 从成品 yaml 解析回元信息（端口/API，不写死）----------

/// 返回 (mixed_port, clash_api_url, clash_secret)。
/// external-controller 形如 `0.0.0.0:9090` → API URL 用 127.0.0.1 连本机。
pub fn parse_meta(yaml: &str) -> Result<(u16, String, String), String> {
    let mixed = find_scalar(yaml, "mixed-port").ok_or("成品 yaml 缺少 mixed-port。")?;
    let mixed_port: u16 = mixed
        .trim()
        .parse()
        .map_err(|_| format!("mixed-port 非法：{mixed}"))?;

    let ec =
        find_scalar(yaml, "external-controller").ok_or("成品 yaml 缺少 external-controller。")?;
    let ec_port = ec.rsplit(':').next().unwrap_or("").trim();
    if ec_port.parse::<u16>().is_err() {
        return Err(format!("external-controller 端口非法：{ec}"));
    }
    let clash_api_url = format!("http://127.0.0.1:{ec_port}");

    let secret = find_scalar(yaml, "secret").unwrap_or_default();
    Ok((mixed_port, clash_api_url, secret))
}

/// 在顶层（或任意缩进）按 `key:` 取标量值，去掉首尾引号。返回首个匹配。
fn find_scalar(yaml: &str, key: &str) -> Option<String> {
    for line in yaml.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(val) = rest.strip_prefix(':') {
                let v = val.trim().trim_matches('"');
                return Some(v.to_string());
            }
        }
    }
    None
}

/// 从成品 yaml 提取基准 IP（独立 IP 节点的 server）。用于「导入已有 yaml」。
/// 先从 Claude 组取首选节点名，再定位该节点的 server。
pub fn extract_basis_ip(yaml: &str) -> Result<String, String> {
    let claude_line = yaml
        .lines()
        .find(|l| l.contains("name: Claude") && l.contains("proxies: ["))
        .ok_or("yaml 里找不到 Claude 策略组（可能不是本软件生成的配置）。")?;
    let after = claude_line
        .split("proxies: [")
        .nth(1)
        .ok_or("Claude 组格式异常。")?;
    let primary = after
        .split(|c: char| c == ',' || c == ']')
        .next()
        .unwrap_or("")
        .trim();
    if primary.is_empty() {
        return Err("Claude 组里没有可用节点。".into());
    }
    let needle = format!("name: {primary},");
    let node_line = yaml
        .lines()
        .find(|l| l.contains(&needle) && l.contains("server:"))
        .ok_or_else(|| format!("yaml 里找不到节点「{primary}」的 server（可能不是本软件生成的配置）。"))?;
    let server = flow_field(node_line, "server").ok_or("解析独立 IP 节点的 server 失败。")?;
    if server.is_empty() {
        return Err("独立 IP 节点的 server 为空。".into());
    }
    Ok(server)
}

/// 从一行 flow 映射 `{... key: value, ...}` 取某字段值（去引号）。
fn flow_field(line: &str, key: &str) -> Option<String> {
    let needle = format!("{key}:");
    let pos = line.find(&needle)? + needle.len();
    let rest = &line[pos..];
    let end = rest.find(|c: char| c == ',' || c == '}').unwrap_or(rest.len());
    Some(rest[..end].trim().trim_matches('"').to_string())
}

/// 解析 proxy-providers 段里的机场 (name, url)。用于「当前配置」展示。
pub fn parse_airports(yaml: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut in_section = false;
    let mut cur_name: Option<String> = None;
    for raw in yaml.lines() {
        let trimmed = raw.trim();
        let indent = raw.len() - raw.trim_start().len();
        if indent == 0 {
            if trimmed.starts_with("proxy-providers:") {
                in_section = true;
                cur_name = None;
                continue;
            }
            if in_section && !trimmed.is_empty() && !trimmed.starts_with('#') {
                break; // 下一个顶层 key → providers 段结束
            }
            continue;
        }
        if !in_section {
            continue;
        }
        if indent == 2 && trimmed.ends_with(':') && !trimmed.starts_with('#') {
            cur_name = Some(trimmed.trim_end_matches(':').trim().to_string());
        } else if trimmed.starts_with("url:") {
            // 每个机场只取首个 url（provider 的 url，排除 health-check 的 url）。
            if let Some(name) = cur_name.take() {
                let url = trimmed["url:".len()..].trim().trim_matches('"').to_string();
                out.push((name, url));
            }
        }
    }
    out
}

/// 解析注入的中转站节点 (name, server, protocol, port)。靠 dialer-proxy 标记识别（不取密码）。
pub fn parse_nodes(yaml: &str) -> Vec<(String, String, String, String)> {
    let mut out = Vec::new();
    for raw in yaml.lines() {
        let t = raw.trim();
        if t.starts_with("- {") && t.contains("dialer-proxy:") {
            let name = flow_field(t, "name").unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let server = flow_field(t, "server").unwrap_or_default();
            let protocol = flow_field(t, "type").unwrap_or_default();
            let port = flow_field(t, "port").unwrap_or_default();
            out.push((name, server, protocol, port));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> GenerateInput {
        GenerateInput {
            airports: vec![Airport {
                name: "Nice".into(),
                url: "http://8.134.143.129:5988/s/abc".into(),
            }],
            independent_nodes: vec![IndependentNode {
                name: "美国独立IP".into(),
                protocol: "socks5".into(),
                server: "207.97.137.112".into(),
                port: 443,
                username: "user1".into(),
                // 故意带引号与逗号，压测转义 + 解析。
                password: "p@ss\"w,d".into(),
                tls: None,
                exit_ip: None,
                dialer_proxy: "美国-自动".into(),
            }],
            split_apps: vec![],
            back_cn_only: false,
            dns_override: true,
        }
    }

    #[test]
    fn dns_override_on_keeps_dns_enabled() {
        let y = inject(&sample()).unwrap();
        assert!(parse_dns_override(&y), "默认应保持 DNS 覆写开启（dns.enable: true）");
    }

    #[test]
    fn dns_override_off_disables_dns_section() {
        let mut s = sample();
        s.dns_override = false;
        let y = inject(&s).unwrap();
        assert!(!parse_dns_override(&y), "关闭覆写后 dns.enable 应为 false");
        // CI 的 Windows runner autocrlf 会把模板 checkout 成 CRLF：断言前归一化行结尾。
        let n = y.replace("\r\n", "\n");
        assert!(n.contains("dns:\n  enable: false"), "应只改 dns 段的 enable 行");
        // 其余 enable（proxy-provider health-check / tun）不受影响。
        assert!(n.contains("tun:\n  enable: true"), "tun 段的 enable 不能被误改");
    }

    #[test]
    fn dns_override_off_works_in_backcn_mode() {
        let mut s = sample();
        s.back_cn_only = true;
        s.independent_nodes = vec![];
        s.dns_override = false;
        let y = inject(&s).unwrap();
        assert!(!parse_dns_override(&y), "纯回国模板同样支持关闭 DNS 覆写");
    }

    #[test]
    fn set_dns_enable_round_trip() {
        let y = inject(&sample()).unwrap();
        let off = set_dns_enable(&y, false).unwrap();
        assert!(!parse_dns_override(&off));
        let on = set_dns_enable(&off, true).unwrap();
        assert!(parse_dns_override(&on));
        assert_eq!(y, on, "开→关→开 应完整还原（只动 enable 一行）");
    }

    #[test]
    fn set_dns_enable_rejects_yaml_without_dns() {
        assert!(set_dns_enable("port: 7890\nmode: rule\n", false).is_err());
    }

    #[test]
    fn injects_all_anchors_no_residual() {
        let y = inject(&sample()).unwrap();
        for token in ANCHOR_TOKENS {
            assert!(!y.contains(token), "残留锚点 token: {token}");
        }
    }

    #[test]
    fn provider_url_injected_in_quotes() {
        let y = inject(&sample()).unwrap();
        assert!(y.contains("Nice:"));
        assert!(y.contains("url: \"http://8.134.143.129:5988/s/abc\""));
    }

    #[test]
    fn multi_airport_injection() {
        let mut s = sample();
        s.airports.push(Airport {
            name: "机场B".into(),
            url: "https://b.example/sub".into(),
        });
        let y = inject(&s).unwrap();
        assert!(y.contains("Nice:"));
        assert!(y.contains("机场B:"));
        assert!(y.contains("url: \"https://b.example/sub\""));
    }

    #[test]
    fn rejects_no_airports() {
        let mut s = sample();
        s.airports.clear();
        assert!(inject(&s).is_err());
    }

    #[test]
    fn rejects_duplicate_airport_names() {
        let mut s = sample();
        s.airports.push(Airport {
            name: "Nice".into(),
            url: "https://x.example/sub".into(),
        });
        assert!(inject(&s).is_err());
    }

    #[test]
    fn rejects_airport_without_scheme() {
        let mut s = sample();
        s.airports[0].url = "8.134.143.129/s/abc".into();
        assert!(inject(&s).is_err());
    }

    #[test]
    fn node_has_dialer_name_and_escaped_password() {
        let y = inject(&sample()).unwrap();
        assert!(y.contains("dialer-proxy: 美国-自动"));
        assert!(y.contains("name: 美国独立IP"));
        assert!(y.contains("password: \"p@ss\\\"w,d\""));
    }

    #[test]
    fn claude_group_primary_first() {
        let y = inject(&sample()).unwrap();
        assert!(y.contains("name: Claude, type: select, proxies: [美国独立IP, 直连,"));
    }

    #[test]
    fn verify_rules_present_for_all_domains() {
        let y = inject(&sample()).unwrap();
        for d in VERIFY_DOMAINS {
            assert!(y.contains(&format!("DOMAIN,{d},Claude")), "缺少回显规则: {d}");
        }
    }

    #[test]
    fn generated_parses_as_yaml() {
        let y = inject(&sample()).unwrap();
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("注入后应为合法 yaml");
    }

    #[test]
    fn meta_parsed_from_template_values() {
        let r = generate(&sample()).unwrap();
        assert_eq!(r.mixed_port, 7893);
        assert_eq!(r.proxy_endpoint, "http://127.0.0.1:7893");
        assert_eq!(r.clash_api_url, "http://127.0.0.1:9090");
        assert_eq!(r.clash_secret, "123456");
        assert_eq!(r.exit_basis_ip, "207.97.137.112");
    }

    #[test]
    fn rejects_bad_protocol() {
        let mut s = sample();
        s.independent_nodes[0].protocol = "vmess".into();
        assert!(inject(&s).is_err());
    }

    #[test]
    fn rejects_zero_port() {
        let mut s = sample();
        s.independent_nodes[0].port = 0;
        assert!(inject(&s).is_err());
    }

    #[test]
    fn rejects_empty_credentials() {
        let mut s = sample();
        s.independent_nodes[0].username = "".into();
        assert!(inject(&s).is_err());
    }

    #[test]
    fn http_tls_option_emitted() {
        let mut s = sample();
        s.independent_nodes[0].protocol = "http".into();
        s.independent_nodes[0].tls = Some(true);
        let y = inject(&s).unwrap();
        assert!(y.contains("type: http"));
        assert!(y.contains("tls: true"));
    }

    #[test]
    fn multi_node_injection_ready() {
        let mut s = sample();
        s.independent_nodes.push(IndependentNode {
            name: "美国独立IP2".into(),
            protocol: "socks5".into(),
            server: "203.0.113.9".into(),
            port: 1080,
            username: "u2".into(),
            password: "p2".into(),
            tls: None,
            exit_ip: None,
            dialer_proxy: "美国-自动".into(),
        });
        let y = inject(&s).unwrap();
        assert!(y.contains("name: 美国独立IP2"));
        assert!(y.contains("server: \"203.0.113.9\""));
        assert!(y.contains("proxies: [美国独立IP, 直连,"));
    }

    #[test]
    fn template_has_each_anchor_exactly_once() {
        // 防回归：锚点若在模板里出现多于一次（如又写进头部注释），
        // replace() 会把学生凭据也注入注释，造成泄露与脏输出。
        for token in [
            ANCHOR_PROVIDERS,
            ANCHOR_PROXY_NODE,
            ANCHOR_CLAUDE_GROUP,
            ANCHOR_TOP_RULES,
            ANCHOR_VERIFY_RULES,
        ] {
            assert_eq!(
                TEMPLATE.matches(token).count(),
                1,
                "锚点应在模板中恰好出现一次：{token}"
            );
        }
    }

    #[test]
    fn extract_basis_ip_roundtrip() {
        let y = inject(&sample()).unwrap();
        assert_eq!(extract_basis_ip(&y).unwrap(), "207.97.137.112");
    }

    #[test]
    fn parse_airports_and_nodes_roundtrip() {
        let mut s = sample();
        s.airports.push(Airport {
            name: "JiChang2".into(),
            url: "https://b/sub".into(),
        });
        let y = inject(&s).unwrap();
        let aps = parse_airports(&y);
        assert!(aps.iter().any(|(n, _)| n == "Nice"));
        assert!(aps.iter().any(|(n, u)| n == "JiChang2" && u == "https://b/sub"));
        let nodes = parse_nodes(&y);
        assert!(nodes.iter().any(|(n, s, p, port)| n == "美国独立IP"
            && s == "207.97.137.112"
            && p == "socks5"
            && port == "443"));
    }

    #[test]
    fn split_groups_and_rules_per_app() {
        let mut s = sample();
        s.split_apps = vec![
            SplitApp { key: "chatgpt".into(), name: "ChatGPT".into(), relay: true },
            SplitApp { key: "youtube".into(), name: "YouTube".into(), relay: false },
            SplitApp { key: "binance".into(), name: "Binance 币安".into(), relay: false },
            SplitApp { key: "rocket".into(), name: "Rocket Mortgage / Quicken".into(), relay: true },
        ];
        let y = inject(&s).unwrap();
        // 每个 APP 一个独立 select 组，默认出口（首位）按 relay/类别预选。
        assert!(y.contains("- {name: \"ChatGPT\", type: select, icon: \"https://icon.horse/icon/openai.com\", proxies: [美国独立IP,"));
        assert!(y.contains("- {name: \"YouTube\", type: select, icon: \"https://icon.horse/icon/youtube.com\", proxies: [香港-自动,"));
        assert!(y.contains("- {name: \"Binance 币安\", type: select, icon: \"https://icon.horse/icon/binance.com\", proxies: [台湾-自动,"));
        assert!(y.contains("- {name: \"Rocket Mortgage / Quicken\", type: select, icon: \"https://icon.horse/icon/rocketmortgage.com\", proxies: [美国独立IP,"));
        // 规则指向各自的组（组名即 app.name）。
        assert!(y.contains("- RULE-SET,ChatGPT / Domain,ChatGPT"));
        assert!(y.contains("- RULE-SET,Youtube / Domain,YouTube"));
        assert!(y.contains("- RULE-SET,Binance / Domain,Binance 币安"));
        assert!(y.contains("- DOMAIN-SUFFIX,rocketmortgage.com,Rocket Mortgage / Quicken"));
        // 旧的共享「分流」组已移除。
        assert!(!y.contains("name: 分流,"));
        // 整体仍是合法 yaml。
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("注入后应为合法 yaml");
    }

    #[test]
    fn split_group_default_exit_mapping() {
        // 用户指定的固定默认出口：Apple/Microsoft→直连、Google/Steam→香港、TikTok/Coinbase→独立IP、OKX→台湾。
        let mut s = sample();
        s.split_apps = vec![
            SplitApp { key: "apple".into(), name: "Apple".into(), relay: false },
            SplitApp { key: "microsoft".into(), name: "Microsoft".into(), relay: false },
            SplitApp { key: "google".into(), name: "Google".into(), relay: false },
            SplitApp { key: "steam".into(), name: "Steam".into(), relay: false },
            SplitApp { key: "tiktok".into(), name: "TikTok".into(), relay: false },
            SplitApp { key: "coinbase".into(), name: "Coinbase".into(), relay: false },
            SplitApp { key: "okx".into(), name: "OKX 欧易".into(), relay: false },
        ];
        let y = inject(&s).unwrap();
        assert!(y.contains("name: \"Apple\", type: select, icon: \"https://icon.horse/icon/apple.com\", proxies: [直连,"));
        assert!(y.contains("name: \"Microsoft\", type: select, icon: \"https://icon.horse/icon/microsoft.com\", proxies: [直连,"));
        assert!(y.contains("name: \"Google\", type: select, icon: \"https://icon.horse/icon/google.com\", proxies: [香港-自动,"));
        assert!(y.contains("name: \"Steam\", type: select, icon: \"https://icon.horse/icon/steampowered.com\", proxies: [香港-自动,"));
        assert!(y.contains("name: \"TikTok\", type: select, icon: \"https://icon.horse/icon/tiktok.com\", proxies: [美国独立IP,"));
        assert!(y.contains("name: \"Coinbase\", type: select, icon: \"https://icon.horse/icon/coinbase.com\", proxies: [美国独立IP,"));
        assert!(y.contains("name: \"OKX 欧易\", type: select, icon: \"https://icon.horse/icon/okx.com\", proxies: [台湾-自动,"));
    }

    #[test]
    fn template_infra_group_defaults() {
        // Test 默认独立IP；国外/其他 默认香港；菜单仍含美国独立IP 选项。
        let y = inject(&sample()).unwrap();
        assert!(y.contains("name: Test, <<: *default, proxies: [美国独立IP,"));
        assert!(y.contains("name: 国外,"));
        assert!(y.contains("proxies: [香港-自动,直连,所有-手动,所有-自动,台湾-自动,日本-自动,新加坡-自动,韩国-自动,美国-自动,美国独立IP,其他-自动,拒绝]"));
    }

    #[test]
    fn parsec_split_routes_to_independent() {
        // Parsec 默认走美国独立IP（用户要求），规则覆盖 parsec.app / parsecgaming.com。
        let mut s = sample();
        s.split_apps = vec![SplitApp {
            key: "parsec".into(),
            name: "Parsec 远程桌面".into(),
            relay: true,
        }];
        let y = inject(&s).unwrap();
        assert!(y.contains("name: \"Parsec 远程桌面\", type: select, icon: \"https://icon.horse/icon/parsec.app\", proxies: [美国独立IP,"));
        assert!(y.contains("- DOMAIN-SUFFIX,parsec.app,Parsec 远程桌面"));
        assert!(y.contains("- DOMAIN-SUFFIX,parsecgaming.com,Parsec 远程桌面"));
    }

    #[test]
    fn new_apps_twitch_rookies_expedia_googleplay() {
        let mut s = sample();
        s.split_apps = vec![
            SplitApp { key: "twitch".into(), name: "Twitch".into(), relay: false },
            SplitApp { key: "therookies".into(), name: "The Rookies".into(), relay: false },
            SplitApp { key: "expedia".into(), name: "Expedia".into(), relay: true },
            SplitApp { key: "googleplay".into(), name: "Google Play".into(), relay: true },
            SplitApp { key: "google".into(), name: "Google".into(), relay: false },
        ];
        let y = inject(&s).unwrap();
        // 默认出口：twitch/therookies→香港；expedia/googleplay→美国独立IP。
        assert!(y.contains("name: \"Twitch\", type: select, icon: \"https://icon.horse/icon/twitch.tv\", proxies: [香港-自动,"));
        assert!(y.contains("name: \"The Rookies\", type: select, icon: \"https://icon.horse/icon/therookies.co\", proxies: [香港-自动,"));
        assert!(y.contains("name: \"Expedia\", type: select, icon: \"https://icon.horse/icon/expedia.com\", proxies: [美国独立IP,"));
        assert!(y.contains("name: \"Google Play\", type: select, icon: \"https://icon.horse/icon/play.google.com\", proxies: [美国独立IP,"));
        // 规则齐全
        assert!(y.contains("- DOMAIN-SUFFIX,twitch.tv,Twitch"));
        assert!(y.contains("- DOMAIN-SUFFIX,therookies.co,The Rookies"));
        assert!(y.contains("- DOMAIN-SUFFIX,expedia.com,Expedia"));
        assert!(y.contains("- DOMAIN-SUFFIX,play.google.com,Google Play"));
        // Google Play 规则必须排在 Google 规则集之前（否则 play.google.com 被 geosite:google 抢走）。
        let pos_play = y.find("DOMAIN-SUFFIX,play.google.com,Google Play").unwrap();
        let pos_google = y.find("RULE-SET,Google / Domain,Google").unwrap();
        assert!(pos_play < pos_google, "Google Play 规则应排在 Google 规则集之前");
    }

    #[test]
    fn figma_split_routes_to_hk() {
        let mut s = sample();
        s.split_apps = vec![SplitApp { key: "figma".into(), name: "Figma".into(), relay: false }];
        let y = inject(&s).unwrap();
        assert!(y.contains("name: \"Figma\", type: select, icon: \"https://icon.horse/icon/figma.com\", proxies: [香港-自动,"));
        assert!(y.contains("- DOMAIN-SUFFIX,figma.com,Figma"));
    }

    #[test]
    fn maxsacademy_split_defaults_to_hk_with_all_regions() {
        // 自家官网：默认出口=香港-自动（首位），但菜单里仍保留其余各国 -自动 供 zashboard 切换。
        let mut s = sample();
        s.split_apps = vec![SplitApp {
            key: "maxsacademy".into(),
            name: "Max's Academy 官网".into(),
            relay: false,
        }];
        let y = inject(&s).unwrap();
        assert!(y.contains(
            "name: \"Max's Academy 官网\", type: select, icon: \"https://icon.horse/icon/maxsacademy.com\", proxies: [香港-自动,"
        ));
        // 一条 DOMAIN-SUFFIX 覆盖 www.maxsacademy.com / 裸域 / 全部子域。
        assert!(y.contains("- DOMAIN-SUFFIX,maxsacademy.com,Max's Academy 官网"));
        // 其他国家的 -自动 选项必须在同一组菜单里（用户可切）。
        for region in ["美国-自动", "台湾-自动", "日本-自动", "新加坡-自动", "韩国-自动", "其他-自动"] {
            assert!(y.contains(region), "缺少出口选项：{region}");
        }
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("注入后应为合法 yaml");
    }

    #[test]
    fn back_china_split_routes_to_back_group() {
        // 回国分流：国内 App 默认出口=回国-自动；规则用 DOMAIN-SUFFIX 指向该 APP 自己的组。
        let mut s = sample();
        s.split_apps = vec![
            SplitApp { key: "bilibili".into(), name: "哔哩哔哩".into(), relay: false },
            SplitApp { key: "netease".into(), name: "网易云音乐".into(), relay: false },
        ];
        let y = inject(&s).unwrap();
        assert!(y.contains("name: \"哔哩哔哩\", type: select, icon: \"https://icon.horse/icon/bilibili.com\", proxies: [回国-自动,"));
        assert!(y.contains("- DOMAIN-SUFFIX,bilibili.com,哔哩哔哩"));
        assert!(y.contains("name: \"网易云音乐\", type: select, icon: \"https://icon.horse/icon/music.163.com\", proxies: [回国-自动,"));
        assert!(y.contains("- DOMAIN-SUFFIX,music.163.com,网易云音乐"));
        // 模板含回国-自动地区组（include-all 聚回国机场节点）。
        assert!(y.contains("name: 回国-自动,"));
        // bilibili 域名规则必须排在 China 兜底之前，否则被 China→国内→直连 抢走。
        let pos_bili = y.find("DOMAIN-SUFFIX,bilibili.com,哔哩哔哩").unwrap();
        let pos_china = y.find("RULE-SET,China / Domain,国内").unwrap();
        assert!(pos_bili < pos_china, "国内 App 规则应排在 China 兜底之前");
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("注入后应为合法 yaml");
    }

    #[test]
    fn back_china_extra_apps_and_allcn() {
        // 第二批回国 App + 「全部国内网站」可选项（geosite CN + GeoIP CN → 回国组）。
        let mut s = sample();
        s.split_apps = vec![
            SplitApp { key: "xiaohongshu".into(), name: "小红书".into(), relay: false },
            SplitApp { key: "qq".into(), name: "QQ".into(), relay: false },
            SplitApp { key: "allcn".into(), name: "全部国内网站".into(), relay: false },
        ];
        let y = inject(&s).unwrap();
        // 小红书：默认回国-自动 + 图标 + 规则。
        assert!(y.contains("name: \"小红书\", type: select, icon: \"https://icon.horse/icon/xiaohongshu.com\", proxies: [回国-自动,"));
        assert!(y.contains("- DOMAIN-SUFFIX,xiaohongshu.com,小红书"));
        // QQ：qq.com 较广，但 qqmusic/qqvideo/weread 未在本用例不影响；规则存在即可。
        assert!(y.contains("- DOMAIN-SUFFIX,qq.com,QQ"));
        // 全部国内网站：无图标的 select 组 + 复用 China 规则集指向该组。
        assert!(y.contains("name: \"全部国内网站\", type: select, proxies: [回国-自动,"));
        assert!(y.contains("- RULE-SET,China / Domain,全部国内网站"));
        assert!(y.contains("- RULE-SET,China / IP,全部国内网站,no-resolve"));
        // allcn 的 China 规则必须排在底部 China→国内 之前，否则被国内→直连抢走。
        let pos_top = y.find("RULE-SET,China / Domain,全部国内网站").unwrap();
        let pos_bottom = y.find("RULE-SET,China / Domain,国内").unwrap();
        assert!(pos_top < pos_bottom, "全部国内网站规则应排在 China 兜底之前");
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("注入后应为合法 yaml");
    }

    #[test]
    fn back_cn_only_mode_strips_proxy_groups_and_routes_china() {
        // 纯回国模式：用专属模板，去掉翻墙地区组；国内→回国、其余→直连。
        let mut s = sample();
        s.back_cn_only = true;
        s.independent_nodes = vec![]; // 纯回国无独立IP
        s.split_apps = vec![
            SplitApp { key: "bilibili".into(), name: "哔哩哔哩".into(), relay: false },
            // 国外 App 与 allcn 在纯回国模式应被忽略（不生成组/规则）。
            SplitApp { key: "youtube".into(), name: "YouTube".into(), relay: false },
            SplitApp { key: "allcn".into(), name: "全部国内网站".into(), relay: false },
        ];
        let y = inject(&s).unwrap();
        // 翻墙地区组 / 独立IP 一律不存在。
        assert!(!y.contains("香港-自动"), "纯回国不应出现香港-自动");
        assert!(!y.contains("美国-自动"), "纯回国不应出现美国-自动");
        assert!(!y.contains("美国独立IP"), "纯回国不应出现美国独立IP");
        // 保留回国主组 + 回国-自动 + Test（手动测线路用，菜单仅纯回国出口）。
        assert!(y.contains("{name: 回国, type: select"));
        assert!(y.contains("name: 回国-自动,"));
        assert!(y.contains("{name: Test, type: select, proxies: [回国-自动, 所有-自动, 所有-手动, 直连, 拒绝]}"));
        assert!(y.contains("- RULE-SET,TEST / Domain,Test"));
        // bilibili 生成回国 App 组（纯回国菜单：回国-自动, 所有-自动, 直连, 拒绝）+ 规则。
        assert!(y.contains("name: \"哔哩哔哩\", type: select, icon: \"https://icon.horse/icon/bilibili.com\", proxies: [回国-自动, 所有-自动, 所有-手动, 直连, 拒绝]"));
        assert!(y.contains("- DOMAIN-SUFFIX,bilibili.com,哔哩哔哩"));
        // 国外 App（youtube）与 allcn 被忽略：无对应组/规则。
        assert!(!y.contains("\"YouTube\""), "纯回国应忽略国外 App YouTube");
        assert!(!y.contains("Youtube / Domain"), "纯回国应忽略 YouTube 规则");
        assert!(!y.contains("\"全部国内网站\""), "纯回国应忽略 allcn 组");
        // 拦 B站 QUIC（逼走 TCP，修复 App 重启地区检查泄漏）。
        assert!(y.contains("- AND,((NETWORK,UDP),(DOMAIN-SUFFIX,bilibili.com)),REJECT-DROP"));
        // FakeLocation：拦 httpdns（逼 App 回退正常 DNS）+ 国内 App 域名/IP → 回国。
        assert!(y.contains("- DOMAIN-KEYWORD,httpdns,REJECT-DROP"));
        assert!(y.contains("- DOMAIN-SUFFIX,snssdk.com,回国"));
        assert!(y.contains("- DOMAIN-SUFFIX,sinaimg.cn,回国"));
        // B站番剧解锁补全：api.biliapi.com(.com 后缀)。
        assert!(y.contains("- DOMAIN-SUFFIX,biliapi.com,回国"));
        // 国内云盘（阿里云盘/百度网盘/腾讯微云）→ 回国。
        assert!(y.contains("- DOMAIN-SUFFIX,pan.baidu.com,回国"));
        assert!(y.contains("- DOMAIN-SUFFIX,aliyundrive.com,回国"));
        assert!(y.contains("- DOMAIN-SUFFIX,weiyun.com,回国"));
        // 全部国内 → 回国；其余直连兜底。
        assert!(y.contains("- RULE-SET,China / Domain,回国"));
        assert!(y.contains("- RULE-SET,China / IP,回国,no-resolve"));
        assert!(y.contains("- MATCH,直连"));
        // 回国-自动 不再按「回国/电信」关键词筛、也无 exclude-filter（否则会误杀以接入国家命名的回国节点，
        // 如「US 美国中转」）。只 include-all 全收、排除 直连/拒绝。
        assert!(!y.contains("exclude-filter"), "纯回国回国-自动不应带 exclude-filter（会误杀以接入国家命名的回国节点）");
        assert!(y.contains("name: 回国-自动,") && y.contains("filter: \"^((?!(直连|拒绝)).)*$\""));
        serde_yaml::from_str::<serde_yaml::Value>(&y).expect("纯回国注入后应为合法 yaml");
    }
}
