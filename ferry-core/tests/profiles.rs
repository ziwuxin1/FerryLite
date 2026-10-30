use ferry_core::{generate, Airport, ConfigTarget, CustomGroup, GenerateInput, IndependentNode, SplitApp};
use serde_yaml::Value;

fn node(name: &str, upstream: &str) -> IndependentNode {
    IndependentNode {
        name: name.into(),
        protocol: "socks5".into(),
        server: "residential.example".into(),
        port: 1337,
        username: "test".into(),
        password: "quote\"slash\\,include-all: true".into(),
        tls: None,
        exit_ip: None,
        dialer_proxy: upstream.into(),
    }
}
fn sample() -> GenerateInput {
    GenerateInput {
        airports: vec![Airport {
            name: "Example".into(),
            url: "https://example.test/sub".into(),
        }],
        independent_nodes: vec![],
        split_apps: ["binance", "okx", "bybit", "bitget", "gate", "kucoin"]
            .into_iter()
            .map(|key| SplitApp {
                key: key.into(),
                name: key.into(),
                relay: true,
            })
            .collect(),
        dns_override: true,
        target: ConfigTarget::Pc,
        taiwan_node: Some(node("台湾独立IP", "台湾-中转")),
        exchange_only: false,
        controller_secret: "local-test-secret".into(),
        custom_groups: vec![],
    }
}
fn parsed(input: &GenerateInput) -> Value {
    let yaml = generate(input).unwrap().yaml;
    let mut value: Value = serde_yaml::from_str(&yaml).unwrap();
    value.apply_merge().unwrap();
    value
}
fn group<'a>(v: &'a Value, name: &str) -> &'a Value {
    v["proxy-groups"]
        .as_sequence()
        .unwrap()
        .iter()
        .find(|g| g["name"].as_str() == Some(name))
        .unwrap()
}

#[test]
fn custom_domains_export_in_both_profiles_and_modes() {
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        for exchange_only in [false, true] {
            let mut input = sample();
            input.target = target;
            input.exchange_only = exchange_only;
            input.custom_groups = vec![
                CustomGroup { name: "工作".into(), domains: vec![" EXAMPLE.com. ".into(), "okx.com".into()], country: "jp".into(), exact: false },
                CustomGroup { name: "登录".into(), domains: vec!["login.example.com".into()], country: "us".into(), exact: true },
            ];
            let value = parsed(&input);
            assert_eq!(group(&value, "自定义 · 工作")["proxies"][0], "自定义线路 · 日本");
            assert_eq!(group(&value, "自定义 · 工作")["icon"], "https://icon.horse/icon/example.com");
            assert_eq!(group(&value, "自定义 · 登录")["proxies"][0], "自定义线路 · 美国");
            assert_eq!(group(&value, "自定义线路 · 日本")["include-all-providers"], true);
            assert_eq!(group(&value, "自定义线路 · 日本")["type"], "url-test");
            let rules = value["rules"].as_sequence().unwrap();
            let find = |text: &str| rules.iter().position(|v| v.as_str() == Some(text)).unwrap();
            let parent = find("DOMAIN-SUFFIX,example.com,自定义 · 工作");
            assert!(find("DOMAIN,login.example.com,自定义 · 登录") < parent);
            let custom_exchange = find("DOMAIN-SUFFIX,okx.com,自定义 · 工作");
            assert!(find("DOMAIN-SUFFIX,okx.com,okx") < custom_exchange);
            assert_eq!(group(&value, "okx")["proxies"][0], "交易所-台湾家宽");
            assert!(parent < rules.iter().position(|r| r.as_str().unwrap().starts_with("MATCH,")).unwrap());
        }
    }
}

#[test]
fn custom_domains_validate_duplicates_names_and_injection() {
    let base = CustomGroup { name: "工作".into(), domains: vec!["example.com".into()], country: "jp".into(), exact: false };
    for bad in ["https://example.com", "example.com/path", "*.example.com", "example.com,REJECT", "127.0.0.1", "a..com", "-a.com", "中文.com", "example.com:443"] {
        let mut input = sample();
        input.custom_groups = vec![CustomGroup { domains: vec![bad.into()], ..base.clone() }];
        assert!(generate(&input).is_err(), "accepted invalid domain: {bad}");
    }
    let mut input = sample();
    for invalid in [
        CustomGroup { name: "".into(), ..base.clone() },
        CustomGroup { name: "name,REJECT".into(), ..base.clone() },
        CustomGroup { country: "unknown".into(), ..base.clone() },
        CustomGroup { domains: vec!["example.com".into(); 501], ..base.clone() },
    ] {
        input.custom_groups = vec![invalid];
        assert!(generate(&input).is_err());
    }
    input.custom_groups = vec![base.clone(), CustomGroup { name: "另一组".into(), domains: vec!["EXAMPLE.COM.".into()], ..base.clone() }];
    assert!(generate(&input).is_err());
    input.custom_groups = vec![base.clone(), CustomGroup { domains: vec!["other.test".into()], ..base }];
    assert!(generate(&input).is_err());
}

