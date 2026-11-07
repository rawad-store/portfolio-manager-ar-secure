/* محفظتي — Service Worker
   غيّر رقم VERSION عند كل تحديث للتطبيق ليُحدَّث عند المستخدمين. */
const VERSION='v4';
const CACHE='mahfazati-'+VERSION;
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('mahfazati-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const fresh=(req,ms)=>new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error('timeout')),ms);fetch(req).then(r=>{clearTimeout(t);ok(r)},e=>{clearTimeout(t);no(e)})});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    // الصفحة: الأحدث من الشبكة إن توفرت (3 ثوانٍ) وإلا النسخة المخزنة
    e.respondWith(fresh(req,3000).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp))}return r}).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));
    return}
  if(url.origin===location.origin||/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    // الملفات والخطوط: من الذاكرة فورًا مع تحديثها بالخلفية
    e.respondWith(caches.open(CACHE).then(c=>c.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r}).catch(()=>hit);return hit||net})))}
});
