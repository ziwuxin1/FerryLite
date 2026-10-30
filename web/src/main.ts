// 网页版入口（纯静态）：复用桌面版的配置表单与样式，生成逻辑走 WASM。

import "../../src/styles.css";
import "@fontsource-variable/space-grotesk";
import "./brand.css";
import logoUrl from "../../assets/logo.png";
import { el } from "../../src/dom";
import { setPlatform } from "../../src/platform";
import { renderConfigView } from "../../src/views/config-view";
import { coreVersionLabel, webPlatform } from "./platform.web";

const appEl = document.querySelector<HTMLDivElement>("#app");
if (!appEl) throw new Error("#app 未找到");
const root: HTMLDivElement = appEl;

setPlatform(webPlatform);
const home = el("div", { "data-page": "config" });
root.append(home);

// 品牌页头：满宽黄条 + logo + 品牌名（与 README / 桌面版同一套视觉）。
home.append(
  el("div", { class: "topbar brand" }, [
    el("div", { class: "brand-row" }, [
      el("img", { class: "brand-logo", src: logoUrl, alt: "FerryLite" }),
      el("div", {}, [
        el("span", { class: "brand-name" }, ["FerryLite"]),
        el("span", { class: "brand-sep" }, ["小渡 · YAML 配置生成"]),
      ]),
    ]),
  ]),
);

// 说明条：一句话讲清怎么用，别的不啰嗦。
home.append(
  el("div", { class: "card" }, [
    el("h2", {}, ["怎么用"]),
    el("div", { class: "field-hint" }, [
      "生成电脑版 / 路由器版 Clash YAML，或导入已有 YAML 编辑策略组与站点。订阅与账号密码仅在浏览器本地处理。",
    ]),
  ]),
);

// 生成和源码编辑共用配置入口。
const generator = el("div", {}), editorPanel = el("div", { hidden: true });
const generateTab = el("button", { class: "btn primary", type: "button" }, ["生成新 YAML"]);
const editTab = el("button", { class: "btn", type: "button" }, ["导入 / 编辑 YAML"]);
home.append(el("div", { class: "btn-row", style: "margin-bottom:20px" }, [generateTab, editTab]), generator, editorPanel);
renderConfigView(generator);
let editorLoading: Promise<ReturnType<typeof import("./yaml-editor-view").renderYamlEditor>> | null = null;
function getEditor() {
  if (!editorLoading) editorLoading = import("./yaml-editor-view").then(m => m.renderYamlEditor(editorPanel));
  return editorLoading;
}
async function showEditor(edit: boolean): Promise<void> {
  generator.hidden = edit; editorPanel.hidden = !edit;
  generateTab.classList.toggle("primary", !edit); editTab.classList.toggle("primary", edit);
  if (edit) (await getEditor()).show();
}
generateTab.onclick = () => { void showEditor(false); };
editTab.onclick = () => { void showEditor(true); };
window.addEventListener("ferry:edit-yaml", ((event: CustomEvent<{ yaml: string; filename: string }>) => {
  void showEditor(true).then(async () => { (await getEditor()).load(event.detail.yaml, event.detail.filename); window.scrollTo({ top: 0 }); });
}) as EventListener);

// 版本号角标：显示 WASM 里的核心版本，便于确认用户手上是哪一版生成逻辑。
const badge = document.createElement("div");
badge.className = "core-version-badge";
badge.style.cssText =
  "position:fixed;right:8px;bottom:6px;font-size:12px;opacity:.45;z-index:9999;pointer-events:none;user-select:none;";
document.body.append(badge);
void coreVersionLabel().then((v) => {
  badge.textContent = `core v${v}`;
});
