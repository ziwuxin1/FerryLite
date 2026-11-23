//! Reviewed, shared AI routing data. Keep owned endpoints ahead of broad cloud rules.
use serde::Deserialize;
use crate::SplitApp;

#[derive(Deserialize)]
struct Service { suffixes: Vec<String>, domains: Vec<String>, #[serde(rename="ipCidrs")] ips: Vec<String> }
#[derive(Deserialize)]
struct Voice { cidrs: Vec<String> }
#[derive(Deserialize)]
struct Data { chatgpt: Service, claude: Service, shared: Service, voice: Voice }
fn data() -> Data { serde_yaml::from_str(include_str!("../data/ai-routing.json")).expect("reviewed AI data") }

pub fn shared_group(apps: &[SplitApp], claude_enabled: bool) -> String {
    if !claude_enabled && !apps.iter().any(|a| a.key == "chatgpt") { return String::new(); }
    let mut choices=Vec::new();
    if let Some(app)=apps.iter().find(|a|a.key=="chatgpt") { choices.push(crate::yaml_dq(&app.name)); }
    if claude_enabled { choices.push("Claude".into()); }
    choices.extend(["美国-自动".into(),"直连".into()]);
    format!("- {{name: AI公共服务, type: select, proxies: [{}], icon: \"https://ferrylite.cc/icons/chatgpt.png\"}}",choices.join(", "))
}
fn push_domain(rules: &mut Vec<String>, matcher: String, target: &str) {
    rules.push(format!("- {matcher},{target}"));
    // Mihomo skips UDP-incompatible exits. Stop that fall-through from changing IP.
    rules.push(format!("- AND,((NETWORK,UDP),({matcher})),REJECT"));
}
fn service_rules(rules: &mut Vec<String>, service: &Service, target: &str) {
    for d in &service.suffixes { push_domain(rules,format!("DOMAIN-SUFFIX,{d}"),target); }
    for d in &service.domains { push_domain(rules,format!("DOMAIN,{d}"),target); }
    for ip in &service.ips {
        let kind=if ip.contains(':') {"IP-CIDR6"} else {"IP-CIDR"};
        rules.push(format!("- {kind},{ip},{target},no-resolve"));
        // Raw-IP connections need the same UDP protection as domain matches.
        rules.push(format!("- AND,((NETWORK,UDP),({kind},{ip},no-resolve)),REJECT"));
    }
}
pub fn rules(apps: &[SplitApp], claude_enabled: bool) -> String {
    if !claude_enabled && !apps.iter().any(|a| a.key == "chatgpt") { return String::new(); }
    let d=data(); let mut rules=Vec::new();
    if claude_enabled { service_rules(&mut rules,&d.claude,"Claude"); }
    if let Some(app)=apps.iter().find(|a|a.key=="chatgpt") {
        service_rules(&mut rules,&d.chatgpt,&app.name);
        for ip in &d.voice.cidrs {
            let kind=if ip.contains(':') {"IP-CIDR6"} else {"IP-CIDR"};
            let matcher=format!("AND,((NETWORK,UDP),(DST-PORT,3478),({kind},{ip},no-resolve))");
            rules.push(format!("- {matcher},{}",app.name));
            rules.push(format!("- {matcher},REJECT"));
        }
    }
    service_rules(&mut rules,&d.shared,"AI公共服务");
    rules.join("\n  ")
}

#[cfg(test)]
mod tests {
    #[test]
    fn claude_ip_rules_stop_udp_fall_through_after_tcp_only_exits() {
        let source = super::rules(&[], true);
        let lines: Vec<_> = source.lines().map(str::trim).collect();
        for ip in super::data().claude.ips {
            let kind = if ip.contains(':') { "IP-CIDR6" } else { "IP-CIDR" };
            let rule = format!("- {kind},{ip},Claude,no-resolve");
            let index = lines.iter().position(|line| *line == rule).unwrap();
            assert_eq!(lines[index + 1], format!("- AND,((NETWORK,UDP),({kind},{ip},no-resolve)),REJECT"));
        }
    }
}
