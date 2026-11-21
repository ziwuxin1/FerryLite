//! Keep Parsec signaling and UDP peer discovery/streaming on explicit paths.
use crate::{ConfigTarget, GenerateInput, SplitApp, yaml_dq};
use std::net::IpAddr;

pub const STREAM: &str = "Parsec 串流";
pub const DOMAINS: [&str; 3] = ["parsec.app", "parsecgaming.com", "parsecusercontent.com"];
pub const STUN: [&str; 2] = ["stun.parsec.app", "stun6.parsec.app"];
const PROCESSES: [&str; 2] = ["parsecd.exe", "parsecd"];

pub fn app(input: &GenerateInput) -> Option<&SplitApp> {
    if input.exchange_only { None } else { input.split_apps.iter().find(|a| a.key == "parsec") }
}

pub fn validate(input: &GenerateInput) -> Result<(), String> {
    if app(input).is_none() { return Ok(()); }
    if input.parsec_peer_ips.len() > 32 { return Err("Parsec 对端 IP 最多填写 32 个。".into()); }
    for ip in &input.parsec_peer_ips {
        ip.trim().parse::<IpAddr>().map_err(|_| "Parsec 对端请填写单个 IPv4 / IPv6 地址，不含域名、端口或网段。".to_string())?;
    }
    Ok(())
}

pub fn groups(input: &GenerateInput) -> String {
    let Some(app) = app(input) else { return String::new(); };
    format!("- {{name: {STREAM}, type: select, proxies: [直连, {}, 所有-手动, 拒绝], icon: \"https://ferrylite.cc/icons/sites/parsec.app.png\"}}", yaml_dq(&app.name))
}

fn udp_rule(out: &mut Vec<String>, matcher: &str) {
    let condition = format!("AND,((NETWORK,UDP),({matcher}))");
    out.push(format!("- {condition},{STREAM}"));
    // A TCP-only selected exit must not silently send STUN and streaming elsewhere.
    out.push(format!("- {condition},REJECT"));
}

pub fn rules(input: &GenerateInput) -> String {
    let Some(app) = app(input) else { return String::new(); };
    let mut out = Vec::new();
    if input.target == ConfigTarget::Pc {
        for process in PROCESSES { udp_rule(&mut out, &format!("PROCESS-NAME,{process}")); }
    }
    for host in STUN { udp_rule(&mut out, &format!("DOMAIN,{host}")); }
    let mut seen = std::collections::HashSet::new();
    for raw in &input.parsec_peer_ips {
        let ip = raw.trim().parse::<IpAddr>().expect("validated peer address");
        if !seen.insert(ip) { continue; }
        let (kind, bits) = if ip.is_ipv6() { ("IP-CIDR6", 128) } else { ("IP-CIDR", 32) };
        udp_rule(&mut out, &format!("{kind},{ip}/{bits},no-resolve"));
    }
    if input.target == ConfigTarget::Pc {
        // Covers raw-IP TLS and app-specific S3/CloudFront requests without routing
        // every AWS customer or every browser connection through Parsec's group.
        for process in PROCESSES {
            out.push(format!("- AND,((NETWORK,TCP),(PROCESS-NAME,{process})),{}", app.name));
        }
    }
    for domain in DOMAINS { out.push(format!("- DOMAIN-SUFFIX,{domain},{}", app.name)); }
    out.join("\n  ")
}

/// Insert into the existing template; retain its comments, aliases and TUN settings.
pub fn settings(yaml: String, input: &GenerateInput) -> String {
    let Some(app) = app(input) else { return yaml; };
    let yaml = yaml.replace("\r\n", "\n");
    let resolver = yaml_dq(&format!("https://1.1.1.1/dns-query#{}", app.name));
    let policy = DOMAINS.iter().map(|d| format!("    '+.{d}': [{resolver}]\n")).collect::<String>();
    let mut out = yaml.replace("  fake-ip-filter:\n", "  fake-ip-filter:\n    - stun.parsec.app\n    - stun6.parsec.app\n");
    out = out.replacen("dns:\n", &format!("dns:\n  nameserver-policy:\n{policy}"), 1);
    out.push_str(&format!("\nfind-process-mode: {}\n", if input.target == ConfigTarget::Pc { "strict" } else { "off" }));
    out
}
