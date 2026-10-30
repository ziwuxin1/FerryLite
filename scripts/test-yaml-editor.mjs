import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_CATALOG, SITES } from '../src/site-catalog.ts';
import { canIncludeApp, matchesExclusiveCode } from '../src/exclusive-options.ts';
import { addSites, applyAddedSites, applyGroupDomainEdits, completeSiteDomains, inspectYaml, normalizeDomain, normalizeDomains, readYaml, removeDomainRule, renameGroupDomainEdits, safeFix, setDefaultExit, setGroupIcon, siteSuggestion } from '../src/yaml-editor.ts';

const original = `# keep this comment
defaults: &base
  type: select
  proxies: [JP, US, DIRECT]
proxies:
  - {name: JP, type: socks5, server: jp.example.test, port: 1080, username: test, password: 'a,b:#secret'}
  - {name: US, type: socks5, server: us.example.test, port: 1080}
proxy-groups:
  - name: Games # keep group note
    <<: *base
  - {name: Work, type: select, proxies: [US, JP], icon: 'https://example.test/original.png'}
rules:
  - DOMAIN-SUFFIX,old.example.com,Games # keep rule note
  - MATCH,DIRECT
x-unknown:
  enabled: true
  note: 'keep exact data'
`;

test('every built-in app has an isolated, valid site preset and private suggestions stay hidden', () => {
  const ui = readFileSync(new URL('../src/views/config-view.ts', import.meta.url), 'utf8');
  const apps = [...ui.split('const APP_CATALOG:')[1].split('const domainEdits')[0].matchAll(/key: "([^"]+)", label: "([^"]+)"/g)];
  for (const [, key, label] of apps) {
    assert.equal(siteSuggestion(key, true)?.key, key);
    assert.equal(siteSuggestion(label, true)?.key, key, label);
  }
  assert.equal(new Set(SITE_CATALOG.map(s => s.key)).size, SITE_CATALOG.length);
  for (const preset of SITE_CATALOG) {
    assert.ok(preset.domains.length > 0 && preset.sources.length > 0, preset.key);
    assert.deepEqual(normalizeDomains(preset.domains.join('\n')).domains, preset.domains);
    const output = addSites(original, {target:'Games',text:preset.domains.join('\n'),exact:false,replaceIcon:false}).source;
    const parsed = readYaml(output);
    for (const domain of preset.domains) assert.ok(parsed.rules.includes(`DOMAIN-SUFFIX,${domain},Games`), `${preset.key}: ${domain}`);
    assert.deepEqual(inspectYaml(output), []);
  }
  assert.ok(SITES.every(s => !s.exclusive));
  assert.equal(siteSuggestion('maxsacademy'), undefined);
  assert.equal(siteSuggestion('perforce'), undefined);
});

test('service aliases and specific API URLs select the intended service, not its parent company', () => {
  for (const [input,key] of [['欧易','okx'],['币安','binance'],['暴雪','blizzard'],['微牛','webull'],['E*TRADE','etrade'],['e trade','etrade'],['油管','youtube'],['Gemini','gemini'],['Gemini 交易所','geminiex'],['https://gemini.google.com/app','gemini'],['gemini.com','geminiex'],['https://copilot.microsoft.com/','copilot'],['https://api.cursor.com/','cursor'],['https://api.robinhood.com:443/','robinhood']]) {
    assert.equal(siteSuggestion(input)?.key, key, input);
  }
  for (const host of ['netflix.com.evil.example','not-spotify.com','unknown.example']) assert.deepEqual(completeSiteDomains(host).domains,[host]);
  assert.throws(() => completeSiteDomains('a totally unknown service'), /有效域名|非法字符/);
});

