//! Tauri 命令层：前端只发指令、收结果，所有系统级操作在这里转交各模块。
//! 浏览器打开（claude.ai / ping0.cc）由前端经 opener 插件完成，不在此重复。

use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

use crate::config::{self, AppConfig, ClashApi};
use crate::health::{self, ExitIpReport, LinkHealthReport};
use crate::launch;
use crate::shutdown::{self, ShutdownReport};
use crate::yaml_inject::{self, GenerateInput, GenerateResult};

/// 跨命令共享状态：记录从本软件启动的 Claude Code（PowerShell）PID。
#[derive(Default)]
pub struct AppState {
    pub cli_pid: Mutex<Option<u32>>,
}

fn require_config(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    config::read_config(app)?
        .ok_or_else(|| "尚未生成配置：请先在『配置生成』完成一次配置。".to_string())
}

// ---------- 模块1：配置生成 ----------

#[tauri::command]
pub fn load_template() -> String {
    yaml_inject::TEMPLATE.to_string()
}

#[tauri::command]
pub fn generate_config(input: GenerateInput) -> Result<GenerateResult, String> {
    yaml_inject::generate(&input)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInput {
    pub path: String,
    pub yaml: String,
    pub exit_basis_ip: String,
    pub proxy_endpoint: String,
    pub clash_api_url: String,
    pub clash_secret: String,
    pub last_updated: String,
    pub claude_code_command: Option<String>,
}

#[tauri::command]
pub fn save_generated(app: tauri::AppHandle, input: SaveInput) -> Result<AppConfig, String> {
    // 1. 写成品 yaml 到学生选定路径。
    std::fs::write(&input.path, input.yaml.as_bytes())
        .map_err(|e| format!("写入 yaml 失败（{}）：{e}", input.path))?;

    // 2. 合并已有配置里的可覆盖项（CLI 命令 / 桌面进程名 / 路径）。
    let existing = config::read_config(&app).ok().flatten();
    let claude_code_command = input
        .claude_code_command
        .filter(|s| !s.trim().is_empty())
        .or_else(|| existing.as_ref().map(|c| c.claude_code_command.clone()))
        .unwrap_or_else(|| config::DEFAULT_CLAUDE_CODE_COMMAND.to_string());
    let claude_desktop_process = existing
        .as_ref()
        .map(|c| c.claude_desktop_process.clone())
        .unwrap_or_else(|| config::DEFAULT_CLAUDE_DESKTOP_PROCESS.to_string());
    let claude_desktop_path = existing.as_ref().and_then(|c| c.claude_desktop_path.clone());

    // 3. 从成品 yaml 解析机场 / 中转站（展示用，不含密码）。
    let airports = yaml_inject::parse_airports(&input.yaml)
        .into_iter()
        .map(|(name, url)| config::AirportInfo { name, url })
        .collect();
    let nodes = yaml_inject::parse_nodes(&input.yaml)
        .into_iter()
        .map(|(name, server, protocol, port)| config::NodeInfo {
            name,
            server,
            protocol,
            port,
        })
        .collect();

    // 4. 组装并写 config.json。
    let cfg = AppConfig {
        version: config::CONFIG_VERSION,
        exit_basis_ip: input.exit_basis_ip,
        proxy_endpoint: input.proxy_endpoint,
        clash_api: ClashApi {
            url: input.clash_api_url,
            secret: input.clash_secret,
        },
        generated_yaml_path: input.path,
        airports,
        nodes,
        claude_code_command,
        claude_desktop_process,
        claude_desktop_path,
        dns_override: yaml_inject::parse_dns_override(&input.yaml),
        last_updated: input.last_updated,
    };
    config::write_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn read_app_config(app: tauri::AppHandle) -> Result<Option<AppConfig>, String> {
    config::read_config(&app)
}

/// 导入已有成品 yaml：解析出基准 IP / 端口 / API，写回 config.json
/// （学生拿老师生成好的 yaml 直接用，免再填表单）。
#[tauri::command]
pub fn import_yaml(
    app: tauri::AppHandle,
    path: String,
    last_updated: String,
) -> Result<AppConfig, String> {
    let yaml =
        std::fs::read_to_string(&path).map_err(|e| format!("读取 yaml 失败（{path}）：{e}"))?;
    let (mixed_port, clash_api_url, clash_secret) = yaml_inject::parse_meta(&yaml)?;
    let exit_basis_ip = yaml_inject::extract_basis_ip(&yaml)?;
    let proxy_endpoint = format!("http://127.0.0.1:{mixed_port}");
    let airports = yaml_inject::parse_airports(&yaml)
        .into_iter()
        .map(|(name, url)| config::AirportInfo { name, url })
        .collect();
    let nodes = yaml_inject::parse_nodes(&yaml)
        .into_iter()
        .map(|(name, server, protocol, port)| config::NodeInfo {
            name,
            server,
            protocol,
            port,
        })
        .collect();

    let existing = config::read_config(&app).ok().flatten();
    let claude_code_command = existing
        .as_ref()
        .map(|c| c.claude_code_command.clone())
        .unwrap_or_else(|| config::DEFAULT_CLAUDE_CODE_COMMAND.to_string());
    let claude_desktop_process = existing
        .as_ref()
        .map(|c| c.claude_desktop_process.clone())
        .unwrap_or_else(|| config::DEFAULT_CLAUDE_DESKTOP_PROCESS.to_string());
    let claude_desktop_path = existing.as_ref().and_then(|c| c.claude_desktop_path.clone());

    let cfg = AppConfig {
        version: config::CONFIG_VERSION,
        exit_basis_ip,
        proxy_endpoint,
        clash_api: ClashApi {
            url: clash_api_url,
            secret: clash_secret,
        },
        generated_yaml_path: path,
        airports,
        nodes,
        claude_code_command,
        claude_desktop_process,
        claude_desktop_path,
        dns_override: yaml_inject::parse_dns_override(&yaml),
        last_updated,
    };
    config::write_config(&app, &cfg)?;
    Ok(cfg)
}

/// 清除当前配置（删除 config.json，回到未配置）。不动磁盘上的成品 yaml。
#[tauri::command]
pub fn clear_config(app: tauri::AppHandle) -> Result<(), String> {
    let path = config::config_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("清除配置失败：{e}"))?;
    }
    Ok(())
}

