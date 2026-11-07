import test from 'node:test';import assert from 'node:assert/strict';
import {balanced} from '../worker/policy.js';import {createApp} from '../worker/backend.js';import {database} from '../scripts/local-db.mjs';import {localExecutor} from '../scripts/local-store.mjs';
const fun=v=>['entertainment','brainrot'].includes(v.topic);
const catalogue=Array.from({length:60},(_,i)=>({id:'f'+i,topic:i%2?'brainrot':'entertainment',channel_id:'creator'+i%12,language:i%2?'hi':'mr'})).concat([{id:'info',topic:'skills',channel_id:'teacher',language:'hi'}]);
test('one information reel can repeat at every third position, channel caps constrain entertainment',()=>{const result=balanced(catalogue,15);assert.equal(result.length,15);result.forEach((v,i)=>assert.equal(fun(v),i%3!==2));assert.equal(result.filter(v=>v.id==='info').length,5);assert.equal(new Set(result.filter(fun).map(v=>v.id)).size,10);});
test('shuffle varies order and preserves sequence at pagination boundaries',()=>{const a=balanced(catalogue,15),b=balanced(catalogue,15);assert.notDeepEqual(a.map(v=>v.id),b.map(v=>v.id));const tail=balanced(catalogue,9,Math.random,null,15);tail.forEach((v,i)=>assert.equal(fun(v),(15+i)%3!==2));assert.equal(balanced(catalogue.filter(fun),15).length,0);});
test('mixed API retains actual video language, repeats information across batches and records independent impressions',async()=>{const DB=database(),env={DB,LOCAL_EXECUTE:localExecutor(DB)},app=createApp();const data=catalogue.map((v,i)=>({...v,id:String(i).padStart(11,'0')}));for(const v of data)DB.raw.prepare('INSERT INTO videos VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(v.id,'Test',v.channel_id,'Creator',v.language,v.language,v.topic,30,'approved',new Date().toISOString(),Date.now(),'human_reviewed');
 const r=await app(new Request('https://test/api/feed'),env);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],first=await r.json();assert.equal(first.language,'mixed');assert.deepEqual(new Set(first.videos.map(v=>v.language)),new Set(['hi','mr']));
 const next=await app(new Request('https://test/api/feed',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({offset:15,exclude:first.videos.map(v=>v.id)})}),env);const second=await next.json();assert.equal(second.videos.length,15);const firstEntertainment=new Set(first.videos.filter(fun).map(v=>v.id));assert.ok(second.videos.filter(fun).every(v=>!firstEntertainment.has(v.id)));assert.equal(second.videos[2].id,first.videos[2].id);assert.notEqual(second.videos[2].impressionId,first.videos[2].impressionId);
 for(const v of second.videos.filter(v=>!fun(v))){const event=await app(new Request('https://test/api/events',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({impressionId:v.impressionId,type:'view',watchSeconds:0})}),env);assert.equal(event.status,200);}assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM impressions WHERE displayed=1').get().n,5);
});

test('tiny exhausted catalogue repeats forever with fresh impression IDs and exact thirds',async()=>{
 const DB=database(),env={DB,LOCAL_EXECUTE:localExecutor(DB)},app=createApp();
 for(const [id,topic] of [['fun00000001','entertainment'],['info0000001','skills']])DB.raw.prepare('INSERT INTO videos VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'Test','only-channel','Creator','hi','hi',topic,30,'approved',new Date().toISOString(),Date.now(),'human_reviewed');
 let cookie,impressions=new Set();
 for(let page=0;page<12;page++){
  const request=new Request('https://test/api/feed',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({offset:100005+page*15,exclude:['fun00000001','info0000001']})});
  const response=await app(request,env);assert.equal(response.status,200);cookie??=response.headers.get('set-cookie').split(';')[0];const data=await response.json();assert.equal(data.videos.length,15);assert.equal(data.repeatsAllowed,true);data.videos.forEach((v,i)=>{assert.equal(fun(v),i%3!==2);assert.ok(!impressions.has(v.impressionId));impressions.add(v.impressionId)});
 }
 assert.equal(impressions.size,180);
});
test('all unseen entertainment is preferred before previously issued entertainment is reused',()=>{
 const fresh=Array.from({length:4},(_,i)=>({id:'fresh'+i,topic:'entertainment',channel_id:'one-creator'}));
 const seen=Array.from({length:8},(_,i)=>({id:'seen'+i,topic:'brainrot',channel_id:'seen'+i,previouslySeen:true}));
 const result=balanced([...fresh,...seen,{id:'info',topic:'jobs'}],15,()=>.5).filter(fun);
 assert.ok(result.slice(0,4).every(v=>v.id.startsWith('fresh')));assert.equal(result.length,10);
});
