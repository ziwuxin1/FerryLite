import { el } from "../dom";
import { platform } from "../platform";
import { generateOverseas, importOverseasNodes, mergeOverseasNodes, OVERSEAS_GROUPS, REGIONS } from "../overseas-generator";
import { validateOverseasBundle } from "../overseas-data";
import type { OverseasBundle } from "../overseas-data";
import { inspectYaml } from "../yaml-editor";

const field=(name:string,node:HTMLElement)=>el("label",{class:"field"},[el("span",{},[name]),node]);
const input=(name:string,type="text",placeholder="")=>el("input",{type,"aria-label":name,placeholder,autocomplete:"off"}) as HTMLInputElement;
const select=(name:string,options:string[][])=>el("select",{"aria-label":name},options.map(([v,label])=>el("option",{value:v},[label]))) as HTMLSelectElement;
const button=(label:string,fn:()=>void,primary=false)=>el("button",{type:"button",class:`btn${primary?" primary":""}`,onclick:fn},[label]) as HTMLButtonElement;
const hints:Record<string,string>={中国网站:"回国访问中国服务",哔哩哔哩:"独立选择哔哩哔哩出口",交易所:"海外交易所 · 可选台湾独立 IP",台湾影音:"台湾影音及播放 CDN",日本网站:"日本地区网站及相关服务",STEAM:"默认直连，可切换地区"};
const DRAFT="ferrylite.overseas.routing.v1";

