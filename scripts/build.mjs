import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {loadAssets} from './assets.mjs';
await build();
writeFileSync('build/config.js',readFileSync('public/config.js'));
const assets=loadAssets();
const parts=['operation-names.js','store.js','policy.js','youtube.js','backend.js'].map(file=>readFileSync('worker/'+file,'utf8').replace(/^import .*;\n/gm,'').replace(/export (?=(?:async )?function|const)/g,''));
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js','const ASSETS='+JSON.stringify(assets)+';\n'+parts.join('\n')+'\nexport default {fetch:createApp(ASSETS)};\n');
console.log('React viewer ready: build/; backend Worker artifact: dist/server/index.js');

const edgeParts=['operation-names.js','store.js','policy.js','youtube.js','backend.js','edge-feed.js'].map(file=>readFileSync('worker/'+file,'utf8').replace(/^import .*;\n/gm,'').replace(/export (?=(?:async )?function|const)/g,''));
mkdirSync('supabase/functions/ytshorts-feed',{recursive:true});
writeFileSync('supabase/functions/ytshorts-feed/index.ts',edgeParts.join('\n')+'\nDeno.serve(createEdgeFeed({getEnv:name=>Deno.env.get(name),app:createApp()}));\n');
