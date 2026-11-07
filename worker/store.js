import {OPERATIONS} from './operation-names.js';
const operationSet=new Set(OPERATIONS);
async function executeData(env,op,args){
 if(!operationSet.has(op)&&op!=='batch')throw Error('Unknown data operation.');
 if(typeof env.LOCAL_EXECUTE==='function')return env.LOCAL_EXECUTE(op,args);
 if(!env.YTSHORTS_DATA_URL||!env.YTSHORTS_BACKEND_TOKEN)throw Error('Supabase data service is not configured.');
 const response=await fetch(env.YTSHORTS_DATA_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Ytshorts-Token':env.YTSHORTS_BACKEND_TOKEN},body:JSON.stringify({op,args}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Supabase data service failed ('+response.status+').');
 return response.json();
}
export function statement(env,op){if(!operationSet.has(op))throw Error('Unknown data operation.');let args=[];return {op,get args(){return args},bind(...values){args=values;return this},async first(){return (await executeData(env,op,args)).rows[0]||null},async all(){return {results:(await executeData(env,op,args)).rows}},async run(){return {meta:{changes:(await executeData(env,op,args)).changes}}}};}
export async function batch(env,statements){const result=await executeData(env,'batch',statements.map(s=>({op:s.op,args:s.args})));return result.results.map(r=>({results:r.rows,meta:{changes:r.changes}}));}
