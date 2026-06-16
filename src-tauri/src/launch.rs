//! 模块2 拉起 Claude（三按钮中的 CLI / 桌面）。见设计 §6.2。
//! 浏览器打开交给 opener 插件（见 commands::open_external）。
//! **不接管代理、不开 TUN、不切节点。**

use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// 启动 Claude Code（CLI）：新开 PowerShell 控制台，注入代理环境变量后运行命令，
/// 便于学生交互。返回该 PowerShell 进程 PID（供模块3 精确关闭整棵进程树）。
pub fn launch_claude_code(proxy_endpoint: &str, claude_command: &str) -> Result<u32, String> {
    // 单引号转义，避免 proxy_endpoint 破坏 PowerShell 字符串。
    let inner = format!(
        "$env:HTTPS_PROXY='{p}'; $env:HTTP_PROXY='{p}'; $env:NO_PROXY='localhost,127.0.0.1,::1'; {cmd}",
        p = proxy_endpoint.replace('\'', "''"),
        cmd = claude_command
    );

    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoExit", "-NoProfile", "-Command", &inner])
        // 进程环境也注入一遍，双保险（子进程 claude 直接继承）。
        .env("HTTPS_PROXY", proxy_endpoint)
        .env("HTTP_PROXY", proxy_endpoint)
        .env("NO_PROXY", "localhost,127.0.0.1,::1");

    #[cfg(windows)]
    command.creation_flags(CREATE_NEW_CONSOLE);

    let child = command.spawn().map_err(|e| {
        format!("启动 Claude Code 失败：{e}。请确认已安装 CLI，且命令「{claude_command}」可用。")
    })?;
    Ok(child.id())
}

/// 启动 Claude 桌面 App（走系统 TUN，不需环境变量）。优先用显式路径，否则自动探测常见安装位置。
pub fn launch_claude_desktop(explicit_path: Option<&str>) -> Result<(), String> {
    let candidates: Vec<String> = match explicit_path {
        Some(p) if !p.trim().is_empty() => vec![p.trim().to_string()],
        _ => default_desktop_candidates(),
    };

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            Command::new(path)
                .spawn()
                .map_err(|e| format!("启动 Claude 桌面 App 失败（{path}）：{e}"))?;
            return Ok(());
        }
    }
    Err(
        "未找到 Claude 桌面 App。请手动启动，或在 config.json 设置 claudeDesktopPath 指向 Claude.exe。"
            .into(),
    )
}

#[cfg(windows)]
fn default_desktop_candidates() -> Vec<String> {
    // 已知安装根目录。Anthropic 桌面版走 Squirrel/Electron，主程序在
    // `LOCALAPPDATA\AnthropicClaude\app-<版本>\Claude.exe`（版本号会变），
    // 故不能写死路径，需扫描根目录 + 版本化子目录。
    let mut roots: Vec<String> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(format!("{local}\\AnthropicClaude"));
        roots.push(format!("{local}\\Programs\\claude"));
        roots.push(format!("{local}\\Programs\\Claude"));
        roots.push(format!("{local}\\Claude"));
    }
    if let Ok(pf) = std::env::var("PROGRAMFILES") {
        roots.push(format!("{pf}\\Claude"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
        roots.push(format!("{pf}\\Claude"));
    }

    let mut v = Vec::new();
    for root in &roots {
        scan_root_for_claude(root, &mut v);
    }
    v
}

/// 在一个安装根目录里找 Claude.exe：先根目录的启动壳，再版本化子目录
/// `app-*\Claude.exe`（按修改时间新→旧，确保选中最新安装的版本）。
#[cfg(windows)]
fn scan_root_for_claude(root: &str, out: &mut Vec<String>) {
    // 1) 根目录启动壳（Squirrel 常在根放一个 Claude.exe stub）
    out.push(format!("{root}\\Claude.exe"));
    // 2) 版本化子目录 app-*\Claude.exe
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut apps: Vec<std::path::PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("app-"))
                    .unwrap_or(false)
        })
        .collect();
    let mtime = |p: &std::path::PathBuf| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    apps.sort_by(|a, b| mtime(b).cmp(&mtime(a))); // 新→旧
    for dir in apps {
        out.push(format!("{}\\Claude.exe", dir.display()));
    }
}

#[cfg(not(windows))]
fn default_desktop_candidates() -> Vec<String> {
    Vec::new()
}
