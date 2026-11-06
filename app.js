/* =====================================================================
   محفظتي الاحترافية — app.js (النسخة النهائية المصحّحة v5)
   - AES-GCM + PBKDF2 600k
   - بدون أي بيانات مالية في SEED
   - تصحيح كامل للأخطاء المعروفة
   ===================================================================== */

'use strict';

/* ═══════════ SEED فارغ ═══════════ */
const SEED = {
  usd: 56, oz: 3880, cut: "", due: "",
  tx: [],
  man: { cr: 0, cd: "", sm: 0, sc: 0, cb: 0, lv: 0 },
  cash: [],
  cert: { p: 0, c: 0, r: [0, 0, 0, 0], dates: ["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"] },
  q: [],
  zk: { paid: 0, h: [], year: new Date().getFullYear() },
  im: [],
  re: { up: 0, mo: 0, n: 0, start: "", x: [] },
  plan: { Stocks: 0, Gold: 0, Crypto: 0, Library: 0, Cash: 0 },
  targets: { Gold: 0.25, Stocks: 0.25, Cert: 0.15, Crypto: 0.05, Cash: 0.18, RE: 0.12, Library: 0 },
  annual: { currentYear: new Date().getFullYear(), viewYear: new Date().getFullYear(), archived: {} }
};

let S = JSON.parse(JSON.stringify(SEED));
let tab = 'ov', flt = '', fltYear = '', cur = 'Gold';
let Q = { i: 'Stocks', k: 'dep', on: false };

const K = 'wlt1';
const SECURE_K = 'wlt1_secure_v1';
let isUnlocked = false, lockTimer = null;

/* ═══════════ DOM HELPERS ═══════════ */
const $ = s => document.querySelector(s);
const E = x => String(x ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const num = x => Number.isFinite(Number(x)) ? Number(x) : 0;
const N = (x, d = 0) => num(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const P = (x, f = '—') => Number.isFinite(Number(x)) ? (Number(x) * 100).toFixed(1) + '%' : f;
const sg = x => (num(x) > 0 ? '+' : '') + N(x);
const cl = x => num(x) > 0 ? 'up' : num(x) < 0 ? 'dn' : 'mu';
const td = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const yearOf = d => { const y = String(d || '').slice(0, 4); return /^\d{4}$/.test(y) ? +y : null; };
const TY = { Crypto: 'كريبتو', Gold: 'ذهب', Stocks: 'بورصة', Fee: 'رسوم', Tathir: 'تطهير', Profit: 'أرباح', Library: 'مكتبة', RealEstate: 'عقار' };

function st(t) { const e = $('#st'); if (e) e.textContent = t; }

/* ═══════════ CRYPTO VAULT ═══════════ */
const enc = new TextEncoder(), dec = new TextDecoder();
let vaultKey = null, vaultSalt = null, vaultIterations = 600000;

function b64(bytes) { let s = ''; bytes.forEach(x => s += String.fromCharCode(x)); return btoa(s); }
function unb64(s) { const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); }

async function deriveKey(password, salt, it = 600000) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function encryptPayload(value) {
  if (!vaultKey || !vaultSalt) throw new Error('vault not initialized');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, enc.encode(JSON.stringify(value))));
  return JSON.stringify({ v: 1, it: vaultIterations, salt: b64(vaultSalt), iv: b64(iv), data: b64(ct) });
}

async function decryptPayload(raw, password) {
  const o = JSON.parse(raw);
  if (!o || o.v !== 1) throw new Error('unsupported');
  const it = Number.isInteger(+o.it) && +o.it >= 100000 ? +o.it : 250000;
  const salt = unb64(o.salt);
  const key = await deriveKey(password, salt, it);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data));
  return { data: JSON.parse(dec.decode(plain)), key, salt, it };
}

async function save() {
  if (!isUnlocked) return false;
  try {
    localStorage.setItem(SECURE_K, await encryptPayload(S));
    st('حُفظ ' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    return true;
  } catch (e) {
    st('تعذر الحفظ');
    return false;
  }
}

/* ═══════════ LOCK / UNLOCK ═══════════ */
function showLock(setup = false) {
  const box = $('#lockScreen');
  box.hidden = false;
  $('#lockTitle').textContent = setup ? 'إنشاء حماية المحفظة' : 'محفظتي محمية';
  $('#lockText').textContent = setup ? 'أنشئ كلمة مرور من 8 أحرف على الأقل لتشفير بياناتك على هذا الجهاز.' : 'أدخل كلمة المرور لفك تشفير بياناتك المحلية.';
  $('#lockConfirmWrap').hidden = !setup;
  $('#restoreWrap').hidden = !setup;
  $('#lockSubmit').textContent = setup ? 'تفعيل الحماية' : 'فتح التطبيق';
  $('#lockPassword').value = '';
  $('#lockConfirm').value = '';
  $('#lockError').textContent = '';
  setTimeout(() => $('#lockPassword').focus(), 50);
}

function hideLock() {
  $('#lockScreen').hidden = true;
  $('#lockPassword').value = '';
  $('#lockConfirm').value = '';
}

function lockApp() {
  if (!isUnlocked) return;
  isUnlocked = false;
  vaultKey = null;
  vaultSalt = null;
  vaultIterations = 600000;
  clearTimeout(lockTimer);
  location.reload();
}

function armAutoLock() {
  clearTimeout(lockTimer);
  if (!$('#pwModal')?.hidden) return;
  lockTimer = setTimeout(lockApp, 5 * 60 * 1000);
}

function changePassword() {
  $('#pwModal').hidden = false;
  $('#newPassword').value = '';
  $('#newPasswordConfirm').value = '';
  $('#pwError').textContent = '';
  setTimeout(() => $('#newPassword').focus(), 30);
}

async function applyPasswordChange(e) {
  e.preventDefault();
  const next = $('#newPassword').value, confirm = $('#newPasswordConfirm').value;
  if (next.length < 8) { $('#pwError').textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'; return; }
  if (next !== confirm) { $('#pwError').textContent = 'كلمتا المرور غير متطابقتين'; return; }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(next, salt, 600000);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(S))));
    localStorage.setItem(SECURE_K, JSON.stringify({ v: 1, it: 600000, salt: b64(salt), iv: b64(iv), data: b64(ct) }));
    vaultKey = key; vaultSalt = salt; vaultIterations = 600000;
    $('#pwModal').hidden = true;
    st('تم تغيير كلمة المرور');
    armAutoLock();
  } catch (err) {
    console.error(err);
    $('#pwError').textContent = 'تعذر حفظ التغيير';
  }
}

/* ═══════════ MIGRATION ═══════════ */
function mig() {
  const cp = o => JSON.parse(JSON.stringify(o));
  if (!Array.isArray(S.tx)) S.tx = [];
  if (!S.man || typeof S.man !== 'object') S.man = cp(SEED.man);
  if (!Array.isArray(S.im)) S.im = [];
  if (!S.plan || typeof S.plan !== 'object') S.plan = cp(SEED.plan);
  if (!S.targets || typeof S.targets !== 'object') S.targets = cp(SEED.targets);
  if (!S.re || typeof S.re !== 'object') S.re = cp(SEED.re);
  if (!Array.isArray(S.re.x)) S.re.x = [];
  if (!S.cert || typeof S.cert !== 'object') S.cert = cp(SEED.cert);
  if (!Array.isArray(S.cert.r)) S.cert.r = [0, 0, 0, 0];
  if (!Array.isArray(S.cert.dates)) S.cert.dates = cp(SEED.cert.dates);
  if (!Array.isArray(S.q)) S.q = [];
  if (!S.zk || typeof S.zk !== 'object') S.zk = cp(SEED.zk);
  if (!Array.isArray(S.zk.h)) S.zk.h = [];
  if (!Number.isInteger(+S.zk.year)) S.zk.year = new Date().getFullYear();
  if (!Array.isArray(S.cash)) S.cash = [];
  ['usd', 'oz'].forEach(k => { S[k] = Number.isFinite(+S[k]) && +S[k] > 0 ? +S[k] : SEED[k]; });
  ['cr', 'sm', 'sc', 'cb', 'lv'].forEach(k => { S.man[k] = Number.isFinite(+S.man[k]) ? +S.man[k] : 0; });
  ['c', 'p'].forEach(k => { S.cert[k] = Number.isFinite(+S.cert[k]) ? +S.cert[k] : 0; });
  ['up', 'mo', 'n'].forEach(k => { S.re[k] = Number.isFinite(+S.re[k]) && +S.re[k] >= 0 ? +S.re[k] : 0; });
  if (!S.annual || typeof S.annual !== 'object') S.annual = cp(SEED.annual);
  if (!Number.isInteger(+S.annual.currentYear)) S.annual.currentYear = new Date().getFullYear();
  if (!Number.isInteger(+S.annual.viewYear)) S.annual.viewYear = S.annual.currentYear;
  if (!S.annual.archived || typeof S.annual.archived !== 'object') S.annual.archived = {};
  delete S.inc;
}

