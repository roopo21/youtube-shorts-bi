import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react(),{name:'shortlist-runtime-config',transformIndexHtml:{order:'post',handler:()=>[{tag:'script',attrs:{src:'/config.js'},injectTo:'head-prepend'}]}}],
 publicDir:false,
 build:{outDir:'build',emptyOutDir:true},
 server:{host:'127.0.0.1',port:5173,proxy:{'/api':'http://localhost:4175','/admin':'http://localhost:4175','/coverage':'http://localhost:4175','/config.js':'http://localhost:4175'}},
});
