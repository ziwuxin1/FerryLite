import { basicSetup, EditorView } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { autocompletion, startCompletion, type CompletionContext } from "@codemirror/autocomplete";
import { linter, lintGutter } from "@codemirror/lint";
import { el } from "../dom";
import { platform } from "../platform";
import { domainLogo } from "./group-domain-manager";
import { addSites, completeSiteDomains, inspectYaml, MAX_YAML_SIZE, normalizeDomains, readYaml, removeDomainRule, safeFix, setDefaultExit, setGroupIcon, siteSuggestion, SITES } from "../yaml-editor";

const fields = ["proxies", "proxy-providers", "proxy-groups", "rules", "rule-providers", "dns", "tun", "mode", "mixed-port", "external-controller", "secret", "name", "type", "server", "port", "username", "password", "icon", "filter", "use", "include-all-providers", "dialer-proxy", "interval", "url", "enable", "listen", "nameserver", "enhanced-mode"];
const ruleTypes = ["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "RULE-SET", "GEOSITE", "GEOIP", "IP-CIDR", "MATCH"];
const input = (label: string, placeholder = "") => el("input", { type: "text", "aria-label": label, placeholder }) as HTMLInputElement;
const field = (label: string, control: HTMLElement) => el("div", { class: "field" }, [el("label", {}, [label]), control]);
const button = (label: string, action: () => void, primary = false) => el("button", { class: `btn btn-sm${primary ? " primary" : ""}`, onclick: action }, [label]);

export function renderYamlEditor(root: HTMLElement) {
  const status = el("div", { class: "status-line", role: "status", "aria-live": "polite" });
  const fileInfo = el("div", { class: "field-hint", role: "status", "aria-live": "polite", style: "margin-top:12px" }, ["尚未选择文件，也可在下方粘贴完整 YAML。"]);
  let filename = "Ferry", loadedSource = "", knownNames: string[] = [], knownDomains: string[] = [];
  const groupSelect = el("select", { "aria-label": "编辑已有策略组" }) as HTMLSelectElement;
  const exitSelect = el("select", { "aria-label": "策略组默认出口" }) as HTMLSelectElement;
  const upstream = el("select", { "aria-label": "新策略组的出口" }) as HTMLSelectElement;
  const domainList = el("div", { class: "editor-domain-list" });
  const groupSummary = el("div", { class: "field-hint" });
  const editorHost = el("div", { class: "yaml-source-editor" });
  const message = (text: string, error = false) => { status.textContent = text; status.className = `status-line ${error ? "err" : "ok"}`; };
  function complete(context: CompletionContext) {
    const word = context.matchBefore(/[\w\u0080-\uFFFF.·/-]*/);
    if (!word || (!word.text && !context.explicit)) return null;
    return { from: word.from, options: [
      ...fields.map(label => ({ label, type: "property", apply: `${label}: ` })),
      ...ruleTypes.map(label => ({ label, type: "keyword" })),
      ...knownNames.map(label => ({ label, type: "variable", detail: "已有出口 / 策略组" })),
      ...[...new Set([...knownDomains, ...SITES.flatMap(s => s.domains)])].map(label => ({ label, type: "text", detail: "域名" })),
    ] };
  }
  const editor = new EditorView({ parent: editorHost, extensions: [
    basicSetup, yaml(), autocompletion({ override: [complete] }), lintGutter(),
    linter(view => inspectYaml(view.state.doc.toString()).map(p => ({ ...p, from: Math.min(p.from, view.state.doc.length), to: Math.min(Math.max(p.from, p.to), view.state.doc.length) })), { delay: 700 }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": "YAML 源码编辑器", spellcheck: "false" }),
    EditorView.theme({ "&": { maxHeight: "560px", fontSize: "13px" }, ".cm-scroller": { overflow: "auto", minHeight: "300px" }, ".cm-content": { fontFamily: "Consolas, monospace" } }),
  ] });
  const text = () => editor.state.doc.toString();
  const replaceText = (source: string) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
  function run(action: () => void): void { try { action(); } catch (e) { message((e as Error).message, true); } }
  function check(): void {
    const issues = inspectYaml(text());
    if (issues.length) message(issues.map(p => `${p.severity === "error" ? "错误" : "提示"}：${p.message}`).join("\n"), issues.some(p => p.severity === "error"));
    else message("YAML 语法、策略组引用与规则目标检查通过。仍需由实际客户端验证节点可用性。");
  }
  function refreshGroups(): void {
    const parsed = readYaml(text()), previous = groupSelect.value;
    knownNames = [...new Set(["DIRECT", "REJECT", ...parsed.groups.map(g => g.name), ...(Array.isArray(parsed.value.proxies) ? parsed.value.proxies.map(p => String((p as { name: string }).name)) : [])])];
    knownDomains = parsed.domains.map(r => r.domain);
    groupSelect.replaceChildren(...parsed.groups.map(g => el("option", { value: g.name }, [g.name])));
    if (parsed.groups.some(g => g.name === previous)) groupSelect.value = previous;
    upstream.replaceChildren(...knownNames.map(name => el("option", { value: name }, [name])));
    updateGroup();
  }
  function updateGroup(): void {
    const parsed = readYaml(text()), group = parsed.groups.find(g => g.name === groupSelect.value);
    exitSelect.replaceChildren(); domainList.replaceChildren();
    if (!group) { groupSummary.textContent = "此配置没有可编辑策略组。"; return; }
    exitSelect.append(...group.proxies.map(name => el("option", { value: name }, [name])));
    exitSelect.disabled = group.type !== "select" || !group.proxies.length;
    const rules = parsed.domains.filter(r => r.target === group.name);
    groupSummary.textContent = `类型：${group.type} · ${rules.length} 条直接域名规则 · ${group.icon ? "已有 Logo，默认保留" : "尚无 Logo，添加站点时自动补齐"}。规则集和其他复杂规则保留在源码中。`;
    for (const rule of rules) {
      domainList.append(el("div", { class: "editor-rule-row" }, [
        domainLogo(rule.domain),
        el("span", {}, [`${rule.exact ? "精确" : "含子域名"} · ${rule.domain}`]),
        button("删除域名规则", () => run(() => { replaceText(removeDomainRule(text(), rule.index, rule.raw)); refreshGroups(); message("已删除该域名规则。可在源码编辑器中按 Ctrl+Z 撤销。"); })),
      ]));
    }
  }
  groupSelect.onchange = () => run(updateGroup);
  const fileInput = el("input", { type: "file", hidden: true, accept: ".yaml,.yml,text/yaml,application/yaml", "aria-label": "导入已有 YAML 文件" }) as HTMLInputElement;
  const chooseFile = el("button", { type: "button", class: "btn primary", onclick: () => fileInput.click() }, ["选择 YAML 文件"]) as HTMLButtonElement;
  const filePicker = el("div", { class: "btn-row", style: "align-items:center" }, [
    chooseFile,
    el("span", { class: "field-hint" }, ["支持 .yaml / .yml，最大 2 MiB"]),
    fileInput,
  ]);
  fileInput.onchange = () => {
    const file = fileInput.files?.[0]; if (!file) return;
    fileInput.value = "";
    if (file.size > MAX_YAML_SIZE) { message("文件超过 2 MiB，请精简后再导入。", true); return; }
    chooseFile.disabled = true;
    chooseFile.textContent = "正在读取…";
    void file.text().then(source => load(source, file.name)).catch(() => message("无法读取文件，请重新选择。", true)).finally(() => {
      chooseFile.disabled = false;
      chooseFile.textContent = "选择 YAML 文件";
    });
  };
  function load(source: string, name = "Ferry.yaml"): void {
    if (source.length > MAX_YAML_SIZE) { message("文件超过 2 MiB。", true); return; }
    filename = name.replace(/\.ya?ml$/i, ""); loadedSource = source;
    knownNames = []; knownDomains = []; groupSelect.replaceChildren(); exitSelect.replaceChildren(); domainList.replaceChildren();
    replaceText(source); fileInfo.textContent = `当前文件：${name} · 所有编辑仅在当前页面中；下载另存，不覆盖原文件。`;
    run(() => { refreshGroups(); check(); });
    editor.requestMeasure();
  }
  const site = input("站点名称或网址", "例如 Steam、GitHub、https://example.com/path");
  const suggestions = el("datalist", { id: "yaml-site-suggestions" }, SITES.map(s => el("option", { value: s.name }, [s.domains[0]])));
  site.setAttribute("list", "yaml-site-suggestions");
  const domains = el("textarea", { rows: "4", "aria-label": "追加域名列表", placeholder: "每行一个域名或网址，可直接粘贴多个站点链接" }) as HTMLTextAreaElement;
  const exact = el("select", { "aria-label": "追加域名匹配方式" }, [el("option", { value: "suffix" }, ["域名及所有子域名"]), el("option", { value: "exact" }, ["仅精确域名"])]) as HTMLSelectElement;
  const replaceIcon = el("input", { type: "checkbox" }) as HTMLInputElement;
  const newName = input("新策略组名称", "例如：工作站点");
  const createNew = el("input", { type: "checkbox" }) as HTMLInputElement;
  const newFields = el("div", { class: "row-2", style: "display:none" }, [field("新策略组名称", newName), field("使用配置中已有的出口", upstream)]);
  createNew.onchange = () => { newFields.style.display = createNew.checked ? "" : "none"; };
  function fillSite(): void {
    const known = siteSuggestion(site.value);
    const result = completeSiteDomains(site.value);
    domains.value = result.domains.join("\n");
    if (known) exact.value = "suffix";
    if (!newName.value) newName.value = known?.name ?? result.domains[0];
    message(`${result.message}\n已替换输入框里的补全清单；点击添加才会写入配置。`);
  }
  site.addEventListener("change", () => { if (siteSuggestion(site.value)) run(fillSite); });
  const toolbar = el("div", { class: "btn-row" }, [
    button("一键 Reset · 恢复导入内容", () => run(() => {
      if (!window.confirm("恢复到最近一次导入或从生成器打开时的 YAML？当前编辑会被替换，可按 Ctrl+Z 撤销。")) return;
      replaceText(loadedSource); site.value = ""; domains.value = ""; newName.value = ""; createNew.checked = false; newFields.style.display = "none"; replaceIcon.checked = false;
      if (loadedSource) refreshGroups(); else { groupSelect.replaceChildren(); exitSelect.replaceChildren(); domainList.replaceChildren(); }
      message("已恢复最初内容。可按 Ctrl+Z 撤销重置。");
    })),
    button("重新识别策略组 / 校验", () => run(() => { refreshGroups(); check(); })),
    button("安全自动纠错", () => run(() => { const result = safeFix(text()); replaceText(result.source); refreshGroups(); message(result.changes.join("\n")); })),
    button("字段与域名补全", () => { editor.focus(); startCompletion(editor); }),
    button(platform().kind === "desktop" ? "另存修改后的 YAML" : "下载修改后的 YAML", () => run(() => {
      const errors = inspectYaml(text()).filter(p => p.severity === "error");
      if (errors.length) throw new Error(`请先修正：${errors[0].message}`);
      void platform().saveYaml(text(), `${filename}-edited.yaml`)
        .then(done => message(done ?? "已取消保存，编辑内容仍保留。"))
        .catch(error => message(`保存失败：${error instanceof Error ? error.message : String(error)}`, true));
    }), true),
  ]);
  root.append(
    el("div", { class: "card" }, [el("h2", {}, ["导入 YAML 并编辑"]), filePicker, fileInfo,
      el("div", { class: "field-hint" }, ["支持电脑与路由器的 Clash / Mihomo 完整 YAML。保留原节点、订阅和未知配置字段；结构化编辑保留注释与锚点，排版可能调整。源码支持实时检查、Ctrl+Space 补全和 Ctrl+Z 撤销。"]),
      el("div", { class: "field-hint" }, ["自动纠错只处理可验证的格式、域名规范化和完全重复规则；不会猜测拼错的真实域名，也不会擅自改变国家或代理链。文件内容不上传。"]), toolbar, status]),
    el("div", { class: "card" }, [el("h2", {}, ["已有策略组 · 站点与出口"]),
      el("div", { class: "row-2" }, [field("选择策略组", groupSelect), field("默认出口（仅 select 类型）", exitSelect)]),
      button("保存默认出口", () => run(() => { replaceText(setDefaultExit(text(), groupSelect.value, exitSelect.value)); refreshGroups(); message("已调整默认出口。客户端保存的选择可能优先，导入后请核对。"); })),
      groupSummary, domainList,
      field("站点自动补全", site), suggestions, button("补全本站相关域名", () => run(fillSite)),
      field("追加域名", domains), field("匹配方式", exact),
      el("label", { class: "checkbox-row" }, [createNew, "为这些站点新建独立策略组"]), newFields,
      el("label", { class: "checkbox-row" }, [replaceIcon, "用本站 Logo 替换已有组图标（未勾选时保留原图标）"]),
      el("div", { class: "field-hint" }, ["域名 Logo 从 icon.horse 获取，失败时尝试 Google 图标服务，仅发送域名，找不到时显示首字母。缺少组 Logo 时自动以首个域名补齐；一个策略组只有一个 Logo，同组追加站点默认保留原图标。"]),
      el("div", { class: "btn-row" }, [
        button("添加站点到策略组", () => run(() => {
          const result = addSites(text(), { target: groupSelect.value, text: domains.value, exact: exact.value === "exact", replaceIcon: replaceIcon.checked, ...(createNew.checked ? { newGroup: { name: newName.value, upstream: upstream.value } } : {}) });
          replaceText(result.source); refreshGroups();
          if (createNew.checked) { groupSelect.value = newName.value.trim(); updateGroup(); }
          message(result.changes.join("\n"));
        }), true),
        button("仅设置组 Logo", () => run(() => { const first = normalizeDomains(domains.value || site.value).domains[0]; replaceText(setGroupIcon(text(), groupSelect.value, first)); refreshGroups(); message("已设置组 Logo 地址。"); })),
      ]),
      el("div", { class: "field-hint" }, ["新增规则优先于普通分流，已有 Ferry 台湾家宽保护仍优先。若相同域名已指向其他组，会提示先调整旧规则。可直接编辑下方 YAML 进行更细的设置。"]),
    ]),
    el("div", { class: "card" }, [el("h2", {}, ["YAML 源码"]), editorHost]),
  );
  return { load, show: () => editor.requestMeasure() };
}
