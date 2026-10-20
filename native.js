/* Android-only helpers (back button + status bar). Does nothing in a normal browser. */
/* ---------- file export (defined always; checks Capacitor at call time) ---------- */
(function(){
  function toast(msg,ms){
    var d=document.createElement('div'); d.textContent=msg;
    d.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:88vw;background:rgba(30,30,30,.95);color:#fff;padding:10px 16px;border-radius:20px;font:14px sans-serif;z-index:2147483647;pointer-events:none';
    (document.body||document.documentElement).appendChild(d); setTimeout(function(){ d.remove(); },ms||2500);
  }
  function say(m,err){ toast(m, err?7000:2500); }
  function toB64(blob){ return new Promise(function(res,rej){
    var r=new FileReader(); r.onload=function(){ res(String(r.result).split(',')[1]||''); }; r.onerror=function(){ rej(r.error||new Error('read failed')); }; r.readAsDataURL(blob); }); }
  function mimeOf(n){ n=n.toLowerCase(); return /\.pdf$/.test(n)?'application/pdf':/\.zip$/.test(n)?'application/zip':'application/octet-stream'; }
  window.__nativeSave=async function(blob,name){
    var C=window.Capacitor;
    if(!C||!C.registerPlugin){ say('Native bridge missing (window.Capacitor not found)',true); return; }
    try{
      var FS=C.registerPlugin('Filesystem'), SH=C.registerPlugin('Share'), SF=C.registerPlugin('SaveFile');
      name=String(name||'file').replace(/[\\/:*?"<>|]+/g,'_');
      say('Preparing '+name+'...');
      var w=await FS.writeFile({path:name,data:await toB64(blob),directory:'CACHE'});
      try{
        await SF.saveAs({path:w.uri,name:name,mime:mimeOf(name)});
        say('Saved: '+name);
      }catch(e1){
        var m1=String(e1&&e1.message||e1);
        if(/cancel/i.test(m1)){ say('Save cancelled'); return; }
        say('Save dialog unavailable ('+m1+'), opening share...',true);
        try{ await SH.share({title:name,url:w.uri,dialogTitle:'Save or share '+name}); }
        catch(e2){ if(/cancel/i.test(String(e2&&e2.message||e2))) say('Export cancelled'); else throw e2; }
      }
    }catch(e){ console.error(e); say('Export failed: '+(e&&e.message||e),true); }
  };
})();

(function(){
  var C=window.Capacitor;
  if(!C||!C.isNativePlatform||!C.isNativePlatform()) return;
  var App=C.registerPlugin('App'), SB=C.registerPlugin('StatusBar');


  /* ---------- status bar colour follows the page ---------- */
  function rgb(c){ var m=(c||'').match(/[\d.]+/g); return m?m.map(Number):null; }
  function hex(n){ n=Math.max(0,Math.min(255,Math.round(n))); return (n<16?'0':'')+n.toString(16); }
  function syncBar(){
    try{
      var cs=getComputedStyle(document.documentElement), v=(cs.getPropertyValue('--bg')||'').trim(), c=null;
      if(/^#[0-9a-f]{6}$/i.test(v)) c=[parseInt(v.substr(1,2),16),parseInt(v.substr(3,2),16),parseInt(v.substr(5,2),16)];
      if(!c) c=rgb(getComputedStyle(document.body).backgroundColor);
      if(!c||(c.length>3&&c[3]===0)) c=rgb(getComputedStyle(document.documentElement).backgroundColor);
      if(!c||(c.length>3&&c[3]===0)) c=[255,255,255];
      var lum=(0.299*c[0]+0.587*c[1]+0.114*c[2])/255;
      SB.setBackgroundColor({color:'#'+hex(c[0])+hex(c[1])+hex(c[2])}).catch(function(){});
      SB.setStyle({style:lum>0.5?'LIGHT':'DARK'}).catch(function(){});
    }catch(e){}
  }
  var t=null; function later(){ clearTimeout(t); t=setTimeout(syncBar,250); }
  try{
    var mo=new MutationObserver(later), o={attributes:true,attributeFilter:['class','style','data-theme']};
    mo.observe(document.documentElement,o); mo.observe(document.body,o);
    if(window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change',later);
  }catch(e){}
  setTimeout(syncBar,300); setTimeout(syncBar,2000);

  /* ---------- back button ---------- */
  function toast(msg,ms){
    var d=document.createElement('div'); d.textContent=msg;
    d.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(30,30,30,.92);color:#fff;padding:9px 16px;border-radius:20px;font:14px sans-serif;z-index:2147483647;pointer-events:none';
    document.body.appendChild(d); setTimeout(function(){ d.remove(); },ms||1800);
  }
  function findOverlays(){
    var out=[], all=document.body.getElementsByTagName('*');
    for(var i=0;i<all.length;i++){
      var el=all[i], tag=el.tagName;
      if(tag==='SCRIPT'||tag==='STYLE'||tag==='CANVAS') continue;
      var s=getComputedStyle(el);
      if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||s.pointerEvents==='none'||parseFloat(s.opacity)<0.05) continue;
      var z=parseInt(s.zIndex,10); if(!(z>=60)) continue;
      var r=el.getBoundingClientRect(); if(r.width<20||r.height<20||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight) continue;
      var full=r.width>=innerWidth*0.85&&r.height>=innerHeight*0.85;
      var pop=el.matches('.menu,.clmenu,[role=dialog],[role=menu]');
      if(full||pop) out.push({el:el,z:z,full:full,i:i});
    }
    out.sort(function(a,b){ return (b.z-a.z)||(b.i-a.i); });
    return out;
  }
  var base=[], tried=[];
  setTimeout(function(){ base=findOverlays().map(function(i){ return i.el; }); },4000);   /* always-visible fixed layers: ignore */
  function closeTop(){
    var list=findOverlays().filter(function(i){ return base.indexOf(i.el)<0; });
    tried=tried.filter(function(e){ return list.some(function(i){ return i.el===e; }); });
    for(var k=0;k<list.length;k++){
      var it=list[k], el=it.el;
      if(tried.indexOf(el)>=0) continue;   /* tried once and it stayed open: skip it */
      tried.push(el);
      var btn=el.querySelector('[data-close],[aria-label*="lose" i],.close,.x,.cancel,[id$="Close"],[id$="Cancel"],[id$="close"],[id$="cancel"]');
      if(btn){ btn.click(); return true; }
      if(it.full){ el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return true; }
      el.style.display='none'; return true;
    }
    return false;
  }
  var lastBack=0;
  App.addListener('backButton',function(){
    var a=document.activeElement;
    if(a&&(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a.isContentEditable)){ a.blur(); return; }
    if(closeTop()) return;
    var ev=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true});
    document.dispatchEvent(ev);
    if(ev.defaultPrevented) return;
    var now=Date.now();
    if(now-lastBack<2000){ App.minimizeApp(); return; }   /* minimize, never kill: no lost work */
    lastBack=now; toast('Press back again to exit');
  });
})();
