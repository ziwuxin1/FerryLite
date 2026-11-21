// Maintenance command: refresh the vendor's current voice ranges, then rebuild/redeploy.
import {readFile,writeFile} from 'node:fs/promises';
import {isIP} from 'node:net';
const file=new URL('../ferry-core/data/ai-routing.json',import.meta.url);
const data=JSON.parse(await readFile(file,'utf8'));
const response=await fetch('https://openai.com/chatgpt-voice.json',{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error(`Voice source returned ${response.status}`);
const voice=await response.json();
const cidrs=voice.prefixes?.map(p=>p.ipv4Prefix??p.ipv6Prefix);
if(!Array.isArray(cidrs)||!cidrs.length||cidrs.some(c=>{if(typeof c!=='string')return true;const [ip,bits,...extra]=c.split('/');const family=isIP(ip);return extra.length||!family||!/^\d+$/.test(bits)||Number(bits)>(family===4?32:128)||Number(bits)===0;}))throw new Error('Invalid voice source; existing data preserved');
data.voice={updatedAt:voice.creationTime,cidrs:[...new Set(cidrs)]};
await writeFile(file,JSON.stringify(data,null,2)+'\n');
console.log(`Updated ${data.voice.cidrs.length} official voice prefixes (${data.voice.updatedAt}). Rebuild and redeploy to publish.`);
