import {refresh} from '../worker/backend.js';
const languages=process.argv.slice(2);for(const language of languages.length?languages:['hi','mr'])console.log(language,JSON.stringify(await refresh(process.env,language)));
