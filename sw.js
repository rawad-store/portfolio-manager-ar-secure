/* محفظتي — Service Worker
   غيّر رقم VERSION عند كل تحديث للتطبيق ليُحدَّث عند المستخدمين. */
const VERSION='v20';
const CACHE='mahfazati-'+VERSION;
const CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];
// cache:'reload' يتجاوز ذاكرة HTTP فلا يُخزَّن إصدار قديم من الصفحة عند التثبيت.
// allSettled: غياب ملف واحد (مثل أيقونة) لا يُفشل التثبيت كله.
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(u=>c.add(new Request(u,{cache:'reload'}))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('mahfazati-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const offline=()=>new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body dir="rtl" style="font-family:system-ui;padding:2rem"><h1>لا يوجد اتصال</h1><p>افتح التطبيق مرة واحدة متصلًا بالإنترنت ليُحفظ للعمل دون اتصال.</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
const cachedPage=async()=>(await caches.match('./index.html',{ignoreSearch:true}))||(await caches.match('./'));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    // الصفحة: الأحدث من الشبكة إن ردّت خلال 3 ثوانٍ وإلا النسخة المخزنة (تتجاهل ?a= و ?t=).
    // no-cache: يتحقق من الخادم (304 رخيص) بدل الاكتفاء بنسخة ذاكرة HTTP التي قد تبقى 10 دقائق.
    // Promise.resolve().then: أي استثناء متزامن يتحول إلى رفض فيسقط الكود إلى النسخة المخزنة.
    // الطلب يُكمل في الخلفية ويحدّث المخزن حتى لو تأخر، والرد الخاطئ (404/500) لا يحلّ محل النسخة المخزنة.
    const net=Promise.resolve().then(()=>fetch(req,{cache:'no-cache'})).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp))}return r});
    e.waitUntil(net.catch(()=>{}));
    e.respondWith((async()=>{
      try{
        const r=await Promise.race([net,new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),3000))]);
        if(r.ok)return r;
        return (await cachedPage())||r;
      }catch(_){return (await cachedPage())||offline()}
    })());
    return}
  // الملفات المحلية فقط (لا خطوط خارجية): من الذاكرة فورًا مع تحديثها بالخلفية.
  // نخزّن الردود الناجحة (ok) من نفس الأصل فقط — الردود المعتمة (opaque) ليست ok فلا تُخزَّن، وهي تُحسب كحصة تخزين كبيرة.
  if(url.origin===location.origin){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE),hit=await c.match(req);
      const net=fetch(req).then(r=>{if(r&&r.ok)c.put(req,r.clone());return r}).catch(()=>null);
      if(hit){e.waitUntil(net);return hit}
      return (await net)||Response.error();
    })())}
});
