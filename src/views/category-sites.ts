import { el } from "../dom";
import { completeSiteDomains, normalizeDomains, renameGroupDomainEdits, siteSuggestion, SITES } from "../yaml-editor";
import type { GroupDomainEdit } from "../yaml-editor";
import { renderGroupDomainManager } from "./group-domain-manager";
import { domainLogo } from "./site-logo";
import type { SavedCategorySite } from "../routing-draft";

export interface CategorySite {
  name: string;
  domains: string[];
  upstream: string;
  category: string;
  enabled: HTMLInputElement;
}

/** One inline add form per category; saved sites stay directly below its heading. */
export function categorySiteAdder(host: HTMLElement, category: string, sites: CategorySite[], options: {
  names: () => string[];
  defaultExit: string;
  exitValue?: (country: string) => string;
  displayName?: () => string;
  changed: () => void;
  selectionChanged: () => void;
  edits: Map<string, GroupDomainEdit>;
}) {
  const displayCategory = options.displayName?.() ?? category;
  const form = el("div", { class: "card", hidden: true, style: "margin:8px 0 16px" });
  const name = el("input", { "aria-label": `${displayCategory}：新站点名称`, placeholder: "网站名或域名，例如 Netflix、example.com", style: "width:100%;box-sizing:border-box;padding:10px;font:inherit" }) as HTMLInputElement;
  const listId = `new-site-${crypto.randomUUID()}`;
  name.setAttribute("list", listId);
  const suggestions = el("datalist", { id: listId }, SITES.map(s => el("option", { value: s.name })));
  const domains = el("textarea", { rows: "4", "aria-label": `${displayCategory}：新站点域名`, placeholder: "每行一个域名，包含其全部子域名", style: "width:100%;box-sizing:border-box;padding:10px;font:inherit" }) as HTMLTextAreaElement;
  const exits = ["美国", "香港", "台湾", "日本", "新加坡", "韩国", "英国", "德国", "法国", "加拿大", "澳大利亚", "荷兰"];
  const upstream = el("select", { "aria-label": `${displayCategory}：新站点默认线路` }, exits.map(s => el("option", { value: options.exitValue?.(s) ?? `${s}-自动` }, [s]))) as HTMLSelectElement;
  const note = el("div", { class: "status-line", role: "status", "aria-live": "polite" });
  let editing: CategorySite | undefined;
  let editingRow: HTMLElement | undefined;
  const button = (label: string, action: () => void) => el("button", { type: "button", class: "btn btn-sm", onclick: () => {
    try { action(); } catch (error) { note.textContent = (error as Error).message; note.className = "status-line err"; }
  } }, [label]);
  const fill = () => {
    const result = completeSiteDomains(name.value);
    domains.value = result.domains.join("\n");
    note.textContent = result.message; note.className = "status-line ok";
  };
  name.onchange = () => { if (!editing && siteSuggestion(name.value)) fill(); };
  name.onkeydown = event => { if (!editing && event.key === "Enter") { event.preventDefault(); try { fill(); } catch(error) { note.textContent = (error as Error).message; } } };
  const close = () => { form.hidden = true; editing = undefined; editingRow = undefined; };
  const save = button("添加到本分类", () => {
    const title = name.value.trim();
    if (!title || /[,\r\n\u0000-\u001f]/u.test(title)) throw new Error("请填写不含逗号或换行的站点名称。");
    const known = siteSuggestion(title);
    const existing = options.names().filter(n => n !== editing?.name);
    if (existing.some(n => n.toLowerCase() === title.toLowerCase() || (known && siteSuggestion(n)?.key === known.key))) throw new Error("该站点已存在，请展开原站点的“管理域名”；也可使用不同名称创建独立策略组。");
    if (!domains.value.trim() && !editing) fill();
    const normalized = normalizeDomains(domains.value).domains;
    const enabled = editing?.enabled ?? el("input", { type: "checkbox", checked: true }) as HTMLInputElement;
    if (!editing) enabled.onchange = () => { options.selectionChanged(); options.changed(); };
    const entry = editing ?? { name: title, domains: normalized, upstream: upstream.value, category, enabled };
    renameGroupDomainEdits(options.edits, entry.name, title);
    Object.assign(entry, { name: title, domains: normalized, upstream: upstream.value });
    const row = renderSite(entry, editingRow);
    if (!editing) { sites.push(entry); host.append(row); }
    close(); options.selectionChanged(); options.changed();
  });
  function renderSite(entry: CategorySite, row = el("div", { style: "padding:8px 0 8px 14px" })): HTMLElement {
    const { name: title, domains: normalized, enabled } = entry;
    row.setAttribute("data-added-site", title);
    const settings = button("设置", () => {
      if (editing === entry && !form.hidden) { close(); return; }
      editing = entry; editingRow = row;
      name.value = entry.name; domains.value = entry.domains.join("\n"); upstream.value = entry.upstream;
      domainFields.hidden = true;
      formTitle.textContent = `站点设置 · ${entry.name}`;
      save.textContent = "保存修改"; note.textContent = ""; row.append(form); form.hidden = false;
    });
    settings.setAttribute("aria-label", `设置新增站点 ${title}`);
    const managerHost = el("div", { class: "group-domain-manager", hidden: true });
    let manager: ReturnType<typeof renderGroupDomainManager> | undefined;
    const iconHost = el("span", {});
    const refreshIcon = () => iconHost.replaceChildren(domainLogo(options.edits.get(title)?.iconDomain ?? normalized[0]));
    refreshIcon();
    const edit = button("管理域名", () => {
      close();
      if (manager) { manager.toggle(); return; }
      managerHost.hidden = false;
      const baseline = JSON.stringify({
        "proxy-groups": [{ name: title, type: "select", proxies: ["DIRECT"], icon: `https://icon.horse/icon/${normalized[0]}` }],
        rules: normalized.map(d => `DOMAIN-SUFFIX,${d},${title}`),
      });
      manager = renderGroupDomainManager(managerHost, [{ name: title }], baseline, options.edits, () => { refreshIcon(); options.changed(); }, open => {
        edit.textContent = open ? "收起域名" : "管理域名"; edit.setAttribute("aria-expanded", String(open));
      });
    });
    edit.setAttribute("aria-label", `管理新增站点 ${title} 域名`);
    edit.setAttribute("aria-expanded", "false");
    const remove = button("删除站点", () => {
      sites.splice(sites.indexOf(entry), 1);
      options.edits.delete(entry.name);
      if (row.contains(form)) { host.prepend(form); close(); }
      row.remove(); options.selectionChanged(); options.changed();
    });
    remove.setAttribute("aria-label", `删除新增站点 ${title}`);
    // Move the reusable form before replacing its current row.
    host.prepend(form);
    row.replaceChildren(el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap" }, [
      el("label", { class: "checkbox-row" }, [enabled, iconHost, title]),
      el("div", { class: "btn-row" }, [edit, settings, remove]),
    ]), managerHost);
    return row;
  }
  const formTitle = el("strong", {}, [`添加站点 · ${options.displayName?.() ?? category}`]);
  const domainFields = el("div", {}, [button("补全本站相关域名", fill), domains]);
  form.append(formTitle, name, suggestions, domainFields,
    el("label", {}, ["默认国家线路 ", upstream]),
    el("div", { class: "field-hint" }, ["新站点生成独立策略组；域名覆盖全部子域名，Logo 自动获取。线路使用机场节点。"]),
    el("div", { class: "btn-row" }, [save, button("取消", close)]), note);
  host.prepend(form);
  return { restore(saved: SavedCategorySite[]) {
    for (const data of saved) {
      if (sites.some(s => s.name === data.name)) throw new Error("恢复站点时发现重复名称");
      const enabled = el("input", { type: "checkbox" }) as HTMLInputElement;
      enabled.checked = data.enabled;
      enabled.onchange = () => { options.selectionChanged(); options.changed(); };
      const entry: CategorySite = { ...data, category, domains: normalizeDomains(data.domains.join("\n")).domains, enabled };
      sites.push(entry); host.append(renderSite(entry));
    }
    options.selectionChanged();
  }, open() {
    formTitle.textContent = `添加站点 · ${options.displayName?.() ?? category}`;
    editing = undefined; editingRow = undefined; name.value = ""; domains.value = ""; upstream.value = options.defaultExit;
    domainFields.hidden = false;
    note.textContent = ""; save.textContent = "添加到本分类"; host.prepend(form); form.hidden = false; name.focus();
  } };
}
