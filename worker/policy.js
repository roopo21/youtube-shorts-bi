export const LANGUAGES=['hi','mr'];
export const TOPICS=['skills','jobs','entertainment','brainrot','income','farming','construction','money','documents','food_stay'];
export function language(value){if(!LANGUAGES.includes(value)){const e=new Error('Choose Hindi (hi) or Marathi (mr). Other languages are not supported.');e.status=400;throw e;}return value;}
export function audioLanguage(value){return typeof value==='string'?value.toLowerCase().split('-')[0]:null;}
export function durationSeconds(value){const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value||'');return m?Math.round(Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0)):0;}
export function classify(video,expectedLanguage,trusted=false,topic='skills'){
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
export function balanced(rows,limit=15,random=Math.random,previousChannel=null,offset=0){
 const groups=Object.fromEntries(TOPICS.map(t=>[t,[]]));for(const row of rows)groups[row.topic]?.push(row);
 for(const group of Object.values(groups))for(let i=group.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[group[i],group[j]]=[group[j],group[i]];}
 for(const group of Object.values(groups))group.sort((a,b)=>Number(!!b.previouslySeen)-Number(!!a.previouslySeen));
 const fun=['brainrot','entertainment'],useful=TOPICS.filter(t=>!fun.includes(t));let funCursor=0,usefulCursor=0,lastChannel=previousChannel;const channelCounts=new Map();
 const informationRows=rows.filter(v=>useful.includes(v.topic));
 const channel=v=>v.channel_id||v.source_url||('video:'+v.id);
 function take(pool,isFun,allowRepeat=false){for(let tries=0;tries<pool.length;tries++){const cursor=isFun?funCursor++:usefulCursor++;const group=groups[pool[cursor%pool.length]];for(let i=group.length-1;i>=0;i--){const key=channel(group[i]);if(isFun&&(channelCounts.get(key)||0)>=2)continue;if(!allowRepeat&&key===lastChannel)continue;return group.splice(i,1)[0];}}return null;}
 const result=[];while(result.length<limit){
  const wantFun=(offset+result.length)%3!==2;
  let item=take(wantFun?fun:useful,wantFun)||take(wantFun?fun:useful,wantFun,true);
  if(!item&&!wantFun&&informationRows.length){for(const row of informationRows)groups[row.topic].push(row);for(const group of useful.map(t=>groups[t]))for(let i=group.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[group[i],group[j]]=[group[j],group[i]];}item=take(useful,false)||take(useful,false,true);}
  if(!item)break;
  const key=channel(item);channelCounts.set(key,(channelCounts.get(key)||0)+1);lastChannel=key;result.push(item);
 }
 // Complete triples keep the experiment exact. Never substitute entertainment for information.
 const trailing=(offset+result.length)%3;if(trailing)result.splice(Math.max(0,result.length-trailing));
 return result;
}
