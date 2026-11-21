import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {initSync,generateConfig} from '../web/src/ferry-wasm/ferry_wasm.js';
import {inspectYaml} from '../src/yaml-editor.ts';
initSync({module:readFileSync(new URL('../web/src/ferry-wasm/ferry_wasm_bg.wasm',import.meta.url))});
const input={airports:[{name:'Synthetic',url:'https://example.test/sub'}],independentNodes:[],splitApps:[{key:'microsoft',name:'Microsoft',relay:false},{key:'parsec',name:'Parsec 远程桌面',relay:false}]};
const generate=extra=>{const r=JSON.parse(generateConfig(JSON.stringify({...input,...extra})));return {...r,c:parse(r.yaml)}};
for(const target of ['pc','nikki']) test(`${target}: Parsec separates signaling, STUN and exact peer UDP, leaving other traffic alone`,()=>{
 const {c,yaml}=generate({target,parsecPeerIps:['203.0.113.50','2001:db8::50','203.0.113.50']});const rules=c.rules;
 assert.equal(c.tun.enable,true);assert.equal(c.tun['endpoint-independent-nat'],true);
 assert.equal(c['find-process-mode'],target==='pc'?'strict':'off');
 assert.equal(c['proxy-groups'].find(g=>g.name==='Parsec 串流').proxies[0],'直连');
 assert.equal(c['proxy-groups'].find(g=>g.name==='Parsec 远程桌面').proxies[0],'美国-自动');
 for(const host of ['stun.parsec.app','stun6.parsec.app']){
  assert.ok(c.dns['fake-ip-filter'].includes(host));
  const route=`AND,((NETWORK,UDP),(DOMAIN,${host}))`;const i=rules.indexOf(route+',Parsec 串流');assert.ok(i>=0);assert.equal(rules[i+1],route+',REJECT');
  assert.ok(i<rules.indexOf('DOMAIN-SUFFIX,parsec.app,Parsec 远程桌面'));
 }
 for(const domain of ['parsec.app','parsecgaming.com','parsecusercontent.com']){
  assert.deepEqual(c.dns['nameserver-policy']['+.'+domain],['https://1.1.1.1/dns-query#Parsec 远程桌面']);
  assert.ok(rules.indexOf(`DOMAIN-SUFFIX,${domain},Parsec 远程桌面`)<rules.indexOf('RULE-SET,Microsoft / Domain,Microsoft'));
 }
 for(const ip of ['IP-CIDR,203.0.113.50/32','IP-CIDR6,2001:db8::50/128']){
  const route=`AND,((NETWORK,UDP),(${ip},no-resolve))`;
  assert.equal(rules.filter(r=>r===route+',Parsec 串流').length,1);
  assert.equal(rules[rules.indexOf(route+',Parsec 串流')+1],route+',REJECT');
 }
 assert.equal(rules.some(r=>r.includes('PROCESS-NAME,parsecd.exe')),target==='pc');
 if(target==='pc')for(const name of ['parsecd.exe','parsecd']){
  assert.ok(rules.includes(`AND,((NETWORK,TCP),(PROCESS-NAME,${name})),Parsec 远程桌面`));
  assert.ok(rules.includes(`AND,((NETWORK,UDP),(PROCESS-NAME,${name})),Parsec 串流`));
 }
 assert.ok(!rules.some(r=>/^DST-PORT,(3478|8000)/.test(r)||r==='NETWORK,UDP,直连'));
 assert.ok(!rules.some(r=>/^DOMAIN-SUFFIX,(amazonaws.com|cloudfront.net),Parsec/.test(r)));
 assert.deepEqual(inspectYaml(yaml).filter(p=>p.severity==='error'),[]);
});
test('deselected Parsec has no process, STUN, peer or DNS changes; bad peer input is rejected when enabled',()=>{
 const {c}=generate({splitApps:[],parsecPeerIps:['not-an-ip']});
 assert.ok(!c['proxy-groups'].some(g=>g.name==='Parsec 串流'));assert.ok(!c.rules.some(r=>r.includes('parsec')||r.includes('Parsec')));
 assert.equal(c.dns['nameserver-policy'],undefined);assert.equal(c['find-process-mode'],undefined);
 for(const ip of ['example.com','1.2.3.4:8000','1.2.3.0/24','1.2.3.4\nMATCH,DIRECT'])assert.throws(()=>generate({parsecPeerIps:[ip]}));
 assert.throws(()=>generate({parsecPeerIps:Array(33).fill('203.0.113.1')}));
});
test('Parsec keeps DNS override preference and explicit custom rules',()=>{
 const {c}=generate({dnsOverride:false,customGroups:[{name:'MyOverride',domains:['parsec.app'],country:'hk',exact:false}]});
 assert.equal(c.dns.enable,false);
 assert.ok(c.rules.indexOf('DOMAIN-SUFFIX,parsec.app,MyOverride')<c.rules.indexOf('DOMAIN-SUFFIX,parsec.app,Parsec 远程桌面'));
});