/// DNS 覆写开关：直接改成品 yaml 里 dns 段的 enable 并回写（免重新生成整份配置）。
/// 机场公告场景：线路调整后要求「关闭 DNS 覆写 + 重新导入订阅」；切完需把 yaml 重新拖进 ClashMi。
#[tauri::command]
pub fn set_dns_override(app: tauri::AppHandle, enable: bool) -> Result<AppConfig, String> {
    let mut cfg = require_config(&app)?;
    let path = cfg.generated_yaml_path.clone();
    let yaml =
        std::fs::read_to_string(&path).map_err(|e| format!("读取成品 yaml 失败（{path}）：{e}"))?;
    let patched = yaml_inject::set_dns_enable(&yaml, enable)?;
    std::fs::write(&path, patched.as_bytes())
        .map_err(|e| format!("写入 yaml 失败（{path}）：{e}"))?;
    cfg.dns_override = enable;
    config::write_config(&app, &cfg)?;
    Ok(cfg)
}

/// 把「实际出口IP」设为校验基准：住宅代理常「入口网关域名 ≠ 真实出口IP」，
/// 第2步检测到的出口若是有效公网IP，前端一键调本命令把它写成基准，免去重新生成。
#[tauri::command]
pub fn set_exit_basis(app: tauri::AppHandle, ip: String) -> Result<AppConfig, String> {
    let ip = ip.trim().to_string();
    if ip.is_empty() {
        return Err("出口 IP 不能为空。".into());
    }
    let mut cfg = require_config(&app)?;
    cfg.exit_basis_ip = ip;
    config::write_config(&app, &cfg)?;
    Ok(cfg)
}

// ---------- 模块2/4：体检（异步，经本地代理）----------

#[tauri::command]
pub async fn check_clash(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = require_config(&app)?;
    health::check_clash(&cfg.clash_api.url, &cfg.clash_api.secret).await
}

#[tauri::command]
pub async fn verify_exit_ip(app: tauri::AppHandle) -> Result<ExitIpReport, String> {
    let cfg = require_config(&app)?;
    let report = health::verify_exit_ip(
        &cfg.proxy_endpoint,
        &cfg.exit_basis_ip,
        &cfg.clash_api.url,
        &cfg.clash_api.secret,
    )
    .await?;
    // 自动识别到的可用端口与配置不同 → 写回 config，后续链路体检 / 启动 Claude Code 用对端口。
    if !report.proxy_endpoint.is_empty() && report.proxy_endpoint != cfg.proxy_endpoint {
        if let Ok(Some(mut c)) = config::read_config(&app) {
            c.proxy_endpoint = report.proxy_endpoint.clone();
            let _ = config::write_config(&app, &c);
        }
    }
    Ok(report)
}

#[tauri::command]
pub async fn link_health(app: tauri::AppHandle) -> Result<LinkHealthReport, String> {
    let cfg = require_config(&app)?;
    health::link_health(&cfg.proxy_endpoint).await
}

// ---------- 模块2：拉起 Claude ----------

#[tauri::command]
pub fn launch_claude_code(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<u32, String> {
    let cfg = require_config(&app)?;
    let pid = launch::launch_claude_code(&cfg.proxy_endpoint, &cfg.claude_code_command)?;
    *state
        .cli_pid
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())? = Some(pid);
    Ok(pid)
}

#[tauri::command]
pub fn launch_claude_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let cfg = require_config(&app)?;
    launch::launch_claude_desktop(cfg.claude_desktop_path.as_deref())
}

// ---------- 模块3：一键安全关闭 ----------

#[tauri::command]
pub fn safe_shutdown(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ShutdownReport, String> {
    let desktop_process = require_config(&app)
        .ok()
        .map(|c| c.claude_desktop_process)
        .unwrap_or_else(|| config::DEFAULT_CLAUDE_DESKTOP_PROCESS.to_string());

    let pid = state
        .cli_pid
        .lock()
        .map_err(|_| "内部状态锁异常".to_string())?
        .take();

    Ok(shutdown::safe_shutdown(pid, &desktop_process))
}
