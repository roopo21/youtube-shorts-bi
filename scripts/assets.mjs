import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,extname} from 'node:path';
export function loadAssets(){
 const assets={},types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
 function walk(dir,prefix=''){for(const file of readdirSync(dir,{withFileTypes:true})){const path=join(dir,file.name),url=prefix+'/'+file.name;if(file.isDirectory())walk(path,url);else assets[url]={body:readFileSync(path,'utf8'),type:types[extname(path)]||'application/octet-stream'};}}
 walk('public');if(existsSync('build'))walk('build');
 return assets;
}
