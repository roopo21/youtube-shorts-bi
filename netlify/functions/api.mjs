import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createApp} from '../../worker/backend.js';
import {handleNetlify} from '../../worker/netlify-adapter.js';
const assets={};
for(const file of ['admin.html','admin.js','admin.css','coverage.html','coverage.js']){
 const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
 assets['/'+file]={body:readFileSync(join(process.cwd(),'public',file),'utf8'),type};
}
const app=createApp(assets);
export default request=>handleNetlify(request,{...process.env,YTSHORTS_FEED_URL:process.env.YTSHORTS_FEED_URL||'https://hqgkdfaxexdodiozgxoe.supabase.co/functions/v1/ytshorts-feed'},app);
export const config={path:['/api/*','/admin','/admin.html','/admin.js','/admin.css','/coverage.html','/coverage.js']};
