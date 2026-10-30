use crate::{build_node_line, build_provider_block, yaml_dq, GenerateInput, IndependentNode};

pub const NODE_NAME: &str = "台湾独立IP";
pub const UPSTREAM: &str = "台湾-中转";
pub const EXCHANGES: &[&str] = &["binance", "okx", "bybit", "bitget", "gate", "kucoin"];
pub fn is_exchange(key: &str) -> bool {
    EXCHANGES.contains(&key)
}

/// The reference profiles use a Taiwan upstream for media by default, with the
/// residential exit available manually. Keep this separate from exchange routing.
pub fn media_groups(input: &GenerateInput) -> String {
    let residential = if input.taiwan_node.is_some() {
        ", 台湾独立IP"
    } else {
        ""
    };
    format!(
        r#"- {{name: 台湾影音-机场, type: url-test, include-all-providers: true, empty-fallback: REJECT, filter: "(?i)(台湾|台灣|🇹🇼|Taiwan|Tai[ -]?Wan|\\bTW(?:\\b|[0-9]))", url: "https://www.gstatic.com/generate_204", interval: 300, tolerance: 50}}
  - {{name: 台湾影音, type: select, proxies: [台湾影音-机场{residential}, REJECT]}}"#
    )
}

pub fn media_rules() -> String {
    [
        ("DOMAIN-SUFFIX", "ofiii.com"),
        ("DOMAIN-SUFFIX", "svc.litv.tv"),
        ("DOMAIN", "ntdofifreepc-tgc.cdn.hinet.net"),
        ("DOMAIN", "ntdofifreemobile-tgc.cdn.hinet.net"),
        ("DOMAIN", "ntdofifreetv-tgc.cdn.hinet.net"),
    ]
    .into_iter()
    .flat_map(|(kind, domain)| {
        [
            format!("- AND,((NETWORK,UDP),({kind},{domain})),REJECT"),
            format!("- {kind},{domain},台湾影音"),
        ]
    })
    .collect::<Vec<_>>()
    .join("\n  ")
}

pub fn node_line(node: &IndependentNode) -> String {
    let mut line = build_node_line(node);
    // Change only the icon, never globally replace content in credentials.
    let suffix = ", icon: \"https://gh-proxy.com/raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/us.svg\"}";
    if line.ends_with(suffix) {
        line.truncate(line.len() - suffix.len());
    }
    line.push_str(", udp: false, icon: \"https://gh-proxy.com/raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/tw.svg\"}");
    line
}

pub fn groups(input: &GenerateInput) -> String {
    // Explicit REJECT remains even on older cores without empty-fallback support.
    // Provider-only inclusion excludes the local TW residential node by construction.
    let mut lines = vec![format!("- {{name: {UPSTREAM}, type: select, proxies: [REJECT], include-all-providers: true, empty-fallback: REJECT, filter: \"(?i)(台湾|台灣|🇹🇼|Taiwan|Tai[ -]?Wan|\\\\bTW[0-9 -])\"}}")];
    lines.push(format!(
        "- {{name: 交易所-台湾家宽, type: select, proxies: [{NODE_NAME}, REJECT]}}"
    ));
    if input.exchange_only {
        for app in input.split_apps.iter().filter(|a| is_exchange(&a.key)) {
            lines.push(format!(
                "- {{name: {}, type: select, proxies: [交易所-台湾家宽, REJECT]}}",
                yaml_dq(&app.name)
            ));
        }
    }
    lines.join("\n  ")
}

