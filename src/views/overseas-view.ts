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
  const target=select("用在哪里",[["pc","我的电脑（Windows / Mac）"],["nikki","我的路由器（Nikki / OpenClash）"]]);
  const airports: {row:HTMLElement;name:HTMLInputElement;url:HTMLInputElement}[]=[];
  const airportList=el("div",{class:"airport-list"});
  const nodeList=el("div",{class:"overseas-node-list"});
  const nodeCount=el("div",{class:"field-hint"});
  const controls=new Map<string,{on:HTMLInputElement;exit:HTMLSelectElement;domains:HTMLTextAreaElement}>();
  const savedDefaults:Record<string,string>={};
  const save=()=>{try{localStorage.setItem(DRAFT,JSON.stringify({version:1,target:target.value,groups:[...controls].map(([name,c])=>({name,enabled:c.on.checked,exit:c.exit.value,domains:c.domains.value}))}));}catch{/* Private browsing may disable storage. */}};
  const changed=()=>{revision++;download.disabled=true;edit.disabled=true;preview?.destroy();preview=null;previewHost.replaceChildren();previewCard.hidden=true;save();if(result)note("设置已修改，请重新点击下载配置。");};
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
    const name=input("海外机场名称");name.value="";
    const label=airports.length?`额外订阅链接 ${airports.length+1}`:"机场订阅链接";
    const url=input(label,"url","在这里粘贴机场的 Clash / Mihomo 订阅链接");
    const row=el("div",{class:"overseas-airport-row"});const item={row,name,url};
    row.append(field(label,url));
    if(airports.length)row.append(button("移除这条订阅",()=>{airports.splice(airports.indexOf(item),1);row.remove();changed();}));
    url.oninput=changed;airports.push(item);airportList.append(row);changed();
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
      unlockStatus.textContent=`已载入你的 ${incoming.nodes.length} 个私人节点和原来的分流设置。现在可以直接点击「下载配置」，也可以继续添加订阅。`;unlockStatus.className="status-line ok";
      routingSummary.textContent="已使用你的私人分流设置：中国网站、交易所、台湾影音、日本网站沿用你原来的节点选择。";
    }catch(e){unlockStatus.textContent=(e as Error).message;unlockStatus.className="status-line err";}finally{unlock.disabled=false;}
  })();},true);
  code.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();unlock.click();}};
  const routingSummary=el("p",{class:"field-hint overseas-routing-summary"},["已经帮你选好：台湾影音、海外交易所用台湾节点，日本网站用日本节点；中国网站、哔哩哔哩、Steam 和其他网站用你当前的网络。"]);
  const privateCard=el("details",{class:"card overseas-private"},[el("summary",{},["我有私人代码（可选）"]),el("p",{class:"field-hint"},["载入自己的私人节点和分流设置，不需要另外填写订阅。"]),el("div",{class:"btn-row"},[code,unlock]),unlockStatus]);
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
  const routeCard=el("div",{class:"card"},[el("h2",{},["自定义网站分流"]),el("p",{class:"field-hint"},["一般不用修改。需要回国节点或固定出口时，在这里更改。取消分类后使用其余规则。"])]);
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
  const previewCard=el("details",{class:"card",hidden:true},[el("summary",{},["查看或编辑配置内容（可选）"]),el("div",{class:"btn-row"},[download,edit]),previewHost]) as HTMLDetailsElement;
  previewCard.ontoggle=()=>{void(async()=>{
    if(!previewCard.open||!result||preview)return;
    const start=revision;
    const {createYamlPreview}=await import("./yaml-preview");
    if(start!==revision||!result||preview)return;
    preview=createYamlPreview(previewHost,result.yaml,yaml=>{if(result)result={...result,yaml};});
  })();};
  const generate=button("下载配置",()=>{void(async()=>{
    if(loading)return;loading=true;generate.disabled=true;const start=revision;
    try{
      const subscriptions=airports.map(a=>({name:a.name.value,url:a.url.value})).filter(a=>a.url.trim());
      if(!subscriptions.length&&!bundle.nodes.length){airports[0]?.url.focus();throw new Error("请先粘贴机场订阅链接，或使用私人代码载入节点。");}
      const output=generateOverseas({target:target.value as "pc"|"nikki",airports:subscriptions,bundle,enabled:[...controls].filter(([,c])=>c.on.checked).map(([name])=>name),defaults:Object.fromEntries([...controls].map(([n,c])=>[n,c.exit.value])),domains:Object.fromEntries([...controls].map(([n,c])=>[n,c.domains.value])),controllerSecret:crypto.randomUUID().replaceAll("-","")});
      result=output;generatedRevision=revision;preview?.destroy();preview=null;previewHost.replaceChildren();previewCard.open=false;previewCard.hidden=false;download.disabled=false;edit.disabled=false;
      const saved=await platform().saveYaml(output.yaml,output.filename);
      if(start!==revision)return;
      if(saved===null){note("配置已生成，保存已取消。需要时可再次点击下载配置。");return;}
      note("配置已生成，已发起下载。将下载的文件导入 Clash 客户端或路由器插件并启用，客户端会自动加载订阅节点。");
    }catch(e){note((e as Error).message,true);}finally{loading=false;generate.disabled=false;}
  })();},true);
  target.onchange=changed;
  const reset=button("重置海外配置",()=>{try{localStorage.removeItem(DRAFT);}catch{/* Storage is optional. */}preview?.destroy();root.replaceChildren();renderOverseasView(root);});
  const advanced=el("details",{class:"card overseas-advanced"},[el("summary",{},["高级设置（一般不用改）"]),button("再添加一个机场",addAirport),nodeCard,routeCard,reset]);
  const quickCard=el("div",{class:"card overseas-quick"},[el("h2",{},["粘贴订阅，直接下载"]),el("p",{class:"field-hint"},["不用选节点，也不用设置分流。复制机场里的「Clash / Mihomo 订阅链接」，粘贴到下面。"]),airportList,field("用在哪里",target),el("div",{class:"btn-row"},[generate]),status,el("p",{class:"field-hint"},["下载后，将文件导入 Clash 客户端或路由器插件并启用。TUN 已开启。"]),routingSummary,el("p",{class:"field-hint"},["订阅需要包含台湾、日本节点，才能使用对应地区服务。节点按名称自动识别；中国地区限定内容需在高级设置中添加回国节点。"])]);
  root.append(quickCard,privateCard,advanced,previewCard);
  try{const raw=localStorage.getItem(DRAFT);if(raw){const d=JSON.parse(raw);if(d.version===1){if(["pc","nikki"].includes(d.target))target.value=d.target;for(const g of d.groups??[]){const c=controls.get(g.name);if(!c)continue;if(typeof g.enabled==="boolean")c.on.checked=g.enabled;if(typeof g.exit==="string")savedDefaults[g.name]=g.exit;if(typeof g.domains==="string"&&g.domains.length<100000)c.domains.value=g.domains;}}}}catch{note("已保存的海外分流设置无法读取，请重新配置。",true);}
  refreshNodes();addAirport();
  if([...controls].some(([,c])=>!c.on.checked||c.exit.value||c.domains.value.trim()))routingSummary.textContent="已恢复你上次的自定义分流设置。可在高级设置中查看，或点击「重置海外配置」恢复自动分流。";
}
