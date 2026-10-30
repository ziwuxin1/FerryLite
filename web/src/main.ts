// 网页版入口（纯静态）：复用桌面版的配置表单与样式，生成逻辑走 WASM。

import "../../src/styles.css";
import "@fontsource-variable/space-grotesk";
import "../../src/brand.css";
import { setPlatform } from "../../src/platform";
import { renderApp } from "../../src/app-view";
import { coreVersionLabel, webPlatform } from "./platform.web";

const appEl = document.querySelector<HTMLDivElement>("#app");
if (!appEl) throw new Error("#app 未找到");
const root: HTMLDivElement = appEl;

setPlatform(webPlatform);
renderApp(root);

// 版本号角标：显示 WASM 里的核心版本，便于确认用户手上是哪一版生成逻辑。
const badge = document.createElement("div");
badge.className = "core-version-badge";
badge.style.cssText =
  "position:fixed;right:8px;bottom:6px;font-size:12px;opacity:.45;z-index:9999;pointer-events:none;user-select:none;";
document.body.append(badge);
void coreVersionLabel().then((v) => {
  badge.textContent = `core v${v}`;
});
