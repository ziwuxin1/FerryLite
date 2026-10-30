import type { GroupDomainEdit } from "./yaml-editor";

export const ROUTING_DRAFT_KEY = "ferrylite.routing.v1";
export interface SavedCustomGroup { id: string; name: string; country: string; enabled: boolean }
export interface SavedCategorySite { name: string; domains: string[]; upstream: string; category: string; enabled: boolean }
export interface RoutingDraft {
  version: 1;
  groups: SavedCustomGroup[];
  sites: SavedCategorySite[];
  edits: [string, GroupDomainEdit][];
  apps: [string, boolean][];
  target: "pc" | "nikki";
  dnsOverride: boolean;
}
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const countries = new Set(["us", "hk", "tw", "jp", "sg", "kr", "gb", "de", "fr", "ca", "au", "nl"]);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 512): v is string => typeof v === "string" && v.length <= max;
const strings = (v: unknown, max = 500): v is string[] => Array.isArray(v) && v.length <= max && v.every(s => string(s, 2048));
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
function parseDraft(raw: string): RoutingDraft {
  if (raw.length > 2_000_000) throw new Error("保存的数据过大");
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.version !== 1 || !list(data.groups, 50) || !list(data.sites, 1000) || !list(data.edits, 2000) || !list(data.apps, 500) || !["pc", "nikki"].includes(String(data.target)) || typeof data.dnsOverride !== "boolean") throw new Error("保存的数据版本或格式无效");
  const groups: SavedCustomGroup[] = data.groups.map(g => {
    if (!record(g) || !string(g.id) || !/^custom-[a-z0-9-]+$/i.test(g.id) || !string(g.name, 120) || !g.name.trim() || typeof g.country !== "string" || !countries.has(g.country) || typeof g.enabled !== "boolean") throw new Error("保存的策略组无效");
    return { id: g.id, name: g.name, country: g.country, enabled: g.enabled };
  });
  const sites: SavedCategorySite[] = data.sites.map(s => {
    if (!record(s) || !string(s.name) || !s.name.trim() || !strings(s.domains) || !s.domains.length || !string(s.upstream) || !string(s.category) || typeof s.enabled !== "boolean") throw new Error("保存的站点无效");
    return { name: s.name, domains: s.domains, upstream: s.upstream, category: s.category, enabled: s.enabled };
  });
  if (new Set(groups.map(g => g.id)).size !== groups.length || new Set(groups.map(g => g.name)).size !== groups.length || new Set(sites.map(s => s.name)).size !== sites.length || sites.some(s => s.category.startsWith("custom-") && !groups.some(g => g.id === s.category))) throw new Error("保存的分组关系无效");
  const edits: RoutingDraft["edits"] = data.edits.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || !string(pair[0]) || !record(pair[1]) || !strings(pair[1].removedRules, 2000) || !strings(pair[1].domains) || (pair[1].iconDomain !== undefined && !string(pair[1].iconDomain, 253))) throw new Error("保存的域名修改无效");
    return [pair[0], { removedRules: pair[1].removedRules, domains: pair[1].domains, ...(pair[1].iconDomain ? { iconDomain: pair[1].iconDomain } : {}) }];
  });
  const apps: RoutingDraft["apps"] = data.apps.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || !string(pair[0]) || typeof pair[1] !== "boolean") throw new Error("保存的勾选状态无效");
    return [pair[0], pair[1]];
  });
  return { version: 1, groups, sites, edits, apps, target: data.target as RoutingDraft["target"], dnsOverride: data.dnsOverride };
}
export function loadRoutingDraft(storage: DraftStorage): RoutingDraft | null {
  const raw = storage.getItem(ROUTING_DRAFT_KEY);
  return raw === null ? null : parseDraft(raw);
}
export function saveRoutingDraft(storage: DraftStorage, draft: RoutingDraft): void {
  // Whitelist data through the schema; subscriptions, passwords and generated YAML are not stored.
  storage.setItem(ROUTING_DRAFT_KEY, JSON.stringify(parseDraft(JSON.stringify(draft))));
}
export function clearRoutingDraft(storage: DraftStorage): void { storage.removeItem(ROUTING_DRAFT_KEY); }