test('runtime resources exclude country storefronts, unrelated products and shared CDN roots', () => {
  const all = SITE_CATALOG.flatMap(s => s.domains);
  for (const domain of ['youtube.ae','youtube.co.jp','amazon.co.uk','amazon.co.jp','netflix.ca','nintendo.co.jp','disney.de','binance.us','twitter.jp','amazonaws.com','cloudfront.net','akamaized.net','akamaihd.net','windows.net','cloudinary.com','vercel.app','netlify.app']) assert.ok(!all.includes(domain),domain);
  for (const [site,expected,excluded] of [
    ['Netflix',['nflximg.net','nflxvideo.net'],['disneyplus.com','netflixinvestor.com']],
    ['Amazon',['media-amazon.com','ssl-images-amazon.com'],['primevideo.com','amazonaws.com']],
    ['GitHub',['githubassets.com','githubusercontent.com'],['npmjs.org']],
    ['Cursor',['cursorapi.com','cursor-cdn.com'],['openai.com']],
    ['Discord',['discord.media','discordapp.net'],['twitch.tv']],
    ['Spotify',['scdn.co','spotifycdn.com'],['youtube.com']],
    ['ArtStation',['artstationmedia.com'],['pinterest.com']],
    ['Perplexity',['pplx.ai','pplx-res.cloudinary.com'],['cloudinary.com']],
  ]) {
    const domains=completeSiteDomains(site).domains;
    for(const d of expected)assert.ok(domains.includes(d),`${site}: ${d}`);
    for(const d of excluded)assert.ok(!domains.includes(d),`${site}: ${d}`);
  }
});

test('exclusive options require the code and stay excluded from locked selection', async () => {
  assert.equal(await matchesExclusiveCode('wrong-code'), false);
  assert.equal(await matchesExclusiveCode(''), false);
  assert.equal(await matchesExclusiveCode('181501'), true);
  assert.deepEqual(['youtube', 'maxsacademy', 'perforce'].filter(key => canIncludeApp(key, false)), ['youtube']);
  assert.deepEqual(['youtube', 'maxsacademy', 'perforce'].filter(key => canIncludeApp(key, true)), ['youtube', 'maxsacademy', 'perforce']);
});

test('category additions export named groups with suffix rules, selected exits and logos', () => {
  const output = applyAddedSites(original, [
    {name:'生活服务',domains:['service.example.test','assets.example.test'],upstream:'JP'},
    {name:'新站点',domains:['other.example.test'],upstream:'US'},
  ]);
  const parsed=readYaml(output);
  assert.equal(parsed.groups.find(g=>g.name==='生活服务').proxies[0],'JP');
  assert.equal(parsed.groups.find(g=>g.name==='生活服务').icon,'https://icon.horse/icon/service.example.test');
  assert.ok(parsed.rules.includes('DOMAIN-SUFFIX,assets.example.test,生活服务'));
  assert.ok(parsed.rules.indexOf('DOMAIN-SUFFIX,service.example.test,生活服务')<parsed.rules.indexOf('MATCH,DIRECT'));
  assert.deepEqual(parsed.value.proxies,readYaml(original).value.proxies);
  assert.deepEqual(inspectYaml(output),[]);
  assert.equal(applyAddedSites(original,[]),original);
  assert.throws(()=>applyAddedSites(original,[{name:'Games',domains:['x.example.test'],upstream:'JP'}]),/名称已存在/);
  assert.throws(()=>applyAddedSites(original,[{name:'New',domains:['old.example.com'],upstream:'JP'}]),/其他策略组/);
  assert.throws(()=>applyAddedSites(original,[{name:'New',domains:['x.example.test'],upstream:'missing'}]),/已有的出口/);
});

test('YouTube completion covers only its service hosts and recognises URLs safely', () => {
  const result = completeSiteDomains('youtube');
  assert.equal(result.domains.length, 10);
  for (const domain of ['youtube.com', 'googlevideo.com', 'youtubei.googleapis.com', 'youtube.googleapis.com', 'youtubeembeddedplayer.googleapis.com', 'ytimg.com', 'ggpht.com', 'yt3.googleusercontent.com', 'youtube-nocookie.com']) assert.ok(result.domains.includes(domain), domain);
  for (const domain of ['youtube.co.jp', 'youtube.ae', 'ggpht.cn', 'youtube.com.tw', 'netflix.com', 'twitch.tv', 'disneyplus.com', 'google.com', 'googleapis.com', 'googleusercontent.com']) assert.ok(!result.domains.includes(domain), domain);
  assert.deepEqual(completeSiteDomains('https://www.youtube.com/watch?v=test').domains, result.domains);
  assert.deepEqual(completeSiteDomains('https://music.youtube.com/').domains, result.domains);
  assert.deepEqual(completeSiteDomains('not-youtube.com').domains, ['not-youtube.com']);
  assert.deepEqual(completeSiteDomains('youtube.com.example.org').domains, ['youtube.com.example.org']);
});

