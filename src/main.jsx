import React, {useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {mountViewer} from './viewer.js';
import './style.css';
function ShortsViewer(){
 const feed=useRef(null),notice=useRef(null);
 useEffect(()=>mountViewer(feed.current,notice.current),[]);
 return <><main ref={feed} id="feed" aria-label="Curated Shorts" tabIndex={0}/><p ref={notice} id="notice" role="status" hidden/></>;
}
createRoot(document.getElementById('root')).render(<ShortsViewer/>);
