// 网页版入口（纯静态）：复用桌面版的配置表单与样式，生成逻辑走 WASM。

import "../../src/styles.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "../../src/brand.css";
import "./tool.css";
import "./config-design.css";
import { setPlatform } from "../../src/platform";
import { renderApp } from "../../src/app-view";
import { coreVersionLabel, webPlatform } from "./platform.web";

const appEl = document.querySelector<HTMLDivElement>("#app");
if (!appEl) throw new Error("#app 未找到");
const root: HTMLDivElement = appEl;

// Share the homepage preference without rebuilding the form or editor on toggle.
document.documentElement.classList.add("tool-page");
let stored: string | null = null;
try { stored = localStorage.getItem("ferry-landing-theme"); } catch { /* Storage is optional. */ }
let theme = stored === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;

root.replaceChildren();
setPlatform(webPlatform);
renderApp(root, true);
const header = root.querySelector<HTMLElement>(".topbar.brand");
if (header) {
  header.classList.add("web-tool-header");
  const back = document.createElement("a");
  back.href = "/";
  back.className = "tool-home-link";
  back.textContent = "← 返回首页";
  const actions = document.createElement("div");
  actions.className = "tool-header-actions";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tool-home-link tool-theme-toggle";
  function applyTheme(): void {
    document.documentElement.dataset.theme = theme;
    const label = `切换为${theme === "dark" ? "浅色" : "深色"}模式`;
    toggle.textContent = theme === "dark" ? "☀ 浅色" : "☾ 深色";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }
  applyTheme();
  toggle.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme();
    try { localStorage.setItem("ferry-landing-theme", theme); } catch { /* Storage is optional. */ }
  };
  actions.append(toggle, back);
  header.append(actions);
}

// 版本号角标：显示 WASM 里的核心版本，便于确认用户手上是哪一版生成逻辑。
const badge = document.createElement("div");
badge.className = "core-version-badge";
badge.style.cssText =
  "position:fixed;right:8px;bottom:6px;font-size:12px;opacity:.45;z-index:9999;pointer-events:none;user-select:none;";
document.body.append(badge);
void coreVersionLabel().then((v) => {
  badge.textContent = `core v${v}`;
});
