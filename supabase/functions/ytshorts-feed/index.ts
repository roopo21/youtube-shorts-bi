const OPERATIONS=["setting_get", "refresh_claim", "impressions_expire", "sessions_expire", "videos_expire", "sources_enabled", "video_audio_conflict", "video_upsert", "refresh_success", "refresh_failure", "session_get", "session_insert", "feed_catalogue", "session_seen", "impression_insert", "refresh_status", "impression_get", "impression_progress", "sources_all", "refreshes_all", "catalogue_counts", "interest_metrics", "setting_put", "sources_count", "source_exists", "source_enabled", "source_upsert", "source_get", "source_disable", "source_unpublish", "candidates", "video_get", "video_reject", "video_approve", "discovery_duration", "discovery_counts", "coverage_status", "discovery_import"];

const operationSet=new Set(OPERATIONS);
async function executeData(env,op,args){
 if(!operationSet.has(op)&&op!=='batch')throw Error('Unknown data operation.');
 if(typeof env.LOCAL_EXECUTE==='function')return env.LOCAL_EXECUTE(op,args);
 if(!env.YTSHORTS_DATA_URL||!env.YTSHORTS_BACKEND_TOKEN)throw Error('Supabase data service is not configured.');
 const response=await fetch(env.YTSHORTS_DATA_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Ytshorts-Token':env.YTSHORTS_BACKEND_TOKEN},body:JSON.stringify({op,args}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Supabase data service failed ('+response.status+').');
 return response.json();
}
function statement(env,op){if(!operationSet.has(op))throw Error('Unknown data operation.');let args=[];return {op,get args(){return args},bind(...values){args=values;return this},async first(){return (await executeData(env,op,args)).rows[0]||null},async all(){return {results:(await executeData(env,op,args)).rows}},async run(){return {meta:{changes:(await executeData(env,op,args)).changes}}}};}
async function batch(env,statements){const result=await executeData(env,'batch',statements.map(s=>({op:s.op,args:s.args})));return result.results.map(r=>({results:r.rows,meta:{changes:r.changes}}));}

const LANGUAGES=['hi','mr'];
const TOPICS=['skills','jobs','entertainment','brainrot','income','farming','construction','money','documents','food_stay'];
function language(value){if(!LANGUAGES.includes(value)){const e=new Error('Choose Hindi (hi) or Marathi (mr). Other languages are not supported.');e.status=400;throw e;}return value;}
function audioLanguage(value){return typeof value==='string'?value.toLowerCase().split('-')[0]:null;}
function durationSeconds(value){const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value||'');return m?Math.round(Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0)):0;}
function classify(video,expectedLanguage,trusted=false,topic='skills'){
 const s=video.snippet||{},d=video.contentDetails||{},status=video.status||{},audio=audioLanguage(s.defaultAudioLanguage),seconds=durationSeconds(d.duration);
 const unavailable=status.embeddable!==true||status.privacyStatus!=='public'||s.liveBroadcastContent==='live'||s.liveBroadcastContent==='upcoming'||d.contentRating?.ytRating==='ytAgeRestricted'||d.regionRestriction?.blocked?.includes('IN')||(d.regionRestriction?.allowed&&!d.regionRestriction.allowed.includes('IN'));
 if(unavailable)return {status:'rejected',language:audio,duration:seconds,reason:'unavailable_or_restricted',topic};
 // Duration/#shorts are only a candidate heuristic; YouTube does not provide a public isShort flag here.
 const marked=/#shorts?\b/i.test((s.title||'')+' '+(s.description||'')+' '+(s.tags||[]).join(' '));
 if(seconds<1||seconds>180)return {status:'rejected',language:audio,duration:seconds,reason:'not_short_candidate',topic};
 if(audio&&audio!==expectedLanguage)return {status:'rejected',language:audio,duration:seconds,reason:'audio_language_mismatch',topic};
 if(!marked&&!trusted)return {status:'pending',language:audio,duration:seconds,reason:'short_format_review_required',topic};
 if(!audio)return {status:'pending',language:null,duration:seconds,reason:'audio_language_missing',topic};
 return {status:trusted?'approved':'pending',language:audio,duration:seconds,reason:trusted?'approved_source_audio_match':'source_review_required',topic};
}
function balanced(rows,limit=15,random=Math.random,previousChannel=null,offset=0){
 const fun=['brainrot','entertainment'],useful=TOPICS.filter(t=>!fun.includes(t));
 const groups=Object.fromEntries(TOPICS.map(t=>[t,[]]));
 function shuffle(group){for(let i=group.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[group[i],group[j]]=[group[j],group[i]];}}
 function refill(source,repeated=false){for(const row of source)groups[row.topic]?.push(repeated?{...row,previouslySeen:true}:row);for(const group of Object.values(groups)){shuffle(group);group.sort((a,b)=>Number(!!b.previouslySeen)-Number(!!a.previouslySeen));}}
 refill(rows);
 let funCursor=0,usefulCursor=0,lastChannel=previousChannel;const counts=new Map();
 const channel=v=>v.channel_id||v.source_url||('video:'+v.id);
 function take(pool,isFun,adjacent=false,ignoreCap=false,seen=false){for(let tries=0;tries<pool.length;tries++){const cursor=isFun?funCursor++:usefulCursor++,group=groups[pool[cursor%pool.length]];for(let i=group.length-1;i>=0;i--){const row=group[i],key=channel(row);if(isFun&&!seen&&row.previouslySeen)continue;if(isFun&&!ignoreCap&&(counts.get(key)||0)>=2)continue;if(!adjacent&&key===lastChannel)continue;return group.splice(i,1)[0];}}return null;}
 function entertainment(){for(const seen of [false,true]){const item=take(fun,true,false,false,seen)||take(fun,true,false,true,seen)||take(fun,true,true,false,seen)||take(fun,true,true,true,seen);if(item)return item;}return null;}
 const funRows=rows.filter(v=>fun.includes(v.topic)),infoRows=rows.filter(v=>useful.includes(v.topic));
 const result=[];while(result.length<limit){
  const wantFun=(offset+result.length)%3!==2;let item=wantFun?entertainment():(take(useful,false)||take(useful,false,true));
  if(!item){const source=wantFun?funRows:infoRows;if(!source.length)break;refill(source,true);item=wantFun?entertainment():(take(useful,false)||take(useful,false,true));}
  if(!item)break;const key=channel(item);counts.set(key,(counts.get(key)||0)+1);lastChannel=key;result.push(item);
 }
 const trailing=(offset+result.length)%3;if(trailing)result.splice(Math.max(0,result.length-trailing));
 return result;
}

