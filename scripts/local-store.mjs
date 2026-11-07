import {readFileSync} from 'node:fs';
const queries=JSON.parse(readFileSync(new URL('./local-operations.json',import.meta.url),'utf8'));
export function localExecutor(database){return async function execute(op,args){if(op==='batch'){database.raw.exec('BEGIN');try{const results=[];for(const item of args)results.push(await execute(item.op,item.args));database.raw.exec('COMMIT');return {results}}catch(e){database.raw.exec('ROLLBACK');throw e}}
 const sql=queries[op];if(!sql)throw Error('Unknown local operation.');const stmt=database.raw.prepare(sql);if(sql.startsWith('SELECT'))return {rows:stmt.all(...args),changes:0};const r=stmt.run(...args);return {rows:[],changes:r.changes};};}
