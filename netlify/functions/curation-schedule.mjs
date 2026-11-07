// Internal schedule only; Netlify does not expose scheduled functions as public URLs.
export default async()=>{
 if(!process.env.ADMIN_USER||!process.env.ADMIN_PASSWORD)throw Error('Curator credentials are not configured.');
 const base=process.env.URL||'https://youtube-shorts-bi-roopo21.netlify.app';
 const response=await fetch(base+'/.netlify/functions/curation-background',{method:'POST',headers:{authorization:'Basic '+Buffer.from(process.env.ADMIN_USER+':'+process.env.ADMIN_PASSWORD).toString('base64'),'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 if(response.status!==202)throw Error('Discovery background job was not accepted.');
 console.log('Private YouTube discovery job queued.');
 return new Response(null,{status:204});
};
export const config={schedule:'0 */6 * * *'};
