//! Ferry YAML 配置生成器。关闭窗口即退出。
mod commands;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&format!("Ferry · YAML 配置生成 v{}", env!("CARGO_PKG_VERSION")))?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::generate_config, commands::export_config])
        .run(tauri::generate_context!())
        .expect("运行 Ferry 失败");
}
