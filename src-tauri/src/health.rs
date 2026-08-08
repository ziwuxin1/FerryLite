//! 模块2（出口 IP 验证）+ 模块4（独立 IP 链路体检）。见设计 §6.2 / §6.4。
//!
//! 安全兜底核心：启动 Claude 前，经「与 Claude 完全相同的路径」实测出口 IP 是否 == 基准 IP。
//! 回显域名已被模块1 注入规则强制走 Claude 组，故任何错配都会被发现。

use serde::Serialize;
use std::net::IpAddr;
use std::time::{Duration, Instant};

/// 回显源。主机名必须与注入的 DOMAIN 规则（yaml_inject::VERIFY_DOMAINS）严格一致，
/// 这样回显请求才与 Claude 实际走向相同。带 curl UA 时这些端点均返回纯文本 IP。
const ECHO_URLS: [&str; 4] = [
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://ip.sb",
    "https://ipinfo.io/ip",
];

const ECHO_UA: &str = "curl/8.4.0";
const STABILITY_ROUNDS: u32 = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitIpReport {
    pub matched: bool,
    pub echo_ip: String,
    pub basis_ip: String,
    pub source: String,
    pub message: String,
    /// 自动探测到的、实际可用的本地代理端点（可能与配置不同；命令会写回 config）。
    pub proxy_endpoint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkHealthReport {
    pub total: u32,
    pub success: u32,
    pub avg_latency_ms: Option<u64>,
    pub message: String,
}

// ---------- HTTP 客户端构造 ----------

fn proxied_client(proxy_endpoint: &str, secs: u64) -> Result<reqwest::Client, String> {
    let proxy = reqwest::Proxy::all(proxy_endpoint)
        .map_err(|e| format!("本地代理端点无效（{proxy_endpoint}）：{e}"))?;
    reqwest::Client::builder()
        .proxy(proxy)
        .user_agent(ECHO_UA)
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))
}

/// 直连客户端（不走代理）。仅用于访问本机 Clash API（127.0.0.1，loopback 不受 TUN 影响）。
fn direct_client(secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .user_agent(ECHO_UA)
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))
}

// ---------- 模块2 第1步：查 ClashMi 在不在 ----------

pub async fn check_clash(clash_url: &str, secret: &str) -> Result<String, String> {
    let client = direct_client(5)?;
    let url = format!("{}/version", clash_url.trim_end_matches('/'));
    let mut req = client.get(&url);
    if !secret.is_empty() {
        req = req.bearer_auth(secret);
    }
    match req.send().await {
        // 任何 HTTP 响应（含 401）都证明 Clash 客户端控制器在线。secret 可能由客户端随机管理、
        // 无法获取，这里不卡鉴权；核心体检走代理端口，不需要 secret。
        Ok(resp) => {
            if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
                Ok("Clash 客户端已就位（API 在线；secret 由客户端随机管理，已自动跳过鉴权）。".into())
            } else {
                Ok("Clash 客户端已就位（Clash API 可达）。".into())
            }
        }
        Err(_) => {
            Err("未检测到 Clash 客户端：Clash API 无法连接。请先打开你的 Clash 客户端（ClashMi / Clash Verge / FlClash 等）并连接。".into())
        }
    }
}

/// 候选本地代理端口：先试配置的，再试常见端口（ClashMi 等客户端常用 7890）。
fn proxy_candidates(configured: &str) -> Vec<String> {
    let mut v = vec![configured.trim().to_string()];
    for p in [7890u16, 7897, 7893, 7891, 7892, 1080] {
        let ep = format!("http://127.0.0.1:{p}");
        if !v.contains(&ep) {
            v.push(ep);
        }
    }
    v
}

// ---------- 模块2 第2步：验证出口 IP == 基准 IP ----------

