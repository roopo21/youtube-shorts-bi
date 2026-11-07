import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import {createApp} from '../worker/backend.js';
const config=JSON.parse(readFileSync(0,'utf8'));
const endpoint=config.url;
const call=async(token,payload)=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Ytshorts-Token':token}:{})},body:JSON.stringify(payload)});
assert.equal((await call(null,{op:'sources_all',args:[]})).status,401);
assert.equal((await call('0'.repeat(64),{op:'sources_all',args:[]})).status,401);
assert.equal((await call(config.token,{op:'arbitrary_sql',args:[]})).status,400);
const data=await call(config.token,{op:'sources_all',args:[]});assert.equal(data.status,200);assert.ok(Array.isArray((await data.json()).rows));
const env={YTSHORTS_DATA_URL:endpoint,YTSHORTS_BACKEND_TOKEN:config.token,ADMIN_EMAIL:'verification@example.test'};
const app=createApp();for(const lang of ['hi','mr']){const r=await app(new Request('https://verification.example/api/feed?lang='+lang),env,{waitUntil:()=>{}});assert.equal(r.status,200);const d=await r.json();assert.equal(d.language,lang);assert.ok(d.videos.every(v=>v.language===lang));console.log(JSON.stringify({language:lang,status:r.status,feedStatus:d.status,videos:d.videos.length}));}
assert.equal((await app(new Request('https://verification.example/api/feed?lang=ta'),env)).status,400);
assert.equal((await app(new Request('https://verification.example/api/admin/status'),env)).status,403);
const admin=await app(new Request('https://verification.example/api/admin/status',{headers:{'oai-authenticated-user-email':env.ADMIN_EMAIL}}),env);assert.equal(admin.status,200);const d=await admin.json();assert.ok(!JSON.stringify(d).includes(config.token));console.log('Verified scoped authentication, named operations, both language feeds and admin status against live Supabase.');
