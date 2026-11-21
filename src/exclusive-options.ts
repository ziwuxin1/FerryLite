import { validateLisaBundle } from "./lisa-vps-data.ts";
import type { LisaBundle } from "./lisa-vps-data.ts";
// Code and node credentials stay in memory only; the server owns access verification.
export const isExclusiveApp = (key: string): boolean => key === "maxsacademy" || key === "perforce" || key === "perforce_hk";
export const canIncludeApp = (key: string, unlocked: boolean): boolean => unlocked || !isExclusiveApp(key);
export async function unlockExclusive(code: string, request: typeof fetch = fetch, endpoint = "/api/exclusive"): Promise<LisaBundle | null> {
  if (!code.trim()) return null;
  const response = await request(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim() }), credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) return null;
  if (response.status === 429) throw new Error("尝试过于频繁，请稍后再试。");
  if (!response.ok) throw new Error("专属 VPS 暂时无法加载，请联系管理员或稍后重试。");
  return validateLisaBundle(await response.json());
}
