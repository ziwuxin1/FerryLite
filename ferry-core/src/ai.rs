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

pub fn shared_group(apps: &[SplitApp]) -> String {
    let mut choices=Vec::new();
    if let Some(app)=apps.iter().find(|a|a.key=="chatgpt") { choices.push(crate::yaml_dq(&app.name)); }
    choices.extend(["Claude".into(),"美国-自动".into(),"直连".into()]);
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
    }
}
pub fn rules(apps: &[SplitApp]) -> String {
    let d=data(); let mut rules=Vec::new();
    service_rules(&mut rules,&d.claude,"Claude");
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
