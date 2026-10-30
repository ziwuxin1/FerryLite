//! 纯 YAML 生成与文件导出。
use ferry_core::{GenerateInput, GenerateResult};

#[tauri::command]
pub fn generate_config(input: GenerateInput) -> Result<GenerateResult, String> {
    ferry_core::generate(&input)
}

#[tauri::command]
pub fn export_config(path: String, yaml: String) -> Result<(), String> {
    std::fs::write(&path, yaml.as_bytes()).map_err(|e| format!("导出失败：{e}"))
}
