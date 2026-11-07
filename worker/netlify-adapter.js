import {timingSafeEqual} from 'node:crypto';
export async function handleNetlify(request,env,app){
 const path=new URL(request.url).pathname,headers=new Headers(request.headers);
 // A public host must never trust a caller's Sites identity header.
 headers.delete('oai-authenticated-user-email');
 if(['/api/feed','/api/events'].includes(path)&&env.YTSHORTS_FEED_URL){
  const upstreamHeaders=new Headers();
  for(const name of ['cookie','content-type','origin'])if(headers.has(name))upstreamHeaders.set(name,headers.get(name));
  upstreamHeaders.set('X-Ytshorts-Token',env.YTSHORTS_BACKEND_TOKEN||'');
  upstreamHeaders.set('X-Shortlist-Public-Origin',new URL(request.url).origin);
  try{
   const bytes=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
   if(bytes?.byteLength>64000)return Response.json({error:'Request too large.'},{status:413});
   const upstream=await fetch(env.YTSHORTS_FEED_URL.replace(/\/$/,'')+path+new URL(request.url).search,{method:request.method,headers:upstreamHeaders,...(bytes?{body:bytes}:{}),signal:AbortSignal.timeout(30000)});
   const responseHeaders=new Headers(upstream.headers);responseHeaders.delete('content-encoding');responseHeaders.delete('content-length');
   return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  }catch{return Response.json({error:'Feed service unavailable.'},{status:503});}
 }

 const owner=path==='/admin'||path.startsWith('/admin.')||path.startsWith('/coverage')||path.startsWith('/api/admin/');
 if(owner){
  const supplied=Buffer.from(headers.get('authorization')||'');
  const expected=Buffer.from('Basic '+Buffer.from((env.ADMIN_USER||'')+':'+(env.ADMIN_PASSWORD||'')).toString('base64'));
  if(!env.ADMIN_USER||!env.ADMIN_PASSWORD||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return new Response('Curator sign-in required.',{status:401,headers:{'WWW-Authenticate':'Basic realm="Shortlist curator"','Cache-Control':'no-store'}});
  headers.set('oai-authenticated-user-email',env.ADMIN_EMAIL||'curator@local');
 }
 const pending=[];
 const response=await app(new Request(request,{headers}),{...env,ADMIN_EMAIL:env.ADMIN_EMAIL||'curator@local'},{waitUntil:p=>pending.push(p)});
 // Complete authorized admin discovery before the function runtime exits.
 if(pending.length)await Promise.allSettled(pending);
 return response;
}