/* ═══════════ CERTIFICATE ═══════════ */
function certCalc() {
  let balance = num(S.cert.p);
  const rows = [];
  (S.cert.r || []).forEach((rate, i) => {
    const date = S.cert.dates[i] || '';
    const earned = !!date && date <= td();
    const profit = earned ? balance * num(rate) : 0;
    if (earned) balance += profit;
    rows.push({ i, date, rate: num(rate), earned, profit, balance });
  });
  return { value: balance, rows };
}

/* ═══════════ CORE CALC ═══════════ */
function RT() {
  return num(S.re.up) + num(S.re.mo) * num(S.re.n) + S.re.x.reduce((s, x) => s + num(x[1]), 0);
}

function C() {
  const ia = (k, from = '') => S.im.reduce((a, m) => (m.d >= from ? a + num((m.a || {})[k]) : a), 0);
  const inc = { bors: ia('Stocks'), gold: ia('Gold'), crypto: ia('Crypto'), lib: ia('Library'), re: ia('RealEstate'), cash: ia('Cash') };
  const i2 = ['Stocks', 'Gold', 'Library', 'RealEstate', 'Cash', 'Crypto'].reduce((a, k) => a + ia(k, '2026-01-01'), 0);
  const t = S.tx;
  const sum = (ty, idx, f) => t.filter(x => x[0] === ty && (!f || f(x))).reduce((a, x) => a + num(x[idx]), 0);

  const u = num(S.usd) || 1;
  const gp = num(S.oz) / 31.1034768 * u;
  const g = sum('Gold', 4);
  const goldV = g * gp;
  const goldC = sum('Gold', 5) + inc.gold;

  const cap = sum('Crypto', 3) + inc.crypto / u;
  const crV = num(S.man.cr) * u;

  const dep = sum('Stocks', 5) + inc.bors;
  const fee = sum('Fee', 5);
  const th = sum('Tathir', 5);
  const inv = dep + fee + th;
  const app = num(S.man.sm) + num(S.man.sc);
  const prof = sum('Profit', 5) - th - fee;

  const cv = certCalc().value;

  const fx = { USD: u, QAR: u / 3.65, SAR: u / 3.65, EGP: 1 };
  const cash = S.cash.reduce((a, c) => a + num(c[2]) * (fx[c[1]] || 1), 0) + inc.cash;

  const re = sum('RealEstate', 5) + inc.re;
  const lib = num(S.man.lv);
  const libC = sum('Library', 5) + inc.lib;

  const tg = S.targets || SEED.targets;
  const rows = [
    ['الذهب', goldV, tg.Gold, 'var(--au)'],
    ['البورصة', app, tg.Stocks, '#2F7F86'],
    ['شهادة فيصل', cv, tg.Cert, '#6C7FA0'],
    ['كريبتو', crV, tg.Crypto, '#8A63A8'],
    ['نقدية', cash, tg.Cash, '#7FA35C'],
    ['عقار', re, tg.RE, '#B5694A'],
    ['مكتبة', lib, tg.Library, '#8C8C8C']
  ];
  const total = rows.reduce((a, r) => a + r[1], 0);

  const i26 = ['Stocks', 'Library', 'RealEstate', 'Gold'].reduce((a, y) => a + sum(y, 5, x => x[1] >= '2026-01-01'), 0)
    + sum('Crypto', 3, x => x[1] >= '2026-01-01') * u + i2;

  const days = /^\d{4}-\d{2}-\d{2}$/.test(S.due || '') ? Math.ceil((new Date(S.due + 'T00:00:00') - new Date(td() + 'T00:00:00')) / 864e5) : null;

  const reTotal = RT();
  const liab = Math.max(0, reTotal - re);
  const rn = num(S.re.mo) > 0 ? Math.ceil(Math.max(0, num(S.re.mo) * num(S.re.n) - Math.max(0, re - num(S.re.up) - S.re.x.reduce((s, x) => s + num(x[2]), 0))) / num(S.re.mo)) : 0;

  const byType = {};
  t.forEach(x => {
    const ty = x[0]; if (!byType[ty]) byType[ty] = { n: 0, egp: 0, usdt: 0, g: 0 };
    byType[ty].n++; byType[ty].egp += num(x[5]); byType[ty].usdt += num(x[3]); byType[ty].g += num(x[4]);
  });

  return {
    inc, u, gp, g, goldV, goldC, cap, crV, dep, fee, th, inv, app, prof, cv, cash, re, lib, libC,
    rows, total, i26, days, liab, rn, reTotal, fx, byType
  };
}

/* ═══════════ HELPERS FOR HTML ═══════════ */
const inp = (p, v, t = 'number') => `<input data-p="${E(p)}" type="${E(t)}" step="any" inputmode="${t === 'number' ? 'decimal' : 'text'}" value="${E(v)}">`;
const fl = (l, p, v, t) => `<label>${l}${inp(p, v, t)}</label>`;
const kp = (l, v, s = '', c = '') => `<div class="k"><span>${l}</span><b class="${c}">${v}</b><i>${s || ''}</i></div>`;

/* ═══════════ OVERVIEW ═══════════ */
const KS = ['Gold', 'Stocks', 'Cert', 'Crypto', 'Cash', 'RE', 'Library'];
const KN = { Gold: 'الذهب', Stocks: 'البورصة', Cert: 'شهادة فيصل', Crypto: 'كريبتو', Cash: 'النقدية', RE: 'العقار', Library: 'المكتبة' };
const KT = { Gold: ['Gold'], Stocks: ['Stocks', 'Fee', 'Tathir', 'Profit'], Crypto: ['Crypto'], Library: ['Library'], RE: ['RealEstate'] };
const KI = { Gold: 'Gold', Stocks: 'Stocks', Crypto: 'Crypto', Library: 'Library', RE: 'RealEstate', Cash: 'Cash' };

function vOv(c) {
  const base = (S.q.find(x => x[0] === '2025-Q4') || ['', 0])[1];
  const net = c.total - base - c.i26;
  const qs = [...S.q, ['الآن', c.total]];
  const mx = Math.max(1, ...qs.map(x => num(x[1])));
  const zk = Math.max(0, c.total * 0.025 - num(S.zk.paid));
  const zc = c.days === null ? 'mu' : c.days <= 30 ? 'dn' : c.days <= 60 ? 'au' : 'up';
  const gg = c.goldV - c.goldC;
  const sg2 = c.app - c.inv;
  const ug = num(S.man.sm) - num(S.man.cb);
  const netWorth = c.total - c.liab;

  return `<div class="hero">
    <small>إجمالي الثروة (ج.م)</small>
    <b>${N(c.total)}</b>
    <small>≈ $${N(c.u ? c.total / c.u : 0)} · صافي الثروة بعد التزامات: <b>${N(netWorth)}</b></small>
    ${base ? `<small>منذ نهاية 2025: <span class="${cl(c.total - base)}">${sg(c.total - base)}</span> (ضخّ ${N(c.i26)} · أداء فعلي <span class="${cl(net)}">${sg(net)} / ${P(base ? net / base : 0)}</span>)</small>` : ''}
  </div>
  <div class="bar">${c.rows.map(r => `<i style="width:${c.total > 0 ? r[1] / c.total * 100 : 0}%;background:${r[3]}"></i>`).join('')}</div>
  <div class="ks">
    ${kp('ربح الذهب غير المحقق', sg(gg), P(c.goldC ? gg / c.goldC : 0) + ' على التكلفة', cl(gg))}
    ${kp('ربح البورصة الكلي', sg(sg2), 'غير محقق ' + sg(ug), cl(sg2))}
    ${kp('أرباح محققة صافية', N(c.prof), 'بعد التطهير والرسوم', 'up')}
    ${kp('كريبتو', P(c.cap ? num(S.man.cr) / c.cap - 1 : 0), N(S.man.cr) + ' من ' + N(c.cap) + ' USDT', cl(num(S.man.cr) - c.cap))}
    ${kp('الزكاة المتبقية', N(zk), c.days === null ? 'موعد غير محدد' : 'باقٍ ' + c.days + ' يوم', zc)}
    ${kp('التزام العقار', N(c.liab), c.rn + ' قسط متبقٍ', 'au')}
  </div>
  <section class="c"><h2>التوزيع مقابل الهدف</h2>
    <div class="tb"><table>
      <tr><th>الأصل</th><th>القيمة</th><th>الحالي</th><th>الهدف</th><th>الفرق</th></tr>
      ${c.rows.map((r, i) => {
        const p = c.total ? r[1] / c.total : 0;
        const d = p - r[2];
        return `<tr data-st="${KS[i]}" style="cursor:pointer">
          <td><s style="background:${r[3]}"></s>${E(r[0])} ›</td>
          <td>${N(r[1])}</td><td>${P(p)}</td><td>${r[2] ? P(r[2]) : '—'}</td>
          <td class="${Math.abs(d) > 0.05 ? (d > 0 ? 'au' : 'dn') : 'mu'}">${sg(d * 100)} نقطة</td>
        </tr>`;
      }).join('')}
    </table></div>
  </section>
  <section class="c"><h2>الأرصدة الربعية (ألف ج.م)</h2>
    ${qs.length ? `<div class="ch">${qs.map(x => `<div><em>${N(x[1] / 1e3)}</em><b style="height:${mx > 0 ? num(x[1]) / mx * 100 : 0}%"></b><span>${E(x[0])}</span></div>`).join('')}</div>` : '<p class="mu">لم تُثبَّت أرصدة ربعية بعد.</p>'}
  </section>`;
}

