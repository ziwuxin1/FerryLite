import { isAlias, isCollection, isMap, isPair, isSeq, parseDocument } from "yaml";

export const MAX_YAML_SIZE = 2 * 1024 * 1024;
import { SITE_CATALOG, SITES } from "./site-catalog.ts";
export { SITES };

type Obj = Record<string, unknown>;
export interface GroupInfo { name: string; type: string; proxies: string[]; icon: string; index: number }
export interface DomainRule { index: number; domain: string; target: string; exact: boolean; raw: string }
export interface Problem { message: string; from: number; to: number; severity: "error" | "warning" }
const BUILTINS = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];
const RULE_TYPES = new Set(["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "DOMAIN-WILDCARD", "DOMAIN-REGEX", "GEOSITE", "GEOIP", "IP-CIDR", "IP-CIDR6", "IP-SUFFIX", "IP-ASN", "SRC-GEOIP", "SRC-IP-ASN", "SRC-IP-CIDR", "SRC-IP-SUFFIX", "DST-PORT", "SRC-PORT", "IN-PORT", "IN-TYPE", "IN-USER", "IN-NAME", "PROCESS-PATH", "PROCESS-NAME", "PROCESS-PATH-WILDCARD", "PROCESS-NAME-WILDCARD", "PROCESS-PATH-REGEX", "PROCESS-NAME-REGEX", "UID", "NETWORK", "DSCP", "RULE-SET", "AND", "OR", "NOT", "SUB-RULE", "MATCH"]);
const object = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
const objects = (v: unknown): Obj[] => Array.isArray(v) ? v.filter(object) : [];

export function normalizeDomain(raw: string, exact = false): string {
  let input = raw.trim().replace(/[。．]/g, ".");
  if (input.startsWith("*.")) {
    if (exact) throw new Error("精确匹配不能使用 *.，请改为域名及子域名匹配。");
    input = input.slice(2);
  }
  if (!input || /[\s,，#\[\]{}]/u.test(input)) throw new Error("域名含空白或非法字符。");
  let url: URL;
  try { url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error("无法识别域名或网址。"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只接受不含账号密码的 HTTP(S) 网址或域名。");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.length > 253 || !host.includes(".") || /^\d+(\.\d+){3}$/.test(host) || host.split(".").some(s => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s))) throw new Error("请填写有效域名，不接受 IP 地址或通配符。");
  return host;
}

export function normalizeDomains(text: string, exact = false): { domains: string[]; corrections: string[] } {
  const domains: string[] = [], corrections: string[] = [];
  for (const raw of text.split(/[\s,，;；]+/u).filter(Boolean)) {
    const domain = normalizeDomain(raw, exact);
    if (domains.includes(domain)) { corrections.push(`去重：${domain}`); continue; }
    if (raw !== domain) corrections.push(`${raw} → ${domain}`);
    domains.push(domain);
  }
  if (!domains.length) throw new Error("请填写至少一个域名。");
  if (domains.length > 500) throw new Error("每次最多添加 500 个域名。");
  return { domains, corrections };
}

const siteKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s*·()（）/\-]/gu, "");
export function siteSuggestion(value: string, includeExclusive = false) {
  const sites = includeExclusive ? SITE_CATALOG : SITES;
  const key = siteKey(value.trim());
  const byName = sites.find(s => [s.name, ...s.aliases].some(alias => siteKey(alias) === key));
  if (byName) return byName;
  let host: string;
  try { host = normalizeDomain(value); } catch { return undefined; }
  // Prefer a service-specific hostname over a broader parent family (Gemini/Google,
  // Copilot/Microsoft). A suffix boundary prevents deceptive lookalike matches.
  return sites.flatMap(site => site.domains.map(domain => ({ site, domain })))
    .filter(({ domain }) => host === domain || host.endsWith(`.${domain}`))
    .sort((a, b) => b.domain.length - a.domain.length)[0]?.site;
}
export function completeSiteDomains(value: string, includeExclusive = false): { domains: string[]; message: string } {
  const known = siteSuggestion(value, includeExclusive);
  if (!known) return { domains: normalizeDomains(value).domains, message: "未识别到站点专属域名库，仅规范你输入的域名；没有自动发现关联域名。" };
  const coverage = known.name === "Robinhood" ? "robinhood.com 同时覆盖 api.robinhood.com、bonfire.robinhood.com、cdn.robinhood.com 等全部子域名。"
    : known.name === "OKX" ? "okx.com 同时覆盖 www.okx.com、static.okx.com、wspri.okx.com、ipushws.okx.com 等全部子域名，443 / 8443 等端口均适用。"
    : "主域名及其全部子域名一并覆盖，无需逐条枚举 api、cdn、static 等地址。";
  return { domains: [...known.domains], message: known.name === "YouTube"
    ? `已补全 YouTube 的 ${known.domains.length} 个网页、播放、图片与专用接口域名。包含其全部子域名；不展开各国站点，也不加入其他视频平台。这里只补全已知资源域名，不会扫描设备的实时连接。`
    : `已补全 ${known.name} 的 ${known.domains.length} 个已知主域名及资源域名。${coverage} 不枚举各国站点；未收录的跨域资源需按实际连接补充。` };
}
export const logoFor = (domain: string): string => `https://icon.horse/icon/${normalizeDomain(domain)}`;

export function syntaxDocument(source: string) {
  if (source.length > MAX_YAML_SIZE) throw new Error("YAML 文件超过 2 MiB，请先精简配置。");
  const doc = parseDocument(source, { merge: true, keepSourceTokens: true, prettyErrors: false });
  if (doc.errors.length) {
    const error = doc.errors[0];
    const line = source.slice(0, error.pos[0]).split("\n").length;
    throw new Error(`YAML 第 ${line} 行：${error.message}`);
  }
  if (doc.warnings.length) throw new Error(`YAML 使用了不支持的语法：${doc.warnings[0].message}`);
  // Bound alias expansion before toJS, including merge aliases.
  let cost = 0;
  function walk(node: unknown, path: Set<unknown>, depth: number): void {
    if (++cost > 100000 || depth > 80) throw new Error("YAML 嵌套或锚点展开过大，请精简后再导入。");
    if (!node || typeof node !== "object") return;
    if (path.has(node)) throw new Error("YAML 锚点存在循环引用。");
    const next = new Set(path).add(node);
    if (isAlias(node)) walk(node.resolve(doc), next, depth + 1);
    else if (isCollection(node)) for (const item of node.items) walk(item, next, depth + 1);
    else if (isPair(node)) { walk(node.key, next, depth + 1); walk(node.value, next, depth + 1); }
  }
  walk(doc.contents, new Set(), 0);
  return doc;
}

export function readYaml(source: string) {
  const doc = syntaxDocument(source);
  const value: unknown = doc.toJS({ maxAliasCount: 10000 });
  if (!object(value)) throw new Error("配置顶层必须是 YAML 映射。");
  if (!Array.isArray(value["proxy-groups"])) throw new Error("缺少 proxy-groups 策略组列表；请导入完整 Clash / Mihomo 配置。");
  if (value.rules !== undefined && (!Array.isArray(value.rules) || value.rules.some(r => typeof r !== "string"))) throw new Error("rules 必须是字符串规则列表。");
  const groups: GroupInfo[] = objects(value["proxy-groups"]).map((g, index) => ({ name: String(g.name ?? ""), type: String(g.type ?? ""), proxies: strings(g.proxies), icon: typeof g.icon === "string" ? g.icon : "", index }));
  if (groups.length !== value["proxy-groups"].length) throw new Error("策略组列表中存在无效项目。");
  const rules = strings(value.rules);
  const domains: DomainRule[] = [];
  rules.forEach((raw, index) => {
    const parts = raw.split(",").map(s => s.trim());
    if (["DOMAIN", "DOMAIN-SUFFIX"].includes(parts[0]) && parts.length === 3) domains.push({ index, domain: parts[1], target: parts[2], exact: parts[0] === "DOMAIN", raw });
  });
  return { doc, value, groups, rules, domains };
}

function ruleTarget(rule: string): string | null {
  const parts = rule.split(",").map(s => s.trim());
  if (parts.length < 2 || parts[0] === "SUB-RULE") return null;
  while (["no-resolve", "src"].includes(parts[parts.length - 1] ?? "")) parts.pop();
  return parts[parts.length - 1] ?? null;
}

export function inspectYaml(source: string): Problem[] {
  try {
    const { value, groups, rules, domains } = readYaml(source);
    const errors: Problem[] = [];
    const add = (message: string, severity: "error" | "warning" = "error") => errors.push({ message, severity, from: 0, to: Math.min(source.length, 1) });
    const names = new Set(BUILTINS), edges = new Map<string, string[]>();
    for (const node of [...objects(value.proxies), ...objects(value["proxy-groups"])]) {
      if (typeof node.name !== "string" || !node.name.trim()) { add("节点或策略组名称为空。"); continue; }
      if (names.has(node.name)) add(`名称重复：${node.name}`);
      names.add(node.name);
      if (node.proxies !== undefined && (!Array.isArray(node.proxies) || node.proxies.some(p => typeof p !== "string"))) add(`「${node.name}」的 proxies 必须是名称列表。`);
      edges.set(node.name, [...strings(node.proxies), ...(typeof node["dialer-proxy"] === "string" ? [node["dialer-proxy"]] : [])]);
      for (const provider of strings(node.use)) if (!object(value["proxy-providers"]) || !Object.prototype.hasOwnProperty.call(value["proxy-providers"], provider)) add(`「${node.name}」引用不存在的订阅：${provider}`);
    }
    for (const [name, refs] of edges) for (const ref of refs) if (!names.has(ref)) add(`「${name}」引用不存在的出口「${ref}」。请从补全列表选择。`);
    const done = new Set<string>(), active = new Set<string>();
    function visit(name: string): void {
      if (active.has(name)) throw new Error(`策略组或代理链循环引用：${name}`);
      if (done.has(name)) return;
      active.add(name);
      for (const ref of edges.get(name) ?? []) visit(ref);
      active.delete(name); done.add(name);
    }
    try { for (const name of edges.keys()) visit(name); } catch (e) { add((e as Error).message); }
    rules.forEach((rule, index) => {
      const kind = rule.split(",")[0].trim();
      if (!RULE_TYPES.has(kind) || rule.split(",").length < (kind === "MATCH" ? 2 : 3)) add(`第 ${index + 1} 条规则格式或类型不受支持：${kind}`);
      const target = ruleTarget(rule);
      if (target && !names.has(target)) add(`第 ${index + 1} 条规则引用不存在的出口「${target}」。`);
      if (/^RULE-SET,/.test(rule)) {
        const provider = rule.split(",")[1]?.trim();
        if (!object(value["rule-providers"]) || !Object.prototype.hasOwnProperty.call(value["rule-providers"], provider)) add(`规则集不存在：${provider}`);
      }
    });
    const domainTargets = new Map<string, string>();
    for (const rule of domains) {
      const key = `${rule.exact}:${rule.domain.toLowerCase()}`;
      const previous = domainTargets.get(key);
      if (previous && previous !== rule.target) add(`域名 ${rule.domain} 同时分配给「${previous}」和「${rule.target}」，前面的规则优先。`, "warning");
      domainTargets.set(key, rule.target);
    }
    const firstMatch = rules.findIndex(r => r.startsWith("MATCH,"));
    if (firstMatch >= 0 && firstMatch < rules.length - 1) add("MATCH 之后的规则不会被匹配，请检查规则顺序。", "warning");
    if (!groups.length) add("配置没有策略组。", "warning");
    return errors;
  } catch (e) {
    let from = 0, to = Math.min(1, source.length);
    if (source.length <= MAX_YAML_SIZE) {
      const doc = parseDocument(source, { prettyErrors: false });
      if (doc.errors[0]) [from, to] = doc.errors[0].pos;
    }
    return [{ message: (e as Error).message, severity: "error", from, to }];
  }
}

function finish(doc: ReturnType<typeof syntaxDocument>): string {
  const source = doc.toString({ lineWidth: 0 });
  const errors = inspectYaml(source).filter(e => e.severity === "error");
  if (errors.length) throw new Error(errors[0].message);
  return source;
}

export function setDefaultExit(source: string, name: string, exit: string): string {
  const { doc, groups } = readYaml(source);
  const group = groups.find(g => g.name === name);
  if (!group || group.type !== "select") throw new Error("只有 select 策略组可以手动设置默认出口；自动测速组请在 YAML 中调整。");
  if (!group.proxies.includes(exit)) throw new Error("请选择该组已有出口，避免改变代理链。");
  doc.setIn(["proxy-groups", group.index, "proxies"], [exit, ...group.proxies.filter(p => p !== exit)]);
  return finish(doc);
}

export interface AddSiteOptions { target: string; text: string; exact: boolean; replaceIcon: boolean; newGroup?: { name: string; upstream: string } }
export function addSites(source: string, options: AddSiteOptions): { source: string; changes: string[] } {
  const { doc, value, groups, domains, rules } = readYaml(source);
  const normalized = normalizeDomains(options.text, options.exact);
  const changes = [...normalized.corrections];
  let group = groups.find(g => g.name === options.target);
  if (options.newGroup) {
    const name = options.newGroup.name.trim(), upstream = options.newGroup.upstream;
    if (!name || /[,\r\n\u0000-\u001f]/u.test(name)) throw new Error("请填写不含逗号或控制字符的新策略组名。");
    const names = [...BUILTINS, ...groups.map(g => g.name), ...objects(value.proxies).map(p => String(p.name))];
    if (names.includes(name)) throw new Error("该策略组名称已存在，请直接选择已有策略组。");
    if (!names.includes(upstream)) throw new Error("请选择配置中已有的出口。");
    const seq = doc.get("proxy-groups", true);
    if (!isSeq(seq)) throw new Error("proxy-groups 不是可编辑的列表。");
    seq.add(doc.createNode({ name, type: "select", proxies: [upstream, ...["DIRECT", "REJECT"].filter(p => p !== upstream)] }));
    group = { name, type: "select", proxies: [upstream], index: groups.length, icon: "" };
    changes.push(`新增策略组：${name}`);
  }
  if (!group) throw new Error("请选择一个已有策略组。");
  const rulesNode = doc.get("rules", true);
  if (rulesNode !== undefined && !isSeq(rulesNode)) throw new Error("rules 不是可编辑的列表。");
  if (!rulesNode) doc.set("rules", doc.createNode([]));
  const seq = doc.get("rules", true);
  if (!isSeq(seq)) throw new Error("无法编辑规则。");
  const added: string[] = [];
  for (const domain of normalized.domains) {
    const exact = options.exact;
    const same = domains.filter(d => d.domain.toLowerCase().replace(/\.$/, "") === domain && d.exact === exact);
    if (same.some(d => d.target !== group!.name)) throw new Error(`「${domain}」已有规则指向其他策略组。请先在原组删除该规则，或在 YAML 编辑器中明确调整。`);
    if (same.length) { changes.push(`已存在，跳过：${domain}`); continue; }
    added.push(`${exact ? "DOMAIN" : "DOMAIN-SUFFIX"},${domain},${group.name}`);
  }
  // Preserve Ferry's protected residential/media/verification routes before additions.
  const protectedTargets = new Set(["交易所-台湾家宽", "台湾影音"]);
  let expanded = true;
  while (expanded) { expanded = false; for (const g of groups) if (!protectedTargets.has(g.name) && g.proxies.some(p => protectedTargets.has(p))) { protectedTargets.add(g.name); expanded = true; } }
  let insertion = 0;
  rules.forEach((rule, i) => {
    if (protectedTargets.has(ruleTarget(rule) ?? "") || /^DOMAIN,(api\.ipify\.org|ifconfig\.me|ip\.sb|ipinfo\.io),Claude$/.test(rule) || (/^AND,/.test(rule) && /DOMAIN.*(okx|binance|bybit|bitget|kucoin|gate|ofiii)/i.test(rule))) insertion = i + 1;
  });
  seq.items.splice(insertion, 0, ...added.map(rule => doc.createNode(rule)));
  if (!group.icon || options.replaceIcon) {
    doc.setIn(["proxy-groups", group.index, "icon"], logoFor(normalized.domains[0]));
    changes.push("已自动设置站点 Logo 地址（由客户端加载）。");
  }
  changes.push(`向「${group.name}」添加 ${added.length} 条域名规则；已有保护规则仍优先。`);
  return { source: finish(doc), changes };
}

export function removeDomainRule(source: string, index: number, expected: string): string {
  const { doc, rules } = readYaml(source);
  if (rules[index] !== expected) throw new Error("规则已变化，请重新识别后再删除。");
  doc.deleteIn(["rules", index]);
  return finish(doc);
}

export function safeFix(source: string): { source: string; changes: string[] } {
  let text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const changes: string[] = [];
  if (text !== source) changes.push("统一文件头和换行格式。");
  if (/^\t+/m.test(text)) {
    if (/[|>][+-]?\d?\s*(?:#.*)?$/m.test(text)) throw new Error("配置含多行文本，无法安全推断 Tab 缩进，请在源码中修正。");
    text = text.replace(/^(\t+)(?=\S)/gm, (_, tabs: string) => "  ".repeat(tabs.length));
    changes.push("行首 Tab 转为两空格缩进；需通过解析才能应用。");
  }
  const { doc, domains, rules } = readYaml(text);
  const seen = new Set<string>(), remove: number[] = [];
  for (const rule of domains) {
    const d = normalizeDomain(rule.domain, rule.exact);
    const fixed = `${rule.exact ? "DOMAIN" : "DOMAIN-SUFFIX"},${d},${rule.target}`;
    if (fixed !== rule.raw) { doc.setIn(["rules", rule.index], fixed); changes.push(`规范域名：${rule.domain} → ${d}`); }
  }
  const current = doc.get("rules", true);
  if (isSeq(current)) current.items.forEach((_, index) => {
    const rule = String(doc.getIn(["rules", index]));
    // Only identical domain rules are redundant regardless of earlier matches.
    if (/^DOMAIN(?:-SUFFIX)?,/.test(rule)) { if (seen.has(rule)) remove.push(index); else seen.add(rule); }
  });
  for (const index of remove.reverse()) doc.deleteIn(["rules", index]);
  if (remove.length) changes.push(`移除 ${remove.length} 条完全重复的域名规则。`);
  for (const [index, rule] of rules.entries()) if (!rule.trim()) throw new Error(`第 ${index + 1} 条规则为空，请手动检查。`);
  if (!changes.length) return { source, changes: ["未发现可安全自动纠正的问题。"] };
  return { source: finish(doc), changes };
}

export function setGroupIcon(source: string, name: string, domain: string): string {
  const { doc, groups } = readYaml(source);
  const group = groups.find(g => g.name === name);
  if (!group) throw new Error("策略组不存在。");
  const node = doc.getIn(["proxy-groups", group.index], true);
  if (!isMap(node)) throw new Error("策略组不是可编辑的映射。");
  node.set("icon", logoFor(domain));
  return finish(doc);
}

export interface GroupDomainEdit {
  removedRules: string[];
  domains: string[];
  iconDomain?: string;
}

/** Keep domain removals and additions attached when a user renames a group. */
export function renameGroupDomainEdits(edits: Map<string, GroupDomainEdit>, from: string, to: string): void {
  if (from === to || !edits.has(from)) return;
  const edit = edits.get(from)!;
  edits.delete(from);
  edits.set(to, { ...edit, removedRules: edit.removedRules.map(rule => {
    const parts = rule.split(",");
    if (parts[2] === from) parts[2] = to;
    return parts.join(",");
  }) });
}

/** Add category-local sites as real named groups, with validated routes and logos. */
export function applyAddedSites(source: string, sites: readonly { name: string; domains: string[]; upstream: string }[]): string {
  let result = source;
  for (const site of sites) result = addSites(result, {
    target: site.name, text: site.domains.join("\n"), exact: false, replaceIcon: false,
    newGroup: { name: site.name, upstream: site.upstream },
  }).source;
  return result;
}

/** Apply removals first so a domain can be moved between groups in one generation. */
export function applyGroupDomainEdits(source: string, edits: ReadonlyMap<string, GroupDomainEdit>): string {
  const active = [...edits].filter(([, e]) => e.removedRules.length || e.domains.length || e.iconDomain);
  if (!active.length) return source;
  const parsed = readYaml(source);
  const names = new Set(parsed.groups.map(g => g.name));
  const enabled = active.filter(([name]) => names.has(name));
  if (!enabled.length) return source;
  const removals = new Set(enabled.flatMap(([, edit]) => edit.removedRules));
  for (let i = parsed.rules.length - 1; i >= 0; i--) {
    if (removals.has(parsed.rules[i])) parsed.doc.deleteIn(["rules", i]);
  }
  let result = parsed.doc.toString({ lineWidth: 0 });
  for (const [target, edit] of enabled) {
    if (edit.domains.length) result = addSites(result, { target, text: normalizeDomains(edit.domains.join("\n")).domains.join("\n"), exact: false, replaceIcon: false }).source;
    if (edit.iconDomain) result = setGroupIcon(result, target, edit.iconDomain);
  }
  const errors = inspectYaml(result).filter(p => p.severity === "error");
  if (errors.length) throw new Error(errors[0].message);
  return result;
}
