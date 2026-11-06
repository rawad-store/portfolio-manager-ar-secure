(() => {
  'use strict';

  /* ============ الثوابت ============ */
  const KEY = 'portfolio_v5_plain';
  const LEGACY_KEYS = ['portfolio_v4_plain', 'portfolio_v3_plain'];
  const THEME_KEY = 'portfolio_theme';
  const OZ_IN_GRAM = 31.1034768;
  const ZAKAT_RATE = 0.025;
  const CURRENCY = 'ج.م';
  const SAVE_DEBOUNCE_MS = 400;
  const MAX_IMPORT_SIZE = 10 * 1024 * 1024;
  const ID_REGEX = /^[a-z0-9]{1,24}$/i;
  const YEARS_TO_SHOW = 8;

  const ASSET_META = {
    stocks:      { label: 'البورصة',    color: '#277da1' },
    gold:        { label: 'الذهب',      color: '#c99a2e' },
    crypto:      { label: 'الكريبتو',   color: '#8a63a8' },
    cash:        { label: 'النقدية',    color: '#7fa35c' },
    realEstate:  { label: 'العقار',     color: '#b5694a' },
    certificate: { label: 'الشهادة',    color: '#6c7fa0' },
  };

  const TABS = [
    ['overview',     'نظرة عامة'],
    ['transactions', 'العمليات'],
    ['income',       'الدخل'],
    ['certificate',  'الشهادة'],
    ['zakat',        'الزكاة'],
    ['backup',       'النسخ'],
  ];

  const TX_TYPES = ['إيداع', 'شراء ذهب', 'بورصة', 'كريبتو', 'مصروف', 'أرباح', 'عقار'];

  /* ============ أدوات ============ */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const n = (x, d = 0) => num(x).toLocaleString('en-US', {
    maximumFractionDigits: d, minimumFractionDigits: d,
  });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthISO = () => new Date().toISOString().slice(0, 7);
  const yearISO  = () => new Date().getFullYear();
  const stampISO = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ============ Toast ============ */
  let toastTimer;
  function notify(text, type = 'ok') {
    const el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'show' + (type === 'error' ? ' err' : type === 'warn' ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show', 'err', 'warn'), 2800);
  }

  /* ============ حالة الحفظ (شريط st) ============ */
  let statusTimer;
  function setStatus(text, cls = '') {
    const el = $('#st');
    if (!el) return;
    el.textContent = text;
    el.className = cls;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.textContent = '';
      el.className = '';
    }, 2200);
  }

  /* ============ الحالة ============ */
  const seed = () => ({
    version: 5,
    updatedAt: '',
    currentYear: yearISO(),
    prices: { usd: 56, goldOz: 3880 },
    assets: { stocks: 0, gold: 0, crypto: 0, cash: 0, realEstate: 0, certificate: 0 },
    transactions: [],
    income: [],
    certificate: { principal: 0, rates: [0, 0, 0, 0] },
    zakat: { year: 0, base: 0, paid: 0, history: [] },
    annualArchive: {}, // { "2024": { snapshot... } }
  });

  let state = seed();
  let tab = 'overview';
  let saveTimer = null;
  let deferredPrompt = null;

  /* ============ التطبيع والترحيل ============ */
  function normalize(raw) {
    const d = seed();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid');

    // ترحيل v3 القديم (man/tx/im)
    if (!raw.assets && (raw.man || raw.tx || raw.im)) {
      const m = raw.man || {};
      const oldTx = Array.isArray(raw.tx) ? raw.tx.filter(Array.isArray) : [];
      const oldIm = Array.isArray(raw.im) ? raw.im.filter(Array.isArray) : [];
      const usd = num(raw.usd) || d.prices.usd;
      raw = {
        ...raw,
        prices: { usd, goldOz: num(raw.oz) || d.prices.goldOz },
        assets: {
          stocks: num(m.sm),
          gold: oldTx.filter((r) => r[0] === 'Gold').reduce((a, r) => a + num(r[4]), 0),
          crypto: num(m.cr),
          cash: Array.isArray(raw.cash)
            ? raw.cash.filter(Array.isArray).reduce((a, r) => {
                const rate = r[1] === 'SAR' ? usd / 3.75 : r[1] === 'QAR' ? usd / 3.65 : 1;
                return a + num(r[2]) * rate;
              }, 0)
            : 0,
          realEstate: oldTx.filter((r) => r[0] === 'RealEstate').reduce((a, r) => a + num(r[5]), 0),
          certificate: num(raw.cert?.c ?? raw.cert?.p),
        },
        transactions: oldTx.map((r) => ({
          id: uid(), date: String(r[1] || ''), type: String(r[0] || 'عملية'),
          note: String(r[2] || ''), amount: num(r[5]),
        })),
        income: oldIm.map((r) => ({
          id: uid(), date: String(r.d || ''), income: num(r.q),
          transferredSar: num(r.tq), transferred: num(r.te),
        })),
        certificate: {
          principal: num(raw.cert?.c ?? raw.cert?.p),
          rates: Array.isArray(raw.cert?.r) ? raw.cert.r.slice(0, 4).map(num) : [0, 0, 0, 0],
        },
        zakat: {
          year: num(raw.zk?.year), base: num(raw.zk?.base),
          paid: num(raw.zk?.paid),
          history: Array.isArray(raw.zk?.h) ? raw.zk.h.filter(Array.isArray) : [],
        },
      };
    }

    const o = { ...d, ...raw };
    o.prices = { ...d.prices, ...(raw.prices || {}) };
    o.prices.usd = Math.max(0, num(o.prices.usd));
    o.prices.goldOz = Math.max(0, num(o.prices.goldOz));

    o.assets = { ...d.assets, ...(raw.assets || {}) };
    for (const k of Object.keys(d.assets)) o.assets[k] = Math.max(0, num(o.assets[k]));

    o.certificate = { ...d.certificate, ...(raw.certificate || {}) };
    let rates = Array.isArray(o.certificate.rates) ? o.certificate.rates.slice(0, 4).map(num) : [];
    while (rates.length < 4) rates.push(0);
    o.certificate.rates = rates.map((r) => clamp(r, 0, 100));
    o.certificate.principal = Math.max(0, num(o.certificate.principal));

    o.transactions = Array.isArray(o.transactions)
      ? o.transactions.filter((r) => r && typeof r === 'object').map((r) => ({
          id: ID_REGEX.test(r.id || '') ? r.id : uid(),
          date: String(r.date || '').slice(0, 10),
          type: String(r.type || 'عملية').slice(0, 40),
          note: String(r.note || '').slice(0, 120),
          amount: Math.max(0, num(r.amount)),
          year: num(r.year) || (r.date ? +String(r.date).slice(0, 4) : 0),
        }))
      : [];

    o.income = Array.isArray(o.income)
      ? o.income.filter((r) => r && typeof r === 'object').map((r) => ({
          id: ID_REGEX.test(r.id || '') ? r.id : uid(),
          date: String(r.date || '').slice(0, 7),
          income: Math.max(0, num(r.income)),
          transferredSar: Math.max(0, num(r.transferredSar)),
          transferred: Math.max(0, num(r.transferred)),
        }))
      : [];

    o.zakat = { ...d.zakat, ...(raw.zakat || {}) };
    o.zakat.year = num(o.zakat.year);
    o.zakat.base = Math.max(0, num(o.zakat.base));
    o.zakat.paid = Math.max(0, num(o.zakat.paid));
    o.zakat.history = Array.isArray(o.zakat.history)
      ? o.zakat.history.filter((r) => Array.isArray(r) && r.length >= 3)
      : [];

    o.annualArchive = (raw.annualArchive && typeof raw.annualArchive === 'object')
      ? raw.annualArchive : {};

    o.currentYear = clamp(num(o.currentYear) || yearISO(), 1900, 2200);
    o.version = 5;
    return o;
  }

  /* ============ الحفظ ============ */
  function saveNow(silent = false) {
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(state));
      if (!silent) {
        notify('تم الحفظ');
        setStatus('✓ محفوظ', 'saved');
      }
      return true;
    } catch (e) {
      console.error(e);
      notify('تعذر الحفظ — قد تكون الذاكرة ممتلئة', 'error');
      setStatus('✗ تعذر الحفظ', 'error');
      return false;
    }
  }

  function save(silent = false) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(silent), SAVE_DEBOUNCE_MS);
  }

  function load() {
    try {
      let raw = null, usedKey = null;
      for (const k of [KEY, ...LEGACY_KEYS]) {
        const v = localStorage.getItem(k);
        if (v) { raw = v; usedKey = k; break; }
      }
      if (!raw) return;
      state = normalize(JSON.parse(raw));
      if (usedKey !== KEY) {
        saveNow(true);
        LEGACY_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
      }
    } catch (e) {
      console.error(e);
      state = seed();
      notify('تعذر قراءة البيانات؛ بدأنا بخزنة جديدة', 'error');
    }
  }

  /* ============ التقويم الهجري ============ */
  const hijriFmt = (() => {
    try {
      return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
        year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
      });
    } catch {
      try {
        return new Intl.DateTimeFormat('en-u-ca-islamic', {
          year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
        });
      } catch { return null; }
    }
  })();

  function hijriParts(date = new Date()) {
    if (!hijriFmt) return { year: 0, month: 0, day: 0 };
    try {
      const r = {};
      hijriFmt.formatToParts(date).forEach((p) => {
        if (['year', 'month', 'day'].includes(p.type)) r[p.type] = +p.value;
      });
      return r;
    } catch { return { year: 0, month: 0, day: 0 }; }
  }

  function dueFor(hijriYear) {
    if (!Number.isInteger(hijriYear) || hijriYear < 1300 || hijriYear > 1600) return '';
    if (!hijriFmt) return '';
    const approx = Math.floor(hijriYear * 0.970224 + 621.5774);
    const from = new Date(Date.UTC(approx - 1, 8, 1));
    const to = new Date(Date.UTC(approx + 1, 5, 30));
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const h = hijriParts(d);
      if (h.year === hijriYear && h.month === 8 && h.day === 3) {
        return d.toISOString().slice(0, 10);
      }
    }
    return '';
  }

  function cycle() {
    const now = new Date();
    const h = hijriParts(now);
    if (!h.year) {
      const gy = now.getUTCFullYear();
      const approximate = Math.floor((gy - 622) * 1.030684);
      return { year: approximate, due: '', nextDue: '' };
    }
    const dueThis = dueFor(h.year);
    const year = dueThis && now >= new Date(dueThis + 'T00:00:00Z') ? h.year : h.year - 1;
    return { year, due: dueFor(year), nextDue: dueFor(year + 1) };
  }

  /* ============ الحسابات ============ */
  const goldGrams = () => num(state.assets.gold);
  const goldPricePerGram = () => num(state.prices.goldOz) / OZ_IN_GRAM;
  const goldValue = () => goldGrams() * goldPricePerGram() * num(state.prices.usd);
  const cryptoValue = () => num(state.assets.crypto) * num(state.prices.usd);
  const certCompoundValue = () =>
    state.certificate.rates.reduce(
      (b, r) => b * (1 + clamp(num(r), 0, 100) / 100),
      Math.max(0, num(state.certificate.principal))
    );

  function syncCertAsset() {
    state.assets.certificate = certCompoundValue();
  }

  function assetValues() {
    return {
      stocks: Math.max(0, num(state.assets.stocks)),
      gold: goldValue(),
      crypto: cryptoValue(),
      cash: Math.max(0, num(state.assets.cash)),
      realEstate: Math.max(0, num(state.assets.realEstate)),
      certificate: certCompoundValue(),
    };
  }

  function total() {
    return Object.values(assetValues()).reduce((a, b) => a + b, 0);
  }

  /* ============ نظام السنوات ============ */
  function yearOptions() {
    const cur = state.currentYear;
    const years = new Set();
    for (let y = cur - YEARS_TO_SHOW + 1; y <= cur + 1; y++) years.add(y);
    state.transactions.forEach((t) => { if (t.year) years.add(t.year); });
    if (state.annualArchive) Object.keys(state.annualArchive).forEach((y) => years.add(+y));
    return [...years].filter((y) => y > 1900 && y < 2200).sort((a, b) => b - a);
  }

  function drawYearSelect() {
    const sel = $('#yearSel');
    if (!sel) return;
    const years = yearOptions();
    sel.innerHTML = years.map((y) =>
      `<option value="${y}" ${y === state.currentYear ? 'selected' : ''}>${y}</option>`
    ).join('');
  }

  /* ============ الزكاة ============ */
  function ensureZakat(persist = false) {
    const c = cycle();
    let changed = false;
    if (!Number.isInteger(+state.zakat.year) || +state.zakat.year < 1300) {
      state.zakat.year = c.year;
      state.zakat.base = total();
      state.zakat.paid = 0;
      changed = true;
    } else if (+state.zakat.year !== c.year) {
      state.zakat.history.push([
        `${state.zakat.year} هـ — 3 شعبان إلى 2 شعبان`,
        num(state.zakat.base),
        num(state.zakat.paid),
      ]);
      state.zakat.year = c.year;
      state.zakat.base = total();
      state.zakat.paid = 0;
      changed = true;
    }
    if (changed) {
      if (persist) saveNow(true);
      else save(true);
    }
    return changed;
  }

  /* ============ بطاقات ============ */
  const card = (label, value, sub = '') =>
    `<div class="k"><span>${esc(label)}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;

  /* ============ تبويبات ============ */
  function drawTabs() {
    const el = $('#tabs');
    if (!el) return;
    el.innerHTML = TABS.map(([id, label]) =>
      `<button role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`
    ).join('');
  }

  /* ============ نظرة عامة ============ */
  function overview() {
    const c = cycle();
    const vals = assetValues();
    const t = Object.values(vals).reduce((a, b) => a + b, 0);
    const zakatDue = Math.max(0, num(state.zakat.base) * ZAKAT_RATE - num(state.zakat.paid));
    const incomeTotal = state.income
      .filter((r) => !r.date || r.date.startsWith(String(state.currentYear)))
      .reduce((a, r) => a + num(r.transferred), 0);

    const segments = Object.entries(ASSET_META).map(([k, meta]) => {
      const pct = t > 0 ? (vals[k] / t) * 100 : 0;
      return `<i style="width:${pct}%;background:${meta.color}" title="${meta.label}: ${n(vals[k])} ${CURRENCY} (${n(pct, 1)}%)"></i>`;
    }).join('');

    const legend = Object.entries(ASSET_META).map(([k, meta]) => {
      const pct = t > 0 ? (vals[k] / t) * 100 : 0;
      return `<div style="font-size:13px"><s style="background:${meta.color}"></s><b>${meta.label}</b>
        <div class="mu" style="font-size:12px;margin-inline-start:16px">${n(vals[k])} ${CURRENCY} — ${n(pct, 1)}%</div></div>`;
    }).join('');

    return `
