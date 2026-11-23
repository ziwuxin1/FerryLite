import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,stringify} from 'yaml';
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
// Set MIHOMO_EXECUTABLE to run these packet-level checks. All proxy endpoints,
// listeners and rule providers are local fixtures; no TUN or real service is used.
test('native overseas TCP-only exits reject UDP fallback and UDP exits still work',
  {skip:!process.env.MIHOMO_EXECUTABLE,timeout:30000},async()=>{
    const [{default:fs},{default:path},{default:os},{default:net},{default:http},{default:dgram},{spawn}]=await Promise.all([
      import('node:fs/promises'),import('node:path'),import('node:os'),import('node:net'),import('node:http'),import('node:dgram'),import('node:child_process'),
    ]);
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ferrylite-overseas-'));
    const sockets=new Set();let kernel,logs='',forwarded=0;
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const track=s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));};
    const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));
    const freePort=async()=>{const s=net.createServer();const port=await listen(s);await new Promise(r=>s.close(r));return port;};
    const readFrom=s=>{
      let buffer=Buffer.alloc(0),wake;
      s.on('data',b=>{buffer=Buffer.concat([buffer,b]);wake?.();});
      return async n=>{
        while(buffer.length<n)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SOCKS fixture timeout')),2000);wake=()=>{clearTimeout(timer);resolve();};});
        const bytes=buffer.subarray(0,n);buffer=buffer.subarray(n);return bytes;
      };
    };
    const marker=http.createServer((q,r)=>r.end('selected-proxy'));
    marker.on('connection',track);
    marker.on('connect',(q,s)=>{s.write('HTTP/1.1 200 Connection Established\r\n\r\n');s.once('data',()=>s.end('HTTP/1.1 200 OK\r\nContent-Length: 14\r\nConnection: close\r\n\r\nselected-proxy'));});
    const udp=dgram.createSocket('udp4');udp.on('message',()=>forwarded++);
    await new Promise(r=>udp.bind(0,'127.0.0.1',r));const udpPort=udp.address().port;
    const socks=net.createServer(async s=>{
      track(s);try{const read=readFrom(s),greeting=await read(2);await read(greeting[1]);s.write(Buffer.from([5,0]));const command=await read(4);assert.equal(command[1],3);assert.equal(command[3],1);await read(6);s.write(Buffer.from([5,0,0,1,127,0,0,1,udpPort>>8,udpPort&255]));}catch{s.destroy();}
    });
    const markerPort=await listen(marker),socksPort=await listen(socks);
    const stop=async()=>{if(kernel){const p=kernel;kernel=null;const done=new Promise(r=>p.once('exit',r));p.kill();await done;}};
    try{
      const empty=path.join(dir,'empty.yaml');await fs.writeFile(empty,'payload:\n  - DOMAIN,unused.invalid\n');
      for(const target of ['pc','nikki']){
        const localNodes=['日本','台湾'].flatMap(region=>[
          {name:`${region} TCP`,type:'http',server:'127.0.0.1',port:markerPort},
          {name:`${region} UDP`,type:'socks5',server:'127.0.0.1',port:socksPort,udp:true},
        ]);
        const c=parse(generateOverseas({...input,target,bundle:{version:1,nodes:localNodes,preferred:{}}}).yaml);
        c.proxies=c.proxies.map(n=>n.name==='直连'?{name:'直连',type:'socks5',server:'127.0.0.1',port:socksPort,udp:true}:n);
        c.tun={enable:false};c.dns={enable:false};c.sniffer={enable:false};c.profile={'store-selected':false};
        c['allow-lan']=false;c['bind-address']='127.0.0.1';c['mixed-port']=await freePort();c['redir-port']=0;c['tproxy-port']=0;
        const controlPort=await freePort();c['external-controller']=`127.0.0.1:${controlPort}`;c.secret='';c['log-level']='info';
        for(const name of Object.keys(c['rule-providers']))c['rule-providers'][name]={type:'file',behavior:'classical',format:'yaml',path:empty};
        const config=path.join(dir,`${target}.yaml`);await fs.writeFile(config,stringify(c));logs='';
        kernel=spawn(process.env.MIHOMO_EXECUTABLE,['-d',dir,'-f',config],{windowsHide:true,stdio:['ignore','pipe','pipe']});
        kernel.stdout.on('data',b=>logs+=b);kernel.stderr.on('data',b=>logs+=b);
        const api=`http://127.0.0.1:${controlPort}`;let ready=false;
        for(let i=0;i<50;i++){try{if((await fetch(`${api}/version`)).ok){ready=true;break;}}catch{}await pause(50);}
        assert.ok(ready,logs);
        const select=async(group,node)=>assert.equal((await fetch(`${api}/proxies/${encodeURIComponent(group)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:node})})).status,204);
        const tcp=host=>new Promise((resolve,reject)=>{
          const q=http.get({host:'127.0.0.1',port:c['mixed-port'],path:`http://${host}/fixture`,headers:{Host:host},timeout:2000},r=>{let body='';r.on('data',b=>body+=b);r.on('end',()=>resolve(body));});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('TCP fixture timeout')));
        });
        const probe=async(host,port,expected)=>{
          const s=net.connect(c['mixed-port'],'127.0.0.1');track(s);const read=readFrom(s);await new Promise(r=>s.once('connect',r));
          s.write(Buffer.from([5,1,0]));await read(2);s.write(Buffer.from([5,3,0,1,0,0,0,0,0,0]));const response=await read(10);
          const d=dgram.createSocket('udp4'),before=forwarded,start=logs.length;
          d.send(Buffer.concat([Buffer.from([0,0,0,3,Buffer.byteLength(host)]),Buffer.from(host),Buffer.from([port>>8,port&255]),Buffer.from('fixture')]),response.readUInt16BE(8),'127.0.0.1');
          for(let i=0;i<40&&forwarded===before&&!logs.slice(start).includes('using REJECT');i++)await pause(25);
          d.close();s.destroy();assert.equal(forwarded>before,expected,`${target} ${host}:${port}\n${logs.slice(start)}`);
          if(!expected)assert.match(logs.slice(start),/using REJECT/);
        };
        for(const [group,region,host]of [['日本网站','日本','www.dmm.com'],['台湾影音','台湾','ofissaifreetv.akamaized.net']]){
          assert.equal(await tcp(host),'selected-proxy',`${target} ${host} TCP`);
          await probe(host,443,false);await probe(host,8443,false);
          await select(group,`${region} UDP`);await probe(host,443,true);await probe(host,8443,true);
        }
        // Existing intentional guards remain active even for a UDP-capable exit.
        await select('交易所','台湾 UDP');await probe('www.okx.com',443,false);
        // An unrelated UDP request still reaches the final direct policy.
        await probe('unrelated.example.test',443,true);
        await stop();
      }
    }finally{
      await stop();for(const s of sockets)s.destroy();marker.close();socks.close();udp.close();
      const resolved=path.resolve(dir),temp=path.resolve(os.tmpdir());
      if(path.dirname(resolved)!==temp||!path.basename(resolved).startsWith('ferrylite-overseas-'))throw Error('Unexpected fixture cleanup path');
      await fs.rm(resolved,{recursive:true,force:true});
    }
  });
