import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {initSync,generateConfig} from '../web/src/ferry-wasm/ferry_wasm.js';
import data from '../ferry-core/data/ai-routing.json' with {type:'json'};
import {SITE_CATALOG} from '../src/site-catalog.ts';
import {generateOverseas,OVERSEAS_GROUPS} from '../src/overseas-generator.ts';
import {inspectYaml} from '../src/yaml-editor.ts';
initSync({module:readFileSync(new URL('../web/src/ferry-wasm/ferry_wasm_bg.wasm',import.meta.url))});
const input={airports:[{name:'Synthetic',url:'https://example.test/sub'}],independentNodes:[],controllerSecret:'synthetic-test-only',
  // Deliberately put broad cloud groups before ChatGPT in the input.
  splitApps:[{key:'microsoft',name:'Microsoft',relay:false},{key:'apple',name:'Apple',relay:false},{key:'chatgpt',name:'ChatGPT',relay:false}]};
const generate=extra=>parse(JSON.parse(generateConfig(JSON.stringify({...input,...extra}))).yaml);
test('Claude relay checkbox changes the default without removing the optional independent exit',()=>{
  const independentNodes=[{name:'美国独立IP',protocol:'socks5',server:'example.test',port:1080,username:'test',password:'synthetic',dialerProxy:'美国-中转'}];
  for(const claudeRelay of [false,true]){
    const c=generate({independentNodes,claudeRelay});
    const group=c['proxy-groups'].find(g=>g.name==='Claude');
    assert.equal(group.proxies[0],claudeRelay?'美国独立IP':'美国-自动');
    assert.ok(group.proxies.includes('美国独立IP'));
    assert.equal(group.proxies.length,new Set(group.proxies).size);
  }
});
for(const target of ['pc','nikki']) test(`${target}: Claude selection removes its rules, provider and references and can be restored`,()=>{
  for(const enabled of [false,true]){
    const source=JSON.parse(generateConfig(JSON.stringify({...input,target,claudeEnabled:enabled}))).yaml;
    const c=parse(source);
    assert.equal(c['proxy-groups'].filter(g=>g.name==='Claude').length,enabled?1:0);
    assert.equal(Boolean(c['rule-providers']['Claude / Domain']),enabled);
    assert.equal(c.rules.some(r=>r.includes('Claude')),enabled);
    assert.equal(c['proxy-groups'].find(g=>g.name==='AI公共服务').proxies.includes('Claude'),enabled);
    assert.deepEqual(inspectYaml(source).filter(p=>p.severity==='error'),[]);
  }
  const c=generate({target,claudeEnabled:false,splitApps:[]});
  assert.ok(!c['proxy-groups'].some(g=>['Claude','ChatGPT','AI公共服务'].includes(g.name)));
  assert.ok(!c.rules.some(r=>/Claude|ChatGPT|AI公共服务/.test(r)));
});
const domainMatch=(rule,host)=>{const [type,value]=rule.split(',');return type==='DOMAIN'?value===host:type==='DOMAIN-SUFFIX'?(host===value||host.endsWith('.'+value)):type==='DOMAIN-KEYWORD'?host.includes(value):false;};
for(const target of ['pc','nikki']) test(`${target}: AI owned and shared endpoints precede cloud, tests and fallbacks`,()=>{
  const c=generate({target});const rules=c.rules;
  const broad=rules.findIndex(r=>r==='RULE-SET,Microsoft / Domain,Microsoft');assert.ok(broad>0);
  for(const [key,name] of [['chatgpt','ChatGPT'],['claude','Claude'],['shared','AI公共服务']]){
    const s=data[key];
    for(const domain of [...s.domains,...s.suffixes,...s.suffixes.map(d=>'test.'+d)]){
      const index=rules.findIndex(r=>domainMatch(r,domain));assert.ok(index>=0&&index<broad,domain);
      assert.equal(rules[index].split(',').at(-1),name,domain);
      assert.equal(rules[index+1],`AND,((NETWORK,UDP),(${rules[index].split(',').slice(0,-1).join(',')})),REJECT`,domain);
    }
  }
  assert.ok(c['rule-providers']['Claude / Domain'].url.endsWith('/anthropic.mrs'));
  assert.equal(c['proxy-groups'].find(g=>g.name==='AI公共服务').proxies[0],'ChatGPT');
  for(const d of ['auth0.com','stripe.com','sentry.io','datadoghq.com','algolia.net','storage.googleapis.com'])assert.ok(!rules.some(r=>r.startsWith(`DOMAIN-SUFFIX,${d},`)&&/,(ChatGPT|Claude|AI公共服务)$/.test(r)),d);
  assert.ok(!rules.some(r=>/^DOMAIN-KEYWORD,(openai|datadog|sentry|sift|anthropic-static),/.test(r)));
  assert.ok(!rules.some(r=>r.startsWith('IP-ASN,20473,')));
});
test('voice uses official IPs only on UDP 3478, with a no-fall-through guard',()=>{
  const rules=generate({}).rules;assert.ok(data.voice.cidrs.length>100);
  for(const ip of data.voice.cidrs){const kind=ip.includes(':')?'IP-CIDR6':'IP-CIDR';const matcher=`AND,((NETWORK,UDP),(DST-PORT,3478),(${kind},${ip},no-resolve))`;const at=rules.indexOf(matcher+',ChatGPT');assert.ok(at>=0,ip);assert.equal(rules[at+1],matcher+',REJECT');}
  for(const ip of data.claude.ipCidrs)assert.ok(rules.includes(`${ip.includes(':')?'IP-CIDR6':'IP-CIDR'},${ip},Claude,no-resolve`));
  assert.ok(!rules.includes('IP-CIDR,160.79.104.0/21,Claude,no-resolve'));
});
test('disabled ChatGPT does not leave dangling groups or voice rules',()=>{
  const c=generate({splitApps:[]});assert.ok(!c.rules.some(r=>r.endsWith(',ChatGPT')));
  assert.deepEqual(c['proxy-groups'].find(g=>g.name==='AI公共服务').proxies,['Claude','美国-自动','直连']);
});
test('editor catalog shares reviewed core domains; overseas AI remains direct',()=>{
  for(const key of ['claude','chatgpt'])assert.deepEqual(SITE_CATALOG.find(s=>s.key===key).domains,[...data[key].suffixes,...data[key].domains]);
  const c=parse(generateOverseas({target:'pc',airports:[{name:'A',url:'https://example.test/sub'}],bundle:{version:1,nodes:[],preferred:{}},enabled:[...OVERSEAS_GROUPS],defaults:{},domains:{},controllerSecret:'test-only'}).yaml);
  for(const domain of ['chatgpt.com','api.openai.com','claude.ai','api.anthropic.com'])assert.ok(!c.rules.some(r=>domainMatch(r,domain)));
  assert.equal(c.rules.at(-1),'MATCH,直连');
});
