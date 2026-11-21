import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, generateConfig } from '../web/src/ferry-wasm/ferry_wasm.js';
import { validateLisaBundle, LISA_GROUP, LISA_SERVER } from '../src/lisa-vps-data.ts';
import { applyLisaVps } from '../src/lisa-vps.ts';
import { readYaml, inspectYaml, applyAddedSites } from '../src/yaml-editor.ts';
import { unlockExclusive } from '../src/exclusive-options.ts';
import { createExclusiveHandler } from '../server/exclusive-handler.mjs';

// Entirely synthetic credentials. Never read the administrator's YAML in committed tests.
export const fixture = {version:1,nodes:[
  {type:'hysteria2',server:LISA_SERVER,port:443,password:'synthetic-hy2',sni:'example.com',fingerprint:'ab'.repeat(32)},
  {type:'ss',server:LISA_SERVER,port:24443,cipher:'2022-blake3-aes-128-gcm',password:Buffer.alloc(16,1).toString('base64')},
  {type:'vless',server:LISA_SERVER,port:34443,uuid:'11111111-1111-4111-8111-111111111111',servername:'example.com',
    'reality-opts':{'public-key':'A'.repeat(43),'short-id':'0123456789abcdef'}},
]};
initSync({module:readFileSync(new URL('../web/src/ferry-wasm/ferry_wasm_bg.wasm', import.meta.url))});
const input = {airports:[{name:'机场',url:'https://subscription.example.test/sub'}],independentNodes:[],
  splitApps:[{key:'chatgpt',name:'ChatGPT',relay:false},{key:'perforce',name:'Perforce 美国',relay:false},
    {key:'perforce_hk',name:'Perforce 香港',relay:false},{key:'youtube',name:'YouTube',relay:false}],
  customGroups:[{name:'自定义',domains:['custom.example.test'],country:'hk',exact:false}]};

test('VPS merge respects deselected Claude and retains the ChatGPT VPS default',()=>{
  const source=JSON.parse(generateConfig(JSON.stringify({...input,claudeEnabled:false}))).yaml;
  const result=applyLisaVps(source,fixture);
  const {groups}=readYaml(result);
  assert.ok(!groups.some(g=>g.name==='Claude'));
  assert.equal(groups.find(g=>g.name==='ChatGPT').proxies[0],LISA_GROUP);
  assert.deepEqual(inspectYaml(result).filter(p=>p.severity==='error'),[]);
});

test('allowlisted credentials reject incomplete nodes and chained transports', () => {
  assert.equal(validateLisaBundle(fixture).nodes.length,3);
  for (const edit of [b=>b.nodes.pop(),b=>b.nodes[0].fingerprint='bad',b=>b.nodes[1]['dialer-proxy']='机场',b=>b.nodes[2].port=443]) {
    const b=structuredClone(fixture); edit(b); assert.throws(()=>validateLisaBundle(b));
  }
  const b=structuredClone(fixture); b.nodes[0]['private-key']='must-not-return';
  assert.ok(!JSON.stringify(validateLisaBundle(b)).includes('must-not-return'));
});
for (const target of ['pc','nikki']) test(`${target}: real WASM output preserves routing and adds VPS safely`, () => {
  const base=JSON.parse(generateConfig(JSON.stringify({...input,target}))).yaml;
  const before=applyAddedSites(base,[{name:'新增网站',domains:['added.example.test'],upstream:'香港-自动'}]);
  const result=applyLisaVps(before,fixture), a=readYaml(before), b=readYaml(result);
  assert.deepEqual(inspectYaml(result).filter(p=>p.severity==='error'),[]);
  assert.deepEqual(b.rules,a.rules);
  assert.deepEqual(b.value['proxy-providers'],a.value['proxy-providers']);
  assert.deepEqual(b.value.tun,a.value.tun);
  const byName=new Map(b.groups.map(g=>[g.name,g]));
  for (const group of a.groups) {
    const after=byName.get(group.name);
    if(group.type==='select'&&!group.name.endsWith('-中转')&&!group.name.startsWith('订阅刷新')) {
      assert.ok(after.proxies.includes(LISA_GROUP),group.name);
      const expected=['Claude','ChatGPT','Perforce 美国'].includes(group.name)?LISA_GROUP:
        group.name==='所有-手动'?'所有-自动':group.proxies[0];
      assert.equal(after.proxies[0],expected,group.name);
    } else assert.deepEqual(after.proxies,group.proxies,group.name);
  }
  for(const name of ['Claude','ChatGPT','Perforce 美国']) assert.equal(byName.get(name).proxies[0],LISA_GROUP);
  assert.equal(byName.get('Perforce 香港').proxies[0],'香港-自动');
  assert.equal(byName.get(LISA_GROUP).proxies.length,3);
  assert.throws(()=>applyLisaVps(result,fixture),/重复/);
  for(const g of b.value['proxy-groups'].filter(g=>g['include-all']||g['include-all-proxies'])) {
    assert.ok(new RegExp(g['exclude-filter']).test(`${LISA_GROUP} · HY2`));
    for(const node of validateLisaBundle(fixture).nodes) assert.ok(new RegExp(g['exclude-filter']).test(node.name));
  }
});
const env={FERRYLITE_EXCLUSIVE_CODE:'test-only-code',FERRYLITE_LISA_VPS_JSON:JSON.stringify(fixture)};
const req=(code='test-only-code',headers={})=>new Request('https://ferrylite.cc/api/exclusive',{
  method:'POST',headers:{'content-type':'application/json',origin:'https://ferrylite.cc',...headers},body:JSON.stringify({code})});
test('API authentication, no-cache and origin checks never disclose nodes on failure',async()=>{
  const handler=createExclusiveHandler(env);
  for(const [r,status] of [[req('wrong'),401],[req(undefined,{origin:'https://evil.example'}),403],
    [new Request('https://ferrylite.cc/api/exclusive'),405],[req('x'.repeat(2100)),413]]) {
    const response=await handler(r);assert.equal(response.status,status);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.ok(!(await response.text()).includes('synthetic-hy2'));
  }
  const good=await handler(req());assert.equal(good.status,200);assert.deepEqual(await good.json(),validateLisaBundle(fixture));
  const desktop=await handler(req(undefined,{origin:'http://tauri.localhost','sec-fetch-site':'cross-site'}));
  assert.equal(desktop.status,200);assert.equal(desktop.headers.get('access-control-allow-origin'),'http://tauri.localhost');
  assert.equal((await createExclusiveHandler({})(req())).status,503);
  const limited=createExclusiveHandler(env);
  for(let i=0;i<10;i++) assert.equal((await limited(req('wrong'))).status,401);
  assert.equal((await limited(req())).status,429);
});
test('browser unlock distinguishes bad code, temporary failure and verified node bundle',async()=>{
  assert.equal(await unlockExclusive(''),null);
  assert.equal(await unlockExclusive('bad',async()=>new Response('{}',{status:401})),null);
  await assert.rejects(unlockExclusive('any',async()=>new Response('{}',{status:503})),/暂时/);
  const b=await unlockExclusive(' test-only-code ',async(url,options)=>{
    assert.equal(url,'/api/exclusive');assert.equal(options.cache,'no-store');
    return createExclusiveHandler(env)(req(JSON.parse(options.body).code));
  });
  assert.deepEqual(b,validateLisaBundle(fixture));
});
