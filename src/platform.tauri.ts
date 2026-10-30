// 桌面版只生成并导出 YAML，不保存运行状态。
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import type { Platform } from "./platform";

export const tauriPlatform: Platform = {
  kind: "desktop",
  generateConfig: (input) => api.generateConfig(input),
  async saveYaml(source, filename) {
    const path = await save({
      title: "保存 YAML 配置",
      defaultPath: filename,
      filters: [{ name: "YAML 配置", extensions: ["yaml", "yml"] }],
    });
    if (!path) return null;
    await api.exportConfig(path, source);
    return `已保存到：${path}`;
  },
  async saveResult(result) {
    const done = await this.saveYaml(result.yaml, result.suggestedFileName);
    return done ? `${done}\n${result.instructions}` : null;
  },
};
