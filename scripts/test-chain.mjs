// Isolated synthetic test. No real subscriptions, TUN, system proxy, or exchange traffic.
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [mihomo, fixtureDir] = process.argv.slice(2);
if (!mihomo || !fixtureDir) throw new Error('Usage: node scripts/test-chain.mjs <mihomo.exe> <fixture-directory>');
const root = path.resolve(fixtureDir);
const configPath = path.join(root, 'runtime.yaml');
let yaml = await readFile(configPath, 'utf8');
if (!yaml.includes('hosts:')) yaml += '\nhosts:\n  www.binance.com: 127.0.0.1\n';
await writeFile(configPath, yaml);
const counts = { upstream: 0, residential: 0, direct: 0 };
const sockets = new Set();
function reader(socket) {
  let buffer = Buffer.alloc(0), waiter;
  const onData = chunk => { buffer = Buffer.concat([buffer, chunk]); waiter?.(); };
  socket.on('data', onData);
  return {
    async read(size) {
      while (buffer.length < size) await new Promise((resolve, reject) => {
        waiter = resolve;
        socket.once('close', () => reject(new Error('closed during handshake')));
        socket.once('error', reject);
      });
      const result = buffer.subarray(0, size); buffer = buffer.subarray(size); return result;
    },
    detach() { socket.off('data', onData); return buffer; },
  };
}
function socks(auth, handler) {
  return net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    void (async () => {
      const r = reader(socket);
      const greeting = await r.read(2); await r.read(greeting[1]);
      socket.write(Buffer.from([5, auth ? 2 : 0]));
      if (auth) {
        const a = await r.read(2); const user = await r.read(a[1]);
        const p = await r.read(1); const password = await r.read(p[0]);
        assert.equal(user.toString(), 'test'); assert.equal(password.toString(), 'test');
        socket.write(Buffer.from([1, 0]));
      }
      const head = await r.read(4); assert.equal(head[1], 1);
      let host;
      if (head[3] === 1) host = [...await r.read(4)].join('.');
      else if (head[3] === 3) host = (await r.read((await r.read(1))[0])).toString();
      else throw new Error('Unexpected address family');
      const port = (await r.read(2)).readUInt16BE();
      const buffered = r.detach();
      await handler(socket, host, port, buffered);
    })().catch(error => { if (error.code !== 'ECONNREFUSED') console.error('Synthetic SOCKS:', error.message); socket.destroy(); });
  });
}
const success = Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]);
const upstream = socks(false, async (socket, host, port, buffered) => {
  counts.upstream++;
  assert.equal(host, '127.0.0.1'); assert.equal(port, 19802);
  const remote = net.connect(port, host); sockets.add(remote); remote.on('close', () => sockets.delete(remote));
  remote.on('error', () => socket.destroy()); socket.on('close', () => remote.destroy());
  await new Promise((resolve, reject) => { remote.once('connect', resolve); remote.once('error', reject); });
  socket.write(success); if (buffered.length) remote.write(buffered);
  socket.pipe(remote); remote.pipe(socket);
});
const residential = socks(true, async (socket, host, port, buffered) => {
  counts.residential++; assert.equal(host, '127.0.0.1'); assert.equal(port, 19803);
  socket.write(success);
  const reply = () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\nVIA-TW-HOME');
  if (buffered.length) reply(); else socket.once('data', reply);
});
const origin = http.createServer((req, res) => { counts.direct++; res.end('DIRECT-LEAK'); });
const listen = (server, port) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const close = server => new Promise(resolve => server.close(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function request() {
  return new Promise(resolve => {
    const req = http.get({host:'127.0.0.1', port:17893, path:'http://www.binance.com:19803/test', headers:{Host:'www.binance.com:19803'}, timeout:3000}, res => {
      let body = ''; res.on('data', c=>body+=c); res.on('end', ()=>resolve({status:res.statusCode, body}));
    });
    req.on('error', e=>resolve({error:e.code})); req.on('timeout', ()=>req.destroy());
  });
}
let child;
let logs = '';
try {
  await listen(upstream, 19801); await listen(residential, 19802); await listen(origin, 19803);
  child = spawn(mihomo, ['-d', root, '-f', configPath], {windowsHide:true, stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', c=>logs+=c); child.stderr.on('data', c=>logs+=c);
  const headers = {Authorization:'Bearer fixture-only-secret', 'Content-Type':'application/json'};
  let ready = false;
  for (let n=0; n<40; n++) {
    try { const r = await fetch('http://127.0.0.1:19093/version', {headers}); if (r.ok) { ready=true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'isolated core API did not start');
  // Force initial REJECT even on a repeated test with a cached selection.
  const choose = async name => {
    const r = await fetch('http://127.0.0.1:19093/proxies/'+encodeURIComponent('台湾-中转'), {method:'PUT',headers,body:JSON.stringify({name})});
    assert.equal(r.status, 204);
  };
  await choose('REJECT');
  const blocked = await request(); assert.notEqual(blocked.status, 200); assert.equal(counts.direct, 0); assert.equal(counts.residential, 0);
  await choose('TW-01 Test');
  const passed = await request(); assert.equal(passed.body, 'VIA-TW-HOME', JSON.stringify({passed, counts}));
  assert.ok(counts.upstream > 0); assert.ok(counts.residential > 0); assert.equal(counts.direct, 0);
  await close(residential);
  const failed = await request(); assert.notEqual(failed.status, 200); assert.equal(counts.direct, 0);
  console.log(JSON.stringify({defaultBlocked:true, twoHopPassed:true, residentialFailureBlocked:true, ...counts}, null, 2));
} finally {
  child?.kill();
  for (const socket of sockets) socket.destroy();
  await Promise.all([close(upstream), close(residential), close(origin)]);
  await writeFile(path.join(root, 'synthetic-chain.log'), logs);
}
