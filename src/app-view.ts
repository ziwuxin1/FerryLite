import logoUrl from "../assets/logo.png";
import { el } from "./dom";
import { renderConfigView } from "./views/config-view";

export function renderApp(root: HTMLElement): void {
  const home = el("div", { "data-page": "config" });
  root.append(home);

  // Shared branding and editor navigation for browser and desktop.
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
        "生成电脑版 / 路由器版 Clash YAML，或导入已有 YAML 编辑策略组与站点。订阅与账号密码仅在本地处理。",
      ]),
    ]),
  );

  // 生成和源码编辑共用配置入口。
  const generator = el("div", {}), editorPanel = el("div", { hidden: true });
  const generateTab = el("button", { class: "btn primary", type: "button" }, ["生成新 YAML"]);
  const editTab = el("button", { class: "btn", type: "button" }, ["导入 / 编辑 YAML"]);
  home.append(el("div", { class: "btn-row", style: "margin-bottom:20px" }, [generateTab, editTab]), generator, editorPanel);
  renderConfigView(generator);
  let editorLoading: Promise<ReturnType<typeof import("./views/yaml-editor-view").renderYamlEditor>> | null = null;
  function getEditor() {
    if (!editorLoading) editorLoading = import("./views/yaml-editor-view").then(m => m.renderYamlEditor(editorPanel));
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

}
