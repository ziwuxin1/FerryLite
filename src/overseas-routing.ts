import {V77} from "./overseas-v77.ts";

// Keep the owner's tested V77 routes and selections. Add reviewed service sets
// before MATCH, so existing special cases (including LiTV ads) keep precedence.
const services: [string,string,string][] = [
  ["Binance / Domain", "binance", "交易所"],
  ["Gate / Domain", "gateio", "交易所"],
  ["KuCoin / Domain", "kucoin", "交易所"],
  ["Bahamut / Domain", "bahamut", "台湾影音"],
  ["LiTV / Domain", "litv", "台湾影音"],
  ["ABEMA / Domain", "abema", "日本网站"],
  ["TVer / Domain", "tver", "日本网站"],
  ["Niconico / Domain", "niconico", "日本网站"],
];
const extra: string[] = [];
for (const [name,,group] of services) extra.push(`AND,((NETWORK,UDP),(RULE-SET,${name})),REJECT`, `RULE-SET,${name},${group}`);
for (const [group,domains] of [
  ["交易所", ["oklink.com","xlayer.tech","okx.com.cdn.cloudflare.net","kucoin.com","kucoin.plus","bitget.com","bitgetapp.com","bitgetapps.com","krbitget.com","bitget.cloud","bitget.org","bitget.io"]],
  ["日本网站", ["fc2.com","fc2.net","fc2video.com"]],
] as const) for (const domain of domains) extra.push(`AND,((NETWORK,UDP),(DOMAIN-SUFFIX,${domain})),REJECT`, `DOMAIN-SUFFIX,${domain},${group}`);
export const OVERSEAS_RULES = [...V77.rules.filter(r=>!r.startsWith("MATCH,") && r!=="DOMAIN-KEYWORD,fc2,日本网站"), ...extra, "MATCH,直连"];
export const OVERSEAS_PROVIDERS = {
  ...V77.ruleProviders,
  ...Object.fromEntries(services.map(([name,slug])=>[name,{type:"http",interval:86400,behavior:"domain",format:"mrs",url:`https://gh-proxy.com/github.com/metacubex/meta-rules-dat/raw/refs/heads/meta/geo/geosite/${slug}.mrs`}]))
};
