import { isSeq } from "yaml";
import { readYaml, inspectYaml } from "./yaml-editor.ts";
import { LISA_GROUP, validateLisaBundle } from "./lisa-vps-data.ts";
import type { LisaBundle } from "./lisa-vps-data.ts";

/** Apply last, so built-in groups, custom groups and category additions all receive the exit. */
export function applyLisaVps(source: string, input: LisaBundle, defaults: readonly string[] = ["Claude", "ChatGPT", "Perforce 美国"]): string {
  const bundle = validateLisaBundle(input);
  const { doc, value, groups } = readYaml(source);
  const proxies = value.proxies;
  if (proxies !== undefined && !Array.isArray(proxies)) throw new Error("proxies 必须是节点列表。");
  const reserved = new Set([LISA_GROUP, ...bundle.nodes.map(n => n.name)]);
  const existing = (proxies ?? []) as Record<string, unknown>[];
  if (existing.some(n => reserved.has(String(n.name))) || groups.some(g => reserved.has(g.name))) {
    throw new Error("配置已包含丽萨洛杉矶 VPS 名称，请避免重复添加。");
  }
  if (proxies === undefined) doc.set("proxies", doc.createNode([]));
  const nodeList = doc.get("proxies", true);
  const groupList = doc.get("proxy-groups", true);
  if (!isSeq(nodeList) || !isSeq(groupList)) throw new Error("节点或策略组列表格式错误。");
  for (const node of bundle.nodes) nodeList.add(doc.createNode(node));

  // Do not let new raw VPS nodes get automatically mixed into airport region/relay pools.
  // Explicit group references remain selectable; only include-all's implicit nodes are filtered.
  const exclude = `^${LISA_GROUP} · `;
  const rawGroups = value["proxy-groups"] as Record<string, unknown>[];
  for (const g of groups) {
    const raw = rawGroups[g.index];
    if (raw["include-all"] === true || raw["include-all-proxies"] === true) {
      const previous = typeof raw["exclude-filter"] === "string" ? raw["exclude-filter"] : "";
      doc.setIn(["proxy-groups", g.index, "exclude-filter"], previous ? `(?:${previous})|(?:${exclude})` : exclude);
    }
    // Regional url-test pools remain regional. A relay hop must not silently change countries.
    if (g.type !== "select" || g.name.endsWith("-中转") || g.name.startsWith("订阅刷新")) continue;
    // A provider-only selector has no static first item. Keep its initial exit on the
    // airport pool instead of making the newly added VPS its implicit default.
    const current = g.name === "所有-手动" && !g.proxies.length && groups.some(x => x.name === "所有-自动")
      ? ["所有-自动"] : g.proxies;
    const choices = defaults.includes(g.name) ? [LISA_GROUP, ...current] : [...current, LISA_GROUP];
    doc.setIn(["proxy-groups", g.index, "proxies"], [...new Set(choices)]);
  }
  groupList.add(doc.createNode({ name: LISA_GROUP, type: "select",
    icon: "https://gh-proxy.com/raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/us.svg",
    proxies: bundle.nodes.map(n => n.name) }));
  const output = doc.toString({ lineWidth: 0 });
  const error = inspectYaml(output).find(p => p.severity === "error");
  if (error) throw new Error(`丽萨 VPS 合并失败：${error.message}`);
  return output;
}
