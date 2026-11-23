//! Reviewed catalog fallbacks precede company-wide provider lists.
use serde::Deserialize;
use crate::SplitApp;

#[derive(Deserialize)]
struct Site { key: String, domains: Vec<String> }

pub fn site_domains(key: &str) -> Vec<String> {
    let sites: Vec<Site> = serde_yaml::from_str(include_str!("../data/site-catalog.json")).expect("reviewed catalog");
    sites.into_iter().find(|s| s.key == key).map(|s| s.domains).unwrap_or_default()
}

pub fn catalog_rules(apps: &[SplitApp]) -> String {
    let sites: Vec<Site> = serde_yaml::from_str(include_str!("../data/site-catalog.json")).expect("reviewed catalog");
    let mut rules = Vec::new();
    for app in apps {
        if matches!(app.key.as_str(), "chatgpt" | "claude" | "parsec" | "perforce" | "perforce_hk" | "google" | "apple" | "microsoft") { continue; }
        if let Some(site) = sites.iter().find(|s| s.key == app.key) {
            for domain in &site.domains {
                // The Graph API is shared. When Facebook is selected, keep it
                // with Facebook's page/media exit instead of WhatsApp's exit.
                if app.key == "whatsapp" && domain == "graph.facebook.com"
                    && apps.iter().any(|a| a.key == "facebook") { continue; }
                rules.push(format!("- DOMAIN-SUFFIX,{domain},{}", app.name));
            }
        }
    }
    // Service-specific subdomains win over broader domains, independent of UI order.
    rules.sort_by_key(|r| std::cmp::Reverse(r.split(',').nth(1).unwrap_or("").split('.').count()));
    rules.dedup();
    rules.join("\n  ")
}

/// Prefer HTTPS/TCP for Facebook web/media when a proxy advertises UDP but its
/// QUIC path is unreliable. Scope to these hosts and UDP/443, never global UDP.
pub fn facebook_compat_rules(apps: &[SplitApp]) -> String {
    if !apps.iter().any(|app| app.key == "facebook") { return String::new(); }
    ["facebook.com", "facebook.net", "fbcdn.com", "fbcdn.net", "fbsbx.com", "fbsbx.net", "fbcdn-a.akamaihd.net"]
        .iter().map(|host| format!("- AND,((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,{host})),REJECT"))
        .collect::<Vec<_>>().join("\n  ")
}

/// Official Telegram DC ranges also work before the remote IP set is fetched.
pub fn telegram_ip_rules(target: &str) -> Vec<String> {
    include_str!("../data/telegram-cidrs.txt").lines()
        .map(str::trim).filter(|s| !s.is_empty() && !s.starts_with('#'))
        .map(|cidr| format!("- {},{cidr},{target},no-resolve", if cidr.contains(':') { "IP-CIDR6" } else { "IP-CIDR" }))
        .collect()
}

pub fn guarded(source: &str) -> String {
    let mut out = Vec::new();
    for line in source.lines().map(str::trim).filter(|s| !s.is_empty()) {
        out.push(line.to_string());
        let raw = line.strip_prefix("- ").unwrap_or(line).trim_matches('"');
        let mut parts: Vec<_> = raw.split(',').collect();
        if !matches!(parts.first(), Some(&"DOMAIN") | Some(&"DOMAIN-SUFFIX") | Some(&"RULE-SET") | Some(&"IP-CIDR") | Some(&"IP-CIDR6")) { continue; }
        let no_resolve = parts.last() == Some(&"no-resolve");
        if no_resolve { parts.pop(); }
        let target = parts.pop().unwrap_or("");
        if matches!(target, "REJECT" | "REJECT-DROP" | "DIRECT" | "直连" | "拒绝") { continue; }
        if no_resolve { parts.push("no-resolve"); }
        out.push(format!("- AND,((NETWORK,UDP),({})),REJECT", parts.join(",")));
    }
    let mut seen = std::collections::HashSet::new();
    out.retain(|line| seen.insert(line.clone()));
    out.join("\n  ")
}

pub fn group_line(source: &str) -> String {
    let regions: std::collections::BTreeMap<String,String> = serde_yaml::from_str(include_str!("../data/regions.json")).expect("region patterns");
    let mut line = source.to_string();
    for (region, pattern) in regions {
        if line.contains(&format!("name: {region}-自动,")) || line.contains(&format!("name: {region}-中转,")) || line.contains(&format!("name: {region}影音-机场,")) {
            if let Some(start) = line.find("filter: \"") {
                let start = start + "filter: ".len();
                if let Some(end) = line[start+1..].find('"') {
                    line.replace_range(start..start+end+2, &crate::yaml_dq(&pattern));
                }
            }
        }
    }
    if line.contains("include-all-providers: true") && !line.contains("empty-fallback:") {
        if let Some(end) = line.rfind('}') { line.insert_str(end, ", empty-fallback: REJECT"); }
    }
    line
}