const QUERIES={
hi:{skills:'प्लंबिंग औजार काम सीखें #shorts हिंदी',jobs:'डिलीवरी नौकरी काम रोजगार #shorts हिंदी',entertainment:'हिंदी कॉमेडी मजेदार #shorts',brainrot:'डिलीवरी मजेदार कहानी ai microdrama #shorts हिंदी',income:'कमाई हुनर छोटा व्यवसाय #shorts हिंदी',farming:'खेती सिंचाई कृषि तकनीक #shorts हिंदी',construction:'निर्माण मिस्त्री टाइल काम #shorts हिंदी',money:'UPI QR code पैसे फोन इस्तेमाल #shorts हिंदी',documents:'आधार पैन ई श्रम जानकारी #shorts हिंदी',food_stay:'सस्ता खाना श्रमिक कैंटीन #shorts हिंदी'},
mr:{skills:'प्लंबिंग कौशल्य काम शिका #shorts मराठी',jobs:'नोकरी काम रोजगार #shorts मराठी',entertainment:'मराठी कॉमेडी मजेदार #shorts',brainrot:'मराठी विनोदी कथा ai #shorts',income:'कमाई कौशल्य लघु व्यवसाय #shorts मराठी',farming:'शेती ठिबक सिंचन कृषी #shorts मराठी',construction:'बांधकाम गवंडी टाइल काम #shorts मराठी',money:'UPI QR code फोन पैसे #shorts मराठी',documents:'आधार पॅन ई श्रम माहिती #shorts मराठी',food_stay:'स्वस्त जेवण कामगार निवास #shorts मराठी'}
};
async function youtube(key,path,params,fetcher=fetch){const url=new URL('https://www.googleapis.com/youtube/v3/'+path);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));const r=await fetcher(url,{headers:{'X-Goog-Api-Key':key},signal:AbortSignal.timeout(15000)});if(!r.ok){const e=new Error(r.status===403?'YouTube refused the request. Check API activation, key restrictions and quota.':'YouTube request failed ('+r.status+').');e.status=502;throw e;}return r.json();}
async function discover(key,lang,sources,fetcher=fetch){const found=new Map();
 // At most three global searches plus three approved-source searches per language per refresh.
 const offset=(Math.floor(Date.now()/21600000)*3)%TOPICS.length;const discoveryTopics=Array.from({length:3},(_,i)=>TOPICS[(offset+i)%TOPICS.length]);
 for(const topic of discoveryTopics){const data=await youtube(key,'search',{part:'snippet',type:'video',q:QUERIES[lang][topic],relevanceLanguage:lang,regionCode:'IN',safeSearch:'strict',videoDuration:'short',videoEmbeddable:'true',maxResults:15},fetcher);for(const v of data.items||[])if(v.id?.videoId&&!found.has(v.id.videoId))found.set(v.id.videoId,{topic,trusted:false});}
 for(const source of sources.slice(0,3)){const data=await youtube(key,'search',{part:'snippet',type:'video',channelId:source.channel_id,q:'#shorts',order:'date',relevanceLanguage:lang,regionCode:'IN',videoDuration:'short',videoEmbeddable:'true',maxResults:15,safeSearch:'strict'},fetcher);for(const v of data.items||[])if(v.id?.videoId)found.set(v.id.videoId,{topic:source.topic,trusted:true,channelId:source.channel_id});}
 const records=[];const all=[...found.keys()];for(let i=0;i<all.length;i+=50){const data=await youtube(key,'videos',{part:'snippet,contentDetails,status',id:all.slice(i,i+50).join(',')},fetcher);for(const v of data.items||[]){const f=found.get(v.id);const trusted=f.trusted&&f.channelId===v.snippet?.channelId;records.push({id:v.id,title:String(v.snippet?.title||'').slice(0,200),channelId:v.snippet?.channelId||'',channelTitle:v.snippet?.channelTitle||'',publishedAt:v.snippet?.publishedAt||new Date().toISOString(),audioLanguage:v.snippet?.defaultAudioLanguage||null,...classify(v,lang,trusted,f.topic)});}}
 return records;
}

