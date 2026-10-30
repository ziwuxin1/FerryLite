// 后端命令的强类型封装。字段名与 Rust serde(camelCase) 输出一致。

import { invoke } from "@tauri-apps/api/core";

export type Protocol = "socks5" | "http";

export interface IndependentNodeInput {
  name: string;
  protocol: Protocol;
  server: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean | null;
  exitIp?: string | null;
  dialerProxy: string;
}

export interface Airport {
  name: string;
  url: string;
}

export interface GenerateInput {
  target?: "pc" | "nikki";
  taiwanNode?: IndependentNodeInput | null;
  exchangeOnly?: boolean;
  controllerSecret?: string;
  airports: Airport[];
  independentNodes: IndependentNodeInput[];
  splitApps: { key: string; relay: boolean; name: string }[];
  customGroups?: { name: string; domains: string[]; country: string; exact: boolean }[];
  /** DNS 覆写开关（默认 true）：false=生成的 dns.enable: false（机场公告要求关闭时用）。 */
  dnsOverride?: boolean;
}

export interface GenerateResult {
  target: "pc" | "nikki";
  exportOnly: boolean;
  instructions: string;
  yaml: string;
  mixedPort: number;
  proxyEndpoint: string;
  clashApiUrl: string;
  clashSecret: string;
  exitBasisIp: string;
  suggestedFileName: string;
}

export const api = {
  generateConfig: (input: GenerateInput) => invoke<GenerateResult>("generate_config", { input }),
  exportConfig: (path: string, yaml: string) => invoke<void>("export_config", { path, yaml }),
};
