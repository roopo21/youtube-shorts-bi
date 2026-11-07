import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(0,'utf8'));const records=JSON.parse(readFileSync(config.file,'utf8'));let imported=0;
for(let i=0;i<records.length;i+=100){const chunk=records.slice(i,i+100).map(v=>({...v,status:'candidate'}));const r=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json','X-Ytshorts-Token':config.token},body:JSON.stringify({op:'discovery_import',args:chunk}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Import failed with status '+r.status);const result=await r.json();imported+=Number(result.changes);}
if(config.selectionKey){const r=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json','X-Ytshorts-Token':config.token},body:JSON.stringify({op:'setting_put',args:[config.selectionKey,JSON.stringify(records.map(v=>v.id))]})});if(!r.ok)throw Error('Selection manifest failed.');}
console.log(JSON.stringify({imported,input:records.length}));
