// 网页版入口（纯静态）：复用桌面版的配置表单与样式，生成逻辑走 WASM。
// 桌面版独有的链路体检 / Claude 启停需要操作本机进程与端口，浏览器做不到，这里不提供。

import "../../src/styles.css";
import "@fontsource-variable/space-grotesk";
import { el } from "../../src/dom";
import { setPlatform } from "../../src/platform";
import { renderConfigView } from "../../src/views/config-view";
import { coreVersionLabel, webPlatform } from "./platform.web";

const appEl = document.querySelector<HTMLDivElement>("#app");
if (!appEl) throw new Error("#app 未找到");
const root: HTMLDivElement = appEl;

setPlatform(webPlatform);

// 说明条：讲清楚这版能做什么、不能做什么，以及数据不出浏览器这件事。
root.append(
  el("div", { class: "card" }, [
    el("h2", {}, ["网页版 · 只生成配置"]),
    el("div", { class: "field-hint" }, [
      "填完点生成，直接下载成品 yaml，再导入你自己的 Clash 客户端（Clash Verge / Mihomo Party / OpenClash 等）。",
    ]),
    el("div", { class: "field-hint" }, [
      "订阅链接和独立 IP 的账号密码只在本页内存里参与计算，不经过任何服务器 —— 这个页面是纯静态的，没有后端。",
    ]),
    el("div", { class: "field-hint" }, [
      "链路体检、出口 IP 校验、Claude 一键启停需要操作本机端口和进程，浏览器无法实现，这些功能请用桌面版。",
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
