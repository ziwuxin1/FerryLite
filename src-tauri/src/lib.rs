//! Claude 一键启动器 — 库入口。注册插件、共享状态、命令、系统托盘。
//!
//! 架构：前端（Web UI）只发指令、收结果；后端（这里 + 各模块）做全部系统级操作。
//! 关闭窗口 → 隐藏到托盘（不退出）；托盘菜单「退出」才彻底关闭。
//! 见 doc/2026-06-11-claude-launcher-design.md。

mod commands;
mod config;
mod health;
mod launch;
mod shutdown;
mod yaml_inject;

use commands::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            // 窗口标题带版本号（编译期 CARGO_PKG_VERSION，自动跟随版本，无需手改）。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("Ferry · 链式代理 v{}", env!("CARGO_PKG_VERSION")));
            }
            // 系统托盘：关闭窗口后缩到这里，从托盘恢复 / 退出。
            let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut builder = TrayIconBuilder::with_id("main")
                .tooltip("Claude 一键启动器")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
            builder.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 关闭窗口 → 隐藏到托盘，不退出（用托盘菜单「退出」彻底关闭）。
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_template,
            commands::generate_config,
            commands::save_generated,
            commands::read_app_config,
            commands::import_yaml,
            commands::clear_config,
            commands::set_dns_override,
            commands::set_exit_basis,
            commands::check_clash,
            commands::verify_exit_ip,
            commands::link_health,
            commands::launch_claude_code,
            commands::launch_claude_desktop,
            commands::safe_shutdown,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
