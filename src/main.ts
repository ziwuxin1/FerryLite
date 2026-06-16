import "./styles.css";
import "@fontsource-variable/space-grotesk"; // 现代 grotesk 字体（打包进 exe，离线/国内可用；中文自动回退雅黑）
import { api } from "./api";
import { renderConfigView } from "./views/config-view";
import { renderDashboardView } from "./views/dashboard-view";

const appEl = document.querySelector<HTMLDivElement>("#app");
if (!appEl) throw new Error("#app 未找到");
const root: HTMLDivElement = appEl;

export type View = "config" | "dashboard";

export async function navigate(view: View): Promise<void> {
  // 取消「页面切换动画」：在满宽固定页头布局上，页面级滑入/淡入在切换瞬间总会露边或闪一下，
  // 反复修不彻底 —— 直接瞬间渲染最稳。按钮 hover、分类下拉这两个动画在各自组件里，保留不受影响。
  root.innerHTML = "";
  if (view === "config") {
    renderConfigView(root, () => void navigate("dashboard"));
    return;
  }
  // 状态盘是主页：即使尚未生成配置也进入（按钮置灰 + 提示），让启动功能从一开始就可见。
  const config = await api.readAppConfig().catch(() => null);
  renderDashboardView(
    root,
    config,
    () => void navigate("config"),
    () => void navigate("dashboard"),
  );
}

// Ctrl + 滚轮 / Ctrl +/-/0：缩放整个界面（WebView2 支持 CSS zoom）。
let zoom = 1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
function applyZoom(): void {
  zoom = Math.round(zoom * 100) / 100;
  document.documentElement.style.setProperty("zoom", String(zoom));
}
window.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    applyZoom();
  },
  { passive: false },
);
window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  if (e.key === "0") {
    zoom = 1;
  } else if (e.key === "=" || e.key === "+") {
    zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
  } else if (e.key === "-") {
    zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
  } else {
    return;
  }
  e.preventDefault();
  applyZoom();
});

// 版本号角标（右下角常驻、跨视图；版本号来自 tauri.conf.json，以后只改那一处）。
const versionBadge = document.createElement("div");
versionBadge.style.cssText =
  "position:fixed;right:8px;bottom:6px;font-size:12px;opacity:.45;z-index:9999;pointer-events:none;user-select:none;";
document.body.appendChild(versionBadge);
void import("@tauri-apps/api/app")
  .then(({ getVersion }) => getVersion())
  .then((v) => {
    versionBadge.textContent = `v${v}`;
  });

void navigate("dashboard");
