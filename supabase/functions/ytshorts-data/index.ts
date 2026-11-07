// Server-to-server entry point. JWT verification is replaced with the scoped token check below.
// No project-wide Supabase secret ever leaves this function's runtime.
const allowed = new Set(['setting_get','refresh_claim','impressions_expire','sessions_expire','videos_expire','sources_enabled','video_audio_conflict','video_upsert','refresh_success','refresh_failure','session_get','session_insert','feed_catalogue','session_seen','impression_insert','refresh_status','impression_get','impression_progress','sources_all','refreshes_all','catalogue_counts','interest_metrics','setting_put','sources_count','source_exists','source_enabled','source_upsert','source_get','source_disable','source_unpublish','candidates','video_get','video_reject','video_approve','discovery_duration','discovery_counts','coverage_status','discovery_import']);
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function equal(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function validOperation(op:unknown,args:unknown):boolean {if(typeof op!=='string'||!Array.isArray(args))return false;if(op==='batch')return args.length<=200&&args.every(item=>item&&item.op!=='batch'&&validOperation(item.op,item.args));if(op==='discovery_import')return args.length<=100&&args.every(v=>v&&typeof v.id==='string');return allowed.has(op)&&args.length<=12;}
Deno.serve(async request=>{
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 const token=request.headers.get('X-Ytshorts-Token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorized.'},401);
 if(Number(request.headers.get('content-length')||0)>262144)return reply({error:'Request too large.'},413);
 try{
  const base=Deno.env.get('SUPABASE_URL');
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
  const key=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!key)return reply({error:'Database runtime unavailable.'},503);
  const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
  if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  const configResponse=await fetch(base+'/rest/v1/ytshorts_settings?select=value&key=eq.backend_token_sha256',{headers,signal:AbortSignal.timeout(10000)});
  if(!configResponse.ok)return reply({error:'Database runtime unavailable.'},503);
  const config=await configResponse.json();
  const expected=config[0]?.value;
  if(typeof expected!=='string'||!equal(hash,expected))return reply({error:'Unauthorized.'},401);
  const text=await request.text();if(text.length>262144)return reply({error:'Request too large.'},413);
  let body;try{body=JSON.parse(text)}catch{return reply({error:'Invalid JSON.'},400)}
  if(!validOperation(body.op,body.args))return reply({error:'Unknown or invalid operation.'},400);
  const response=await fetch(base+'/rest/v1/rpc/ytshorts_data_operation',{method:'POST',headers,body:JSON.stringify({p_operation:body.op,p_args:body.args}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){console.error('ytshorts database operation failed',response.status);return reply({error:'Database operation failed.'},503);}
  return reply(await response.json());
 }catch{return reply({error:'Data service unavailable.'},503);}
});