test('public overseas mode requires no private nodes and preserves V77 routing',()=>{
  const result=generateOverseas(input),c=parse(result.yaml);
  assert.deepEqual(c.rules.filter(r=>OVERSEAS_RULES.includes(r)),OVERSEAS_RULES);
  for(const rule of V77.rules.filter(r=>r!=='DOMAIN-KEYWORD,fc2,日本网站'))assert.ok(c.rules.includes(rule));
  assert.equal(c.rules[c.rules.length-1],'MATCH,直连');
  assert.equal(c.tun.enable,true);assert.equal(c.tun['auto-route'],false);assert.equal(c.ipv6,false);
  assert.ok(result.warnings.length>0);
  assert.ok(!result.yaml.includes('Proton'));
  const pc=parse(generateOverseas({...input,target:'pc'}).yaml);
  assert.equal(pc.tun['auto-route'],true);assert.equal(pc['allow-lan'],false);assert.equal(pc['external-controller'],'127.0.0.1:9090');
});
test('every overseas category keeps unsupported UDP from falling through to direct',()=>{
  for(const target of ['pc','nikki']){
    const c=parse(generateOverseas({...input,target}).yaml);
    for(const rule of c.rules){
      const m=rule.match(/^(DOMAIN(?:-SUFFIX|-KEYWORD)?|RULE-SET),(.+),([^,]+)$/);
      if(!m||!OVERSEAS_GROUPS.includes(m[3]))continue;
      assert.ok(c.rules.includes(`AND,((NETWORK,UDP),(${m[1]},${m[2]})),REJECT`),`${target}: ${rule}`);
    }
    for(const route of ['DOMAIN-SUFFIX,dmm.com,日本网站','DOMAIN,ofissaifreetv.akamaized.net,台湾影音']){
      const index=c.rules.indexOf(route),matcher=route.slice(0,route.lastIndexOf(','));
      assert.equal(c.rules[index+1],`AND,((NETWORK,UDP),(${matcher})),REJECT`);
    }
    assert.ok(c.rules.indexOf('AND,((NETWORK,UDP),(DOMAIN-SUFFIX,okx.com)),REJECT')<c.rules.indexOf('DOMAIN-SUFFIX,okx.com,交易所'));
    const disabled=parse(generateOverseas({...input,target,enabled:OVERSEAS_GROUPS.filter(g=>!['日本网站','台湾影音'].includes(g))}).yaml);
    for(const matcher of ['DOMAIN-SUFFIX,dmm.com','DOMAIN,ofissaifreetv.akamaized.net'])assert.ok(!disabled.rules.some(r=>r.includes(matcher)));
  }
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
