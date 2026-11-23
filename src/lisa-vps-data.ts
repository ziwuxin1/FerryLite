export const LISA_GROUP = "丽萨洛杉矶VPS";
export const LISA_SERVER = "38.34.24.86";
export const HONG_KONG_GROUP = "MAXs香港VPS";
export const HONG_KONG_SERVER = "192.238.186.43";
export type LisaNode = Record<string, unknown> & { name: string; type: string; server: string; port: number };
export interface LisaBundle { version: 1; nodes: LisaNode[]; hongKong?: { version: 1; nodes: LisaNode[] } }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 512): v is string => typeof v === "string" && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const fail = (): never => { throw new Error("专属 VPS 配置不完整，请联系管理员检查服务端设置。"); };

/** Accept only the three direct VPS transports; never copy arbitrary client configuration. */
export function validateLisaBundle(value: unknown): LisaBundle {
  const bundle = validateTransportBundle(value, LISA_SERVER, LISA_GROUP, "🇺🇸");
  if (record(value) && value.hongKong !== undefined) bundle.hongKong = validateHongKongBundle(value.hongKong);
  return bundle;
}

export function validateHongKongBundle(value: unknown): LisaBundle {
  const bundle = validateTransportBundle(value, HONG_KONG_SERVER, HONG_KONG_GROUP, "🇭🇰");
  // Prefer the verified TCP transport; HY2 depends on UDP reachability.
  const order = ["ss", "hysteria2", "vless"];
  bundle.nodes.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return bundle;
}

function validateTransportBundle(value: unknown, server: string, group: string, flag: string): LisaBundle {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.nodes) || value.nodes.length !== 3) return fail();
  const nodes: LisaNode[] = [];
  for (const type of ["hysteria2", "ss", "vless"]) {
    const matches = value.nodes.filter(n => record(n) && n.type === type);
    if (matches.length !== 1) return fail();
    const n = matches[0] as Record<string, unknown>;
    const port = type === "hysteria2" ? 443 : type === "ss" ? 24443 : 34443;
    if (n.server !== server || n.port !== port || n["dialer-proxy"] !== undefined) return fail();
    const base = { name: `${flag} ${group} · ${type === "hysteria2" ? "HY2" : type === "ss" ? "SS2022" : "Reality"}`, type, server, port };
    if (type === "hysteria2") {
      if (!text(n.password) || !text(n.sni) || !text(n.fingerprint) || !/^[a-f\d]{64}$/i.test(n.fingerprint.replaceAll(":", ""))) return fail();
      nodes.push({ ...base, password: n.password, sni: n.sni, fingerprint: n.fingerprint.replaceAll(":", ""), "skip-cert-verify": false, alpn: ["h3"], udp: true });
    } else if (type === "ss") {
      if (n.cipher !== "2022-blake3-aes-128-gcm" || !text(n.password) || !/^[A-Za-z0-9+/]{22}==$/.test(n.password)) return fail();
      nodes.push({ ...base, cipher: n.cipher, password: n.password, udp: true });
    } else {
      const r = n["reality-opts"];
      if (!text(n.uuid) || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(n.uuid) ||
          !text(n.servername) || !record(r) || !text(r["public-key"]) || !/^[A-Za-z0-9_-]{43}$/.test(r["public-key"]) ||
          !text(r["short-id"]) || !/^(?:[a-f\d]{2}){1,8}$/i.test(r["short-id"])) return fail();
      nodes.push({ ...base, uuid: n.uuid, network: "tcp", tls: true, udp: false, flow: "xtls-rprx-vision",
        servername: n.servername, "client-fingerprint": "chrome", "reality-opts": { "public-key": r["public-key"], "short-id": r["short-id"] } });
    }
  }
  return { version: 1, nodes };
}
