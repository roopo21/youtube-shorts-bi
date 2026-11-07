import {refresh} from '../../worker/backend.js';
import {handleNetlify} from '../../worker/netlify-adapter.js';
export default async request=>{
 // Background invocations still authenticate before touching the catalogue.
 const secured=new Request(new URL('/api/admin/background',request.url),request);
 return handleNetlify(secured,process.env,async(_request,env)=>{
  const results=await Promise.all(['hi','mr'].map(async language=>({language,...await refresh(env,language)})));
  console.log('YouTube discovery complete:',JSON.stringify(results));
  return Response.json({results});
 });
};
export const config={background:true};
