import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parse} from 'yaml';import {initSync,generateConfig} from '../web/src/ferry-wasm/ferry_wasm.js';
import {generateOverseas,OVERSEAS_GROUPS} from '../src/overseas-generator.ts';
import {V77} from '../src/overseas-v77.ts';
initSync({module:fs.readFileSync(new URL('../web/src/ferry-wasm/ferry_wasm_bg.wasm',import.meta.url))});
const keys=['google','microsoft','amazon','youtube','github','npm','gemini','cursor','gitlab','dockerhub','huggingface','ea','ubisoft','metaai','okx','steam','grok','twitter','gate','kucoin','whatsapp','discord'];
const input={airports:[{name:'Audit',url:'https://example.test/sub'}],independentNodes:[],splitApps:keys.map(key=>({key,name:key,relay:false}))};
// Minimal upstream company lists retain the overlaps that exposed the bug.
const remote={'Google / Domain':['google.com','googlevideo.com','youtube.com','googleusercontent.com','googleapis.com'],'Microsoft / Domain':['github.com','githubusercontent.com','npmjs.org','blob.core.windows.net']};
const suffix=(h,d)=>h===d||h.endsWith('.'+d);
function route(c,host){for(const r of c.rules){const p=r.split(',');if(p[0]==='DOMAIN'&&p[1]===host||p[0]==='DOMAIN-SUFFIX'&&suffix(host,p[1]))return p[2];if(p[0]==='RULE-SET'&&remote[p[1]]?.some(d=>suffix(host,d)))return p[2];if(p[0]==='MATCH')return p[1];}}
for(const target of ['pc','nikki'])test(`${target}: specific service routes win over corporate clouds with UDP guards`,()=>{
 const c=parse(JSON.parse(generateConfig(JSON.stringify({...input,target}))).yaml,{merge:true});
 const cases={'api.github.com':'github','raw.githubusercontent.com':'github','registry.npmjs.org':'npm','www.youtube.com':'youtube','r1.googlevideo.com':'youtube','yt3.googleusercontent.com':'youtube','cursorapi.com':'cursor','cursorvm.com':'cursor','gitlab-static.net':'gitlab','dockerstatic.com':'dockerhub','hf.co':'huggingface','cloudsync-prod.s3.amazonaws.com':'ea','ubisoft-uplay-savegames.s3.amazonaws.com':'ubisoft','geminiweb-pa.clients.google.com':'gemini','steamcloudsweden.blob.core.windows.net':'steam','lh3.googleusercontent.com':'google'};
 for(const [host,expected]of Object.entries(cases))assert.equal(route(c,host),expected,host);
 for(const [host,expected]of Object.entries({'grok.x.com':'grok','grokbot.com':'grok','grokipedia.com':'grok','api.gateio.ws':'gate','api-testnet.gateapi.io':'gate','gateimg.com':'gate','kucoin.plus':'kucoin','wa.me':'whatsapp','discord-attachments-uploads-prd.storage.googleapis.com':'discord'}))assert.equal(route(c,host),expected,host);
 assert.equal(route(c,'unrelated.storage.googleapis.com'),'google');
 for(const name of ['Gemini / Domain','Meta AI / Domain','Amazon / Domain'])assert.equal(c['rule-providers'][name],undefined);
 for(const host of ['unrelated.s3.amazonaws.com','unrelated.cloudfront.net'])assert.notEqual(route(c,host),'amazon');
 for(const host of ['genspark.ai','manus.im','skywork.ai'])assert.notEqual(route(c,host),'metaai');
 for(const key of ['gemini','cursor','okx']){const r=c.rules.find(r=>r.startsWith('DOMAIN-SUFFIX,')&&r.endsWith(','+key));const at=c.rules.indexOf(r);assert.equal(c.rules[at+1],`AND,((NETWORK,UDP),(${r.slice(0,r.lastIndexOf(','))})),REJECT`);}
 assert.equal(c.tun.enable,true);
 for(const g of c['proxy-groups'].filter(g=>g['include-all-providers']))assert.equal(g['empty-fallback'],'REJECT',g.name);
 const us=new RegExp(c['proxy-groups'].find(g=>g.name==='美国-自动').filter.replace('(?i)',''),'i');for(const name of ['US01','🇺🇸 美国 01','us-2'])assert(us.test(name));for(const name of ['AUS01','RUS 01','Australia'])assert(!us.test(name));
 const tw=new RegExp(c['proxy-groups'].find(g=>g.name==='台湾-自动').filter.replace('(?i)',''),'i');assert(tw.test('TW01'));assert(!tw.test('🇨🇳 CN01'));
});
test('overseas retains tested OKX rules and adds bounded services without changing exit defaults',()=>{
 const input={target:'pc',airports:[{name:'A',url:'https://example.test/sub'}],bundle:{version:1,nodes:[],preferred:{}},enabled:[...OVERSEAS_GROUPS],defaults:{},domains:{},controllerSecret:''};
 const c=parse(generateOverseas(input).yaml);
 for(const r of V77.rules.filter(r=>/okx|okex|OKX/.test(r)))assert.ok(c.rules.includes(r),r);
 for(const host of ['oklink.com','xlayer.tech','okx.com.cdn.cloudflare.net']){const r=`DOMAIN-SUFFIX,${host},交易所`;const at=c.rules.indexOf(r);assert(at>=0);assert.equal(c.rules[at-1],`AND,((NETWORK,UDP),(DOMAIN-SUFFIX,${host})),REJECT`);}
 for(const [name,group]of [['Bahamut','台湾影音'],['LiTV','台湾影音'],['ABEMA','日本网站'],['TVer','日本网站'],['Niconico','日本网站'],['KuCoin','交易所']])assert(c.rules.includes(`RULE-SET,${name} / Domain,${group}`));
 assert(!c.rules.some(r=>r.startsWith('DOMAIN-KEYWORD,fc2,')));assert.equal(route(c,'notfc2.example'),'直连');
 assert.equal(c['proxy-groups'].find(g=>g.name==='交易所').proxies[0],'台湾-出口');
 const disabled=parse(generateOverseas({...input,enabled:[]}).yaml);assert(!disabled.rules.some(r=>r.includes('RULE-SET,ABEMA')||r.includes('DOMAIN-SUFFIX,oklink.com')));
 for(const region of ['美国','台湾']){const regex=new RegExp(c['proxy-groups'].find(g=>g.name===region+'-机场').filter.replace('(?i)',''),'i');assert(regex.test(region==='美国'?'US01':'TW01'));}
});
test('custom and built-in regional pools accept the same city-only airport names',()=>{
 for(const target of ['pc','nikki']) {
  const c=parse(JSON.parse(generateConfig(JSON.stringify({...input,target,customGroups:[{name:'自选网站',domains:['custom.example.test'],country:'us'}]}))).yaml,{merge:true});
  for(const [region,names]of Object.entries({'美国':['洛杉矶01','西雅图01','US01'],'日本':['东京01','大阪01','JP01'],'台湾':['台灣01','TW01'],'香港':['香港01','HK01'],'新加坡':['狮城01','SG01'],'韩国':['首尔01','KR01']})) {
   const custom=c['proxy-groups'].find(g=>g.name==='自定义线路 · '+region),builtIn=c['proxy-groups'].find(g=>g.name===region+'-自动');
   assert.equal(custom.filter,builtIn.filter,region);
   const re=new RegExp(custom.filter.replace('(?i)',''),'i');for(const name of names)assert(re.test(name),name);
   assert.equal(custom['empty-fallback'],'REJECT');
  }
 }
});
