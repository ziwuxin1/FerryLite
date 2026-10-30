import { el } from "../dom";
import { completeSiteDomains, normalizeDomains, readYaml, siteSuggestion, SITES } from "../yaml-editor";
import type { GroupDomainEdit } from "../yaml-editor";
import { domainLogo } from "./site-logo";
export { domainLogo } from "./site-logo";

export function renderGroupDomainManager(host: HTMLElement, apps: { name: string }[], baseline: string, edits: Map<string, GroupDomainEdit>, onChange: () => void, onToggle?: (open: boolean) => void, includeExclusive = false) {
  const parsed = readYaml(baseline);
  const select = el("select", { "aria-label": "管理域名的策略组" }, apps.map(a => el("option", { value: a.name }, [a.name]))) as HTMLSelectElement;
  const heading = el("span");
  const toggleHint = el("span", { style: "margin-left:12px;font-size:13px" });
  const disclosure = el("details", { open: true }, [el("summary", {
    style: "cursor:pointer;font-weight:700;padding:4px 0;user-select:none",
  }, [heading, toggleHint])]) as HTMLDetailsElement;
  const updateHeading = () => {
    heading.textContent = `策略组域名管理 · ${select.value}`;
    toggleHint.textContent = disclosure.open ? "收起 ▴" : "展开 ▾";
    onToggle?.(disclosure.open);
  };
  disclosure.ontoggle = updateHeading;
  const list = el("div", { class: "group-domain-list" });
  const note = el("div", { class: "status-line", role: "status", "aria-live": "polite" });
  const site = el("input", { placeholder: "输入站点名称，如 youtube，自动补全本站相关域名", "aria-label": "站点名称或网址", style: "min-height:42px;max-width:100%;width:420px;box-sizing:border-box;padding:8px 12px;border:2px solid #161616;border-radius:8px;font:inherit" }) as HTMLInputElement;
  const id = `group-sites-${crypto.randomUUID()}`;
  site.setAttribute("list", id);
  const suggestions = el("datalist", { id }, SITES.map(s => el("option", { value: s.name }, [s.domains[0]])));
  const domains = el("textarea", { rows: "3", "aria-label": "添加到策略组的域名", placeholder: "每行一个域名或网址，自动去重、规范格式" }) as HTMLTextAreaElement;
  const replaceLogo = el("input", { type: "checkbox" }) as HTMLInputElement;
  const btn = (name: string, fn: () => void) => el("button", { type: "button", class: "btn btn-sm", onclick: () => {
    try { fn(); } catch (e) { note.textContent = (e as Error).message; note.className = "status-line err"; }
  } }, [name]);
  const draft = (): GroupDomainEdit => edits.get(select.value) ?? { removedRules: [], domains: [] };
  function save(edit: GroupDomainEdit, message: string) {
    edits.set(select.value, edit); render(); onChange(); note.textContent = message; note.className = "status-line ok";
  }
  function render() {
    const edit = draft();
    list.replaceChildren();
    const defaults = parsed.domains.filter(r => r.target === select.value && !edit.removedRules.includes(r.raw));
    for (const rule of defaults) {
      list.append(el("div", { class: "editor-rule-row" }, [domainLogo(rule.domain), el("span", {}, [`${rule.domain} · ${rule.exact ? "精确" : "含子域名"}`]),
        btn(`删除 ${rule.domain}`, () => save({ ...draft(), removedRules: [...new Set([...draft().removedRules, rule.raw])] }, "已移除本组这条域名规则；生成时生效。其他规则集仍可能匹配该域名。"))]));
    }
    for (const domain of edit.domains) {
      list.append(el("div", { class: "editor-rule-row" }, [domainLogo(domain), el("span", {}, [`${domain} · 新增`]),
        btn(`删除 ${domain}`, () => save({ ...draft(), domains: draft().domains.filter(d => d !== domain) }, "已删除新增域名。"))]));
    }
    const remote = parsed.rules.filter(r => r.startsWith("RULE-SET,") && r.split(",")[2] === select.value && !edit.removedRules.includes(r));
    for (const rule of remote) list.append(el("div", { class: "editor-rule-row" }, [el("span", {}, [`远程规则集：${rule.split(",")[1]}`]),
      btn(`移除规则集 ${rule.split(",")[1]}`, () => save({ ...draft(), removedRules: [...new Set([...draft().removedRules, rule])] }, "已移除本组的规则集绑定；生成时生效。"))]));
    if (!defaults.length && !edit.domains.length && !remote.length) list.append(el("div", { class: "field-hint" }, ["尚无直接域名规则，可在下方添加。"]));
    const icon = edit.iconDomain || parsed.groups.find(g => g.name === select.value)?.icon;
    if (icon) list.append(el("div", { class: "field-hint" }, [`组 Logo：${edit.iconDomain || "保留默认图标"}`]));
  }
  function fill() {
    const result = completeSiteDomains(site.value, includeExclusive);
    domains.value = result.domains.join("\n");
    note.textContent = `${result.message} 已替换输入框里的补全清单，点击“添加域名”写入本组。`;
    note.className = "status-line ok";
  }
  site.onchange = () => { if (siteSuggestion(site.value, includeExclusive)) fill(); };
  site.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); try { fill(); } catch (e) { note.textContent = (e as Error).message; note.className = "status-line err"; } } };
  select.onchange = () => { domains.value = ""; site.value = ""; replaceLogo.checked = false; note.textContent = ""; render(); updateHeading(); };
  const content = el("div", { style: "margin-top:14px" });
  content.append(el("div", { class: "field", hidden: apps.length === 1 }, [el("label", {}, ["选择策略组"]), select]),
    el("div", { class: "field-hint" }, ["仅启用的 APP 会写入生成结果。这里列出直接域名规则和远程规则集绑定；规则集内容由客户端下载，不在网页展开。删除某条规则不等于阻止访问，流量仍按其余规则匹配。Logo 从 icon.horse 获取，失败时尝试 Google 图标服务，仅发送域名；找不到时显示首字母。"]),
    list, site, suggestions, btn("补全本站相关域名", fill),
    el("div", { class: "field-hint" }, ["输入网站名称或常用别名后按 Enter，补全该站已知的 API、CDN 和资源域名，不枚举各国站点。主域名包含全部子域名，无需逐条填写 api、cdn、static。点击“添加域名”写入当前组。"]), domains,
    el("label", { class: "checkbox-row" }, [replaceLogo, "同时用首个域名 Logo 替换本组图标"]),
    el("div", { class: "btn-row" }, [
      btn("添加域名", () => {
        if (!domains.value.trim() && site.value.trim()) fill();
        const normalized = normalizeDomains(domains.value);
        const edit = draft();
        const existing = new Set(parsed.domains.filter(r => r.target === select.value && !edit.removedRules.includes(r.raw) && !r.exact).map(r => r.domain));
        const added = [...new Set([...edit.domains, ...normalized.domains])].filter(d => !existing.has(d));
        if (added.length > 500) throw new Error("每组最多新增 500 个域名。");
        save({ ...edit, domains: added, iconDomain: replaceLogo.checked ? normalized.domains[0] : edit.iconDomain }, "域名已添加，生成 YAML 后生效；同域名跨组冲突会在生成时提示。");
        domains.value = ""; site.value = "";
      }),
      btn("Reset 本组", () => {
        if (!window.confirm(`恢复「${select.value}」的默认域名、规则集和 Logo？`)) return;
        edits.delete(select.value); domains.value = ""; site.value = ""; replaceLogo.checked = false; render(); onChange(); note.textContent = "本组已恢复默认。";
      }),
    ]), note);
  disclosure.append(content); host.append(disclosure);
  render(); updateHeading();
  return { toggle() { disclosure.open = !disclosure.open; updateHeading(); }, select(name: string) {
    if (select.value !== name) { select.value = name; select.dispatchEvent(new Event("change")); }
    disclosure.open = true; updateHeading(); host.hidden = false;
  } };
}
