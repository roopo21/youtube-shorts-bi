// Server-to-server feed endpoint. The React client never receives this bridge token.
export function createEdgeFeed({getEnv,app,fetchImpl=fetch}){
 const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  const suffix=new URL(request.url).pathname.replace(/^.*\/ytshorts-feed/,'');
  if(!['/api/feed','/api/events'].includes(suffix))return reply('Route not found.',404);
  const token=request.headers.get('X-Ytshorts-Token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return reply('Unauthorized.',401);
  try{
   const base=getEnv('SUPABASE_URL'),keys=JSON.parse(getEnv('SUPABASE_SECRET_KEYS')||'{}'),key=keys.default||getEnv('SUPABASE_SERVICE_ROLE_KEY');
   if(!base||!key)return reply('Database runtime unavailable.',503);
   const headers={apikey:key,'Content-Type':'application/json'};if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
   const response=await fetchImpl(base+'/rest/v1/ytshorts_settings?select=value&key=eq.backend_token_sha256',{headers,signal:AbortSignal.timeout(10000)});
   if(!response.ok)return reply('Database unavailable.',503);
   const expected=(await response.json())[0]?.value;
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
   let difference=0;if(typeof expected!=='string'||expected.length!==hash.length)return reply('Unauthorized.',401);for(let i=0;i<hash.length;i++)difference|=hash.charCodeAt(i)^expected.charCodeAt(i);if(difference)return reply('Unauthorized.',401);
   const origin=request.headers.get('X-Shortlist-Public-Origin');if(!origin)return reply('Missing viewer origin.',400);
   const url=new URL(origin);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return reply('Invalid viewer origin.',400);
   const forwarded=new Request(new URL(suffix+new URL(request.url).search,url.origin),request);
   const env={LOCAL_EXECUTE:async(op,args)=>{
    const r=await fetchImpl(base+'/rest/v1/rpc/ytshorts_data_operation',{method:'POST',headers,body:JSON.stringify({p_operation:op,p_args:args}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Database operation failed.');return r.json();
   }};
   const result=await app(forwarded,env);
   const output=new Response(result.body,result);output.headers.set('X-Shortlist-Feed','supabase-edge');return output;
  }catch{return reply('Feed service unavailable.',503);}
 };
}
