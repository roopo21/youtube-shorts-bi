import {loadAssets} from './assets.mjs';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {createApp} from '../worker/backend.js';
const env={...process.env},port=Number(env.PORT||4174),host=env.HOST||'127.0.0.1';
if(!env.YTSHORTS_DATA_URL||!env.YTSHORTS_BACKEND_TOKEN)throw Error('Copy .env.example to .env and configure the server-only Supabase bridge credentials. For an offline fixture preview use npm run dev.');
const assets=loadAssets();
const app=createApp(assets);
function authorized(value){if(!env.ADMIN_USER||!env.ADMIN_PASSWORD)return false;const actual=Buffer.from(value||''),expected=Buffer.from('Basic '+Buffer.from(env.ADMIN_USER+':'+env.ADMIN_PASSWORD).toString('base64'));return actual.length===expected.length&&timingSafeEqual(actual,expected);}
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 const headers=new Headers(req.headers);headers.delete('oai-authenticated-user-email');
 if(path==='/admin'||path.startsWith('/admin.')||path.startsWith('/coverage')||path.startsWith('/api/admin/')){
  if(!authorized(req.headers.authorization)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Shortlist curator"'});res.end('Curator sign-in required.');return;}
  headers.set('oai-authenticated-user-email',env.ADMIN_EMAIL||'curator@local');
 }
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>64000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const data=Buffer.concat(chunks),base=env.PUBLIC_ORIGIN||'http://localhost:'+port;
 const request=new Request(base+req.url,{method:req.method,headers,...(data.length?{body:data}:{})});
 const response=await app(request,{...env,ADMIN_EMAIL:env.ADMIN_EMAIL||'curator@local'},{waitUntil:p=>p.catch(()=>{})});
 const outputHeaders=Object.fromEntries(response.headers);
 // Only loopback development removes Secure. Public deployments must use HTTPS.
 if(base.startsWith('http://localhost:')&&outputHeaders['set-cookie'])outputHeaders['set-cookie']=outputHeaders['set-cookie'].replace('; Secure','');
 res.writeHead(response.status,outputHeaders);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Backend request failed.');}});
server.listen(port,host,()=>console.log('Shortlist API + viewer: http://'+host+':'+port));
