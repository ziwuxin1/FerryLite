//! ferry-core 的 WASM 包装层。
//!
//! 这里只做 JSON 进 / JSON 出的搬运，一行生成逻辑都不写 —— 分流规则、模板注入、校验
//! 全部来自 ferry-core，桌面版（tauri invoke）与网页版（这里）共用同一份实现，
//! 以后加分流只改 ferry-core 一处，两端同时生效。

use wasm_bindgen::prelude::*;

/// 生成成品配置。入参 / 回参都是 JSON 字符串，字段名与桌面版 invoke 完全一致
/// （两边的结构体都是 serde camelCase），所以前端构造的 payload 不需要改。
#[wasm_bindgen(js_name = generateConfig)]
pub fn generate_config(input_json: &str) -> Result<String, JsError> {
    let input: ferry_core::GenerateInput =
        serde_json::from_str(input_json).map_err(|e| JsError::new(&format!("入参解析失败：{e}")))?;
    let result = ferry_core::generate(&input).map_err(|e| JsError::new(&e))?;
    serde_json::to_string(&result).map_err(|e| JsError::new(&format!("结果序列化失败：{e}")))
}

/// 核心版本号（编译期注入）：网页版页脚显示，便于确认用户手里是哪一版生成逻辑。
#[wasm_bindgen(js_name = coreVersion)]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
