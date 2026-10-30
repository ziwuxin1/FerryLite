//! Credential-free fixtures for isolated Mihomo validation; never uses a real subscription.
use ferry_core::{generate, Airport, ConfigTarget, GenerateInput, IndependentNode, SplitApp};
use serde_yaml::Value;
use std::{fs, path::PathBuf};

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).expect("output directory"));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("airport.yaml"), "proxies:\n  - {name: TW-01 Test, type: socks5, server: 127.0.0.1, port: 19801}\n  - {name: US-01 Test, type: socks5, server: 127.0.0.1, port: 19801}\n").unwrap();
    fs::write(dir.join("domain.yaml"), "payload:\n  - '+.example.test'\n").unwrap();
    fs::write(dir.join("ipcidr.yaml"), "payload:\n  - '192.0.2.0/24'\n").unwrap();
    fs::write(
        dir.join("classical.yaml"),
        "payload:\n  - 'DOMAIN-SUFFIX,example.test'\n",
    )
    .unwrap();
    for target in [ConfigTarget::Pc, ConfigTarget::Nikki] {
        for mode in ["general", "exchanges"] {
            let input = GenerateInput {
                airports: vec![Airport {
                    name: "TestAirport".into(),
                    url: "https://example.test/subscription".into(),
                }],
                independent_nodes: vec![],
                split_apps: ["binance", "okx", "bybit", "bitget", "gate", "kucoin"]
                    .into_iter()
                    .map(|key| SplitApp {
                        key: key.into(),
                        name: key.into(),
                        relay: false,
                    })
                    .collect(),
                dns_override: true,
                target,
                taiwan_node: Some(IndependentNode {
                        name: "台湾独立IP".into(),
                        protocol: "socks5".into(),
                        server: "127.0.0.1".into(),
                        port: 19802,
                        username: "test".into(),
                        password: "test".into(),
                        tls: None,
                        exit_ip: None,
                        dialer_proxy: "台湾-中转".into(),
                    }),
                exchange_only: mode == "exchanges",
                controller_secret: "fixture-only-secret".into(),
                custom_groups: vec![],
            };
            let generated = generate(&input).unwrap();
            let stem = format!("{}-{mode}", target.file_label());
            fs::write(dir.join(format!("{stem}.generated.yaml")), &generated.yaml).unwrap();
            let mut doc: Value = serde_yaml::from_str(&generated.yaml).unwrap();
            doc.apply_merge().unwrap();
            for provider in doc["proxy-providers"]
                .as_mapping_mut()
                .unwrap()
                .values_mut()
            {
                provider["type"] = "file".into();
                provider["path"] = "airport.yaml".into();
                provider
                    .as_mapping_mut()
                    .unwrap()
                    .remove(Value::from("url"));
                provider["health-check"]["enable"] = false.into();
            }
            if let Some(providers) = doc["rule-providers"].as_mapping_mut() {
                for provider in providers.values_mut() {
                    let behavior = provider["behavior"].as_str().unwrap().to_string();
                    provider["type"] = "file".into();
                    provider["format"] = "yaml".into();
                    provider["path"] = format!("{behavior}.yaml").into();
                    provider
                        .as_mapping_mut()
                        .unwrap()
                        .remove(Value::from("url"));
                }
            }
            // Remove geo-data dependencies and UI downloads only in test fixtures.
            doc["dns"]["fake-ip-filter"] = serde_yaml::from_str("['+.lan', '+.local']").unwrap();
            if let Some(fallback) = doc["dns"]["fallback-filter"].as_mapping_mut() {
                fallback.insert("geoip".into(), false.into());
            }
            for key in ["external-ui", "external-ui-name", "external-ui-url"] {
                doc.as_mapping_mut().unwrap().remove(Value::from(key));
            }
            fs::write(
                dir.join(format!("{stem}.offline.yaml")),
                serde_yaml::to_string(&doc).unwrap(),
            )
            .unwrap();
            if mode == "exchanges" && target == ConfigTarget::Pc {
                // Synthetic runtime uses only loopback ports and no TUN/system changes.
                doc["tun"]["enable"] = false.into();
                doc["dns"]["enable"] = false.into();
                doc["allow-lan"] = false.into();
                doc["mixed-port"] = 17893.into();
                for key in ["port", "socks-port", "redir-port", "tproxy-port"] {
                    doc[key] = 0.into();
                }
                doc["external-controller"] = "127.0.0.1:19093".into();
                fs::write(
                    dir.join("runtime.yaml"),
                    serde_yaml::to_string(&doc).unwrap(),
                )
                .unwrap();
            }
        }
    }
    println!("Wrote 4 pairs of generated/offline profiles and 1 isolated runtime fixture.");
}