/* ═══════════ INVESTMENTS LIST ═══════════ */
function vInv(c) {
  return `<div class="il">
    ${c.rows.map((r, j) => {
      const k = KS[j];
      const b = { Gold: c.goldC, Stocks: c.inv, Crypto: c.cap * c.u, Library: c.libC, Cert: num(S.cert.p) }[k];
      const pl = b === undefined ? null : r[1] - b;
      return `<button class="ir" data-st="${k}">
        <s style="background:${r[3]}"></s>
        <span><b>${KN[k]}</b><i>${P(c.total ? r[1] / c.total : 0)} من المحفظة</i></span>
        <span><b>${N(r[1])}</b>${pl === null ? `<i>${k === 'RE' ? P(c.reTotal ? c.re / c.reTotal : 0) + ' من الخطة' : 'سيولة'}</i>` : `<i class="${cl(pl)}">${sg(pl)} · ${P(b ? pl / b : 0)}</i>`}</span>
      </button>`;
    }).join('')}
  </div>`;
}

/* ═══════════ LEDGER (for asset detail) ═══════════ */
function cleanStock(s) {
  return String(s || '').replace(/^(ارباح |أرباح )?(توزيعات|إغلاق)\s+/, '').replace(/ (جزء|نهائي)$/, '').trim();
}

function lg(k) {
  const r = [];
  S.tx.forEach((x, i) => {
    if ((KT[k] || []).includes(x[0])) r.push({
      d: x[1], s: x[2] + (x[4] ? ' · ' + N(x[4], 3) + ' جم' : '') + (k === 'Stocks' && x[0] !== 'Stocks' ? ' (' + TY[x[0]] + ')' : ''),
      a: k === 'Crypto' ? num(x[3]) : num(x[5]), i, ty: x[0]
    });
  });
  S.im.forEach(m => { if (num((m.a || {})[KI[k]])) r.push({ d: m.d, s: 'من دخل ' + m.d.slice(0, 7), a: num(m.a[KI[k]]), i: -1, ty: KI[k] }); });
  r.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  let run = 0;
  r.forEach(x => { run += (k !== 'Stocks' || x.ty === KI[k]) ? x.a : 0; x.run = run; });
  return r;
}

