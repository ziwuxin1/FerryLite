import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'yaml';
import {generateOverseas,importOverseasNodes,mergeOverseasNodes,OVERSEAS_GROUPS} from '../src/overseas-generator.ts';
import {validateOverseasBundle} from '../src/overseas-data.ts';
import {V77} from '../src/overseas-v77.ts';
import {OVERSEAS_RULES} from '../src/overseas-routing.ts';
import {createExclusiveHandler} from '../server/exclusive-handler.mjs';
const empty={version:1,nodes:[],preferred:{}};
const input={target:'nikki',airports:[],bundle:empty,enabled:[...OVERSEAS_GROUPS],defaults:{},domains:{},controllerSecret:'test-only-secret'};
const nodes=[
  {name:'台湾 · airport',type:'socks5',server:'tw.example.test',port:1080,password:'synthetic-only'},
  {name:'日本 · test',type:'socks5',server:'jp.example.test',port:1080},
  {name:'台湾 · residential',type:'socks5',server:'home.example.test',port:1080,'dialer-proxy':'台湾 · airport'},
];
test('public overseas mode requires no private nodes and preserves V77 routing',()=>{
  const result=generateOverseas(input),c=parse(result.yaml);
  assert.deepEqual(c.rules,OVERSEAS_RULES);
  for(const rule of V77.rules.filter(r=>r!=='DOMAIN-KEYWORD,fc2,日本网站'))assert.ok(c.rules.includes(rule));
  assert.equal(c.rules[c.rules.length-1],'MATCH,直连');
  assert.equal(c.tun.enable,true);assert.equal(c.tun['auto-route'],false);assert.equal(c.ipv6,false);
  assert.ok(result.warnings.length>0);
  assert.ok(!result.yaml.includes('Proton'));
  const pc=parse(generateOverseas({...input,target:'pc'}).yaml);
  assert.equal(pc.tun['auto-route'],true);assert.equal(pc['allow-lan'],false);assert.equal(pc['external-controller'],'127.0.0.1:9090');
});
test('private preferences, user subscriptions and chained nodes coexist',()=>{
  const c=parse(generateOverseas({...input,airports:[{name:'A',url:'https://a.example/sub?token=test'},{name:'B',url:'https://b.example/sub'}],bundle:{version:1,nodes,preferred:{交易所:['台湾 · residential','直连'],日本网站:['日本 · test']}}}).yaml);
  assert.equal(Object.keys(c['proxy-providers']).length,2);
  assert.equal(c['proxy-groups'].find(g=>g.name==='交易所').proxies[0],'台湾 · residential');
  assert.equal(c['proxy-groups'].find(g=>g.name==='日本网站').proxies[0],'日本 · test');
  assert.ok(c['proxy-groups'].find(g=>g.name==='台湾-机场').use.length===2);
  assert.ok(!c['proxy-groups'].find(g=>g.name==='台湾-机场').proxies.includes('台湾 · residential'));
});
test('subscription-only setup names the airport and selects useful public defaults',()=>{
  const c=parse(generateOverseas({...input,target:'pc',airports:[{name:'',url:'https://airport.example.test/clash?token=synthetic'}]}).yaml);
  const group=name=>c['proxy-groups'].find(g=>g.name===name);
  const providerNames=Object.keys(c['proxy-providers']);
  assert.equal(providerNames.length,1);
  assert.equal(c['proxy-providers'][providerNames[0]].url,'https://airport.example.test/clash?token=synthetic');
  for(const name of ['中国网站','哔哩哔哩','STEAM'])assert.equal(group(name).proxies[0],'直连');
  for(const name of ['交易所','台湾影音'])assert.equal(group(name).proxies[0],'台湾-出口');
  assert.equal(group('日本网站').proxies[0],'日本-出口');
  for(const region of ['台湾','日本']){
    assert.equal(group(`${region}-出口`).proxies[0],`${region}-机场`);
    assert.equal(group(`${region}-机场`).type,'url-test');
    assert.deepEqual(group(`${region}-机场`).use,providerNames);
    assert.equal(group(`${region}-机场`)['empty-fallback'],'REJECT');
  }
  assert.equal(c.tun.enable,true);
  assert.equal(c.tun['auto-route'],true);
});
test('category controls remove its routes and UDP guards; custom domains precede defaults',()=>{
  const rules=parse(generateOverseas({...input,enabled:OVERSEAS_GROUPS.filter(n=>n!=='日本网站'),domains:{中国网站:'my.example.test'}}).yaml).rules;
  assert.ok(!rules.some(r=>r.endsWith(',日本网站')));
  assert.ok(!rules.some(r=>r.includes('DOMAIN-SUFFIX,dmm.co.jp')));
  assert.equal(rules[1],'DOMAIN-SUFFIX,my.example.test,中国网站');
  const c=parse(generateOverseas({...input,defaults:{STEAM:'日本-出口'}}).yaml);
  assert.equal(c['proxy-groups'].find(g=>g.name==='STEAM').proxies[0],'日本-出口');
});
test('invalid subscription, references, cycles and duplicate reserved names are rejected',()=>{
  assert.throws(()=>generateOverseas({...input,airports:[{name:'x',url:'javascript:bad'}]}));
  assert.throws(()=>generateOverseas({...input,bundle:{...empty,nodes:[{...nodes[0],name:'交易所'}]}}));
  assert.throws(()=>generateOverseas({...input,bundle:{...empty,nodes:[{...nodes[0],'dialer-proxy':'missing'}]}}));
  assert.throws(()=>generateOverseas({...input,bundle:{...empty,nodes:[{...nodes[0],'dialer-proxy':'交易所'}]},defaults:{交易所:nodes[0].name}}));
  assert.throws(()=>generateOverseas({...input,domains:{日本网站:'not a domain'}}));
});
test('local import ignores unrelated config secrets and replaces same-name nodes',()=>{
  const b=importOverseasNodes('secret: controller-secret\nproxies:\n- {name: 台湾节点, type: socks5, server: example.test, port: 1080}\n');
  assert.ok(!JSON.stringify(b).includes('controller-secret'));
  assert.equal(mergeOverseasNodes(b,{...b,nodes:[{...b.nodes[0],port:9999}]}).nodes.length,1);
  assert.equal(mergeOverseasNodes(b,{...b,nodes:[{...b.nodes[0],port:9999}]}).nodes[0].port,9999);
});
test('overseas endpoint has separate credentials and returns no nodes for invalid code',async()=>{
  const env={FERRYLITE_OVERSEAS_CODE:'synthetic-overseas',FERRYLITE_OVERSEAS_NODES_JSON:JSON.stringify({...empty,nodes}),FERRYLITE_EXCLUSIVE_CODE:'synthetic-domestic'};
  const h=createExclusiveHandler(env,{codeKey:'FERRYLITE_OVERSEAS_CODE',bundleKey:'FERRYLITE_OVERSEAS_NODES_JSON',validate:validateOverseasBundle});
  const req=code=>new Request('https://ferrylite.cc/api/overseas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});
  const bad=await h(req('synthetic-domestic'));assert.equal(bad.status,401);assert.ok(!(await bad.text()).includes('synthetic-only'));
  const good=await h(req('synthetic-overseas'));assert.equal(good.status,200);assert.match(good.headers.get('cache-control'),/no-store/);assert.equal((await good.json()).nodes.length,3);
});
