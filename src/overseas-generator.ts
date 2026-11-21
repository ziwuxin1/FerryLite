import { parse, stringify } from "yaml";
import { V77 } from "./overseas-v77.ts";
import { inspectYaml, normalizeDomains } from "./yaml-editor.ts";
import { validateOverseasBundle } from "./overseas-data.ts";
import type { OverseasBundle, OverseasNode } from "./overseas-data.ts";

export const OVERSEAS_GROUPS = ["中国网站", "哔哩哔哩", "交易所", "台湾影音", "日本网站", "STEAM"] as const;
export const REGIONS = ["中国", "台湾", "日本", "香港", "美国", "新加坡", "韩国"] as const;
const regionPatterns = ["(?i)(中国|回国|大陆|深圳|北京|\\bCN\\b|China)", "(?i)(台湾|台灣|🇹🇼|Taiwan|\\bTW\\b)", "(?i)(日本|东京|大阪|🇯🇵|Japan|\\bJP\\b)", "(?i)(香港|🇭🇰|Hong.?Kong|\\bHK\\b)", "(?i)(美国|洛杉|🇺🇸|United.States|\\bUS\\b)", "(?i)(新加坡|🇸🇬|Singapore|\\bSG\\b)", "(?i)(韩国|韓國|🇰🇷|Korea|\\bKR\\b)"];
const flags = ["cn", "tw", "jp", "hk", "us", "sg", "kr"];
const flag = (code: string) => `https://gh-proxy.com/raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${code}.svg`;
const icons: Record<string, string> = {中国网站:flag("cn"),哔哩哔哩:"https://icon.horse/icon/bilibili.com",交易所:"https://icon.horse/icon/okx.com",台湾影音:flag("tw"),日本网站:flag("jp"),STEAM:"https://icon.horse/icon/steampowered.com"};
const defaultExits: Record<string, string> = {中国网站:"中国-出口",哔哩哔哩:"中国网站",交易所:"台湾-出口",台湾影音:"台湾-出口",日本网站:"日本-出口",STEAM:"直连"};
export interface OverseasInput {
  target: "pc" | "nikki";
  airports: {name:string;url:string}[];
  bundle: OverseasBundle;
  enabled: string[];
  defaults: Record<string,string>;
  domains: Record<string,string>;
  controllerSecret: string;
}
export function importOverseasNodes(source: string): OverseasBundle {
  if(source.length > 2_000_000) throw new Error("节点文件过大，请使用小于 2 MB 的 YAML。");
  const data = parse(source, { maxAliasCount: 100 });
  if (!data || !Array.isArray(data.proxies)) throw new Error("请导入包含 proxies 节点列表的 Mihomo YAML。");
  const preferred: Record<string,string[]> = {};
  for(const g of data["proxy-groups"] ?? []) if (typeof g.name === "string" && Array.isArray(g.proxies)) preferred[g.name] = g.proxies;
  return validateOverseasBundle({version:1,nodes:data.proxies,preferred});
}
export function generateOverseas(input: OverseasInput): {yaml:string;filename:string;warnings:string[]} {
  const bundle=validateOverseasBundle(input.bundle);
  const enabled=new Set(input.enabled.filter(n => (OVERSEAS_GROUPS as readonly string[]).includes(n)));
  const names=new Set(["直连","拒绝","DIRECT","REJECT","test",...OVERSEAS_GROUPS,...REGIONS.flatMap(r=>[`${r}-机场`,`${r}-出口`])]);
  for(const node of bundle.nodes) {if(names.has(node.name))throw new Error(`节点名称与策略组冲突：${node.name}`);names.add(node.name);}
  const providers: Record<string,unknown>={};
  input.airports.forEach((a,i)=>{
    if(!a.name.trim())throw new Error("请填写机场名称。");
    let u:URL;try{u=new URL(a.url.trim());}catch{throw new Error("机场订阅地址格式不正确。");}
    if(!["https:","http:"].includes(u.protocol)||u.username||u.password)throw new Error("请使用 HTTP / HTTPS 订阅链接。");
    providers[`机场${i+1} · ${a.name.trim()}`]={type:"http",url:u.href,path:`./proxy_providers/overseas-${i+1}.yaml`,interval:600,proxy:"DIRECT","health-check":{enable:true,url:"https://www.gstatic.com/generate_204",interval:300,lazy:true}};
  });
  const groups: Record<string,unknown>[]=[];
  const existing=new Set([...names,...OVERSEAS_GROUPS]);
  const unique=(a:string[])=>[...new Set(a)];
  const warnings:string[]=[];
  for(const [i,r] of REGIONS.entries()) {
    groups.push({name:`${r}-机场`,type:"url-test",icon:flag(flags[i]),proxies:["REJECT"],...(input.airports.length?{use:Object.keys(providers)}:{}),filter:regionPatterns[i],"empty-fallback":"REJECT",url:"https://www.gstatic.com/generate_204",interval:300,tolerance:50});
    const regex=new RegExp(regionPatterns[i].replace("(?i)",""),"i");
    const local=bundle.nodes.filter(n=>regex.test(n.name)&&n["dialer-proxy"]!==`${r}-出口`).map(n=>n.name);
    groups.push({name:`${r}-出口`,type:"select",icon:flag(flags[i]),proxies:unique([...local,`${r}-机场`,"REJECT"])});
  }
  for(const name of OVERSEAS_GROUPS) {
    const preferred=(bundle.preferred[name]??[]).filter(n=>existing.has(n));
    const fallback=defaultExits[name];
    const first=input.defaults[name] || preferred[0] || fallback;
    if(!existing.has(first))throw new Error(`${name} 的默认出口不存在，请重新选择。`);
    groups.push({name,type:"select",icon:icons[name],proxies:unique([first,...preferred,fallback,...REGIONS.map(r=>`${r}-出口`),...bundle.nodes.map(n=>n.name),"直连","拒绝"]).filter(n=>n!==name)});
    if(enabled.has(name)&&!bundle.nodes.length&&!input.airports.length&&first!=="直连")warnings.push(`${name} 尚未配置节点，当前对应地区出口将拒绝连接。`);
  }
  groups.push({name:"test",type:"select",icon:"https://icon.horse/icon/speedtest.net",proxies:["交易所","台湾影音","中国网站","日本网站","直连"]});
  const matcherEnabled=new Set<string>();
  for(const rule of V77.rules) {const parts=rule.split(",");if(enabled.has(parts[parts.length-1])||parts[parts.length-1]==="test")matcherEnabled.add(parts.slice(0,-1).join(","));}
  const rules:string[]=V77.rules.filter(rule=>{
    if(rule.startsWith("MATCH,"))return true;
    const match=rule.match(/^AND,\(\(NETWORK,UDP\),\((.*)\)\),REJECT$/);
    if(match)return matcherEnabled.has(match[1]);
    if(rule.endsWith(",REJECT"))return true;
    return enabled.has(rule.slice(rule.lastIndexOf(",")+1))||rule.endsWith(",test");
  });
  const additions:string[]=[];
  for(const name of OVERSEAS_GROUPS) if(enabled.has(name)&&input.domains[name]?.trim()) {
    const parsed=normalizeDomains(input.domains[name]);
    for(const domain of parsed.domains) {
      additions.push(`AND,((NETWORK,UDP),(DOMAIN-SUFFIX,${domain})),REJECT`,`DOMAIN-SUFFIX,${domain},${name}`);
    }
  }
  const router=input.target==="nikki";
  const config={
    "mixed-port":7890,"redir-port":7892,"tproxy-port":7893,"allow-lan":router,mode:"rule","log-level":"info",ipv6:false,
    "external-controller":"127.0.0.1:9090",secret:input.controllerSecret,
    dns:{enable:true,listen:`${router?"0.0.0.0":"127.0.0.1"}:7874`,ipv6:false,"enhanced-mode":"fake-ip","fake-ip-range":"198.18.0.1/16",nameserver:["1.1.1.1"],"proxy-server-nameserver":["1.1.1.1"],"fake-ip-filter-mode":"blacklist","fake-ip-filter":["+.lan","+.local","geosite:cn"]},
    tun:router?{enable:true,device:"nikki",stack:"mixed","auto-route":false,"auto-redirect":false}:{enable:true,stack:"gvisor","auto-route":true,"strict-route":true,"auto-detect-interface":true,"dns-hijack":["any:53","tcp://any:53"]},
    profile:{"store-selected":true,"store-fake-ip":true},sniffer:V77.sniffer,
    proxies:[...bundle.nodes,{name:"直连",type:"direct"},{name:"拒绝",type:"reject"}],"proxy-providers":providers,"proxy-groups":groups,
    "rule-providers":V77.ruleProviders,rules:[...additions,...rules],
  };
  const yaml=`# FerryLite 海外模式 · 根据 V77 分流规则生成\n# 含私人节点信息，请勿公开分享。未匹配流量直连。\n${stringify(config,{lineWidth:0})}`;
  const errors=inspectYaml(yaml).filter(e=>e.severity==="error");
  if(errors.length)throw new Error(errors.map(e=>e.message).join("；"));
  return {yaml,filename:`Ferry-Overseas-${router?"Router":"Desktop"}.yaml`,warnings};
}
export function mergeOverseasNodes(current: OverseasBundle, incoming: OverseasBundle): OverseasBundle {
  const nodes=new Map<string,OverseasNode>(current.nodes.map(n=>[n.name,n]));
  for(const n of incoming.nodes)nodes.set(n.name,n);
  return validateOverseasBundle({version:1,nodes:[...nodes.values()],preferred:{...current.preferred,...incoming.preferred}});
}
