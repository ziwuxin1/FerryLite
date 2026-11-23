import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'yaml';
import {initSync,generateConfig} from '../web/src/ferry-wasm/ferry_wasm.js';

initSync({module:fs.readFileSync(new URL('../web/src/ferry-wasm/ferry_wasm_bg.wasm',import.meta.url))});
function config(target,keys){return parse(JSON.parse(generateConfig(JSON.stringify({target,airports:[{name:'Social',url:'https://example.test/sub'}],independentNodes:[],splitApps:keys.map(key=>({key,name:key,relay:false}))}))).yaml,{merge:true});}
function route(c,host){for(const r of c.rules){const [kind,d,target]=r.split(',');if(kind==='DOMAIN'&&d===host||kind==='DOMAIN-SUFFIX'&&(host===d||host.endsWith('.'+d)))return target;if(kind==='MATCH')return d;}}
for(const target of ['pc','nikki'])test(`${target}: Facebook resources remain on one exit even without downloaded rule sets`,()=>{
  const c=config(target,['whatsapp','facebook','instagram','telegram']);
  for(const host of ['www.facebook.com','graph.facebook.com','connect.facebook.net','scontent-lax3-1.xx.fbcdn.net','video.xx.fbcdn.net','lookaside.fbsbx.com','media.fbsbx.net','fbcdn-a.akamaihd.net'])assert.equal(route(c,host),'facebook',host);
  assert.equal(route(c,'web.whatsapp.com'),'whatsapp');
  assert.equal(route(c,'scontent.cdninstagram.com'),'instagram');
  for(const host of ['web.telegram.org','cdn4.telegram-cdn.org','cdn-telegram.org','t.me','graph.org','usercontent.dev'])assert.equal(route(c,host),'telegram',host);
  assert.equal(c['proxy-groups'].find(g=>g.name==='telegram').proxies[0],'香港-自动');
  assert(c['proxy-groups'].find(g=>g.name==='telegram').proxies.includes('美国-自动'));
  const cidrs=fs.readFileSync(new URL('../ferry-core/data/telegram-cidrs.txt',import.meta.url),'utf8').split(/\r?\n/).filter(s=>s&&!s.startsWith('#'));
  for(const cidr of cidrs){const kind=cidr.includes(':')?'IP-CIDR6':'IP-CIDR';const rule=`${kind},${cidr},telegram,no-resolve`;const i=c.rules.indexOf(rule);assert(i>=0,rule);assert.equal(c.rules[i+1],`AND,((NETWORK,UDP),(${kind},${cidr},no-resolve)),REJECT`);}
  const q='AND,((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,fbcdn.net)),REJECT';
  assert(c.rules.indexOf(q)<c.rules.indexOf('DOMAIN-SUFFIX,fbcdn.net,facebook'));
  assert(!c.rules.includes('AND,((NETWORK,UDP),(DST-PORT,443)),REJECT'));
  assert.equal(c.tun.enable,true);
});
test('disabled Facebook leaves shared Graph API to WhatsApp and removes compatibility rules',()=>{
  const c=config('pc',['whatsapp','telegram']);
  assert.equal(route(c,'graph.facebook.com'),'whatsapp');
  assert(!c.rules.some(r=>r.startsWith('AND,((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,fb')));
});
test('disabled Telegram does not retain Telegram IP rules',()=>{
  const c=config('pc',['facebook']);
  assert(!c.rules.some(r=>r.includes('149.154.160.0/20')));
  assert(!c['proxy-groups'].some(g=>g.name==='telegram'));
});
