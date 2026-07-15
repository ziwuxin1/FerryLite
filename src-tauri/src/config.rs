//! 本地配置（config.json）模型与读写。见设计 §4。
//!
//! 由配置生成器写入、状态盘读取。所有抽象值（基准 IP、端口、API 信息）均来自
//! 学生在配置生成器里的输入，软件里**无任何写死的 IP / 品牌**。换 IP / 换服务商
//! 时重跑配置生成器即自动更新。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

pub const CONFIG_VERSION: u32 = 1;
pub const CONFIG_FILE_NAME: &str = "config.json";

/// CLI 默认启动命令（可被老师/学生覆盖）。
pub const DEFAULT_CLAUDE_CODE_COMMAND: &str = "claude";
/// Claude 桌面 App 进程名，用于精确查杀。
/// ⚠️ 设计 §7.3.4：真实进程名需实测确认；此处给默认值并允许 config 覆盖。
pub const DEFAULT_CLAUDE_DESKTOP_PROCESS: &str = "Claude.exe";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClashApi {
    pub url: String,
    pub secret: String,
}

/// 机场信息（用于「当前配置」展示）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AirportInfo {
    pub name: String,
    pub url: String,
}

/// 中转站（独立 IP 节点）摘要（展示用，不含密码）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub name: String,
    pub server: String,
    pub protocol: String,
    #[serde(default)]
    pub port: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    /// 验证基准：学生填的 NovProxy server 值（域名时在 health 里解析后比对）。
    pub exit_basis_ip: String,
    /// 本地代理端点：从生成 yaml 的 mixed-port 拼成，如 http://127.0.0.1:7893。
    pub proxy_endpoint: String,
    pub clash_api: ClashApi,
    /// 上次另存为的成品 yaml 路径。
    pub generated_yaml_path: String,
    /// 机场列表（展示用）。
    #[serde(default)]
    pub airports: Vec<AirportInfo>,
    /// 中转站独立 IP 节点摘要（展示用，不含密码）。
    #[serde(default)]
    pub nodes: Vec<NodeInfo>,
    #[serde(default = "default_claude_code_command")]
    pub claude_code_command: String,
    #[serde(default = "default_claude_desktop_process")]
    pub claude_desktop_process: String,
    /// 可选：Claude 桌面 App 的 exe 绝对路径（自动探测失败时手动指定）。
    #[serde(default)]
    pub claude_desktop_path: Option<String>,
    /// DNS 覆写状态（成品 yaml 里 dns.enable 的值）。机场公告要求关闭时可在状态盘一键切换。
    #[serde(default = "default_dns_override")]
    pub dns_override: bool,
    pub last_updated: String,
}

fn default_dns_override() -> bool {
    true
}

fn default_claude_code_command() -> String {
    DEFAULT_CLAUDE_CODE_COMMAND.to_string()
}
fn default_claude_desktop_process() -> String {
    DEFAULT_CLAUDE_DESKTOP_PROCESS.to_string()
}

/// `%APPDATA%/<identifier>/config.json`（Tauri 标准应用配置目录）。
pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

/// 读取本地配置；不存在返回 None（首次使用）。
pub fn read_config(app: &tauri::AppHandle) -> Result<Option<AppConfig>, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("读取配置失败：{e}"))?;
    let cfg =
        serde_json::from_str::<AppConfig>(&text).map_err(|e| format!("配置文件解析失败：{e}"))?;
    Ok(Some(cfg))
}

/// 写入本地配置（自动创建目录）。
pub fn write_config(app: &tauri::AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败：{e}"))?;
    }
    let text = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化配置失败：{e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("写入配置失败：{e}"))?;
    Ok(())
}