const sp = v => {
  if (v.length < 2) return '';
  const mx = Math.max(...v), mn = Math.min(...v, 0);
  return `<svg class="spark" viewBox="0 0 300 56" width="100%" height="56" preserveAspectRatio="none"><polyline points="${v.map((y, i) => (i / (v.length - 1) * 300).toFixed(1) + ',' + (54 - (y - mn) / (mx - mn || 1) * 52).toFixed(1)).join(' ')}" fill="none" stroke="var(--ac)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
};

/* ═══════════ PRICES / BALANCES ═══════════ */
function vPf(c) {
  const m = S.man, gg = c.goldV - c.goldC;
  return `<section class="c"><h2>الأسعار المرجعية</h2>
    <div class="g">${fl('دولار / جنيه', 'usd', S.usd)}${fl('أونصة الذهب ($)', 'oz', S.oz)}</div>
    <span class="mu">سعر جرام 24: ${N(c.gp)} ج.م</span>
  </section>
  <section class="c"><h2>الذهب</h2><div class="ks">
    ${kp('الوزن (24K)', N(c.g, 3) + ' جم')}${kp('القيمة', N(c.goldV))}
    ${kp('التكلفة', N(c.goldC))}${kp('الربح', sg(gg), P(c.goldC ? gg / c.goldC : 0), cl(gg))}
  </div></section>
  <section class="c"><h2>البورصة</h2>
    <div class="g">${fl('القيمة السوقية للأسهم', 'man.sm', m.sm)}${fl('كاش داخل التطبيق', 'man.sc', m.sc)}${fl('تكلفة الأسهم (Cost Basis)', 'man.cb', m.cb)}</div>
    <div class="ks">
      ${kp('رأس المال المستثمر', N(c.inv), 'إيداع ' + N(c.dep) + ' + رسوم ' + N(c.fee) + ' + تطهير ' + N(c.th))}
      ${kp('الربح الكلي', sg(c.app - c.inv), P(c.inv ? (c.app - c.inv) / c.inv : 0), cl(c.app - c.inv))}
      ${kp('غير المحقق', sg(m.sm - m.cb), P(m.cb ? (m.sm - m.cb) / m.cb : 0), cl(m.sm - m.cb))}
    </div>
  </section>
  <section class="c"><h2>كريبتو</h2>
    <div class="g">${fl('الرصيد (USDT)', 'man.cr', m.cr)}${fl('تاريخ التحديث', 'man.cd', m.cd, 'date')}</div>
    <span class="mu">رأس المال ${N(c.cap, 2)} USDT · القيمة ${N(c.crV)} ج.م</span>
  </section>
  <section class="c"><h2>مكتبة · عقار · شهادة</h2>
    <div class="g">${fl('قيمة المكتبة الحالية', 'man.lv', m.lv)}</div>
    <div class="ks">
      ${kp('المكتبة', sg(c.lib - c.libC), 'تكلفة ' + N(c.libC), cl(c.lib - c.libC))}
      ${kp('العقار (بالتكلفة)', N(c.re))}
      ${kp('شهادة فيصل', N(c.cv), 'أصل ' + N(S.cert.p) + ' · أرباح ' + N(c.cv - S.cert.p))}
    </div>
  </section>
  <section class="c"><h2>النقدية</h2>
    <div class="g">${S.cash.map((x, i) => fl(E(x[0]) + ' (' + E(x[1]) + ')', 'cash.' + i + '.2', x[2])).join('')}</div>
    <p class="mu">الإجمالي: ${N(c.cash)} ج.م</p>
  </section>
  <section class="c"><h2>شهادة فيصل — الأرباع</h2>
    <div class="g">${fl('أصل الشهادة', 'cert.p', S.cert.p)}</div>
    <div class="tb"><table>
      <tr><th>الربع</th><th>الاستحقاق</th><th>النسبة</th><th>الربح</th><th>الرصيد</th></tr>
      ${certCalc().rows.map(r => `<tr>
        <td>Q${r.i + 1} ${r.earned ? '✓' : ''}</td>
        <td>${E(r.date)}</td>
        <td>${fl('', 'cert.r.' + r.i, r.rate)}</td>
        <td>${N(r.profit)}</td>
        <td>${N(r.balance)}</td>
      </tr>`).join('')}
    </table></div>
    <p class="mu">يمكن تعديل نسبة كل ربع. الأرباع المستقبلية لا تُحتسب قبل تاريخ استحقاقها.</p>
  </section>
  <section class="c"><h2>أهداف التوزيع (%)</h2>
    <div class="g">
      ${fl('ذهب', 'targets.Gold', (S.targets.Gold * 100).toFixed(0))}
      ${fl('بورصة', 'targets.Stocks', (S.targets.Stocks * 100).toFixed(0))}
      ${fl('شهادة', 'targets.Cert', (S.targets.Cert * 100).toFixed(0))}
      ${fl('كريبتو', 'targets.Crypto', (S.targets.Crypto * 100).toFixed(0))}
      ${fl('نقدية', 'targets.Cash', (S.targets.Cash * 100).toFixed(0))}
      ${fl('عقار', 'targets.RE', (S.targets.RE * 100).toFixed(0))}
      ${fl('مكتبة', 'targets.Library', (S.targets.Library * 100).toFixed(0))}
    </div>
  </section>`;
}

/* ═══════════ TRANSACTIONS ═══════════ */
function txFiltered() { return S.tx.filter(x => (!flt || x[0] === flt) && (!fltYear || String(x[1]).slice(0, 4) === fltYear)); }
function txTotals(list) { return list.reduce((a, x) => { a.egp += num(x[5]); a.usdt += num(x[3]); a.gold += num(x[4]); a.count++; return a; }, { egp: 0, usdt: 0, gold: 0, count: 0 }); }

function vTx(c) {
  const L = S.tx.map((x, i) => [x, i]).filter(z => (!flt || z[0][0] === flt) && (!fltYear || String(z[0][1]).slice(0, 4) === fltYear)).reverse();
  const allYears = [...new Set(S.tx.map(x => String(x[1]).slice(0, 4)).filter(Boolean))].sort().reverse();
  const tot = txTotals(L.map(z => z[0]));
  return `<section class="c"><h2>إضافة عملية</h2>
    <form id="tf" onsubmit="return false">
      <div class="g">
        <label>النوع<select name="ty">${Object.entries(TY).map(e => `<option value="${e[0]}">${e[1]}</option>`).join('')}</select></label>
        <label>التاريخ<input name="dt" type="date" value="${td()}"></label>
        <label>الوصف<input name="ds"></label>
        <label>مبلغ ج.م<input name="eg" type="number" step="any" inputmode="decimal"></label>
        <label>USDT<input name="us" type="number" step="any" inputmode="decimal"></label>
        <label>ذهب 24 (جم)<input name="gm" type="number" step="any" inputmode="decimal"></label>
      </div>
      <button class="p" data-a="add">＋ إضافة</button>
    </form>
  </section>
  <section class="c"><h2>السجل (${L.length})</h2>
    <div class="g">
      <label>تصفية النوع<select data-f="1"><option value="">الكل</option>
        ${Object.entries(TY).map(e => `<option value="${e[0]}"${flt === e[0] ? ' selected' : ''}>${e[1]}</option>`).join('')}
      </select></label>
      <label>السنة<select data-fy="1"><option value="">كل السنوات</option>
        ${allYears.map(y => `<option value="${y}"${fltYear === y ? ' selected' : ''}>${y}</option>`).join('')}
      </select></label>
    </div>
    <div class="ks filter-total" style="border-top:2px solid var(--ac);padding-top:10px">
      ${kp('إجمالي ج.م', N(tot.egp))}${kp('إجمالي USDT', N(tot.usdt, 2))}
      ${kp('إجمالي ذهب 24', N(tot.gold, 3) + ' جم')}${kp('عدد النتائج', N(tot.count))}
    </div>
    <div class="tb sc"><table>
      <tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th></th></tr>
      ${L.length ? L.map(z => { const x = z[0]; return `<tr>
        <td>${E(x[1])}</td><td>${E(TY[x[0]] || x[0])}</td><td>${E(x[2])}</td>
        <td>${num(x[5]) ? N(x[5], 2) + ' ج' : num(x[3]) ? N(x[3], 2) + ' USDT' : N(x[4], 3) + ' جم'}</td>
        <td><button class="danger" data-a="del" data-i="${z[1]}">حذف</button></td>
      </tr>`; }).join('') : '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">لا توجد نتائج</td></tr>'}
    </table></div>
  </section>`;
}

/* ═══════════ INCOME ═══════════ */
const AL = [['Stocks', 'بورصة'], ['Gold', 'ذهب'], ['Crypto', 'كريبتو'], ['Library', 'مكتبة'], ['RealEstate', 'عقار'], ['Cash', 'نقد']];

function vIn(c) {
  const L = S.im.map((m, i) => [m, i]).sort((a, b) => b[0].d < a[0].d ? -1 : 1);
  const Y = S.im.filter(m => m.d >= new Date().getFullYear() + '-01-01');
  const sm = k => Y.reduce((s, m) => s + num(m[k]), 0);
  const inv = m => Object.values(m.a || {}).reduce((s, v) => s + num(v), 0);
  const iy = Y.reduce((s, m) => s + inv(m), 0);
  const pl = Object.values(S.plan).reduce((s, v) => s + num(v), 0);
  const nf = n => `<input name="${n}" type="number" step="any" inputmode="decimal">`;
  return `<div class="ks">
    ${kp('دخل هذا العام (ريال)', N(sm('q')))}
    ${kp('محوّل هذا العام (ج.م)', N(sm('te')))}
    ${kp('مستثمر هذا العام', N(iy), 'متوسط شهري ' + N(iy / Math.max(1, Y.length)))}
  </div>
  <section class="c"><h2>إضافة دخل شهر</h2>
    <form id="inf" onsubmit="return false">
      <div class="g">
        <label>الشهر<input name="d" type="date" value="${td().slice(0, 8)}01"></label>
        <label>الدخل (ريال)${nf('q')}</label>
        <label>المحوّل (ريال)${nf('tq')}</label>
        <label>المستلم (ج.م)${nf('te')}</label>
        <label>أحتفظ به للمصروف (ج.م)${nf('ex')}</label>
      </div>
      <div class="g">${AL.map(a => `<label>${a[1]} (ج.م)${nf(a[0])}</label>`).join('')}</div>
      <p><button type="button" data-a="auto">توزيع تلقائي</button>
      <button class="p" data-a="addim">حفظ الشهر</button>
      <span id="lv" class="mu"></span></p>
    </form>
  </section>
  <section class="c"><h2>نسب التوزيع التلقائي (%)</h2>
    <div class="g">${AL.filter(a => a[0] !== 'RealEstate').map(a => fl(a[1], 'plan.' + a[0], S.plan[a[0]])).join('')}</div>
    <span class="${pl === 100 ? 'mu' : 'dn'}">المجموع ${pl}%${pl === 100 ? ' ✓' : ' (يجب 100)'} · يُخصم قسط العقار (${N(S.re.mo)}) أولاً</span>
  </section>
  <section class="c"><h2>السجل</h2>
    <div class="tb sc"><table>
      <tr><th>الشهر</th><th>دخل ر</th><th>محوّل ر</th><th>محوّل ج</th><th>مستثمر</th><th>مصروف</th><th>متبقٍ ر</th><th></th></tr>
      ${L.length ? L.map(z => { const m = z[0], v = inv(m); return `<tr>
        <td>${E(m.d.slice(0, 7))}</td><td>${N(m.q)}</td><td>${N(m.tq)}</td><td>${N(m.te)}</td>
        <td>${N(v)}</td><td>${N(num(m.te) - v)}</td><td>${N(num(m.q) - num(m.tq))}</td>
        <td><button class="danger" data-a="delim" data-i="${z[1]}">حذف</button></td>
      </tr>`; }).join('') : '<tr><td colspan="8" class="mu" style="text-align:center;padding:20px">لا يوجد سجل</td></tr>'}
    </table></div>
    <p class="mu">المتبقي بالريال يبقى خارج المحفظة. الموزّع على «نقد» يُضاف تلقائياً للنقدية.</p>
  </section>`;
}

function lv() { const f = $('#inf'); if (!f) return; const g = k => +f[k].value || 0; const s = AL.reduce((a, x) => a + g(x[0]), 0); const el = $('#lv'); if (el) el.textContent = 'موزَّع ' + N(s) + ' · الباقي ' + N(g('te') - s); }
function auto() { const f = $('#inf'); if (!f) return; const g = k => +f[k].value || 0; const av = Math.max(0, g('te') - g('ex')); const re = Math.min(S.re.mo, av); const rest = av - re; AL.forEach(x => f[x[0]].value = x[0] === 'RealEstate' ? Math.round(re) : Math.round(rest * (S.plan[x[0]] || 0) / 100)); lv(); }
function addim() {
  const f = $('#inf'); const g = k => +f[k].value || 0; const a = {};
  AL.forEach(x => a[x[0]] = g(x[0]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.d.value) || g('te') < 0 || AL.some(x => a[x[0]] < 0) || g('te') - AL.reduce((s, x) => s + a[x[0]], 0) < -0.5) {
    $('#lv').textContent = '⚠ تحقق: التوزيع يتجاوز المستلم'; return;
  }
  const month = f.d.value.slice(0, 7);
  if (S.im.some(m => String(m.d).slice(0, 7) === month)) { if (!confirm('يوجد شهر بنفس التاريخ (' + month + '). هل تريد الإضافة على أي حال؟')) return; }
  S.im.push({ d: f.d.value, q: g('q'), tq: g('tq'), te: g('te'), a }); save(); render();
}

/* ═══════════ REAL ESTATE ═══════════ */
function vRe(c) {
  const R = S.re, T = RT();
  const xp = R.x.reduce((s, x) => s + num(x[2]), 0);
  const xl = R.x.reduce((s, x) => s + num(x[1]) - num(x[2]), 0);
  const il = Math.max(0, num(R.mo) * num(R.n) - Math.max(0, c.re - num(R.up) - xp));
  const n = num(R.mo) > 0 ? Math.ceil(il / num(R.mo)) : 0;
  const mk = td().slice(0, 7);
  const txPaid = S.tx.filter(x => x[0] === 'RealEstate' && x[1].slice(0, 7) === mk).reduce((s, x) => s + num(x[5]), 0);
  const imPaid = S.im.filter(m => String(m.d).slice(0, 7) === mk).reduce((s, m) => s + num((m.a || {}).RealEstate), 0);
  const pd = Math.max(txPaid, imPaid);
  const MN = (d, n2) => { const x = new Date(d); x.setMonth(x.getMonth() + n2); return x.toISOString().slice(0, 10); };
  let b = il;
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(R.start || '') ? R.start : td();
  const sc = [...Array(6)].map((_, i) => {
    const a = Math.min(num(R.mo), b); b -= a;
    return `<tr><td>${MN(startDate, i + (pd >= num(R.mo) ? 1 : 0)).slice(0, 7)}</td><td>${N(a)}</td><td>${N(b)}</td></tr>`;
  }).join('');

  return `<section class="c"><h2>خطة العقار</h2>
    <div class="g">
      ${fl('المقدم + دفعة أولى', 're.up', R.up)}
      ${fl('القسط الشهري', 're.mo', R.mo)}
      ${fl('عدد الأقساط', 're.n', R.n)}
      ${fl('تاريخ أول قسط', 're.start', R.start, 'date')}
    </div>
    <div class="tb"><table>
      <tr><th>البند</th><th>المبلغ</th><th>المدفوع منه</th></tr>
      <tr><td>المقدم + دفعة أولى</td><td>${N(R.up)}</td><td></td></tr>
      <tr><td>الأقساط (${R.n} × ${N(R.mo)})</td><td>${N(num(R.mo) * num(R.n))}</td><td></td></tr>
      ${R.x.map((x, i) => `<tr><td>${E(x[0])}</td><td>${N(x[1])}</td><td>${inp('re.x.' + i + '.2', x[2])}</td></tr>`).join('')}
      <tr class="tot"><td>الإجمالي الكلي</td><td>${N(T)}</td><td></td></tr>
    </table></div>
    <button data-a="re-addx" style="margin-top:8px">+ إضافة بند</button>
  </section>
  <div class="ks">
    ${kp('المدفوع', N(c.re), P(T ? c.re / T : 0) + ' من الإجمالي')}
    ${kp('المتبقي', N(c.liab), 'أقساط ' + N(il) + ' + إضافية ' + N(xl), 'au')}
    ${kp('الأقساط المتبقية', N(n), 'تنتهي ≈ ' + MN(td(), n).slice(0, 7))}
    ${kp('هذا الشهر', pd >= num(R.mo) ? '✓ مسدَّد' : 'مستحق ' + N(num(R.mo) - pd), 'القسط ' + N(R.mo), pd >= num(R.mo) ? 'up' : 'dn')}
  </div>
  <div class="bar"><i style="width:${T ? Math.min(100, c.re / T * 100) : 0}%;background:var(--ac)"></i></div>
  <section class="c"><h2>الأقساط القادمة</h2>
    <div class="tb"><table>
      <tr><th>الموعد</th><th>القسط</th><th>المتبقي</th></tr>
      ${sc}
    </table></div>
    <p class="mu">الدفعات الإضافية غير مجدولة — سجّلها في العمليات (عقار) أو الدخل. يُحتسب في الثروة ما دُفع فعلاً فقط.</p>
  </section>`;
}

/* ═══════════ ZAKAT ═══════════ */
function vZk(c) {
  const z = c.total * 0.025;
  const ns = 85 * c.gp;
  const rem = Math.max(0, z - num(S.zk.paid));
  const y = +S.zk.year || new Date().getFullYear();
  return `<section class="c"><h2>زكاة سنة ${y} م</h2>
    <div class="ks">
      ${kp('الأصول الزكوية', N(c.total))}
      ${kp('الزكاة 2.5%', N(z))}
      ${kp('المدفوع', N(S.zk.paid))}
      ${kp('المتبقي', N(rem), 'حتى ' + (S.due || 'غير محدد'), c.days !== null && c.days <= 30 ? 'dn' : 'au')}
      ${kp('النصاب (85 جم ذهب)', N(ns), c.total >= ns ? 'بلغ النصاب ✓' : 'لم يبلغ')}
    </div>
    <div class="g">${fl('المدفوع في السنة الحالية', 'zk.paid', S.zk.paid)}</div>
    <p class="mu">تُفتح سنة زكاة جديدة تلقائياً عند دخول سنة ميلادية جديدة.</p>
  </section>
  <section class="c"><h2>إضافة أو تعديل سنة زكاة</h2>
    <form id="zkf" onsubmit="return false">
      <div class="g">
        <label>السنة<input name="zy" type="number" min="2000" max="9999" value="${y}"></label>
        <label>أساس الزكاة<input name="zb" type="number" min="0" step="any" value="${String(c.total.toFixed(2))}"></label>
        <label>المدفوع<input name="zp" type="number" min="0" step="any" value="${String(num(S.zk.paid).toFixed(2))}"></label>
      </div>
      <button class="p" data-a="addzk">حفظ السنة</button> <span id="zkmsg" class="mu"></span>
    </form>
  </section>
  <section class="c"><h2>الأعوام السابقة</h2>
    <div class="tb"><table>
      <tr><th>السنة</th><th>الأساس</th><th>المستحق 2.5%</th><th>المدفوع</th><th>المتبقي</th></tr>
      ${S.zk.h.length ? S.zk.h.map(h => {
        const d = num(h[1]) * 0.025 - num(h[2]);
        return `<tr><td>${E(h[0])}</td><td>${N(h[1])}</td><td>${N(num(h[1]) * 0.025, 2)}</td><td>${N(h[2], 2)}</td><td class="${Math.abs(d) < 0.05 ? 'up' : 'dn'}">${N(d, 2)}</td></tr>`;
      }).join('') : '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">لا توجد سنوات</td></tr>'}
    </table></div>
  </section>`;
}

function ensureZakatYear() {
  const now = +td().slice(0, 4), prev = +S.zk.year || now;
  if (prev < now) {
    const q = S.q.find(x => x[0] === prev + '-Q4') || S.q.filter(x => String(x[0]).startsWith(prev + '-')).slice(-1)[0];
    const base = q ? num(q[1]) : C().total;
    if (!S.zk.h.some(h => String(h[0]) === String(prev) + ' م')) S.zk.h.push([prev + ' م', base, num(S.zk.paid)]);
    S.zk.year = now; S.zk.paid = 0; save();
    st('فُتحت سنة زكاة ' + now + ' وأُرحّلت السابقة');
  }
}

function addZakatYear() {
  const f = $('#zkf'); const y = +f.zy.value || 0, base = +f.zb.value || 0, paid = +f.zp.value || 0;
  if (!Number.isInteger(y) || y < 2000 || y > 9999 || base < 0 || paid < 0) { $('#zkmsg').textContent = 'تحقق من القيم'; return; }
  if (y === +S.zk.year) S.zk.paid = paid;
  else {
    const label = y + ' م'; const i = S.zk.h.findIndex(h => String(h[0]) === label || String(h[0]) === String(y));
    if (i < 0) S.zk.h.push([label, base, paid]); else S.zk.h[i] = [label, base, paid];
  }
  save(); render(); st('حُفظت سنة الزكاة ' + y);
}

/* ═══════════ YEARS / ANALYTICS ═══════════ */
function yearStats(y) {
  const tx = S.tx.filter(x => yearOf(x[1]) === y);
  const im = S.im.filter(m => yearOf(m.d) === y);
  const income = im.reduce((a, m) => a + num(m.te), 0);
  const invested = im.reduce((a, m) => a + Object.values(m.a || {}).reduce((b, v) => b + num(v), 0), 0);
  const cashflow = tx.reduce((a, x) => a + num(x[5]), 0);
  const profit = tx.filter(x => x[0] === 'Profit').reduce((a, x) => a + num(x[5]), 0);
  const fees = tx.filter(x => x[0] === 'Fee').reduce((a, x) => a + num(x[5]), 0);
  const tathir = tx.filter(x => x[0] === 'Tathir').reduce((a, x) => a + num(x[5]), 0);
  return { year: y, tx: tx.length, months: im.length, income, invested, cashflow, profit, fees, tathir, netProfit: profit - tathir - fees };
}

function archiveYear(y) {
  if (S.annual.archived[y]) return;
  const s = yearStats(y);
  const q = S.q.find(x => x[0] === y + '-Q4') || S.q.filter(x => String(x[0]).startsWith(y + '-')).slice(-1)[0];
  S.annual.archived[y] = { ...s, closingSnapshot: q ? num(q[1]) : null, archivedAt: td() };
}

function ensureCurrentYear() {
  const now = +td().slice(0, 4), active = +S.annual.currentYear || now;
  if (active < now) {
    for (let y = active; y < now; y++) archiveYear(y);
    S.annual.currentYear = now; S.annual.viewYear = now; save();
    st('فُتحت سنة ' + now + ' وأُرشفت السابقة');
  }
  syncYearSelect();
}

function syncYearSelect() {
  const el = $('#yearSel'); if (!el) return;
  const now = +td().slice(0, 4);
  const ys = new Set([now, +S.annual.currentYear, +S.annual.viewYear, ...Object.keys(S.annual.archived).map(Number)]);
  S.im.forEach(m => { const y = yearOf(m.d); if (y) ys.add(y); });
  S.tx.forEach(x => { const y = yearOf(x[1]); if (y) ys.add(y); });
  el.innerHTML = [...ys].filter(Number.isInteger).sort((a, b) => b - a)
    .map(y => `<option value="${y}"${+S.annual.viewYear === y ? ' selected' : ''}>${y}${S.annual.archived[y] ? ' · مؤرشفة' : ''}</option>`).join('');
}

function vYears(c) {
  const y = +S.annual.viewYear || +S.annual.currentYear;
  const s = yearStats(y);
  const arch = [...Object.values(S.annual.archived)].sort((a, b) => b.year - a.year);
  const rows = arch.map(a => `<tr>
    <td>${a.year}</td><td>${N(a.income)}</td><td>${N(a.invested)}</td>
    <td class="${cl(a.netProfit)}">${N(a.netProfit)}</td>
    <td>${a.closingSnapshot === null ? '—' : N(a.closingSnapshot)}</td>
  </tr>`).join('');
  return `<section class="c"><h2>السنة النشطة: ${y}</h2>
    <div class="ks">
      ${kp('دخل محوّل', N(s.income), 'أشهر: ' + s.months)}
      ${kp('إجمالي المستثمر', N(s.invested))}
      ${kp('أرباح محققة', N(s.profit), 'قبل التطهير والرسوم', 'up')}
      ${kp('صافي الربح', N(s.netProfit), 'بعد التطهير والرسوم', cl(s.netProfit))}
    </div>
  </section>
  <section class="c"><h2>الأرشيف السنوي</h2>
    <div class="tb"><table>
      <tr><th>السنة</th><th>الدخل</th><th>المستثمر</th><th>صافي الربح</th><th>آخر رصيد</th></tr>
      ${rows || '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">لا يوجد أرشيف</td></tr>'}
    </table></div>
  </section>`;
}

function chartSvg(items, color = 'var(--ac)') {
  const vals = items.map(x => num(x[1]));
  const mx = Math.max(1, ...vals);
  const w = 620, h = 220, p = 28;
  const bw = Math.max(12, Math.min(52, (w - p * 2) / Math.max(1, items.length) - 8));
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="رسم بياني">
    <line x1="${p}" y1="${h - p}" x2="${w - p}" y2="${h - p}" stroke="var(--ln)"/>
    ${items.map((x, i) => {
      const bh = (num(x[1]) / mx) * (h - p * 2);
      const slot = (w - p * 2) / Math.max(1, items.length);
      const xx = p + i * slot + slot / 2 - bw / 2;
      return `<rect x="${xx.toFixed(1)}" y="${(h - p - bh).toFixed(1)}" width="${bw}" height="${Math.max(1, bh).toFixed(1)}" rx="4" fill="${color}" opacity=".85"><title>${E(x[0])}: ${N(x[1])}</title></rect>
        <text x="${(xx + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11">${E(String(x[0]).slice(-7))}</text>`;
    }).join('')}
  </svg>`;
}