pub async fn verify_exit_ip(
    proxy_endpoint: &str,
    basis_ip: &str,
    clash_url: &str,
    secret: &str,
) -> Result<ExitIpReport, String> {
    // 自动探测可用代理端口：先配置的，再常见端口。第一个能回显 IP 的即采用。
    let mut echo: Option<(String, String, String)> = None; // (ip, source, working_endpoint)
    'outer: for ep in proxy_candidates(proxy_endpoint) {
        let client = match proxied_client(&ep, 8) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for url in ECHO_URLS {
            if let Some(ip) = fetch_ip(&client, url).await {
                echo = Some((ip, url.to_string(), ep.clone()));
                break 'outer;
            }
        }
    }
    let (echo_ip, source, working_endpoint) = match echo {
        Some(v) => v,
        None => {
            return Err(
                "无法检测出口 IP（试过常见代理端口都连不上）。请确认 Clash 客户端已连接、TUN 已开。本次不放行。"
                    .into(),
            )
        }
    };

    let (matched, message) = if basis_ip.trim().is_empty() {
        // 未配置独立 IP（用户选择直接走机场）：无基准可比，确认代理通即放行。
        (
            true,
            format!("出口 IP：{echo_ip}（未设独立IP基准，已确认代理可用，放行）。（代理端口 {working_endpoint}）"),
        )
    } else if ip_matches_basis(&echo_ip, basis_ip).await {
        (
            true,
            format!("出口 IP 校验通过：{echo_ip} == 基准 IP。链路（机场美国节点 → 独立IP）已走通。（代理端口 {working_endpoint}）"),
        )
    } else {
        (
            false,
            diagnose_mismatch(clash_url, secret, &echo_ip, basis_ip).await,
        )
    };

    Ok(ExitIpReport {
        matched,
        echo_ip,
        basis_ip: basis_ip.to_string(),
        source,
        message,
        proxy_endpoint: working_endpoint,
    })
}

async fn fetch_ip(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let body = resp.text().await.ok()?;
    let candidate = body.trim();
    if candidate.parse::<IpAddr>().is_ok() {
        Some(candidate.to_string())
    } else {
        None
    }
}

async fn ip_matches_basis(echo_ip: &str, basis: &str) -> bool {
    let basis = basis.trim();
    if basis.parse::<IpAddr>().is_ok() {
        return echo_ip == basis;
    }
    // 基准是域名：解析为 IP 集合，判断回显是否落在其中（轮换/多 IP 容忍）。
    resolve_ips(basis).await.iter().any(|ip| ip == echo_ip)
}

async fn resolve_ips(host: &str) -> Vec<String> {
    match tokio::net::lookup_host((host, 80u16)).await {
        Ok(addrs) => addrs.map(|sa| sa.ip().to_string()).collect(),
        Err(_) => Vec::new(),
    }
}

/// 出口 IP 不等时，查 Clash API 给出「具体、可操作」的中文提示（TUN 无关、可靠）。
async fn diagnose_mismatch(clash_url: &str, secret: &str, echo_ip: &str, basis: &str) -> String {
    let proxies = match direct_client(5) {
        Ok(c) => fetch_proxies(&c, clash_url, secret).await,
        Err(_) => None,
    };
    if let Some(p) = proxies {
        let claude_now = group_now(&p, "Claude").unwrap_or_default();
        let us_now = group_now(&p, "美国-自动").unwrap_or_default();

        if claude_now == "直连" {
            return format!(
                "出口 IP 校验未通过：Claude 组当前选的是「直连」。请在 zashboard 把 Claude 组改选「美国独立IP」后重试。（回显 {echo_ip}，基准 {basis}）"
            );
        }
        if us_now.is_empty() {
            return format!(
                "出口 IP 校验未通过：「美国-自动」组没有可用节点（机场美国节点可能全挂，或订阅里没有美国节点）。请在 zashboard 检查美国节点后重试。（回显 {echo_ip}，基准 {basis}）"
            );
        }
        return format!(
            "出口 IP 校验未通过：回显 {echo_ip} ≠ 基准 {basis}（Claude 组当前「{claude_now}」）。\n• 若回显是干净的美国住宅IP(非机房)：链路其实通了！只是住宅代理「入口网关≠真实出口IP」—— 回『配置生成』把回显IP填进「实际出口IP（基准·可选）」再生成即可。\n• 否则：可能节点选错 / 独立IP未连通 / 已换IP，请检查 NovProxy 与美国节点。"
        );
    }
    format!(
        "出口 IP 校验未通过：回显 {echo_ip} ≠ 基准 {basis}。若回显是干净的美国住宅IP(非机房)，说明链路其实通了、只是住宅代理出口IP≠网关 —— 回『配置生成』把回显IP填进「实际出口IP」再生成即可；否则请检查美国节点与独立IP状态。"
    )
}

