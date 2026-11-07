import {readFileSync,mkdirSync} from 'node:fs';import {database} from './local-db.mjs';
mkdirSync('.sites-runtime',{recursive:true});const db=database('.sites-runtime/shortlist.db').raw;
const seeds=JSON.parse(readFileSync('data/starter-catalogue.json','utf8')).filter(v=>v.status==='approved');
const entertainment=JSON.parse(readFileSync('data/entertainment-selection.json','utf8'));
const insert=db.prepare('INSERT OR IGNORE INTO videos VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
for(const v of [...seeds,...entertainment])insert.run(v.id,v.title,v.channel_id||'source:'+v.channel_title,v.channel_title||'',v.language,v.audio_language||null,v.topic,v.duration||0,'approved',v.published_at||new Date().toISOString(),Date.now(),seeds.includes(v)?'human_reviewed':'experimental_local_fixture');
console.log('Seeded local development fixture. Public metadata only; experimental videos are not individually verified.');