function vAn(c) {
  const y = +S.annual.viewYear || new Date().getFullYear();
  const tx = S.tx.filter(x => String(x[1]).slice(0, 4) === String(y));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return [y + '-' + m, tx.filter(x => String(x[1]).slice(0, 7) === y + '-' + m).reduce((a, x) => a + num(x[5]), 0)];
  });
  const by = Object.entries(tx.reduce((a, x) => { a[x[0]] = (a[x[0]] || 0) + num(x[5]); return a; }, {}));
  return `<section class="c"><h2>تحليلات ${y}</h2>
    <div class="ks">
      ${kp('عدد العمليات', N(tx.length))}
      ${kp('صافي ج.م', N(tx.reduce((a, x) => a + num(x[5]), 0)))}
      ${kp('USDT', N(tx.reduce((a, x) => a + num(x[3]), 0), 2))}
      ${kp('ذهب 24', N(tx.reduce((a, x) => a + num(x[4]), 0), 3) + ' جم')}
    </div>
  </section>
  <section class="c"><h2>الحركة الشهرية</h2>${chartSvg(months, 'var(--ac)')}</section>
  <section class="c"><h2>حسب النوع</h2>${by.length ? chartSvg(by, 'var(--au)') : '<p class="mu">لا توجد بيانات.</p>'}</section>`;
}