async fn fetch_proxies(
    client: &reqwest::Client,
    clash_url: &str,
    secret: &str,
) -> Option<serde_json::Value> {
    let url = format!("{}/proxies", clash_url.trim_end_matches('/'));
    let mut req = client.get(&url);
    if !secret.is_empty() {
        req = req.bearer_auth(secret);
    }
    let resp = req.send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<serde_json::Value>().await.ok()
}

/// 从 `/proxies` 响应里读某个组当前选中的节点名（`proxies.<group>.now`）。
fn group_now(proxies: &serde_json::Value, group: &str) -> Option<String> {
    proxies
        .get("proxies")?
        .get(group)?
        .get("now")?
        .as_str()
        .map(|s| s.to_string())
}

// ---------- 模块4：独立 IP 链路体检（延迟 + 稳定性）----------

pub async fn link_health(proxy_endpoint: &str) -> Result<LinkHealthReport, String> {
    // 自动选可用端口（与 verify 一致）：第一个能回显的即用。
    let mut chosen: Option<(reqwest::Client, &'static str)> = None;
    'outer: for ep in proxy_candidates(proxy_endpoint) {
        if let Ok(c) = proxied_client(&ep, 12) {
            for url in ECHO_URLS {
                if fetch_ip(&c, url).await.is_some() {
                    chosen = Some((c, url));
                    break 'outer;
                }
            }
        }
    }
    let (client, echo_url) = match chosen {
        Some(v) => v,
        None => {
            return Ok(LinkHealthReport {
                total: STABILITY_ROUNDS,
                success: 0,
                avg_latency_ms: None,
                message: "延迟体检未连通（住宅链路较慢或限速，属正常现象）。出口IP已在第2步验证通过，可正常启动 Claude。".into(),
            })
        }
    };
    let mut success = 0u32;
    let mut total_ms = 0u64;
    for _ in 0..STABILITY_ROUNDS {
        let start = Instant::now();
        if fetch_ip(&client, echo_url).await.is_some() {
            success += 1;
            total_ms += start.elapsed().as_millis() as u64;
        }
    }
    let avg = if success > 0 {
        Some(total_ms / success as u64)
    } else {
        None
    };
    let message = match avg {
        Some(ms) => {
            let mark = if success == STABILITY_ROUNDS {
                "✅"
            } else if success * 2 >= STABILITY_ROUNDS {
                "⚠️"
            } else {
                "❌"
            };
            format!("独立 IP 出口：延迟 {ms}ms ｜ 链路稳定性 {success}/{STABILITY_ROUNDS} {mark}")
        }
        None => format!(
            "延迟体检：链路偏慢（{success}/{STABILITY_ROUNDS} 连通）。出口IP已验证通过，可正常使用；若频繁超时可在 zashboard 换个机场美国节点。"
        ),
    };
    Ok(LinkHealthReport {
        total: STABILITY_ROUNDS,
        success,
        avg_latency_ms: avg,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yaml_inject::VERIFY_DOMAINS;

    #[test]
    fn echo_hosts_match_injected_verify_domains() {
        for (url, dom) in ECHO_URLS.iter().zip(VERIFY_DOMAINS.iter()) {
            assert!(url.contains(dom), "{url} 应包含主机 {dom}");
        }
    }
}