pub fn lock_groups(groups: &str, input: &GenerateInput) -> String {
    groups
        .lines()
        .map(|line| {
            if let Some(app) = input.split_apps.iter().find(|a| {
                is_exchange(&a.key)
                    && line
                        .trim_start()
                        .starts_with(&format!("- {{name: {},", yaml_dq(&a.name)))
            }) {
                format!(
                    "- {{name: {}, type: select, proxies: [交易所-台湾家宽, REJECT]}}",
                    yaml_dq(&app.name)
                )
            } else {
                line.trim_start().to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n  ")
}

fn domains(key: &str) -> &'static [&'static str] {
    match key {
        "binance" => &[
            "binance.com",
            "binance.me",
            "binance.info",
            "binance.vision",
            "bnbstatic.com",
        ],
        "okx" => &[
            "okx.com",
            "okex.com",
            "okx-dns.com",
            "okx-dns1.com",
            "okx-dns2.com",
            "okx.ac",
            "okx.cab",
        ],
        "bybit" => &[
            "bybit.com",
            "bycsi.com",
            "bytick.com",
            "byapis.com",
            "bycbe.com",
            "bymj.io",
            "byabcde.com",
            "byapps.net",
            "byd3c3.com",
            "bybit.biz",
            "bybdc6.com",
            "bybit-global.com",
            "bybit.cloud",
            "bybitglobal.com",
        ],
        "bitget" => &[
            "bitget.com",
            "bitgetapp.com",
            "bitgetapps.com",
            "krbitget.com",
            "bitget.cloud",
            "bitget.org",
            "bitget.io",
        ],
        "gate" => &[
            "gate.com",
            "gate.io",
            "gateio.ws",
            "gateapi.io",
            "gateimg.com",
        ],
        "kucoin" => &["kucoin.com", "kucoin.plus", "kucoin.cc", "kucoin.io"],
        _ => &[],
    }
}

pub fn rules(input: &GenerateInput) -> String {
    let mut rules = Vec::new();
    // A dedicated echo destination leaves the existing Claude verification intact.
    for domain in ["api4.ipify.org", "api6.ipify.org"] {
        rules.push(format!("- AND,((NETWORK,UDP),(DOMAIN,{domain})),REJECT"));
        rules.push(format!("- DOMAIN,{domain},交易所-台湾家宽"));
    }
    for app in input.split_apps.iter().filter(|a| is_exchange(&a.key)) {
        for domain in domains(&app.key) {
            rules.push(format!(
                "- AND,((NETWORK,UDP),(DOMAIN-SUFFIX,{domain})),REJECT"
            ));
            rules.push(format!("- DOMAIN-SUFFIX,{domain},{}", app.name));
        }
        if app.key == "bybit" {
            for domain in ["bybit-exchange.github.io", "bybit.ada.support"] {
                rules.push(format!("- AND,((NETWORK,UDP),(DOMAIN,{domain})),REJECT"));
                rules.push(format!("- DOMAIN,{domain},{}", app.name));
            }
        }
        let provider = match app.key.as_str() {
            "binance" => Some("Binance"),
            "okx" => Some("OKX"),
            "bybit" => Some("Bybit"),
            _ => None,
        };
        if let Some(p) = provider {
            rules.push(format!(
                "- AND,((NETWORK,UDP),(RULE-SET,{p} / Domain)),REJECT"
            ));
            rules.push(format!("- RULE-SET,{p} / Domain,{}", app.name));
        }
    }
    rules.join("\n  ")
}

pub fn exchange_config(input: &GenerateInput) -> Result<String, String> {
    let node = input.taiwan_node.as_ref().ok_or("需要台湾家宽代理。")?;
    let providers = input
        .airports
        .iter()
        .map(build_provider_block)
        .collect::<Vec<_>>()
        .join("\n  ");
    let providers_rules = [("binance", "Binance", "binance"), ("okx", "OKX", "okx"), ("bybit", "Bybit", "bybit")].into_iter()
        .filter(|(key, _, _)| input.split_apps.iter().any(|a| a.key == *key))
        .map(|(_, name, slug)| format!("  {name} / Domain:\n    type: http\n    behavior: domain\n    format: mrs\n    interval: 86400\n    url: https://gh-proxy.com/github.com/metacubex/meta-rules-dat/raw/refs/heads/meta/geo/geosite/{slug}.mrs"))
        .collect::<Vec<_>>().join("\n");
    let mut output_groups = groups(input);
    let mut output_rules = rules(input);
    output_groups.push_str(&format!("\n  {}", media_groups(input)));
    output_rules = format!("{}\n  {output_rules}", media_rules());
    if !input.custom_groups.is_empty() {
        output_groups.push_str(&format!("\n  {}", crate::custom::groups(input)));
        output_rules.push_str(&format!("\n  {}", crate::custom::rules(input)));
    }
    Ok(format!(
        r#"# 所选交易所经台湾家宽，固定包含台湾影音；其他网站直连。
proxy-providers:
  {providers}
proxies:
  - {{name: 直连, type: direct}}
  - {{name: 拒绝, type: reject}}
  {node}
mixed-port: 7893
port: 7890
socks-port: 7891
redir-port: 7892
tproxy-port: 7895
allow-lan: false
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
secret: ""
ipv6: false
dns:
  enable: {dns}
  listen: 127.0.0.1:7874
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver: [223.5.5.5, 119.29.29.29]
  proxy-server-nameserver: [223.5.5.5, 119.29.29.29]
  fake-ip-filter: ["+.lan", "+.local"]
tun:
  enable: true
  device: Ferry
  stack: gvisor
  auto-route: true
  auto-detect-interface: true
  auto-redirect: false
  strict-route: true
  dns-hijack: ["any:53", "tcp://any:53"]
profile:
  store-selected: true
  store-fake-ip: true
proxy-groups:
  {groups}
rules:
  {rules}
  - MATCH,直连
rule-providers:
{providers_rules}
"#,
        node = node_line(node),
        dns = input.dns_override,
        groups = output_groups,
        rules = output_rules
    ))
}