/* ═══════════ HEALTH / BACKUP ═══════════ */
function gaps() {
  const ds = S.im.map(m => String(m.d).slice(0, 7)).filter(Boolean).sort();
  const o = []; if (!ds.length) return o;
  let [y, m] = ds[0].split('-').map(Number);
  for (; ;) {
    const k = y + '-' + String(m).padStart(2, '0');
    if (k > ds[ds.length - 1]) return o;
    if (!ds.includes(k)) o.push(k);
    if (++m > 12) { m = 1; y++; }
  }
}

function vHl(c) {
  const d = {};
  S.tx.forEach(x => { if (/توزيع/.test(x[2]) && num(x[5]) > 1000) { (d[x[5]] = d[x[5]] || []).push(x[1]); } });
  const du = Object.entries(d).filter(e => e[1].length > 1);
  const age = /^\d{4}-\d{2}-\d{2}$/.test(S.man.cd || '') ? Math.round((new Date() - new Date(S.man.cd)) / 864e5) : null;
  const zd = S.zk.h.some(h => Math.abs(num(h[1]) * 0.025 - num(h[2])) >= 0.05);
  const go = c.total > 0 ? c.rows[0][1] / c.total - 0.25 : 0;
  const gq = gaps();
  const z0 = S.im.filter(m => num(m.tq) > 0 && !num(m.te)).map(m => String(m.d).slice(0, 7));
  const ck = [
    [!du.length, 'توزيعات بنفس المبلغ', du.length ? du.map(e => N(e[0], 2) + ' (' + e[1].map(E).join('، ') + ')').join(' | ') : 'لا يوجد'],
    [age === null ? true : age <= 14, 'عمر رصيد كريبتو', age === null ? 'لم يُسجَّل تاريخ' : 'منذ ' + age + ' يوم'],
    [!zd, 'زكاة الأعوام السابقة', 'مطابقة 2.5%'],
    [!gq.length, 'أشهر دخل ناقصة', gq.join('، ') || 'لا يوجد'],
    [!z0.length, 'تحويل ريال بلا مبلغ جنيه', z0.join('، ') || 'لا يوجد'],
    [Math.abs(go) <= 0.1, 'تركّز الذهب', 'الانحراف ' + sg(go * 100) + ' نقطة (الحد 10)']
  ];
  return `<section class="c"><h2>فحوصات البيانات</h2>
    ${ck.map(k => `<p><b class="${k[0] ? 'up' : 'dn'}">${k[0] ? '✓' : '✗'}</b> <b>${k[1]}:</b> <span class="mu">${k[2]}</span></p>`).join('')}
  </section>
  <section class="c"><h2>إحصائيات العمليات</h2>
    <div class="tb"><table>
      <tr><th>النوع</th><th>العدد</th><th>ج.م</th><th>USDT</th><th>جرام</th></tr>
      ${Object.entries(c.byType).length ? Object.entries(c.byType).map(([k, v]) => `<tr>
        <td>${E(TY[k] || k)}</td><td>${v.n}</td><td>${N(v.egp, 2)}</td>
        <td>${v.usdt ? N(v.usdt, 2) : '—'}</td><td>${v.g ? N(v.g, 3) : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">لا توجد عمليات</td></tr>'}
    </table></div>
  </section>
  <section class="c"><h2>تثبيت رصيد ربع</h2>
    <div class="g"><label>الوسم<input id="ql" value="${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}"></label></div>
    <p><button class="p" data-a="qsnap">ثبّت الرصيد (${N(c.total)})</button></p>
  </section>
  <section class="c"><h2>الأمان والنسخ الاحتياطي</h2>
    <p><button data-a="chgpass">تغيير كلمة المرور</button> <span class="mu">قفل تلقائي بعد 5 دقائق</span></p>
    <p><button class="p" data-a="bk">تنزيل نسخة JSON مشفرة</button>
    <button class="danger" data-a="rz" data-s="0">إعادة ضبط البيانات</button></p>
    <label>استعادة: الصق محتوى النسخة<textarea id="rs" rows="3"></textarea></label>
    <p><button data-a="rs">استعادة</button> <span id="ms" class="mu"></span></p>
  </section>`;
}

/* ═══════════ QUICK ENTRY ═══════════ */
const QK = {
  Stocks: [['dep', 'إيداع'], ['div', 'توزيعات'], ['close', 'إغلاق صفقة'], ['th', 'تطهير'], ['fee', 'رسوم'], ['wd', 'سحب']],
  Gold: [['buy', 'شراء'], ['sell', 'بيع']],
  Crypto: [['dep', 'إيداع'], ['wd', 'سحب']],
  Library: [['dep', 'إيداع'], ['wd', 'سحب']],
  RealEstate: [['dep', 'قسط / دفعة']]
};
const QL = { Stocks: 'بورصة', Gold: 'ذهب', Crypto: 'كريبتو', Library: 'مكتبة', RealEstate: 'عقار' };
const QD = { dep: 'إيداع', wd: 'سحب', buy: 'شراء', sell: 'بيع', div: 'توزيعات', close: 'إغلاق', th: 'تطهير', fee: 'رسوم' };
const nI = n => `<input name="${n}" type="number" step="any" inputmode="decimal">`;

function vSheet() {
  if (!Q.on) return '';
  const g = Q.i === 'Gold', pf = Q.i === 'Stocks' && ['div', 'close'].includes(Q.k);
  const cos = [...new Set(S.tx.filter(x => x[0] === 'Profit').map(x => cleanStock(x[2])))].filter(Boolean);
  return `<div class="ov"><div class="bd" data-a="qx"></div><div class="sh">
    <h2>تسجيل سريع</h2>
    <div class="chips">${Object.keys(QK).map(i => `<button class="${Q.i === i ? 'on' : ''}" data-qi="${i}">${QL[i]}</button>`).join('')}</div>
    <div class="chips">${QK[Q.i].map(k => `<button class="${Q.k === k[0] ? 'on' : ''}" data-qk="${k[0]}">${k[1]}</button>`).join('')}</div>
    <form id="qf" onsubmit="return false">
      <div class="g">
        <label>التاريخ<input name="d" type="date" value="${td()}"></label>
        ${g ? `<label>العيار<select name="kr"><option value="24">24</option><option value="21">21</option><option value="18">18</option></select></label>
              <label>الوزن (جم)${nI('gm')}</label>
              <label>المبلغ (ج.م)${nI('eg')}</label>` :
      Q.i === 'Crypto' ? `<label>المبلغ (USDT)${nI('us')}</label>` :
        `<label>المبلغ (ج.م)${nI('eg')}</label>`}
        ${pf ? `<label>السهم<input name="ds" list="cos"><datalist id="cos">${cos.map(c => `<option>${E(c)}</option>`).join('')}</datalist></label>`
        : `<label>ملاحظة<input name="ds"></label>`}
      </div>
      <p class="mu" id="qp"></p>
      <p><button class="p" data-a="qsave">حفظ</button>
      <button data-a="qx">إلغاء</button>
      <button data-t="in">دخل شهري ›</button>
      <button data-t="pf">تحديث رصيد ›</button></p>
    </form>
  </div></div>`;
}

const sheet = () => { const e = $('#sh'); if (e) e.innerHTML = vSheet(); };

function qsave() {
  const f = $('#qf'), n = k => f[k] ? +f[k].value || 0 : 0;
  const i = Q.i, k = Q.k, d = f.d.value || td(), nt = (f.ds?.value || '').trim();
  const sgn = ['wd', 'sell'].includes(k) ? -1 : 1;
  const ds = (['div', 'close'].includes(k) ? QD[k] + ' ' + nt : nt || QD[k]).trim();
  let x;
  if (i === 'Gold') x = ['Gold', d, ds, 0, n('gm') * (+f.kr.value) / 24 * sgn, n('eg') * sgn];
  else if (i === 'Crypto') x = ['Crypto', d, ds, n('us') * sgn, 0, 0];
  else x = [k === 'div' || k === 'close' ? 'Profit' : k === 'th' ? 'Tathir' : k === 'fee' ? 'Fee' : i, d, ds, 0, 0, n('eg') * sgn];
  if (!(x[3] || x[4] || x[5])) { $('#qp').textContent = '⚠ أدخل المبلغ'; return; }
  S.tx.push(x); save(); Q.on = false; sheet(); render(); st('سُجّل: ' + ds);
}

function qsnap() {
  const l = $('#ql')?.value.trim(); if (!l) return;
  const c = C();
  const i = S.q.findIndex(x => x[0] === l);
  if (i < 0) S.q.push([l, c.total]); else S.q[i][1] = c.total;
  S.q.sort((a, b) => a[0] < b[0] ? -1 : 1);
  save(); tab = 'ov'; render();
}

/* ═══════════ ASSET DETAIL ═══════════ */
function vSt(c) {
  const k = cur;
  const L = lg(k);
  const R = c.rows[KS.indexOf(k)] || ['', 0, 0, '#ccc'];
  const val = R[1];
  const b = { Gold: c.goldC, Stocks: c.inv, Crypto: c.cap * c.u, Cert: num(S.cert.p), Library: c.libC }[k];
  const pl = b === undefined ? null : val - b;
  const fx = { USD: c.u, QAR: c.u / 3.65, SAR: c.u / 3.65, EGP: 1 };
  let x = '';

  if (k === 'Gold') {
    x = `<section class="c"><h2>المشتريات</h2><div class="tb"><table>
      <tr><th>التاريخ</th><th>البيان</th><th>جرام 24</th><th>التكلفة</th><th>سعر/جم</th><th>الربح</th></tr>
      ${S.tx.filter(t => t[0] === 'Gold' && num(t[4]) > 0 && num(t[5]) > 0).map(t => {
        const v = num(t[4]) * c.gp;
        return `<tr><td>${E(t[1])}</td><td>${E(t[2])}</td><td>${N(t[4], 3)}</td><td>${N(t[5])}</td><td>${N(num(t[5]) / num(t[4]))}</td><td class="${cl(v - num(t[5]))}">${P(num(t[5]) ? v / num(t[5]) - 1 : 0)}</td></tr>`;
      }).join('')}
    </table></div>
    <p class="mu">الوزن ${N(c.g, 3)} جم · متوسط التكلفة ${N(c.g ? c.goldC / c.g : 0)} · سعر اليوم ${N(c.gp)} ج/جم</p></section>`;
  } else if (k === 'Stocks') {
    const m = {};
    S.tx.filter(t => t[0] === 'Profit').forEach(t => {
      const n = cleanStock(t[2]);
      m[n] = m[n] || [0, 0];
      m[n][/توزيع/.test(t[2]) ? 0 : 1] += num(t[5]);
    });
    x = `<div class="ks">
      ${kp('المستثمر', N(c.inv), 'إيداع ' + N(c.dep) + ' · رسوم ' + N(c.fee) + ' · تطهير ' + N(c.th))}
      ${kp('غير المحقق', sg(num(S.man.sm) - num(S.man.cb)), 'سوقي − Cost Basis', cl(num(S.man.sm) - num(S.man.cb)))}
      ${kp('محقق صافٍ', N(c.prof), 'بعد التطهير والرسوم', 'up')}
    </div>
    ${Object.keys(m).length ? `<section class="c"><h2>الأرباح حسب السهم</h2><div class="tb"><table>
      <tr><th>السهم</th><th>توزيعات</th><th>إغلاق</th><th>الإجمالي</th></tr>
      ${Object.entries(m).sort((a, b) => b[1][0] + b[1][1] - a[1][0] - a[1][1]).map(z => `<tr>
        <td>${E(z[0] || '—')}</td><td>${N(z[1][0])}</td><td>${N(z[1][1])}</td><td><b>${N(z[1][0] + z[1][1])}</b></td>
      </tr>`).join('')}
    </table></div></section>` : ''}`;
  } else if (k === 'Crypto') {
    x = `<div class="ks">
      ${kp('رأس المال', N(c.cap, 2) + ' USDT')}
      ${kp('الرصيد', N(S.man.cr, 2) + ' USDT', 'حتى ' + (S.man.cd || 'غير محدد'))}
      ${kp('الخسارة/الربح', P(c.cap ? num(S.man.cr) / c.cap - 1 : 0), N((num(S.man.cr) - c.cap) * c.u) + ' ج.م', cl(num(S.man.cr) - c.cap))}
    </div>`;
  } else if (k === 'Cert') {
    const cc = certCalc();
    x = `<section class="c"><h2>أرباح الأرباع</h2><div class="tb"><table>
      <tr><th>الاستحقاق</th><th>النسبة</th><th>الربح</th><th>الرصيد</th></tr>
      ${cc.rows.map(r => `<tr><td>${E(r.date)}${r.earned ? ' ✓' : ' (متوقع)'}</td><td>${P(r.rate)}</td><td>${N(r.profit)}</td><td>${N(r.balance)}</td></tr>`).join('')}
    </table></div>
    <p class="mu">الأصل ${N(S.cert.p)} · الأرباح المستحقة ${N(cc.value - num(S.cert.p))}</p></section>`;
  } else if (k === 'Cash') {
    x = `<section class="c"><h2>الأرصدة</h2><div class="tb"><table>
      ${S.cash.map(i => `<tr><td>${E(i[0])}</td><td>${N(i[2])} ${E(i[1])}</td><td>${N(num(i[2]) * (fx[i[1]] || 1))}</td></tr>`).join('')}
      <tr><td>مخصّص من الدخل</td><td></td><td>${N(c.inc.cash)}</td></tr>
      <tr class="tot"><td>الإجمالي</td><td></td><td>${N(c.cash)}</td></tr>
    </table></div></section>`;
  } else if (k === 'RE') {
    x = vRe(c);
  }

  const kk = ['Cash', 'RE', 'Cert'].includes(k) ? '' : `<div class="ks">
    ${kp(k === 'Stocks' ? 'المستثمر' : 'التكلفة', N(b))}
    ${kp('الربح / الخسارة', pl === null ? '—' : sg(pl), pl === null ? '' : P(b ? pl / b : 0), pl === null ? '' : cl(pl))}
  </div>`;

  const lt = ['Cash', 'Cert'].includes(k) ? '' : `<section class="c"><h2>كشف الحركة</h2>
    ${sp(L.map(r => r.run))}
    <div class="tb sc"><table>
      <tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الرصيد</th><th></th></tr>
      ${L.length ? [...L].reverse().map(r => `<tr>
        <td>${E(r.d)}</td><td>${E(r.s)}</td>
        <td class="${r.ty === 'Profit' ? 'up' : ''}">${N(r.a, k === 'Crypto' ? 2 : 0)}</td>
        <td>${N(r.run, k === 'Crypto' ? 2 : 0)}</td>
        <td>${r.i < 0 ? '' : `<button class="danger" data-a="del" data-i="${r.i}">حذف</button>`}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="mu" style="text-align:center;padding:20px">لا توجد حركات</td></tr>'}
    </table></div></section>`;

  return `<p><button data-t="inv">‹ العودة للاستثمارات</button></p>
  <div class="hero">
    <small><s style="background:${R[3]}"></s>${KN[k]}</small>
    <b>${N(val)}</b>
    <small>${P(c.total ? val / c.total : 0)} من المحفظة${k === 'Crypto' ? ' · ' + N(S.man.cr, 2) + ' USDT' : ''}</small>
  </div>
  ${kk}${x}${lt}`;
}

/* ═══════════ MAIN RENDER ═══════════ */
function render() {
  ensureCurrentYear();
  ensureZakatYear();
  const c = C();
  const tabs = [
    ['ov', 'نظرة عامة'], ['inv', 'الاستثمارات'], ['in', 'الدخل'],
    ['pf', 'الأرصدة'], ['tx', 'العمليات'], ['zk', 'الزكاة'],
    ['hl', 'الصحة'], ['years', 'السنوات'], ['an', 'التحليلات']
  ];
  const views = { ov: vOv, inv: vInv, st: vSt, in: vIn, pf: vPf, tx: vTx, zk: vZk, hl: vHl, years: vYears, an: vAn };
  const app = $('#app');
  if (!app) return;
  app.innerHTML = '<nav>' + tabs.map(t => `<button data-t="${t[0]}" class="${tab === t[0] || (tab === 'st' && t[0] === 'inv') ? 'on' : ''}">${t[1]}</button>`).join('') + '</nav>'
    + (views[tab] || vOv)(c);
}

/* ═══════════ EVENT DELEGATION ═══════════ */
document.addEventListener('input', e => { if (e.target.form?.id === 'inf') lv(); });

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.f) { flt = t.value; return render(); }
  if (t.dataset.fy) { fltYear = t.value; return render(); }
  if (t.id === 'yearSel') { S.annual.viewYear = +t.value || new Date().getFullYear(); save(); tab = 'years'; render(); return; }
  const p = t.dataset.p;
  if (!p) return;
  const keys = p.split('.');
  let o = S;
  while (keys.length > 1) o = o[keys.shift()];
  let val = t.type === 'number' ? +t.value : t.value;
  if (p.startsWith('targets.')) val = (val || 0) / 100;
  o[keys[0]] = val;
  save(); render();
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-t],[data-a],[data-st],[data-qi],[data-qk]');
  if (!b) return;
  const d = b.dataset;

  if (d.qi) { Q.i = d.qi; Q.k = QK[Q.i][0][0]; return sheet(); }
  if (d.qk) { Q.k = d.qk; return sheet(); }
  if (d.st) { cur = d.st; tab = 'st'; render(); return scrollTo(0, 0); }
  if (d.t) { Q.on = false; sheet(); tab = d.t; render(); return scrollTo(0, 0); }

  const a = d.a;
  if (a === 'add') {
    const f = $('#tf'), n = k => Number.isFinite(+f[k].value) ? +f[k].value : 0;
    const dtv = f.dt.value || td(), desc = f.ds.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dtv) || !desc || (!n('us') && !n('gm') && !n('eg'))) {
      st('⚠ تحقق: التاريخ + الوصف + مبلغ واحد على الأقل'); return;
    }
    S.tx.push([f.ty.value, dtv, desc, n('us'), n('gm'), n('eg')]);
    save(); render();
  }
  else if (a === 'del') {
    if (d.s !== '1') { b.dataset.s = '1'; b.textContent = 'تأكيد؟'; return; }
    S.tx.splice(+d.i, 1); save(); render();
  }
  else if (a === 'bk') {
    try {
      const blob = new Blob([await encryptPayload(S)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url; el.download = 'portfolio-encrypted-backup-' + td() + '.vault.json';
      el.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      st('تم تنزيل النسخة المشفرة');
    } catch (x) { st('لم يتم التنزيل'); }
  }
  else if (a === 'rs') {
    try {
      const raw = $('#rs').value;
      let j = JSON.parse(raw);
      if (j && j.v === 1) {
        const r = await decryptPayload(raw, window.__vaultPassword || '');
        j = r.data;
      }
      if (!j || !j.tx || !j.man) throw new Error('bad');
      S = j; mig(); await save(); tab = 'ov'; render();
      $('#ms').textContent = '✓ تم الاستعادة';
    } catch (x) { $('#ms').textContent = '✗ محتوى غير صالح أو كلمة المرور لا تطابق'; }
  }
  else if (a === 'qo') { Q.on = true; sheet(); }
  else if (a === 'qx') { Q.on = false; sheet(); }
  else if (a === 'qsave') qsave();
  else if (a === 'qsnap') qsnap();
  else if (a === 'auto') auto();
  else if (a === 'addim') addim();
  else if (a === 'addzk') addZakatYear();
  else if (a === 'delim') {
    if (d.s !== '1') { b.dataset.s = '1'; b.textContent = 'تأكيد؟'; return; }
    S.im.splice(+d.i, 1); save(); render();
  }
  else if (a === 'chgpass') changePassword();
  else if (a === 're-addx') {
    S.re.x.push(['بند جديد', 0, 0]); save(); render();
  }
  else if (a === 'rz') {
    if (d.s !== '1') { b.dataset.s = '1'; b.textContent = 'تأكيد؟ سيُمحى كل شيء'; return; }
    S = JSON.parse(JSON.stringify(SEED)); mig(); save(); tab = 'ov'; render();
  }
});