<section class="hero">
  <small>إجمالي المحفظة</small>
  <b>${n(t)} <span style="font-size:.45em;font-weight:400;color:var(--mu)">${CURRENCY}</span></b>
  <div style="font-size:12px;color:var(--mu);margin-top:4px">دورة الزكاة ${state.zakat.year} هـ — ${c.due || '—'}</div>
</section>

<div class="bar" role="img" aria-label="توزيع الأصول">${segments}</div>

<div class="c">
  <h2>توزيع الأصول</h2>
  <div class="ks" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">${legend}</div>
</div>

<div class="ks">
  ${card('الزكاة المتبقية', n(zakatDue, 2) + ' ' + CURRENCY, `من ${n(num(state.zakat.base) * ZAKAT_RATE, 2)}`)}
  ${card('إجمالي الدخل ' + state.currentYear, n(incomeTotal) + ' ' + CURRENCY, `${state.income.filter((r) => !r.date || r.date.startsWith(String(state.currentYear))).length} شهر`)}
  ${card('عدد العمليات ' + state.currentYear, n(state.transactions.filter((t) => t.year === state.currentYear).length), 'سجل العمليات')}
</div>

<div class="c">
  <h2>أسعار الصرف</h2>
  <div class="g">
    <label>سعر الدولار (${CURRENCY})
      <input type="number" min="0" step="any" data-price="usd" value="${num(state.prices.usd)}">
    </label>
    <label>سعر أونصة الذهب (USD)
      <input type="number" min="0" step="any" data-price="goldOz" value="${num(state.prices.goldOz)}">
    </label>
    <div style="align-self:end;font-size:13px;color:var(--mu)">
      سعر الجرام ≈ <b data-gram-price style="color:var(--ink)">${n(goldPricePerGram() * num(state.prices.usd), 2)}</b> ${CURRENCY}
    </div>
  </div>