#[test]
fn empty_custom_group_can_be_created_before_adding_domains() {
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        let mut input = sample();
        input.target = target;
        input.custom_groups = vec![CustomGroup { name: "稍后添加".into(), domains: vec![], country: "jp".into(), exact: false }];
        let value = parsed(&input);
        let empty = group(&value, "自定义 · 稍后添加");
        assert_eq!(empty["proxies"][0], "自定义线路 · 日本");
        assert!(empty["icon"].is_null());
        assert!(!value["rules"].as_sequence().unwrap().iter().any(|rule| rule.as_str().unwrap().ends_with(",自定义 · 稍后添加")));
        input.custom_groups[0].domains.push("example.org".into());
        let filled = parsed(&input);
        assert_eq!(group(&filled, "自定义 · 稍后添加")["icon"], "https://icon.horse/icon/example.org");
        assert!(filled["rules"].as_sequence().unwrap().iter().any(|rule| rule.as_str() == Some("DOMAIN-SUFFIX,example.org,自定义 · 稍后添加")));
    }
}

#[test]
fn us_relay_toggle_changes_default_exit_and_preserves_taiwan() {
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        for has_us in [false, true] {
            for relay in [false, true] {
                for has_tw in [false, true] {
                    let mut input = sample();
                    input.target = target;
                    if !has_tw { input.taiwan_node = None; }
                    if has_us { input.independent_nodes = vec![node("美国独立IP", "美国-中转")]; }
                    input.split_apps = ["google", "robinhood", "apple", "okx"].into_iter()
                        .map(|key| SplitApp { key: key.into(), name: key.into(), relay }).collect();
                    let value = parsed(&input);
                    for (key, normal) in [("google", "香港-自动"), ("robinhood", "美国-自动"), ("apple", "直连")] {
                        assert_eq!(group(&value, key)["proxies"][0].as_str(), Some(if relay && has_us { "美国独立IP" } else { normal }));
                    }
                    assert_eq!(group(&value, "okx")["proxies"][0].as_str(), Some(if has_tw { "交易所-台湾家宽" } else { "台湾-自动" }));
                    if has_tw {
                        assert_eq!(group(&value, "okx")["proxies"].as_sequence().unwrap(), &vec![Value::from("交易所-台湾家宽"), Value::from("REJECT")]);
                        assert_eq!(group(&value, "交易所-台湾家宽")["proxies"][0].as_str(), Some("台湾独立IP"));
                    }
                }
            }
        }
    }
}

#[test]
fn platform_mode_matrix_and_credentials() {
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        for only in [false, true] {
            let mut input = sample();
            input.target = target;
            input.exchange_only = only;
            let result = generate(&input).unwrap();
            assert!(!result.yaml.contains("回国"));
            let v = parsed(&input);
            assert_eq!(result.export_only, only || target == ConfigTarget::Nikki);
            assert_eq!(v["tun"]["auto-route"], target == ConfigTarget::Pc);
            if target == ConfigTarget::Pc {
                assert!(v["tun"]["device"].is_null(), "desktop device must use the OS default, including macOS utun");
            } else {
                assert_eq!(v["tun"]["device"], "Ferry");
            }
            let label = if target == ConfigTarget::Pc { "Desktop" } else { "Router" };
            assert_eq!(result.suggested_file_name, format!("Ferry-{label}{}.yaml", if only { "-Exchanges" } else { "" }));
            assert!(result.yaml.starts_with(&format!("# Ferry target: {label}\n")));
            assert_eq!(v["allow-lan"], target == ConfigTarget::Nikki);
            assert_eq!(v["external-controller"], "127.0.0.1:9090");
            assert_eq!(v["secret"], "local-test-secret");
            let tw = v["proxies"]
                .as_sequence()
                .unwrap()
                .iter()
                .find(|n| n["name"] == "台湾独立IP")
                .unwrap();
            assert_eq!(tw["password"], input.taiwan_node.as_ref().unwrap().password);
            assert_eq!(tw["dialer-proxy"], "台湾-中转");
            assert_eq!(tw["udp"], false);
            for g in v["proxy-groups"].as_sequence().unwrap() {
                assert!(g["include-all"].is_null());
            }
            assert_eq!(group(&v, "台湾-中转")["proxies"][0], "REJECT");
            assert_eq!(
                group(&v, "交易所-台湾家宽")["proxies"]
                    .as_sequence()
                    .unwrap()
                    .len(),
                2
            );
            for app in &input.split_apps {
                let members = group(&v, &app.name)["proxies"].as_sequence().unwrap();
                assert_eq!(
                    members,
                    &vec![Value::from("交易所-台湾家宽"), Value::from("REJECT")]
                );
            }
            if only {
                assert_eq!(
                    v["rules"].as_sequence().unwrap().last().unwrap(),
                    "MATCH,直连"
                );
                assert!(!result.yaml.contains("name: Claude"));
            }
        }
    }
}

