import test from 'node:test';import assert from 'node:assert/strict';
import {handleNetlify} from '../worker/netlify-adapter.js';
const env={ADMIN_USER:'curator',ADMIN_PASSWORD:'test-password',ADMIN_EMAIL:'owner@example.test'};
const auth='Basic '+Buffer.from('curator:test-password').toString('base64');
test('Netlify adapter strips forged Sites owner identities from public requests',async()=>{
 let forwarded;
 const response=await handleNetlify(new Request('https://example.netlify.app/api/feed',{headers:{'oai-authenticated-user-email':env.ADMIN_EMAIL}}),env,async r=>{forwarded=r;return Response.json({ok:true})});
 assert.equal(response.status,200);assert.equal(forwarded.headers.get('oai-authenticated-user-email'),null);
});
test('Netlify curator needs correct Basic credentials and a configured password',async()=>{
 let calls=0;const app=async()=>{calls++;return new Response('ok')};
 for(const path of ['/admin','/admin.html','/coverage.html','/api/admin/status']){
  const request=new Request('https://example.netlify.app'+path,{headers:{'oai-authenticated-user-email':env.ADMIN_EMAIL}});
  assert.equal((await handleNetlify(request,env,app)).status,401);
 }
 const request=new Request('https://example.netlify.app/admin',{headers:{authorization:auth}});
 assert.equal((await handleNetlify(request,{...env,ADMIN_PASSWORD:''},app)).status,401);assert.equal(calls,0);
 const response=await handleNetlify(request,env,async r=>{assert.equal(r.headers.get('oai-authenticated-user-email'),env.ADMIN_EMAIL);return new Response('ok')});assert.equal(response.status,200);
});
test('Netlify retains HTTPS session cookies and finishes background admin work',async()=>{
 let finished=false;
 const response=await handleNetlify(new Request('https://example.netlify.app/api/feed'),env,async(r,e,ctx)=>{ctx.waitUntil(Promise.resolve().then(()=>{finished=true}));return new Response('ok',{headers:{'Set-Cookie':'shortlist_session=test; Secure; HttpOnly; SameSite=Lax'}})});
 assert.equal(finished,true);assert.match(response.headers.get('set-cookie'),/Secure/);
});
test('Netlify function entry serves protected curator assets with valid authentication',async()=>{
 const {default:handler,config}=await import('../netlify/functions/api.mjs');
 const saved={ADMIN_USER:process.env.ADMIN_USER,ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,ADMIN_EMAIL:process.env.ADMIN_EMAIL};
 Object.assign(process.env,env);
 try{const response=await handler(new Request('https://example.netlify.app/admin',{headers:{authorization:auth}}));assert.equal(response.status,200);assert.match(await response.text(),/<!doctype html>/i);assert.ok(config.path.includes('/api/*'));}
 finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
