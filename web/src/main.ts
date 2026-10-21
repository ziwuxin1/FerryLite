// 网页版入口（纯静态）：复用桌面版的配置表单与样式，生成逻辑走 WASM。
// 桌面版独有的链路体检 / 本机应用启停需要操作本机进程与端口，浏览器做不到，这里不提供。

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

// 品牌页头：满宽黄条 + logo + 品牌名（与 README / 桌面版同一套视觉）。
root.append(
  el("div", { class: "topbar brand" }, [
    el("div", { class: "brand-row" }, [
      el("img", { class: "brand-logo", src: logoUrl, alt: "Ferry" }),
      el("div", {}, [
        el("span", { class: "brand-name" }, ["Ferry"]),
        el("span", { class: "brand-sep" }, ["· 链式代理"]),
      ]),
    ]),
  ]),
);

// 说明条：一句话讲清怎么用，别的不啰嗦。
root.append(
  el("div", { class: "card" }, [
    el("h2", {}, ["怎么用"]),
    el("div", { class: "field-hint" }, [
      "输入机场名字和订阅链接，然后直接保存即可。",
    ]),
  ]),
);

// 网页版只有这一个表单页：生成完留在原地，不跳转。
renderConfigView(root, () => {});

// 版本号角标：显示 WASM 里的核心版本，便于确认用户手上是哪一版生成逻辑。
const badge = document.createElement("div");
badge.style.cssText =
  "position:fixed;right:8px;bottom:6px;font-size:12px;opacity:.45;z-index:9999;pointer-events:none;user-select:none;";
document.body.append(badge);
void coreVersionLabel().then((v) => {
  badge.textContent = `core v${v}`;
});
