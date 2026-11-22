import AI_ROUTING from "../ferry-core/data/ai-routing.json" with { type: "json" };
import CATALOG from "../ferry-core/data/site-catalog.json" with { type: "json" };
export interface SitePreset { key: string; name: string; aliases: string[]; domains: string[]; ipCidrs?: string[]; exclusive?: boolean; sources: string[] }
// Core and editor consume the same reviewed service boundaries.
export const SITE_CATALOG: SitePreset[] = [
 {key:"chatgpt",name:"ChatGPT",aliases:["chatgpt","ChatGPT","OpenAI","Codex"],domains:[...AI_ROUTING.chatgpt.suffixes,...AI_ROUTING.chatgpt.domains],sources:[AI_ROUTING.sources.chatgpt]},
 ...CATALOG,
 {key:"claude",name:"Claude",aliases:["claude","Anthropic","Claude Code","Claude（默认启用）"],domains:[...AI_ROUTING.claude.suffixes,...AI_ROUTING.claude.domains],sources:[AI_ROUTING.sources.claude]},
];
export const SITES = SITE_CATALOG.filter(site => !site.exclusive);