test('YouTube resource preset covers subdomains without adding regional storefronts or branded TLD', () => {
  const result = addSites(original, { target: 'Games', text: completeSiteDomains('youtube').domains.join('\n'), exact: false, replaceIcon: false });
  const parsed = readYaml(result.source);
  for (const rule of ['DOMAIN-SUFFIX,googlevideo.com,Games', 'DOMAIN-SUFFIX,youtubei.googleapis.com,Games', 'DOMAIN-SUFFIX,youtube.com,Games', 'DOMAIN-SUFFIX,yt3.googleusercontent.com,Games']) {
    assert.ok(parsed.rules.includes(rule), rule);
    assert.ok(parsed.rules.indexOf(rule) < parsed.rules.indexOf('MATCH,DIRECT'));
  }
  assert.ok(!parsed.rules.some(r => /netflix|twitch|disney/.test(r)));
  assert.ok(!parsed.rules.includes('DOMAIN-SUFFIX,youtube,Games'));
  assert.ok(!result.source.includes('youtube.co.jp'));
  assert.deepEqual(inspectYaml(result.source), []);
});

test('Robinhood and OKX completion covers observed API, CDN and websocket hostnames by suffix', () => {
  assert.deepEqual(completeSiteDomains('robinhood').domains, ['robinhood.com']);
  assert.deepEqual(completeSiteDomains('okx').domains, ['okx.com']);
  for (const host of ['api.robinhood.com:443', 'bonfire.robinhood.com:443', 'cdn.robinhood.com:443']) assert.deepEqual(completeSiteDomains(host).domains, ['robinhood.com']);
  for (const host of ['static.okx.com:443', 'wspri.okx.com:8443', 'ipushws.okx.com:443']) assert.deepEqual(completeSiteDomains(host).domains, ['okx.com']);
  const parsed = readYaml(addSites(original, { target: 'Games', text: completeSiteDomains('robinhood').domains.join('\n'), exact: false, replaceIcon: false }).source);
  assert.ok(parsed.rules.includes('DOMAIN-SUFFIX,robinhood.com,Games'));
});

test('generator domain edits move domains, preserve unrelated data and reset to exact defaults', () => {
  const edits = new Map([
    ['Games', { removedRules: ['DOMAIN-SUFFIX,old.example.com,Games'], domains: ['steamcommunity.com'], iconDomain: 'steamcommunity.com' }],
    ['Work', { removedRules: [], domains: ['old.example.com'] }],
    ['Disabled', { removedRules: [], domains: ['unused.example.com'] }],
  ]);
  const out = applyGroupDomainEdits(original, edits), parsed = readYaml(out);
  assert.equal(parsed.domains.find(r => r.domain === 'old.example.com').target, 'Work');
  assert.equal(parsed.domains.find(r => r.domain === 'steamcommunity.com').target, 'Games');
  assert.equal(parsed.groups[0].icon, 'https://icon.horse/icon/steamcommunity.com');
  assert.ok(!out.includes('unused.example.com'));
  assert.deepEqual(parsed.value.proxies, readYaml(original).value.proxies);
  assert.deepEqual(parsed.value['x-unknown'], readYaml(original).value['x-unknown']);
  assert.ok(out.includes('&base')); assert.ok(out.includes('# keep this comment'));
  edits.clear(); assert.equal(applyGroupDomainEdits(original, edits), original);
});

test('generator domain edits reject conflicts and remove only selected remote binding', () => {
  assert.throws(() => applyGroupDomainEdits(original, new Map([
    ['Work', { removedRules: [], domains: ['old.example.com'] }],
  ])), /其他策略组/);
  const source = original.replace('  - MATCH,DIRECT', '  - RULE-SET,GamesList,Games\n  - MATCH,DIRECT') + '\nrule-providers:\n  GamesList: {type: http, behavior: domain, url: https://example.test/rules}\n';
  const output = applyGroupDomainEdits(source, new Map([
    ['Games', { removedRules: ['RULE-SET,GamesList,Games'], domains: [] }],
  ]));
  const parsed = readYaml(output);
  assert.ok(!parsed.rules.some(r => r.startsWith('RULE-SET,')));
  assert.ok(parsed.value['rule-providers'].GamesList);
  assert.ok(parsed.domains.some(r => r.domain === 'old.example.com'));
});

