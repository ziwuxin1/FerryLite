import { createHash, timingSafeEqual } from 'node:crypto';
import { validateLisaBundle, validateHongKongBundle } from '../src/lisa-vps-data.ts';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
};
const digest = value => createHash('sha256').update(value).digest();

export function createExclusiveHandler(env = process.env, options = {}) {
  const codeKey = options.codeKey || 'FERRYLITE_EXCLUSIVE_CODE';
  const bundleKey = options.bundleKey || 'FERRYLITE_LISA_VPS_JSON';
  const validate = options.validate || validateLisaBundle;
  // Supplemental per-instance throttling. Not a substitute for an edge-wide limit.
  const attempts = new Map();
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const desktop = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'].includes(origin);
    const responseHeaders = desktop ? {...headers, 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'} : headers;
    const reply = (status, error) => Response.json({error}, {status,headers:responseHeaders});
    if (desktop && request.method === 'OPTIONS') return new Response(null,{status:204,headers:responseHeaders});
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (origin && origin !== new URL(request.url).origin && !desktop) return reply(403, 'forbidden');
    if (request.headers.get('sec-fetch-site') === 'cross-site' && !desktop) return reply(403, 'forbidden');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, 'json_required');
    // The owner explicitly chose to retain the legacy shared code. Anyone who knows it
    // can retrieve these shared nodes; this is not individual student authentication.
    const secret = env[codeKey];
    if (!secret || !env[bundleKey]) return reply(503, 'not_configured');
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const now = Date.now();
    for (const [key, bucket] of attempts) if (bucket.expires <= now) attempts.delete(key);
    const bucket = attempts.get(ip) || { count: 0, expires: now + 60000 };
    if (bucket.count >= 10 || (attempts.size >= 5000 && !attempts.has(ip))) return reply(429, 'rate_limited');
    bucket.count++; attempts.set(ip, bucket);
    if (Number(request.headers.get('content-length')) > 2048) return reply(413, 'too_large');
    let body;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply(400, 'invalid_request');
      const chunks = []; let size = 0;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); return reply(413, 'too_large'); }
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return reply(400, 'invalid_request'); }
    if (typeof body?.code !== 'string' || !timingSafeEqual(digest(body.code.trim()), digest(secret))) return reply(401, 'invalid_code');
    try {
      const bundle = validate(JSON.parse(env[bundleKey]));
      if (validate === validateLisaBundle && env.FERRYLITE_HK_VPS_JSON) {
        bundle.hongKong = validateHongKongBundle(JSON.parse(env.FERRYLITE_HK_VPS_JSON));
      }
      return Response.json(bundle, { headers:responseHeaders });
    } catch {
      // Never log submitted codes, environment values or validation data.
      console.error('Exclusive VPS configuration is invalid');
      return reply(503, 'not_configured');
    }
  };
}
