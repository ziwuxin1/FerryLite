//! 模块3：一键安全关闭。干净熄火 Claude 一侧。见设计 §6.3。
//!
//! 只杀 Claude Code（按记录 PID 杀进程树）+ Claude 桌面 App（按进程名）。
//! **不碰浏览器、不碰 ClashMi / TUN。** 「安全关闭」= 干净结束进程，不改 IP、不抹记录。

use serde::Serialize;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShutdownReport {
    pub cli_killed: bool,
    pub desktop_killed: bool,
    pub details: Vec<String>,
}

pub fn safe_shutdown(cli_pid: Option<u32>, desktop_process: &str) -> ShutdownReport {
    let mut details = Vec::new();

    // 1. Claude Code：用记录的 PID 杀整棵进程树（含 claude 子进程）。
    let cli_killed = match cli_pid {
        Some(pid) => {
            let (ok, msg) = taskkill_pid(pid);
            details.push(msg);
            ok
        }
        None => {
            details.push("未记录 Claude Code 进程（本次可能未从本软件启动 CLI）。".into());
            false
        }
    };

    // 2. Claude 桌面 App：按进程名强制结束。
    let (desktop_killed, dmsg) = taskkill_image(desktop_process);
    details.push(dmsg);

    ShutdownReport {
        cli_killed,
        desktop_killed,
        details,
    }
}

#[cfg(windows)]
fn taskkill_pid(pid: u32) -> (bool, String) {
    let out = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) if o.status.success() => (true, format!("已结束 Claude Code 进程树（PID {pid}）。")),
        Ok(_) => (false, format!("Claude Code 进程（PID {pid}）可能已退出。")),
        Err(e) => (false, format!("结束 Claude Code 失败：{e}")),
    }
}

#[cfg(windows)]
fn taskkill_image(image: &str) -> (bool, String) {
    let out = Command::new("taskkill")
        .args(["/IM", image, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    match out {
        Ok(o) if o.status.success() => {
            (true, format!("已结束 Claude 桌面 App 进程（{image}）。"))
        }
        Ok(_) => (false, format!("未发现运行中的 Claude 桌面 App（{image}）。")),
        Err(e) => (false, format!("结束 Claude 桌面 App 失败：{e}")),
    }
}

#[cfg(not(windows))]
fn taskkill_pid(_pid: u32) -> (bool, String) {
    (false, "仅支持 Windows。".into())
}

#[cfg(not(windows))]
fn taskkill_image(_image: &str) -> (bool, String) {
    (false, "仅支持 Windows。".into())
}