test('parse merged groups and preserve comments, anchors, credentials and unknown fields', () => {
  assert.deepEqual(inspectYaml(original), []);
  const output = addSites(original, { target: 'Games', text: 'HTTPS://Example.COM/path\nEXAMPLE.com\nhttps://第二.example/path', exact: false, replaceIcon: false });
  const p = readYaml(output.source);
  assert.equal(p.value.proxies[0].password, 'a,b:#secret');
  assert.deepEqual(p.value['x-unknown'], readYaml(original).value['x-unknown']);
  assert.equal(p.groups.find(g => g.name === 'Games').icon, 'https://icon.horse/icon/example.com');
  assert.match(output.source, /&base/); assert.match(output.source, /\*base/);
  for (const note of ['keep this comment', 'keep group note', 'keep rule note']) assert.ok(output.source.includes(note));
  assert.equal(p.domains.filter(r => r.domain === 'example.com').length, 1);
  assert.ok(p.rules.indexOf('DOMAIN-SUFFIX,example.com,Games') < p.rules.indexOf('MATCH,DIRECT'));
  assert.ok(p.domains.some(d => d.domain.startsWith('xn--')));
});

test('existing logos survive additions and explicit replacement works', () => {
  const opts = { target: 'Work', text: 'github.com', exact: false, replaceIcon: false };
  assert.equal(readYaml(addSites(original, opts).source).groups[1].icon, 'https://example.test/original.png');
  assert.equal(readYaml(addSites(original, { ...opts, replaceIcon: true }).source).groups[1].icon, 'https://icon.horse/icon/github.com');
  assert.equal(readYaml(setGroupIcon(original, 'Games', 'https://steamcommunity.com/')).groups[0].icon, 'https://icon.horse/icon/steamcommunity.com');
});

test('change default, create standalone group, add exact rule, delete and reject stale edits', () => {
  const reordered = readYaml(setDefaultExit(original, 'Games', 'US'));
  assert.deepEqual(reordered.groups[0].proxies, ['US', 'JP', 'DIRECT']);
  const output = addSites(original, { target: '', text: 'login.example.com', exact: true, replaceIcon: false, newGroup: { name: 'Login', upstream: 'Work' } });
  const p = readYaml(output.source), rule = p.domains.find(d => d.target === 'Login');
  assert.equal(p.groups.find(g => g.name === 'Login').proxies[0], 'Work');
  assert.equal(rule.exact, true);
  assert.ok(!readYaml(removeDomainRule(output.source, rule.index, rule.raw)).rules.includes(rule.raw));
  assert.throws(() => removeDomainRule(output.source, rule.index, 'changed'));
});

test('domain correction does not guess spellings or accept credentials and bad targets', () => {
  assert.equal(normalizeDomain(' HTTPS://EXAMPLE.COM:443/path?q=1 '), 'example.com');
  assert.equal(normalizeDomain('*.Example.com.'), 'example.com');
  assert.equal(normalizeDomain('githbu.com'), 'githbu.com');
  assert.equal(siteSuggestion('Steam').domains[0], 'steampowered.com');
  for (const bad of ['socks://host.example', 'https://user:pass@example.com', '127.0.0.1', 'foo', 'bad..example', 'bad,REJECT']) assert.throws(() => normalizeDomain(bad));
  assert.throws(() => normalizeDomain('*.example.com', true));
  assert.deepEqual(normalizeDomains('example.com，example.org\nEXAMPLE.COM').domains, ['example.com', 'example.org']);
  assert.throws(() => addSites(original, { target: 'Work', text: 'old.example.com', exact: false, replaceIcon: false }), /其他策略组/);
  assert.throws(() => setDefaultExit(original, 'Games', 'missing'));
});

test('safe fix removes identical rules, keeps conflicts visible and retains original payload', () => {
  const src = original.replace('  - MATCH,DIRECT', '  - DOMAIN-SUFFIX,HTTPS://EXAMPLE.COM/path,Games\n  - DOMAIN-SUFFIX,example.com,Games\n  - DOMAIN-SUFFIX,example.com,Work\n  - MATCH,DIRECT');
  const output = safeFix(src);
  const p = readYaml(output.source);
  assert.equal(p.domains.filter(d => d.domain === 'example.com' && d.target === 'Games').length, 1);
  assert.equal(p.domains.filter(d => d.domain === 'example.com' && d.target === 'Work').length, 1);
  assert.equal(p.value.proxies[0].password, 'a,b:#secret');
  assert.equal(safeFix(original).source, original);
});

