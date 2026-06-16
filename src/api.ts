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
  airports: Airport[];
  independentNodes: IndependentNodeInput[];
  splitApps: { key: string; relay: boolean; name: string }[];
}

export interface GenerateResult {
  yaml: string;
  mixedPort: number;
  proxyEndpoint: string;
  clashApiUrl: string;
  clashSecret: string;
  exitBasisIp: string;
  suggestedFileName: string;
}

export interface SaveInput {
  path: string;
  yaml: string;
  exitBasisIp: string;
  proxyEndpoint: string;
  clashApiUrl: string;
  clashSecret: string;
  lastUpdated: string;
  claudeCodeCommand?: string;
}

export interface ClashApi {
  url: string;
  secret: string;
}

export interface AirportInfo {
  name: string;
  url: string;
}

export interface NodeInfo {
  name: string;
  server: string;
  protocol: string;
  port: string;
}

export interface AppConfig {
  version: number;
  exitBasisIp: string;
  proxyEndpoint: string;
  clashApi: ClashApi;
  generatedYamlPath: string;
  airports: AirportInfo[];
  nodes: NodeInfo[];
  claudeCodeCommand: string;
  claudeDesktopProcess: string;
  claudeDesktopPath?: string | null;
  lastUpdated: string;
}

export interface ExitIpReport {
  matched: boolean;
  echoIp: string;
  basisIp: string;
  source: string;
  message: string;
  proxyEndpoint: string;
}

export interface LinkHealthReport {
  total: number;
  success: number;
  avgLatencyMs: number | null;
  message: string;
}

export interface ShutdownReport {
  cliKilled: boolean;
  desktopKilled: boolean;
  details: string[];
}

export const api = {
  loadTemplate: () => invoke<string>("load_template"),
  generateConfig: (input: GenerateInput) => invoke<GenerateResult>("generate_config", { input }),
  saveGenerated: (input: SaveInput) => invoke<AppConfig>("save_generated", { input }),
  readAppConfig: () => invoke<AppConfig | null>("read_app_config"),
  importYaml: (path: string, lastUpdated: string) =>
    invoke<AppConfig>("import_yaml", { path, lastUpdated }),
  clearConfig: () => invoke<void>("clear_config"),
  setExitBasis: (ip: string) => invoke<AppConfig>("set_exit_basis", { ip }),
  checkClash: () => invoke<string>("check_clash"),
  verifyExitIp: () => invoke<ExitIpReport>("verify_exit_ip"),
  linkHealth: () => invoke<LinkHealthReport>("link_health"),
  launchClaudeCode: () => invoke<number>("launch_claude_code"),
  launchClaudeDesktop: () => invoke<void>("launch_claude_desktop"),
  safeShutdown: () => invoke<ShutdownReport>("safe_shutdown"),
};