#[test]
fn every_exchange_rule_has_preceding_udp_guard() {
    let v = parsed(&sample());
    let rules = v["rules"]
        .as_sequence()
        .unwrap()
        .iter()
        .map(|r| r.as_str().unwrap())
        .collect::<Vec<_>>();
    for (index, rule) in rules.iter().enumerate() {
        if let Some((matcher, target)) = rule.rsplit_once(',') {
            if ["binance", "okx", "bybit", "bitget", "gate", "kucoin"].contains(&target) {
                let guard = format!("AND,((NETWORK,UDP),({matcher})),REJECT");
                assert!(
                    rules[..index].contains(&guard.as_str()),
                    "missing guard for {rule}"
                );
            }
        }
    }
}

#[test]
fn us_and_taiwan_remain_separate_and_renaming_works() {
    let mut input = sample();
    input
        .independent_nodes
        .push(node("自定义美国家宽", "美国-中转"));
    let v = parsed(&input);
    assert_eq!(group(&v, "Claude")["proxies"][0], "自定义美国家宽");
    assert_eq!(group(&v, "交易所-台湾家宽")["proxies"][0], "台湾独立IP");
}

#[test]
fn invalid_combinations_and_graph_are_rejected() {
    let mut input = sample();
    input.target = ConfigTarget::Nikki;
    input.dns_override = false;
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.exchange_only = true;
    input.taiwan_node = None;
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.split_apps.clear();
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.independent_nodes.push(node("重复", "不存在"));
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.independent_nodes.push(node("Claude", "美国-自动"));
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.independent_nodes.push(node("循环", "循环"));
    assert!(generate(&input).is_err());
    let mut input = sample();
    input.split_apps[0].name = input.split_apps[1].name.clone();
    assert!(generate(&input).is_err());
}

#[test]
fn disabling_taiwan_retains_legacy_exit_choices() {
    let mut input = sample();
    input.taiwan_node = None;
    let v = parsed(&input);
    assert_eq!(group(&v, "okx")["proxies"][0], "台湾-自动");
}


#[test]
fn ofiii_routes_exact_reference_hosts_with_udp_guards_in_both_modes() {
    let matchers = [
        "DOMAIN-SUFFIX,ofiii.com",
        "DOMAIN-SUFFIX,svc.litv.tv",
        "DOMAIN,ntdofifreepc-tgc.cdn.hinet.net",
        "DOMAIN,ntdofifreemobile-tgc.cdn.hinet.net",
        "DOMAIN,ntdofifreetv-tgc.cdn.hinet.net",
    ];
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        for only in [false, true] {
            let mut input = sample();
            input.target = target;
            input.exchange_only = only;
            let v = parsed(&input);
            assert_eq!(group(&v, "台湾影音")["proxies"][0], "台湾影音-机场");
            assert_eq!(group(&v, "台湾影音")["proxies"][1], "台湾独立IP");
            assert_eq!(group(&v, "台湾影音-机场")["include-all-providers"], true);
            assert_eq!(group(&v, "台湾影音-机场")["empty-fallback"], "REJECT");
            let rules = v["rules"].as_sequence().unwrap();
            for matcher in matchers {
                let rule = Value::from(format!("{matcher},台湾影音"));
                let pos = rules.iter().position(|r| r == &rule).unwrap();
                assert!(rules[..pos].contains(&Value::from(format!(
                    "AND,((NETWORK,UDP),({matcher})),REJECT"
                ))));
            }
            assert!(!rules.contains(&Value::from("DOMAIN-SUFFIX,hinet.net,台湾影音")));
            assert!(!rules.contains(&Value::from("DOMAIN-SUFFIX,litv.tv,台湾影音")));
            assert_eq!(group(&v, "okx")["proxies"][0], "交易所-台湾家宽");
        }
    }
}

#[test]
fn ofiii_is_always_present_without_residential_proxy() {
    let mut input = sample();
    input.taiwan_node = None;
    let v = parsed(&input);
    assert_eq!(
        group(&v, "台湾影音")["proxies"].as_sequence().unwrap(),
        &vec![Value::from("台湾影音-机场"), Value::from("REJECT")]
    );
    let yaml = generate(&input).unwrap().yaml;
    assert!(yaml.contains("DOMAIN-SUFFIX,ofiii.com,台湾影音"));
    assert!(!yaml.contains("回国"));
}

#[test]
fn removed_return_apps_cannot_be_generated_by_legacy_inputs() {
    for key in ["netease", "bilibili", "iqiyi", "allcn"] {
        let mut input = sample();
        input.split_apps.push(SplitApp { key: key.into(), name: "旧项目".into(), relay: false });
        assert!(generate(&input).unwrap_err().contains("不支持的分流项目"));
    }
}