test('missing references, duplicate names, loops, syntax and alias expansion are rejected', () => {
  assert.ok(inspectYaml(original.replace('proxies: [US, JP]', 'proxies: [Missing]')).some(p => p.severity === 'error'));
  assert.ok(inspectYaml(original.replace('name: Work', 'name: Games')).some(p => p.message.includes('重复')));
  assert.ok(inspectYaml(original.replace('proxies: [US, JP]', 'proxies: [Work]')).some(p => p.message.includes('循环')));
  assert.ok(inspectYaml('proxy-groups: [').some(p => p.severity === 'error'));
  assert.ok(inspectYaml('a: &a {b: *a}\nproxy-groups: []').some(p => p.severity === 'error'));
  assert.throws(() => readYaml('x'.repeat(2 * 1024 * 1024 + 1)));
});

test('protected Taiwan rules remain before appended generic domains', () => {
  const src = original.replace('rules:', '  - {name: 交易所-台湾家宽, type: select, proxies: [JP]}\n  - {name: OKX, type: select, proxies: [交易所-台湾家宽, REJECT]}\nrules:').replace('  - MATCH,DIRECT', '  - AND,((NETWORK,UDP),(DOMAIN-SUFFIX,okx.com)),REJECT\n  - DOMAIN-SUFFIX,okx.com,OKX\n  - MATCH,DIRECT');
  const p = readYaml(addSites(src, { target: 'Games', text: 'trade.okx.com', exact: false, replaceIcon: false }).source);
  assert.ok(p.rules.indexOf('DOMAIN-SUFFIX,okx.com,OKX') < p.rules.indexOf('DOMAIN-SUFFIX,trade.okx.com,Games'));
  assert.ok(p.rules.indexOf('DOMAIN-SUFFIX,trade.okx.com,Games') < p.rules.indexOf('MATCH,DIRECT'));
});

test('added sites support the shared domain edits, logo replacement, and reset', () => {
  const baseline = applyAddedSites(original, [{ name: 'Extra', domains: ['extra.example.org'], upstream: 'JP' }]);
  const edits = new Map([['Extra', { removedRules: ['DOMAIN-SUFFIX,extra.example.org,Extra'], domains: ['cdn.example.org'], iconDomain: 'cdn.example.org' }]]);
  const changed = readYaml(applyGroupDomainEdits(baseline, edits));
  assert(changed.rules.includes('DOMAIN-SUFFIX,cdn.example.org,Extra'));
  assert(!changed.rules.includes('DOMAIN-SUFFIX,extra.example.org,Extra'));
  assert(changed.groups.find(g => g.name === 'Extra').icon.includes('cdn.example.org'));
  edits.delete('Extra');
  assert.equal(applyGroupDomainEdits(baseline, edits), baseline);
});

test('renaming retains domain deletions, additions and icon without touching other groups', () => {
  const edits = new Map([['Extra', { removedRules: ['DOMAIN-SUFFIX,extra.example.org,Extra'], domains: ['cdn.example.org'], iconDomain: 'cdn.example.org' }], ['Games', { removedRules: [], domains: ['game.example.org'] }]]);
  renameGroupDomainEdits(edits, 'Extra', 'Renamed');
  assert(!edits.has('Extra'));
  assert.deepEqual(edits.get('Renamed'), { removedRules: ['DOMAIN-SUFFIX,extra.example.org,Renamed'], domains: ['cdn.example.org'], iconDomain: 'cdn.example.org' });
  assert.deepEqual(edits.get('Games').domains, ['game.example.org']);
  const baseline = applyAddedSites(original, [{ name: 'Renamed', domains: ['extra.example.org'], upstream: 'JP' }]);
  const changed = readYaml(applyGroupDomainEdits(baseline, edits));
  assert(!changed.rules.includes('DOMAIN-SUFFIX,extra.example.org,Renamed'));
  assert(changed.rules.includes('DOMAIN-SUFFIX,cdn.example.org,Renamed'));
});