</div>

<div class="c">
  <h2>معلومات</h2>
  <p class="mu" style="font-size:13px;margin:0">الحفظ محلي على هذا الجهاز. دورة الزكاة من <b>3 شعبان</b> إلى <b>2 شعبان</b>، محسوبة بتقويم أم القرى (UTC).</p>
</div>`;
  }

  /* ============ العمليات ============ */
  function transactions() {
    const yearTxs = state.transactions.filter((t) => t.year === state.currentYear);
    const sorted = yearTxs.slice().reverse();
    const rows = sorted.map((r) => `
      <tr>
        <td>${esc(r.date || '—')}</td>
        <td>${esc(r.type)}</td>
        <td>${esc(r.note)}</td>
        <td>${n(r.amount)} ${CURRENCY}</td>
        <td><button type="button" class="d" data-delete-tx="${esc(r.id)}" aria-label="حذف">حذف</button></td>
      </tr>`).join('');
    const sum = yearTxs.reduce((a, r) => a + num(r.amount), 0);

    return `
<div class="c">
  <h2>إضافة عملية</h2>
  <form id="txForm" novalidate>
    <div class="g">
      <label>التاريخ<input name="date" type="date" required value="${todayISO()}" max="${todayISO()}"></label>
      <label>النوع
        <select name="type">${TX_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
      </label>
      <label>الوصف<input name="note" required maxlength="120" placeholder="مثال: شراء 5 جرام"></label>
      <label>المبلغ (${CURRENCY})<input name="amount" type="number" min="0" step="any" required></label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button type="submit" class="p">إضافة</button>
    </div>
  </form>
</div>

<div class="c">
  <h2>عمليات ${state.currentYear} (${yearTxs.length})</h2>
  ${yearTxs.length
    ? `<div class="tb"><table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th colspan="3" style="text-align:end">الإجمالي</th><th>${n(sum)} ${CURRENCY}</th><th></th></tr></tfoot>
      </table></div>`
    : '<div class="empty">لا توجد عمليات لهذه السنة</div>'}
</div>`;
  }

  /* ============ الدخل ============ */
  function income() {
    const yearIncomes = state.income.filter((r) => !r.date || r.date.startsWith(String(state.currentYear)));
    const totals = yearIncomes.reduce((a, r) => ({
      income: a.income + num(r.income),
      sar: a.sar + num(r.transferredSar),
      egp: a.egp + num(r.transferred),
    }), { income: 0, sar: 0, egp: 0 });

    const rows = yearIncomes.slice().reverse().map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td>${n(r.income)}</td>
        <td>${n(r.transferredSar)}</td>
        <td>${n(r.transferred)}</td>
        <td><button type="button" class="d" data-delete-income="${esc(r.id)}">حذف</button></td>
      </tr>`).join('');

    return `
<div class="c">
  <h2>إضافة شهر دخل</h2>
  <form id="incomeForm" novalidate>
    <div class="g">
      <label>الشهر<input name="date" type="month" required value="${monthISO()}"></label>
      <label>الدخل بالريال<input name="income" type="number" min="0" step="any"></label>
      <label>المحوّل بالريال<input name="transferredSar" type="number" min="0" step="any"></label>
      <label>المستلم (${CURRENCY})<input name="transferred" type="number" min="0" step="any"></label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button type="submit" class="p">حفظ</button>
    </div>
  </form>
</div>

<div class="c">
  <h2>دخل ${state.currentYear} (${yearIncomes.length})</h2>
  ${yearIncomes.length
    ? `<div class="tb"><table>
        <thead><tr><th>الشهر</th><th>الدخل ر.س</th><th>المحوّل ر.س</th><th>المستلم ${CURRENCY}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>الإجمالي</th><th>${n(totals.income)}</th><th>${n(totals.sar)}</th><th>${n(totals.egp)}</th><th></th></tr></tfoot>
      </table></div>`
    : '<div class="empty">لا توجد أشهر لهذه السنة</div>'}
</div>`;
  }

  /* ============ الشهادة ============ */
  function certificate() {
    const c = state.certificate;
    const bal = certCompoundValue();
    const profit = bal - num(c.principal);
    return `
<div class="c">
  <h2>شهادة فيصل — أرباح ربع سنوية</h2>
  <form id="certForm" novalidate>
    <div class="g">
      <label>أصل الشهادة (${CURRENCY})
        <input name="principal" type="number" min="0" step="any" value="${num(c.principal)}">
      </label>
      ${c.rates.map((r, i) => `
        <label>الربع ${i + 1} (%)
          <input name="r${i}" type="number" min="0" max="100" step="any" value="${num(r)}">
        </label>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button type="submit" class="p">حفظ</button>
    </div>
  </form>
  <div class="notice" style="margin-top:12px">
    الرصيد التراكمي: <b>${n(bal, 2)} ${CURRENCY}</b>
    &nbsp;—&nbsp; صافي الأرباح: <b>${n(profit, 2)} ${CURRENCY}</b>
  </div>
</div>`;
  }

  /* ============ الزكاة ============ */
  function zakat() {
    ensureZakat();
    const c = cycle();
    const base = num(state.zakat.base);
    const dueAmt = base * ZAKAT_RATE;
    const remaining = Math.max(0, dueAmt - num(state.zakat.paid));
    const pct = dueAmt > 0 ? clamp((num(state.zakat.paid) / dueAmt) * 100, 0, 100) : 0;

    const histRows = state.zakat.history.slice().reverse().map((r) => {
      const b = num(r[1]), p = num(r[2]), dd = b * ZAKAT_RATE;
      return `<tr>
        <td>${esc(r[0])}</td>
        <td>${n(b)}</td>
        <td>${n(dd, 2)}</td>
        <td>${n(p, 2)}</td>
        <td class="${dd - p > 0 ? 'dn' : 'up'}">${n(dd - p, 2)}</td>
      </tr>`;
    }).join('');

    return `
<div class="c">
  <h2>زكاة دورة ${state.zakat.year} هـ</h2>
  <div class="notice">الدورة: <b>3 شعبان → 2 شعبان</b> — الموعد الميلادي (UTC): <b>${c.due || '—'}</b></div>
  <div class="ks">
    ${card('الأساس', n(base) + ' ' + CURRENCY)}
    ${card('المستحق', n(dueAmt, 2) + ' ' + CURRENCY)}
    ${card('المدفوع', n(state.zakat.paid, 2) + ' ' + CURRENCY)}
    ${card('المتبقي', n(remaining, 2) + ' ' + CURRENCY)}
  </div>
  <div class="progress" role="progressbar" aria-valuenow="${n(pct, 0)}" aria-valuemin="0" aria-valuemax="100">
    <i style="width:${pct}%"></i>
  </div>
  <form id="zakatForm" novalidate style="margin-top:12px">
    <div class="g">
      <label>أساس الدورة (${CURRENCY})
        <input name="base" type="number" min="0" step="any" value="${base}">
      </label>
      <label>المدفوع (${CURRENCY})
        <input name="paid" type="number" min="0" step="any" value="${num(state.zakat.paid)}">
      </label>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button type="submit" class="p">حفظ</button>
      <button type="button" data-action="zakat-sync">مزامنة الأساس</button>
    </div>
  </form>
</div>

<div class="c">
  <h2>الدورات السابقة</h2>
  ${state.zakat.history.length
    ? `<div class="tb"><table>
        <thead><tr><th>الدورة</th><th>الأساس</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
        <tbody>${histRows}</tbody></table></div>`
    : '<div class="empty">لا توجد دورات سابقة</div>'}
</div>`;
  }

  /* ============ النسخ ============ */
  function backup() {
    const size = (() => {
      try { return (new Blob([JSON.stringify(state)]).size / 1024).toFixed(1); }
      catch { return '—'; }
    })();
    return `
<div class="c">
  <h2>نسخة احتياطية</h2>
  <p class="mu" style="font-size:13px">النسخة غير مشفرة. احفظها في مكان آمن.</p>
  <p class="mu" style="font-size:13px">الحجم: <b>${size} ك.ب</b> — آخر تحديث: ${esc(state.updatedAt || '—')}</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    <button type="button" class="p" data-action="download">تنزيل JSON</button>
    <button type="button" class="d" data-action="reset">بدء خزنة جديدة</button>
  </div>
</div>

<div class="c">
  <h2>استعادة من ملف</h2>
  <div class="backup-upload">
    <input id="backupFile" type="file" accept=".json,application/json">
    <p id="fileMeta" class="mu" style="font-size:13px;margin:0">لم يتم اختيار ملف</p>
    <button type="button" class="p" data-action="restore">استعادة</button>
  </div>
  <p class="mu" style="font-size:13px;margin:8px 0 0">الاستعادة تستبدل البيانات الحالية بعد تأكيدك.</p>
</div>`;
  }

  /* ============ عرض ============ */
  function render() {
    try {
      ensureZakat();
      drawTabs();
      drawYearSelect();
      const view = { overview, transactions, income, certificate, zakat, backup }[tab] || overview;
      $('#app').innerHTML = view();
    } catch (e) {
      console.error(e);
      $('#app').innerHTML = '<div class="error-box">تعذر عرض الصفحة. أعد التحميل أو استخدم النسخة الاحتياطية.</div>';
    }
  }

  /* ============ Sheet ============ */
  function openSheet(html) {
    const sh = $('#sh');
    if (!sh) return;
    sh.innerHTML = `<div class="ov"><div class="bd" data-close-sheet></div><div class="sh" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    const input = sh.querySelector('input,select,textarea,button');
    if (input) setTimeout(() => input.focus(), 50);
  }
  function closeSheet() {
    const sh = $('#sh');
    if (!sh) return;
    sh.innerHTML = '';
    document.body.style.overflow = '';
  }

  function quickSheet() {
    openSheet(`
      <h2>تسجيل سريع</h2>
      <div class="il">
        <button type="button" class="ir" data-quick="tx">
          <s style="background:#277da1"></s>
          <span><b>عملية جديدة</b><i>إيداع، شراء، مصروف…</i></span>
        </button>
        <button type="button" class="ir" data-quick="income">
          <s style="background:#7fa35c"></s>
          <span><b>دخل شهر</b><i>تسجيل دخل شهري</i></span>
        </button>
        <button type="button" class="ir" data-quick="cert">
          <s style="background:#6c7fa0"></s>
          <span><b>شهادة فيصل</b><i>تحديث أصل الشهادة</i></span>
        </button>
        <button type="button" class="ir" data-quick="backup">
          <s style="background:#c99a2e"></s>
          <span><b>نسخة احتياطية</b><i>تنزيل JSON</i></span>
        </button>
      </div>
    `);
  }

  /* ============ التنزيل والاستعادة ============ */
  function download() {
    saveNow(true);
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `portfolio-backup-${stampISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      notify('تم تنزيل النسخة');
    } catch (e) {
      console.error(e);
      notify('تعذر إنشاء الملف', 'error');
    }
  }

  async function restore(file) {
    if (!file) { notify('اختر ملفًا أولًا', 'error'); return; }
    if (file.size > MAX_IMPORT_SIZE) { notify('الملف أكبر من 10 ميجابايت', 'error'); return; }
    try {
      const text = await file.text();
      const next = normalize(JSON.parse(text));
      if (!next.assets || !Array.isArray(next.transactions)) throw new Error('invalid');
      if (!confirm('سيتم استبدال البيانات الحالية بالكامل. هل تريد المتابعة؟')) return;
      state = next;
      syncCertAsset();
      ensureZakat();
      if (!saveNow(true)) return;
      tab = 'overview';
      render();
      notify('تمت الاستعادة بنجاح');
    } catch (e) {
      console.error(e);
      notify('الملف غير صالح أو تالف', 'error');
    }
  }

  /* ============ الأحداث ============ */
  document.addEventListener('click', (e) => {
    // إغلاق sheet
    if (e.target.closest('[data-close-sheet]')) { closeSheet(); return; }

    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
    if (b.dataset.action === 'quick') { quickSheet(); return; }

    // أزرار داخل quick sheet
    if (b.dataset.quick) {
      const q = b.dataset.quick;
      closeSheet();
      if (q === 'tx') { tab = 'transactions'; render(); setTimeout(() => $('input[name="note"]')?.focus(), 100); }
      else if (q === 'income') { tab = 'income'; render(); setTimeout(() => $('input[name="income"]')?.focus(), 100); }
      else if (q === 'cert') { tab = 'certificate'; render(); setTimeout(() => $('input[name="principal"]')?.focus(), 100); }
      else if (q === 'backup') { tab = 'backup'; render(); }
      return;
    }

    if (b.dataset.action === 'download') { download(); return; }
    if (b.dataset.action === 'restore') { restore($('#backupFile')?.files?.[0]); return; }

    if (b.dataset.action === 'reset') {
      if (confirm('سيتم حذف كل البيانات المحلية. هل أنت متأكد؟')) {
        state = seed();
        saveNow(true);
        render();
        notify('تم بدء خزنة جديدة');
      }
      return;
    }

    if (b.dataset.action === 'zakat-sync') {
      state.zakat.base = total();
      save(); render();
      notify('تمت مزامنة الأساس');
      return;
    }

    if (b.dataset.deleteTx) {
      const id = String(b.dataset.deleteTx);
      if (!ID_REGEX.test(id)) return;
      if (!confirm('حذف هذه العملية؟')) return;
      state.transactions = state.transactions.filter((r) => r.id !== id);
      save(); render(); return;
    }

    if (b.dataset.deleteIncome) {
      const id = String(b.dataset.deleteIncome);
      if (!ID_REGEX.test(id)) return;
      if (!confirm('حذف سجل هذا الشهر؟')) return;
      state.income = state.income.filter((r) => r.id !== id);
      save(); render(); return;
    }
  });

  /* ============ Escape لإغلاق sheet ============ */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#sh').innerHTML) closeSheet();
  });

  /* ============ تغيير السنة ============ */
  document.addEventListener('change', (e) => {
    if (e.target.id === 'yearSel') {
      state.currentYear = clamp(+e.target.value, 1900, 2200);
      save();
      render();
      return;
    }
    if (e.target.id === 'backupFile') {
      const f = e.target.files[0];
      const meta = $('#fileMeta');
      if (meta) meta.textContent = f
        ? `${f.name} — ${(f.size / 1024).toFixed(1)} ك.ب`
        : 'لم يتم اختيار ملف';
    }
  });

  /* ============ تعديل الأسعار جراحيًا ============ */
  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.price;
    if (!k) return;
    const v = Math.max(0, num(e.target.value));
    state.prices[k] = v;
    save(true);
    const gramEl = document.querySelector('[data-gram-price]');
    if (gramEl) gramEl.textContent = n(goldPricePerGram() * num(state.prices.usd), 2);
  });

  /* ============ نماذج ============ */
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const el = (name) => f.elements?.[name];

    if (f.id === 'txForm') {
      const note = (el('note')?.value || '').trim();
      const amount = num(el('amount')?.value);
      if (!note) { notify('أدخل وصفًا', 'error'); el('note')?.focus(); return; }
      if (amount < 0) { notify('المبلغ سالب', 'error'); return; }
      const date = el('date')?.value || todayISO();
      if (date > todayISO() && !confirm('التاريخ مستقبلي. المتابعة؟')) return;
      state.transactions.push({
        id: uid(), date, type: String(el('type')?.value || 'عملية'),
        note: note.slice(0, 120), amount,
        year: +date.slice(0, 4) || state.currentYear,
      });
      save(); render(); notify('تمت الإضافة');
      return;
    }

    if (f.id === 'incomeForm') {
      const date = el('date')?.value;
      if (!date) { notify('اختر الشهر', 'error'); return; }
      if (state.income.some((r) => r.date === date)
          && !confirm('يوجد سجل لهذا الشهر. المتابعة؟')) return;
      state.income.push({
        id: uid(), date,
        income: Math.max(0, num(el('income')?.value)),
        transferredSar: Math.max(0, num(el('transferredSar')?.value)),
        transferred: Math.max(0, num(el('transferred')?.value)),
      });
      save(); render(); notify('تم الحفظ');
      return;
    }

    if (f.id === 'certForm') {
      state.certificate.principal = Math.max(0, num(el('principal')?.value));
      state.certificate.rates = [0, 1, 2, 3].map((i) =>
        clamp(num(el('r' + i)?.value), 0, 100));
      syncCertAsset();
      save(); render(); notify('تم الحفظ');
      return;
    }

    if (f.id === 'zakatForm') {
      state.zakat.base = Math.max(0, num(el('base')?.value));
      state.zakat.paid = Math.max(0, num(el('paid')?.value));
      save(); render(); notify('تم الحفظ');
      return;
    }
  });

  /* ============ المظهر ============ */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    const btn = $('#tbtn');
    if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  }
  function initTheme() {
    let t = 'light';
    try {
      t = localStorage.getItem(THEME_KEY)
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {}
    applyTheme(t);
  }
  const themeBtn = $('#tbtn');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  /* ============ PWA install ============ */
  const installBtn = $('#installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
    if (outcome === 'accepted') notify('تم تثبيت التطبيق');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
  });

  /* ============ بدء التشغيل ============ */
  initTheme();
  load();
  ensureZakat(true);
  render();

  /* ============ حفظ احتياطي ============ */
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    try { saveNow(true); } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(saveTimer);
      try { saveNow(true); } catch {}
    }
  });

  /* ============ تسجيل SW ============ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
    });
  }
})();
