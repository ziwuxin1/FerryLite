// 桌面版平台实现：生成走 tauri invoke，落地走系统保存对话框 + 后端写盘（顺带记账到 app config）。

import { save } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import type { GenerateInput, GenerateResult } from "./api";
import type { Platform } from "./platform";

export const tauriPlatform: Platform = {
  kind: "desktop",

  generateConfig: (input: GenerateInput) => api.generateConfig(input),

  async saveResult(result: GenerateResult): Promise<string | null> {
    const path = await save({
      title: "保存成品 Clash 配置",
      defaultPath: result.suggestedFileName,
      filters: [{ name: "Clash 配置", extensions: ["yaml", "yml"] }],
    });
    if (!path) return null;
    const cfg = await api.saveGenerated({
      path,
      yaml: result.yaml,
      exitBasisIp: result.exitBasisIp,
      proxyEndpoint: result.proxyEndpoint,
      clashApiUrl: result.clashApiUrl,
      clashSecret: result.clashSecret,
      lastUpdated: new Date().toISOString(),
    });
    return `已保存到：${cfg.generatedYamlPath}\n请把它导入你的 Clash 客户端，再回主页点「一键代理」。`;
  },
};
