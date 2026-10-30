// 网页版平台实现：生成走 WASM（ferry-core 编译产物，与桌面版同源），落地走浏览器下载。
//
// 全程没有服务端：机场订阅链接、独立 IP 的账号密码都只在这个页面的内存里待一会儿，
// 算完直接变成一个下载文件，不发往任何地方。

import type { GenerateInput, GenerateResult } from "../../src/api";
import type { Platform } from "../../src/platform";
import init, { coreVersion, generateConfig } from "./ferry-wasm/ferry_wasm.js";
// 显式把 .wasm 交给 vite 当资源处理，dev 与 build 都能正确拿到 URL。
import wasmUrl from "./ferry-wasm/ferry_wasm_bg.wasm?url";

let booting: Promise<unknown> | null = null;

/** 懒加载 WASM：首次生成时才下载那 ~300KB，打开页面不花这个流量。 */
function ensureReady(): Promise<unknown> {
  if (!booting) booting = init({ module_or_path: wasmUrl });
  return booting;
}

export const webPlatform: Platform = {
  kind: "web",

  async generateConfig(input: GenerateInput): Promise<GenerateResult> {
    await ensureReady();
    try {
      return JSON.parse(generateConfig(JSON.stringify(input))) as GenerateResult;
    } catch (e) {
      // WASM 抛出的是 Error，message 就是 ferry-core 的校验文案；
      // 剥掉 Error 包装再抛，让提示和桌面版逐字一致。
      throw new Error(e instanceof Error ? e.message : String(e));
    }
  },

  async saveResult(result: GenerateResult): Promise<string | null> {
    const blob = new Blob([result.yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.suggestedFileName;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return `已下载 ${result.suggestedFileName}。\n${result.instructions}`;
  },
};

/** 核心版本号（WASM 里编译期注入），页脚显示用。 */
export async function coreVersionLabel(): Promise<string> {
  await ensureReady();
  return coreVersion();
}