const SIX_HOURS=21600000,THIRTY_DAYS=2592000000;
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const rows=async statement=>(await statement.all()).results||[];
async function body(request){if(Number(request.headers.get('content-length')||0)>64000)throw fail('Request too large.',413);const text=await request.text();if(text.length>64000)throw fail('Request too large.',413);try{return JSON.parse(text)}catch{throw fail('Invalid JSON.')}}
function checkTopic(t){if(!TOPICS.includes(t))throw fail('Choose a supported feed category.');return t;}
function admin(request,env){const email=request.headers.get('oai-authenticated-user-email');return !!env.ADMIN_EMAIL&&email?.toLowerCase()===env.ADMIN_EMAIL.toLowerCase();}
function bytesTo64(bytes){return btoa(String.fromCharCode(...bytes));}
function from64(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function encryptionKey(env){if(!/^[a-f0-9]{64}$/i.test(env.SETTINGS_ENCRYPTION_KEY||''))throw fail('Server encryption key is not configured.',503);return crypto.subtle.importKey('raw',Uint8Array.from(env.SETTINGS_ENCRYPTION_KEY.match(/../g),v=>parseInt(v,16)),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),new TextEncoder().encode(value));return JSON.stringify({iv:bytesTo64(iv),data:bytesTo64(new Uint8Array(encrypted))});}
async function getKey(env){if(env.YOUTUBE_API_KEY)return env.YOUTUBE_API_KEY;const row=await statement(env,'setting_get').bind('youtube_api_key').first();if(!row)return null;const data=JSON.parse(row.value);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(data.iv)},await encryptionKey(env),from64(data.data)));}
async function refresh(env,lang,manual=false){language(lang);const key=await getKey(env);if(!key)return {status:'needs_api_key'};const now=Date.now(),lease=now+180000;const claim=await statement(env,'refresh_claim').bind(lang,now,lease,now,now-(manual?900000:SIX_HOURS)).run();if(!claim.meta?.changes)return {status:'throttled'};
 try{await batch(env,[statement(env,'impressions_expire').bind(now-THIRTY_DAYS),statement(env,'sessions_expire').bind(now-THIRTY_DAYS),statement(env,'videos_expire').bind(now-THIRTY_DAYS)]);const sources=await rows(statement(env,'sources_enabled').bind(lang));const candidates=await discover(key,lang,sources);const conflicts=candidates.filter(v=>v.reason==='audio_language_mismatch');if(conflicts.length)await batch(env,conflicts.map(v=>statement(env,'video_audio_conflict').bind(v.audioLanguage,now,v.id,v.language)));const statements=candidates.filter(v=>v.reason!=='audio_language_mismatch').map(v=>statement(env,'video_upsert').bind(v.id,v.title,v.channelId,v.channelTitle,(['hi','mr'].includes(v.language)?v.language:null),v.audioLanguage,v.topic,v.duration,v.status,v.publishedAt,now,v.reason));if(statements.length)await batch(env,statements);await statement(env,'refresh_success').bind(now,`Checked ${candidates.length} candidates.`,lang).run();return {status:'ready',checked:candidates.length};
 }catch(e){await statement(env,'refresh_failure').bind(e.message?.startsWith('YouTube')?e.message:'Refresh failed. Try again later.',lang).run();return {status:'failed'};}}
