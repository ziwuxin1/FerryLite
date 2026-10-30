// 桌面版只生成并导出 YAML，不保存运行状态。
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import type { Platform } from "./platform";

export const tauriPlatform: Platform = {
  kind: "desktop",
  generateConfig: (input) => api.generateConfig(input),
  async saveResult(result) {
    const path = await save({
      title: "保存 YAML 配置",
      defaultPath: result.suggestedFileName,
      filters: [{ name: "YAML 配置", extensions: ["yaml", "yml"] }],
    });
    if (!path) return null;
    await api.exportConfig(path, result.yaml);
    return `已导出到：${path}\n${result.instructions}`;
  },
};
