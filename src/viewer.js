export function mountViewer(feed,notice){
const listeners=new AbortController();let disposed=false,apiScript=null;const previousReady=window.onYouTubeIframeAPIReady;
let ids=[],active=-1,player=null,ready=false,generation=0,apiReady=false,observer=null,pausedForScroll=false;
const slots=[];
let muted=true;
function showNotice(text){notice.textContent=text;notice.hidden=false;}
function parseIds(values){if(!Array.isArray(values)||values.length>100)throw Error('This collection must contain between 1 and 100 video IDs.');const result=values.map(v=>typeof v==='string'?v:v?.id);if(!result.every(id=>/^[\w-]{11}$/.test(id||'')))throw Error('This collection contains an invalid YouTube video ID.');return result;}
let selectedLanguage=null,loadingMore=false,noMore=false;
let feedItems=[],playbackTimer=null,viewSent=false,watchSeconds=0,lastMediaTime=0,lastReported=0;
const API_BASE=(window.SHORTLIST_CONFIG?.apiBase||'').replace(/\/$/,'');
const apiFetch=(path,options={})=>fetch(API_BASE+path,{credentials:'include',...options});
function requestFeed(){return apiFetch('/api/feed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offset:ids.length,afterChannel:feedItems.at(-1)?.channel_id||'',exclude:ids.slice(-3000)})});}
async function collection(){
 selectedLanguage='mixed';const response=await requestFeed();const data=await response.json();if(disposed)return [];if(!response.ok)throw Error(data.error||'Feed unavailable.');feedItems=data.videos;
 if(!feedItems.length){showNotice(data.status==='insufficient_balanced_content'?'More informational videos are being curated. Please come back later.':'No more videos right now. Please come back later.');return [];}
 return parseIds(feedItems);
}
function report(type='progress'){const item=feedItems[active];if(!item)return;const payload=JSON.stringify({impressionId:item.impressionId,type,watchSeconds:Math.floor(watchSeconds),videoDuration:player&&ready?player.getDuration():0});apiFetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(()=>{});lastReported=watchSeconds;}
function resetTracking(){clearInterval(playbackTimer);watchSeconds=0;lastMediaTime=0;lastReported=0;viewSent=false;playbackTimer=setInterval(()=>{if(!player||!ready||document.hidden||active<0||!visibleEnough(slots[active]))return;const mediaTime=player.getCurrentTime();if(player.getPlayerState()===1){if(!viewSent){viewSent=true;report('view');}const delta=mediaTime-lastMediaTime;if(delta>0&&delta<2.5)watchSeconds+=delta;if(watchSeconds-lastReported>=5)report();}lastMediaTime=mediaTime;},1000);}

function stop(){if(viewSent)report();clearInterval(playbackTimer);generation++;ready=false;pausedForScroll=false;if(player){try{player.destroy()}catch{}player=null;}}
function visibleEnough(slot){const r=slot.section.getBoundingClientRect(),f=feed.getBoundingClientRect();const visible=Math.max(0,Math.min(r.bottom,f.bottom)-Math.max(r.top,f.top));return visible/r.height>.55;}
function select(index){if(!apiReady||index<0||index>=ids.length||document.hidden)return;const slot=slots[index];if(!visibleEnough(slot))return;if(index===active&&player)return;stop();active=index;if(index>=ids.length-3)loadMore();const token=generation;slots.forEach(s=>{s.message.hidden=true;s.retry.hidden=true;s.section.removeAttribute('aria-current');});slot.section.setAttribute('aria-current','true');slot.mount.replaceChildren();const target=document.createElement('div');slot.mount.append(target);
 resetTracking();
 player=new YT.Player(target,{
  width:'100%',height:'100%',videoId:ids[index],
  playerVars:{autoplay:1,controls:0,disablekb:1,fs:0,playsinline:1,rel:0,origin:location.origin},
  events:{onReady:e=>{if(token!==generation)return;ready=true;const frame=e.target.getIframe();frame.title='Curated Short '+(index+1);frame.allow='autoplay; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';if(muted)e.target.mute();else e.target.unMute();if(!document.hidden&&visibleEnough(slot))e.target.playVideo();else e.target.pauseVideo();},
   onStateChange:e=>{if(token!==generation)return;if(e.data===YT.PlayerState.PLAYING){slot.retry.hidden=true;slot.message.hidden=true;if(document.hidden||!visibleEnough(slot))e.target.pauseVideo();else if(!viewSent){viewSent=true;report('view');}}if(e.data===YT.PlayerState.ENDED&&visibleEnough(slot)&&!document.hidden){e.target.seekTo(0,true);e.target.playVideo();}},
   onAutoplayBlocked:()=>{if(token===generation)slot.retry.hidden=false;},
   onError:()=>{if(token!==generation)return;slot.message.textContent='This video is unavailable. Scroll to the next Short.';slot.message.hidden=false;slot.retry.hidden=true;}
  }
 });
}
function closest(){let best=-1,ratio=0;slots.forEach((s,i)=>{const r=s.section.getBoundingClientRect(),f=feed.getBoundingClientRect();const v=Math.max(0,Math.min(r.bottom,f.bottom)-Math.max(r.top,f.top))/r.height;if(v>ratio){ratio=v;best=i}});return ratio>.55?best:-1;}
function update(){const next=closest();if(next>=0)select(next);if(player&&ready){if(document.hidden||active<0||!visibleEnough(slots[active])){player.pauseVideo();pausedForScroll=true;}else if(pausedForScroll){pausedForScroll=false;player.playVideo();}}}
function appendSlots(start){ids.slice(start).forEach((id,offset)=>{const i=start+offset;const section=document.createElement('section');section.className='short';section.setAttribute('aria-label','Short '+(i+1)+' of '+ids.length);const mount=document.createElement('div');mount.className='player';const message=document.createElement('p');message.className='message';message.hidden=true;const retry=document.createElement('button');retry.className='retry';retry.textContent='Tap to play';retry.hidden=true;retry.onclick=()=>{if(player&&ready&&active===i)player.playVideo()};section.append(mount,message,retry);feed.append(section);slots.push({section,mount,message,retry});if(observer)observer.observe(section);});}
function build(){appendSlots(0);observer=new IntersectionObserver(update,{root:feed,threshold:[0,.55,.65,1]});slots.forEach(s=>observer.observe(s.section));
 window.onYouTubeIframeAPIReady=()=>{if(disposed)return;apiReady=true;update()};if(window.YT?.Player){apiReady=true;update();return;}apiScript=document.createElement('script');apiScript.src='https://www.youtube.com/iframe_api';apiScript.onerror=()=>{if(!disposed)showNotice('YouTube could not load. Check your connection and reload.')};document.head.append(apiScript);
}

async function loadMore(){if(loadingMore||noMore||!selectedLanguage)return;loadingMore=true;try{const response=await requestFeed();if(!response.ok)return;const data=await response.json();if(disposed)return;const existing=new Set(ids);const additions=data.videos;if(additions.some(v=>['brainrot','entertainment'].includes(v.topic)&&existing.has(v.id)))throw Error('Duplicate entertainment batch.');if(!additions.length){noMore=true;return;}const start=ids.length;feedItems.push(...additions);ids.push(...parseIds(additions));appendSlots(start);slots.forEach((s,i)=>s.section.setAttribute('aria-label','Short '+(i+1)+' of '+ids.length));}catch{}finally{loadingMore=false;}}

let scrollFrame=0;feed.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(update)},{passive:true,signal:listeners.signal});
feed.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(e.key)){e.preventDefault();const next=Math.max(0,Math.min(ids.length-1,Math.max(active,0)+(['ArrowDown','PageDown'].includes(e.key)?1:-1)));slots[next]?.section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}},{signal:listeners.signal});
// WebView hosts may call this method from a native swipe handler. It never covers the player.
window.shortlistScroll=direction=>{const i=Math.max(0,Math.min(ids.length-1,Math.max(active,0)+(direction>0?1:-1)));slots[i]?.section.scrollIntoView({behavior:'smooth'});};
// Optional native audio control for a WebView with autoplay permitted.
window.shortlistSetMuted=value=>{muted=Boolean(value);if(player&&ready){if(muted)player.mute();else player.unMute();}};
function suspend(){if(viewSent)report();if(player&&ready)player.pauseVideo();}document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(player&&ready&&active>=0&&visibleEnough(slots[active]))player.playVideo();else update()},{signal:listeners.signal});window.addEventListener('pagehide',suspend,{signal:listeners.signal});window.addEventListener('pageshow',()=>{if(player&&ready&&!document.hidden)player.playVideo()},{signal:listeners.signal});
collection().then(v=>{if(disposed)return;ids=v;if(ids.length)build();}).catch(e=>{if(!disposed)showNotice(e.message||'This collection could not be loaded.')});

// Optional Android/app control: start a fresh shuffled feed without adding page chrome.
window.shortlistShuffle=()=>location.reload();

return ()=>{disposed=true;stop();listeners.abort();observer?.disconnect();cancelAnimationFrame(scrollFrame);apiScript?.remove();window.onYouTubeIframeAPIReady=previousReady;delete window.shortlistScroll;delete window.shortlistSetMuted;delete window.shortlistShuffle;feed.replaceChildren();};
}