async function session(request,env,lang){const cookie=request.headers.get('cookie')||'',id=/\bshortlist_session=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/.exec(cookie)?.[1];const existing=id?await statement(env,'session_get').bind(id,Date.now()-THIRTY_DAYS).first():null;if(existing&&existing.language===lang)return {id:existing.id};const next=crypto.randomUUID();await statement(env,'session_insert').bind(next,lang,Date.now()).run();return {id:next,cookie:`shortlist_session=${next}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`};}
function createApp(assets={}){return async function handle(request,env,ctx={waitUntil:()=>{}}){try{const url=new URL(request.url),path=url.pathname;const isAdmin=path.startsWith('/api/admin/');if(isAdmin&&!admin(request,env))throw fail('Owner sign-in required.',403);if(request.method!=='GET'&&request.method!=='HEAD'){const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw fail('Cross-origin writes are not allowed.',403);}
 if(path==='/api/feed'&&['GET','POST'].includes(request.method)){
 const feedOptions=request.method==='POST'?await body(request):{};
 const requested=url.searchParams.get('lang')||'mixed',lang=requested==='mixed'?'mixed':language(requested);
 const languages=lang==='mixed'?['hi','mr']:[lang];
 const available=(await Promise.all(languages.map(l=>rows(statement(env,'feed_catalogue').bind(l,Date.now()-THIRTY_DAYS))))).flat();const s=await session(request,env,lang);
 const seen=await rows(statement(env,'session_seen').bind(s.id,Date.now()-86400000));const seenIds=new Set(seen.map(v=>v.video_id));const exclude=new Set((Array.isArray(feedOptions.exclude)?feedOptions.exclude.join(','):(url.searchParams.get('exclude')||'')).split(',').filter(id=>/^[\w-]{11}$/.test(id)).slice(0,3000));const unseen=available;const offset=Number(feedOptions.offset??url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)throw fail('Invalid feed position.');const selected=balanced(unseen.map(v=>({...v,previouslySeen:seenIds.has(v.id)||exclude.has(v.id)})),15,Math.random,feedOptions.afterChannel||url.searchParams.get('afterChannel'),offset);const items=selected.map(v=>({...v,impressionId:crypto.randomUUID()}));if(items.length)await batch(env,items.map(v=>statement(env,'impression_insert').bind(v.impressionId,s.id,v.id,v.language,v.topic,Date.now())));
 return json({language:lang,videos:items,status:items.length?'ready':unseen.length?'insufficient_balanced_content':available.length?'caught_up':'awaiting_approved_content',mix:{entertainment:2,information:1},repeatsAllowed:true,refresh:null},200,s.cookie?{'Set-Cookie':s.cookie}:{});
 }
 if(path==='/api/events'&&request.method==='POST'){
 const b=await body(request),sid=/\bshortlist_session=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/.exec(request.headers.get('cookie')||'')?.[1];if(!sid)throw fail('Load a feed first.',401);if(typeof b.impressionId!=='string'||!['view','progress'].includes(b.type))throw fail('Invalid event.');if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.impressionId))throw fail('Unknown impression.',404);const impression=await statement(env,'impression_get').bind(b.impressionId,sid,Date.now()-86400000).first();if(!impression)throw fail('Unknown impression.',404);const seconds=Number(b.watchSeconds||0);if(!Number.isFinite(seconds)||seconds<0||seconds>600)throw fail('Invalid watch duration.');let duration=impression.duration;const reportedDuration=Number(b.videoDuration||0);if(!duration&&Number.isFinite(reportedDuration)&&reportedDuration>=1&&reportedDuration<=180){duration=Math.ceil(reportedDuration);await statement(env,'discovery_duration').bind(impression.video_id,duration).run();}const elapsed=Math.max(0,Math.floor((Date.now()-impression.created_at)/1000)+2),safe=Math.min(Math.floor(seconds),elapsed,duration||180);const completed=duration>0&&safe>=duration*.9?1:0;await statement(env,'impression_progress').bind(safe,completed,b.impressionId).run();return json({ok:true});
 }
 if(path==='/api/admin/coverage'&&request.method==='GET')return json({coverage:await rows(statement(env,'coverage_status')),discovery:await rows(statement(env,'discovery_counts'))});
 if(path==='/api/admin/status'&&request.method==='GET'){return json({connected:!!await getKey(env),languages:['hi','mr'],storage:env.LOCAL_EXECUTE?'local-fixture':'supabase',sources:await rows(statement(env,'sources_all')),refreshes:await rows(statement(env,'refreshes_all')),counts:await rows(statement(env,'catalogue_counts')),metrics:await rows(statement(env,'interest_metrics'))});}
 if(path==='/api/admin/key'&&request.method==='POST'){const b=await body(request);if(typeof b.key!=='string'||b.key.length<20||b.key.length>200)throw fail('Enter a valid YouTube Data API key.');await youtube(b.key,'videos',{part:'id',id:'M7lc1UVf-VE'});await statement(env,'setting_put').bind('youtube_api_key',await encrypt(b.key,env)).run();ctx.waitUntil(Promise.all(['hi','mr'].map(lang=>refresh(env,lang,true))).catch(()=>{}));return json({connected:true});}
 if(path==='/api/admin/refresh'&&request.method==='POST'){const b=await body(request);return json(await refresh(env,language(b.language),true));}
 if(path==='/api/admin/sources'&&request.method==='POST'){const b=await body(request);const lang=language(b.language),topic=checkTopic(b.topic);let channelId=String(b.channel||'').trim();const key=await getKey(env);if(!key)throw fail('Connect YouTube first.',409);let lookup;if(/^UC[\w-]{22}$/.test(channelId))lookup={id:channelId};else {const match=/^(?:https:\/\/(?:www\.)?youtube\.com\/)?(@[\w.-]+)(?:\/.*)?$/.exec(channelId);if(!match)throw fail('Use a channel @handle, handle URL, or UC channel ID.');lookup={forHandle:match[1]};}const data=await youtube(key,'channels',{part:'snippet',...lookup});const channel=data.items?.[0];if(!channel)throw fail('Channel not found.');channelId=channel.id;const count=await statement(env,'sources_count').bind(lang).first();const id=channelId+':'+lang;const existing=await statement(env,'source_exists').bind(id).first();if(count.n>=3&&!((await statement(env,'source_enabled').bind(id).first())?.enabled))throw fail('This MVP supports three approved channels per language. Disable one before adding another.');await statement(env,'source_upsert').bind(id,channelId,lang,topic,channel.snippet.title).run();return json({id,label:channel.snippet.title});}
 if(path==='/api/admin/source-disable'&&request.method==='POST'){const b=await body(request);const s=await statement(env,'source_get').bind(String(b.id)).first();if(!s)throw fail('Unknown source.',404);await batch(env,[statement(env,'source_disable').bind(s.id),statement(env,'source_unpublish').bind(s.channel_id,s.language)]);return json({ok:true});}
 if(path==='/api/admin/candidates'&&request.method==='GET'){return json({videos:await rows(statement(env,'candidates'))});}
 if(path==='/api/admin/review'&&request.method==='POST'){const b=await body(request);const v=await statement(env,'video_get').bind(String(b.id)).first();if(!v)throw fail('Unknown video.',404);if(b.action==='reject'){await statement(env,'video_reject').bind(v.id).run();return json({ok:true});}const lang=language(b.language),topic=checkTopic(b.topic);const audio=v.audio_language?.toLowerCase().split('-')[0];if(audio&&audio!==lang)throw fail('The audio-language tag conflicts with this language. This video cannot enter that feed.');if(b.confirmed!==true)throw fail('Confirm that you watched the video and verified its spoken language and content.');if(v.duration<1||v.duration>180||v.status==='rejected')throw fail('This video is not eligible for approval.');await statement(env,'video_approve').bind(lang,topic,v.id).run();return json({ok:true});}
 if(path.startsWith('/api/'))return json({error:'Route not found.'},404);
 const asset=assets[path==='/'?'/index.html':path==='/admin'?'/admin.html':path];if(asset&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}});return new Response('Not found',{status:404});
 }catch(e){return json({error:e.status?e.message:'The server could not complete this request.'},e.status||500);}};}

// Server-to-server feed endpoint. The React client never receives this bridge token.
function createEdgeFeed({getEnv,app,fetchImpl=fetch}){
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

Deno.serve(createEdgeFeed({getEnv:name=>Deno.env.get(name),app:createApp()}));
