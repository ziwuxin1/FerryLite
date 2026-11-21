export interface OverseasNode extends Record<string, unknown> { name: string; type: string }
export interface OverseasBundle { version: 1; nodes: OverseasNode[]; preferred: Record<string, string[]> }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 512 && !/[\x00-\x1f\x7f]/.test(v);
const protocols = new Set(["wireguard", "vmess", "hysteria2", "socks5", "http", "vless", "ss", "trojan", "tuic"]);
export function validateOverseasBundle(value: unknown): OverseasBundle {
  const fail = (): never => { throw new Error("海外节点配置格式不正确，请检查节点名称、协议和服务器地址。"); };
  if (!record(value) || value.version !== 1 || !Array.isArray(value.nodes) || value.nodes.length > 500 || JSON.stringify(value).length > 2_000_000) return fail();
  const nodes: OverseasNode[] = [];
  for (const n of value.nodes) {
    if (!record(n)) return fail();
    if (["direct", "reject"].includes(String(n.type))) continue;
    if (!text(n.name) || !text(n.type) || !protocols.has(n.type) || !text(n.server) || !Number.isInteger(n.port) || Number(n.port) < 1 || Number(n.port) > 65535) return fail();
    if (n["dialer-proxy"] !== undefined && !text(n["dialer-proxy"])) return fail();
    nodes.push(structuredClone(n) as OverseasNode);
  }
  if (new Set(nodes.map(n => n.name)).size !== nodes.length) return fail();
  const preferred: Record<string, string[]> = {};
  if (record(value.preferred)) for (const [name, choices] of Object.entries(value.preferred)) {
    if (!text(name) || !Array.isArray(choices) || choices.length > 500 || !choices.every(text)) return fail();
    preferred[name] = [...choices];
  }
  return { version: 1, nodes, preferred };
}
