// A local visibility switch, not server-side access control. Do not persist unlock state.
const CODE_DIGEST = "b8207d14cfc2ac9dcf7a0b72ac8d9502f9358b378c43e0e0a8d62737d2170bff";
export const isExclusiveApp = (key: string): boolean => key === "maxsacademy" || key === "perforce";
export const canIncludeApp = (key: string, unlocked: boolean): boolean => unlocked || !isExclusiveApp(key);
export async function matchesExclusiveCode(code: string): Promise<boolean> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim()));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("") === CODE_DIGEST;
}
