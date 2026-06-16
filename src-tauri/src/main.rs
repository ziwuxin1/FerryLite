// 发布版禁止额外弹出控制台窗口（Windows）。请勿删除这行。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claude_launcher_lib::run();
}