/* ═══════════ THEME ═══════════ */
(function () {
  const btn = document.getElementById('tbtn');
  if (!btn) return;
  function apply(th) {
    document.documentElement.setAttribute('data-theme', th);
    btn.textContent = th === 'dark' ? '☀' : '☾';
    try { localStorage.setItem('theme', th); } catch (e) { }
  }
  let saved = 'light';
  try { saved = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); }
  catch (e) { saved = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'; }
  apply(saved);
  btn.addEventListener('click', () => apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
})();

/* ═══════════ BOOT ═══════════ */
async function restoreNewVault() {
  const file = $('#restoreFile')?.files?.[0], pw = $('#lockPassword').value, err = $('#lockError');
  if (!file) { err.textContent = 'اختر ملف النسخة أولاً'; return; }
  if (pw.length < 8) { err.textContent = 'أدخل كلمة مرور النسخة (8 أحرف على الأقل)'; return; }
  try {
    const r = await decryptPayload(await file.text(), pw);
    vaultKey = r.key; vaultSalt = r.salt; vaultIterations = r.it;
    S = r.data; mig();
    isUnlocked = true;
    if (!await save()) throw new Error('save');
    hideLock(); render(); armAutoLock();
  } catch (e) {
    vaultKey = null; vaultSalt = null; vaultIterations = 600000;
    err.textContent = 'تعذر الاستعادة — تحقق من كلمة المرور والملف';
  }
}

async function boot() {
  const raw = localStorage.getItem(SECURE_K);
  const setup = !raw;
  showLock(setup);
  $('#restoreSecureBtn')?.addEventListener('click', restoreNewVault);
  $('#lockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#lockPassword').value;
    const confirm = $('#lockConfirm').value;
    const err = $('#lockError');
    err.textContent = '';
    if (pw.length < 8) { err.textContent = 'كلمة المرور 8 أحرف على الأقل'; return; }
    if (setup && pw !== confirm) { err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
    try {
      if (setup) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        vaultKey = await deriveKey(pw, salt, 600000);
        vaultSalt = salt; vaultIterations = 600000;
        const legacy = localStorage.getItem(K);
        if (legacy) { try { S = JSON.parse(legacy); } catch (_) { S = JSON.parse(JSON.stringify(SEED)); } }
        else { S = JSON.parse(JSON.stringify(SEED)); }
        mig(); isUnlocked = true;
        if (!await save()) throw new Error('save');
        localStorage.removeItem(K);
      } else {
        const r = await decryptPayload(raw, pw);
        vaultKey = r.key; vaultSalt = r.salt; vaultIterations = r.it;
        S = r.data; mig(); isUnlocked = true;
      }
      hideLock(); render(); armAutoLock(); st('مرحبًا');
    } catch (x) {
      vaultKey = null; vaultSalt = null;
      err.textContent = setup ? 'تعذر تفعيل الحماية' : 'كلمة المرور غير صحيحة';
    }
  });
}

['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (isUnlocked) armAutoLock(); }, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden && isUnlocked) lockApp(); });

document.querySelector('#lockBtn')?.addEventListener('click', lockApp);
document.querySelector('#pwCancel')?.addEventListener('click', () => { $('#pwModal').hidden = true; armAutoLock(); });
document.querySelector('#pwForm')?.addEventListener('submit', applyPasswordChange);

// Install prompt
let deferredInstall;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  const b = document.querySelector('#installBtn'); if (b) b.hidden = false;
});
document.addEventListener('click', e => {
  if (e.target.id === 'installBtn' && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; }
});

// PWA
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

// Init
render();
st('جاهز');
boot();
