import logoUrl from "../assets/ferrylite-brand/ferrylite-logo.svg";
import { el } from "./dom";
import { renderConfigView } from "./views/config-view";

export function renderApp(root: HTMLElement, guided = false): void {
  const home = el("div", { "data-page": "config" });
  root.append(home);

  // Shared branding and editor navigation for browser and desktop.
  home.append(
    el("div", { class: "topbar brand" }, [
      el(guided ? "a" : "div", guided
        ? { class: "brand-row tool-brand-link", href: "/", "aria-label": "FerryLite 小渡首页" }
        : { class: "brand-row" }, [
        el("img", { class: "brand-logo", src: logoUrl, alt: "FerryLite" }),
        el("div", {}, [
          el("span", { class: "brand-name" }, ["FerryLite"]),
          el("span", { class: "brand-sep" }, ["小渡 · YAML 配置生成"]),
        ]),
      ]),
    ]),
  );

  // 说明条：一句话讲清怎么用，别的不啰嗦。
  const content = el("main", { class: guided ? "tool-content" : "" });
  const nav = el("nav", { class: "tool-steps", "aria-label": "配置步骤" }, [el("div", { class: "steps-caption" }, ["步骤"])]);
  if (guided) {
    ["导出版本", "DNS 覆写", "机场订阅", "独立 IP", "分流选择", "自定义分流"].forEach((label, i) => {
      nav.append(el("a", { href: `#config-step-${i + 1}` }, [el("span", {}, [String(i + 1).padStart(2, "0")]), label]));
    });
    home.append(el("div", { class: "tool-layout" }, [nav, content]));
  } else home.append(content);
  content.append(
    el("div", { class: guided ? "tool-intro" : "card" }, [
      el(guided ? "h1" : "h2", {}, [guided ? "生成你的 Clash 配置" : "怎么用"]),
      el("div", { class: "field-hint" }, [
        "生成电脑版 / 路由器版 Clash YAML，或导入已有 YAML 编辑策略组与站点。订阅与账号密码仅在本地处理。",
      ]),
    ]),
  );

  // 生成和源码编辑共用配置入口。
  const generator = el("div", {}), editorPanel = el("div", { hidden: true });
  const generateTab = el("button", { class: "btn primary", type: "button" }, ["生成新 YAML"]);
  const editTab = el("button", { class: "btn", type: "button" }, ["导入 / 编辑 YAML"]);
  generator.className = "generator-panel";
  editorPanel.className = "editor-panel";
  content.append(el("div", { class: "btn-row tool-mode-tabs", style: "margin-bottom:20px" }, [generateTab, editTab]), generator, editorPanel);
  renderConfigView(generator, guided);
  let editorLoading: Promise<ReturnType<typeof import("./views/yaml-editor-view").renderYamlEditor>> | null = null;
  function getEditor() {
    if (!editorLoading) editorLoading = import("./views/yaml-editor-view").then(m => m.renderYamlEditor(editorPanel));
    return editorLoading;
  }
  async function showEditor(edit: boolean): Promise<void> {
    generator.hidden = edit; editorPanel.hidden = !edit;
    if (guided) { nav.hidden = edit; home.classList.toggle("editing-yaml", edit); }
    generateTab.classList.toggle("primary", !edit); editTab.classList.toggle("primary", edit);
    if (edit) (await getEditor()).show();
  }
  generateTab.onclick = () => { void showEditor(false); };
  editTab.onclick = () => { void showEditor(true); };
  window.addEventListener("ferry:edit-yaml", ((event: CustomEvent<{ yaml: string; filename: string }>) => {
    void showEditor(true).then(async () => { (await getEditor()).load(event.detail.yaml, event.detail.filename); window.scrollTo({ top: 0 }); });
  }) as EventListener);

}
