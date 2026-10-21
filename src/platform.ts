// 平台接缝：配置生成表单（views/config-view）唯一的对外依赖。
//
// 桌面版（Tauri）和网页版（纯静态 + WASM）共用同一份表单与同一份生成逻辑（ferry-core），
// 差别只有两件事 —— 怎么算、怎么落地。两端各实现一次这个接口，表单本身无需知道自己跑在哪。

import type { GenerateInput, GenerateResult } from "./api";

export interface Platform {
  /** desktop=Tauri 桌面版（可体检/启停）；web=纯静态网页版（只生成配置，数据不出浏览器）。 */
  readonly kind: "desktop" | "web";
  /** 生成成品配置。桌面版走 tauri invoke，网页版走 WASM，底层都是 ferry-core。 */
  generateConfig(input: GenerateInput): Promise<GenerateResult>;
  /** 落地成品。返回给用户看的成功提示文案；null = 用户主动取消。 */
  saveResult(result: GenerateResult): Promise<string | null>;
}

let current: Platform | null = null;

export function setPlatform(p: Platform): void {
  current = p;
}

export function platform(): Platform {
  if (!current) throw new Error("platform 未初始化：入口必须先调用 setPlatform()。");
  return current;
}