export function renderOverseasView(root:HTMLElement): void {
  root.classList.add("overseas-config");
  let bundle:OverseasBundle={version:1,nodes:[],preferred:{}};
  let revision=0,generatedRevision=-1,result:{yaml:string;filename:string}|null=null;
  let preview:ReturnType<typeof import("./yaml-preview").createYamlPreview>|null=null;
  let loading=false;
  const status=el("div",{class:"status-line",role:"status","aria-live":"polite"});
  const note=(message:string,error=false)=>{status.textContent=message;status.className=`status-line ${error?"err":"ok"}`;};
  const target=select("海外配置运行位置",[["nikki","路由器版 · Nikki / OpenClash"],["pc","电脑版 · Clash / Mihomo"]]);
  const airports: {row:HTMLElement;name:HTMLInputElement;url:HTMLInputElement}[]=[];
  const airportList=el("div",{class:"airport-list"});
  const nodeList=el("div",{class:"overseas-node-list"});
  const nodeCount=el("div",{class:"field-hint"});
  const controls=new Map<string,{on:HTMLInputElement;exit:HTMLSelectElement;domains:HTMLTextAreaElement}>();
  const savedDefaults:Record<string,string>={};
  const save=()=>{try{localStorage.setItem(DRAFT,JSON.stringify({version:1,target:target.value,groups:[...controls].map(([name,c])=>({name,enabled:c.on.checked,exit:c.exit.value,domains:c.domains.value}))}));}catch{/* Private browsing may disable storage. */}};
  const changed=()=>{revision++;download.disabled=true;edit.disabled=true;save();if(result)note("配置已修改，请重新生成海外 YAML。");};
  const nodeChoices=()=>[...REGIONS.map(r=>`${r}-出口`),...bundle.nodes.map(n=>n.name),"直连","拒绝"];
  const refreshChoices=()=>{
    for(const [name,c] of controls){const previous=c.exit.value||savedDefaults[name]||"";c.exit.replaceChildren(el("option",{value:""},["按海外模板选择"]),...nodeChoices().map(n=>el("option",{value:n},[n])));c.exit.value=nodeChoices().includes(previous)?previous:"";}
  };
  const refreshNodes=()=>{
    nodeCount.textContent=`已添加 ${bundle.nodes.length} 个独立节点。节点凭据只保留在本页内存和导出的 YAML 中，刷新后需重新导入或解锁。`;
    nodeList.replaceChildren(...bundle.nodes.map(n=>el("div",{class:"overseas-node-row"},[
      el("span",{},[`${n.name} · ${n.type}`]),button("移除",()=>{bundle={...bundle,nodes:bundle.nodes.filter(x=>x.name!==n.name)};refreshNodes();changed();})
    ])));refreshChoices();
  };
  const addAirport=()=>{
    const name=input("海外机场名称","text","机场名称");const url=input("海外机场订阅","url","https://机场域名/订阅地址");
    const row=el("div",{class:"card overseas-airport-row"});const item={row,name,url};
    row.append(el("div",{class:"row-2"},[field("机场名称",name),field("Mihomo 订阅链接",url)]),button("移除机场",()=>{airports.splice(airports.indexOf(item),1);row.remove();changed();}));
    name.oninput=changed;url.oninput=changed;airports.push(item);airportList.append(row);changed();
  };
  const code=input("海外私人节点代码","password","输入私人代码");
  const unlockStatus=el("div",{class:"status-line",role:"status","aria-live":"polite"});
  const unlock=button("载入我的私人节点",()=>{void(async()=>{
    if(!code.value.trim())return;
    unlock.disabled=true;
    try{
      const endpoint=platform().kind==="web"?"/api/overseas":"https://ferrylite.cc/api/overseas";
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code.value.trim()}),cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(response.status===401?"私人代码不正确。":response.status===429?"尝试过于频繁，请稍后再试。":"私人节点暂时无法加载，请稍后重试。");
      const incoming=validateOverseasBundle(await response.json());
      bundle=mergeOverseasNodes(bundle,incoming);code.value="";code.hidden=true;unlock.hidden=true;refreshNodes();changed();
      unlockStatus.textContent=`已载入 ${incoming.nodes.length} 个私人节点，使用 V77 中的默认出口。机场订阅仍可继续添加。`;unlockStatus.className="status-line ok";
    }catch(e){unlockStatus.textContent=(e as Error).message;unlockStatus.className="status-line err";}finally{unlock.disabled=false;}
  })();},true);
  code.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();unlock.click();}};
  const targetCard=el("div",{class:"card"},[el("h2",{},["海外使用"]),el("p",{class:"field-hint"},["功能免费开放，机场与独立节点由你自行配置。中国网站、交易所、台湾影音、日本网站分别分流，其余流量默认直连。"]),field("导出版本",target),el("p",{class:"field-hint"},["TUN 保持开启，IPv6 默认关闭。路由器版沿用 V77 的 Nikki 接管方式；电脑版自动配置 TUN 路由。"])]);
  const privateCard=el("details",{class:"card overseas-private"},[el("summary",{},["私人节点 · 神秘代码"]),el("p",{class:"field-hint"},["已有私人代码可载入自己的节点；不输入也能使用全部海外配置功能。"]),el("div",{class:"btn-row"},[code,unlock]),unlockStatus]);
  const protocol=select("独立节点协议",[["socks5","SOCKS5"],["http","HTTP"]]);
  const region=select("独立节点地区",REGIONS.map(r=>[r,r]));const nodeName=input("独立节点名称","text","例如 台湾家宽");
  const server=input("独立节点服务器","text","服务器地址");const port=input("独立节点端口","number","1080");
  const username=input("独立节点用户名");const password=input("独立节点密码","password");
  const chain=select("独立节点连接方式",[["DIRECT","直接连接"],...REGIONS.map(r=>[`${r}-机场`,`经机场${r}节点连接`])]);
  const tls=input("独立节点 TLS","checkbox");
  const addNode=button("添加独立节点",()=>{
    try{
      const name=nodeName.value.trim();if(!name)throw new Error("请填写独立节点名称。");
      const n={name:`${region.value} · ${name}`,type:protocol.value,server:server.value.trim(),port:Number(port.value),username:username.value,password:password.value,udp:false,...(tls.checked?{tls:true}:{}),...(chain.value!=="DIRECT"?{"dialer-proxy":chain.value}:{})};
      bundle=mergeOverseasNodes(bundle,validateOverseasBundle({version:1,nodes:[n],preferred:{}}));password.value="";refreshNodes();changed();note("独立节点已添加。");
    }catch(e){note((e as Error).message,true);}
  });
  const importFile=input("导入海外节点 YAML","file");importFile.accept=".yaml,.yml";
  importFile.onchange=()=>{void(async()=>{try{const f=importFile.files?.[0];if(!f)return;const incoming=importOverseasNodes(await f.text());bundle=mergeOverseasNodes(bundle,incoming);refreshNodes();changed();note(`已从本地 YAML 导入 ${incoming.nodes.length} 个节点，文件未上传。`);}catch(e){note((e as Error).message,true);}finally{importFile.value="";}})();};
  const nodeCard=el("div",{class:"card"},[el("h2",{},["独立节点"]),el("p",{class:"field-hint"},["可填写 SOCKS5 / HTTP 代理，或导入包含 WireGuard、HY2、VMess 等节点的 Mihomo YAML。节点名称相同则替换该节点。"]),el("details",{},[el("summary",{},["手动添加代理"]),el("div",{class:"row-2"},[field("协议",protocol),field("地区",region),field("名称",nodeName),field("服务器",server),field("端口",port),field("用户名",username),field("密码",password),field("连接方式",chain)]),el("label",{class:"checkbox-row"},[tls,"启用 TLS"]),addNode]),field("本地 YAML 导入",importFile),nodeCount,nodeList]);
  const routeCard=el("div",{class:"card"},[el("h2",{},["海外分流"]),el("p",{class:"field-hint"},["沿用 V77 的网站和播放资源规则。取消某一分类后，该分类按其余规则处理；默认兜底直连。需要的地区没有节点时，该地区出口拒绝连接。"])]);
  for(const name of OVERSEAS_GROUPS){
    const on=input(`启用海外${name}`,"checkbox");on.checked=true;
    const exit=select(`${name}默认出口`,[["","按海外模板选择"]]);
    const domains=el("textarea",{rows:3,"aria-label":`${name}补充域名`,placeholder:"补充域名，每行一个；包含其子域名"}) as HTMLTextAreaElement;
    controls.set(name,{on,exit,domains});on.onchange=changed;exit.onchange=()=>{savedDefaults[name]=exit.value;changed();};domains.oninput=changed;
    routeCard.append(el("details",{class:"overseas-route"},[el("summary",{},[name]),el("p",{class:"field-hint"},[hints[name]]),el("label",{class:"checkbox-row"},[on,`启用 ${name}`]),field("默认出口",exit),field("补充网站",domains)]));
  }
  const previewHost=el("div",{class:"yaml-source-editor"});
  const download=button("下载海外 YAML",()=>{void(async()=>{if(!result||generatedRevision!==revision)return;const errors=inspectYaml(result.yaml).filter(e=>e.severity==="error");if(errors.length){note(errors[0].message,true);return;}try{await platform().saveYaml(result.yaml,result.filename);}catch(e){note((e as Error).message,true);}})();},true);
  const edit=button("管理策略组与站点",()=>{if(result&&generatedRevision===revision)window.dispatchEvent(new CustomEvent("ferry:edit-yaml",{detail:result}));});
  download.disabled=true;edit.disabled=true;
  const previewCard=el("div",{class:"card",hidden:true},[el("h2",{},["海外 YAML 预览"]),el("div",{class:"btn-row"},[download,edit]),previewHost]);
  const generate=button("生成海外 YAML",()=>{void(async()=>{
    if(loading)return;loading=true;generate.disabled=true;const start=revision;
    try{
      const output=generateOverseas({target:target.value as "pc"|"nikki",airports:airports.map(a=>({name:a.name.value,url:a.url.value})).filter(a=>a.name.trim()||a.url.trim()),bundle,enabled:[...controls].filter(([,c])=>c.on.checked).map(([name])=>name),defaults:Object.fromEntries([...controls].map(([n,c])=>[n,c.exit.value])),domains:Object.fromEntries([...controls].map(([n,c])=>[n,c.domains.value])),controllerSecret:crypto.randomUUID().replaceAll("-","")});
      const {createYamlPreview}=await import("./yaml-preview");
      if(start!==revision){note("生成期间配置发生变化，请重新生成。",true);return;}
      result=output;generatedRevision=revision;preview?.destroy();previewCard.hidden=false;
      preview=createYamlPreview(previewHost,output.yaml,yaml=>{if(result)result={...result,yaml};});download.disabled=false;edit.disabled=false;
      note(output.warnings.length?output.warnings.join(" "):"海外配置已生成并通过校验。可下载或继续管理策略组与站点。");previewCard.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){note((e as Error).message,true);}finally{loading=false;generate.disabled=false;}
  })();},true);
  target.onchange=changed;
  const reset=button("重置海外配置",()=>{try{localStorage.removeItem(DRAFT);}catch{/* Storage is optional. */}preview?.destroy();root.replaceChildren();renderOverseasView(root);});
  root.append(targetCard,privateCard,el("div",{class:"card"},[el("h2",{},["机场订阅"]),el("p",{class:"field-hint"},["可添加多个机场。按节点名称识别中国、台湾、日本等地区，每 10 分钟更新订阅。订阅链接仅在本地写入生成的 YAML。"]),airportList,button("添加海外机场",addAirport)]),nodeCard,routeCard,el("p",{class:"field-hint"},["自动保存分流选项；订阅链接、账号密码和私人节点不保存到浏览器存储。"]),el("div",{class:"btn-row"},[generate,reset]),status,previewCard);
  try{const raw=localStorage.getItem(DRAFT);if(raw){const d=JSON.parse(raw);if(d.version===1){if(["pc","nikki"].includes(d.target))target.value=d.target;for(const g of d.groups??[]){const c=controls.get(g.name);if(!c)continue;if(typeof g.enabled==="boolean")c.on.checked=g.enabled;if(typeof g.exit==="string")savedDefaults[g.name]=g.exit;if(typeof g.domains==="string"&&g.domains.length<100000)c.domains.value=g.domains;}}}}catch{note("已保存的海外分流设置无法读取，请重新配置。",true);}
  refreshNodes();
}
