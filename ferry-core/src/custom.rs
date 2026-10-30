use crate::{check_simple_name, yaml_dq, GenerateInput};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomGroup {
    pub name: String,
    pub domains: Vec<String>,
    pub country: String,
    #[serde(default)]
    pub exact: bool,
}

const COUNTRIES: &[(&str, &str, &str)] = &[
    ("us", "美国", "美国|美國|🇺🇸|\\bUS\\b|United States"),
    ("hk", "香港", "香港|🇭🇰|\\bHK\\b|Hong.?Kong"),
    ("tw", "台湾", "台湾|台灣|🇹🇼|\\bTW\\b|Taiwan"),
    ("jp", "日本", "日本|🇯🇵|\\bJP\\b|Japan"),
    ("sg", "新加坡", "新加坡|狮城|獅城|🇸🇬|\\bSG\\b|Singapore"),
    ("kr", "韩国", "韩国|韓國|🇰🇷|\\bKR\\b|Korea"),
    ("gb", "英国", "英国|英國|🇬🇧|\\b(UK|GB)\\b|United Kingdom|Britain"),
    ("de", "德国", "德国|德國|🇩🇪|\\bDE\\b|Germany"),
    ("fr", "法国", "法国|法國|🇫🇷|\\bFR\\b|France"),
    ("ca", "加拿大", "加拿大|🇨🇦|\\bCA\\b|Canada"),
    ("au", "澳大利亚", "澳大利亚|澳大利亞|澳洲|🇦🇺|\\bAU\\b|Australia"),
    ("nl", "荷兰", "荷兰|荷蘭|🇳🇱|\\bNL\\b|Netherlands"),
];

fn normalized(domain: &str) -> String { domain.trim().trim_end_matches('.').to_ascii_lowercase() }
fn group_name(group: &CustomGroup) -> String { format!("自定义 · {}", group.name.trim()) }

pub fn validate(input: &GenerateInput) -> Result<(), String> {
    if input.custom_groups.len() > 50 { return Err("自定义策略组最多 50 个。".into()); }
    let mut names = HashSet::new();
    let mut domains = HashSet::new();
    for group in &input.custom_groups {
        check_simple_name(&group.name, "自定义策略组名称")?;
        if group.name.len() > 120 || !names.insert(group.name.trim()) {
            return Err("自定义策略组名称重复或过长。".into());
        }
        if !COUNTRIES.iter().any(|(key, _, _)| *key == group.country) { return Err("请选择支持的国家 / 地区线路。".into()); }
        if group.domains.len() > 500 { return Err("每个自定义策略组最多填写 500 个域名。".into()); }
        for raw in &group.domains {
            let d = normalized(raw);
            if d.len() > 253 || !d.contains('.') || d.parse::<std::net::IpAddr>().is_ok() || d.split('.').any(|s| s.is_empty() || s.len() > 63 || s.starts_with('-') || s.ends_with('-') || !s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')) {
                return Err(format!("无效域名：{raw}。请只填域名，不含协议、路径、端口或通配符；中文域名请使用 Punycode。"));
            }
            if !domains.insert((d, group.exact)) { return Err(format!("域名重复：{raw}，同一匹配方式只能分配给一个策略组。")); }
        }
    }
    Ok(())
}

pub fn groups(input: &GenerateInput) -> String {
    if input.custom_groups.is_empty() { return String::new(); }
    let mut out = Vec::new();
    for (_, label, filter) in COUNTRIES {
        out.push(format!("- {{name: {}, type: url-test, include-all-providers: true, filter: {}, url: https://www.gstatic.com/generate_204, interval: 300, tolerance: 50}}", yaml_dq(&format!("自定义线路 · {label}")), yaml_dq(&format!("(?i)({filter})"))));
    }
    for group in &input.custom_groups {
        let selected = COUNTRIES.iter().find(|(key, _, _)| *key == group.country).unwrap();
        let mut menu = vec![yaml_dq(&format!("自定义线路 · {}", selected.1))];
        menu.extend(COUNTRIES.iter().filter(|(key, _, _)| *key != group.country).map(|(_, label, _)| yaml_dq(&format!("自定义线路 · {label}"))));
        menu.extend(["DIRECT".into(), "REJECT".into()]);
        let icon = group.domains.first().map(|domain| format!(", icon: {}", yaml_dq(&format!("https://icon.horse/icon/{}", normalized(domain))))).unwrap_or_default();
        out.push(format!("- {{name: {}, type: select{}, proxies: [{}]}}", yaml_dq(&group_name(group)), icon, menu.join(", ")));
    }
    out.join("\n  ")
}

pub fn rules(input: &GenerateInput) -> String {
    let mut entries: Vec<_> = input.custom_groups.iter().flat_map(|g| g.domains.iter().map(move |d| (normalized(d), g))).collect();
    // More specific subdomains precede parents; exact matches precede suffixes.
    entries.sort_by(|(a, ga), (b, gb)| b.split('.').count().cmp(&a.split('.').count()).then_with(|| gb.exact.cmp(&ga.exact)).then_with(|| a.cmp(b)));
    entries.into_iter().map(|(d, g)| format!("- {}", yaml_dq(&format!("{},{},{}", if g.exact { "DOMAIN" } else { "DOMAIN-SUFFIX" }, d, group_name(g))))).collect::<Vec<_>>().join("\n  ")
}
