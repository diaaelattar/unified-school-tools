/* Nepras — رسوم بيانية بسيطة بـ SVG (بلا مكتبات ولا اتصال خارجي).
   NeprasCharts.barH(opts)   → نص HTML لشكل (figure) فيه الرسم والمفتاح وجدول بديل.
   NeprasCharts.attach(root) → يفعّل التلميحات (hover / focus) على كل رسم داخل root.

   قواعد الرسم: أعمدة أفقية بسماكة 20 (≤ 24)، طرف البيانات مدوَّر 4 والقاعدة مربعة،
   فجوة 2 بين القطاعات المتجاورة، خطوط شبكة رفيعة، قيمة الإجمالي عند طرف العمود،
   النصوص بألوان النص لا بلون السلسلة، ومفتاح (legend) لأكثر من سلسلة، وجدول بديل لكل رسم.
   كل نص يأتي من البيانات يمرّ عبر الهروب (NeprasEscape.html) أو textContent في التلميح.
   اتجاه الرسم من اليمين إلى اليسار (القاعدة على اليمين) ليوافق واجهة عربية. */
(function (global) {
  'use strict';
  if (global.NeprasCharts) return;

  const esc = (v) => global.NeprasEscape
    ? global.NeprasEscape.html(v)
    : String(v ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const fmt = (n) => {
    const r = Math.round(num(n) * 10) / 10;
    return String(r);
  };

  // أقرب حد أعلى «نظيف» وخطوات المحور
  function niceScale(max, minMax) {
    const m = Math.max(num(max), num(minMax || 0), 1);
    const pow = Math.pow(10, Math.floor(Math.log10(m)));
    let step = pow;
    for (const f of [1, 2, 2.5, 5, 10]) { step = f * pow; if (m / step <= 5) break; }
    const top = Math.ceil(m / step - 1e-9) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { top, ticks };
  }

  // مسار عمود أفقي: القاعدة x0 على اليمين، طرف البيانات x1 على اليسار (x1 < x0)
  function barPath(x0, x1, y, h, round) {
    const w = x0 - x1;
    const r = 4;
    if (!round || w <= r * 2) return `M${x0},${y}H${x1}V${y + h}H${x0}Z`;
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
  }

  let uid = 0;

  /**
   * @param {object} o
   * @param {string} o.title
   * @param {string} [o.subtitle]
   * @param {{name:string}[]} o.series   سلسلة واحدة أو أكثر (الألوان بالترتيب الثابت 1، 2)
   * @param {{label:string, values:number[]}[]} o.rows
   * @param {boolean} [o.stacked]        تكديس القيم (وإلا سلسلة واحدة فقط)
   * @param {{value:number,label:string}[]} [o.refLines]
   * @param {number} [o.minMax]          حد أدنى لمقياس المحور (ليظهر خط مرجعي مثلًا)
   * @param {string} [o.unit]            وحدة تُذكر في التلميح والجدول
   */
  function barH(o) {
    const series = Array.isArray(o.series) && o.series.length ? o.series : [{ name: '' }];
    const rows = (o.rows || []).filter((r) => r && Array.isArray(r.values));
    const unit = o.unit ? ' ' + o.unit : '';
    const id = 'nviz' + (++uid);
    if (!rows.length) {
      return `<figure class="viz"><figcaption class="viz-title">${esc(o.title)}</figcaption><div class="viz-empty">لا توجد بيانات كافية للرسم.</div></figure>`;
    }

    const W = 520, labelW = 118, tipPad = 46, padTop = 22, pitch = 30, bar = 20, axisH = 24;
    const x0 = W - labelW;                 // خط القاعدة (يمين)
    const plotW = x0 - tipPad;             // أقصى طول للعمود
    const H = padTop + rows.length * pitch + axisH;
    const totals = rows.map((r) => r.values.reduce((a, b) => a + num(b), 0));
    const { top, ticks } = niceScale(Math.max(...totals), o.minMax);
    const X = (v) => x0 - (num(v) / top) * plotW;

    let svg = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" direction="ltr" role="img" aria-labelledby="${id}t" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<title id="${id}t">${esc(o.title)}</title>`;

    // الشبكة والمحور
    for (const t of ticks) {
      const x = X(t);
      svg += `<line class="viz-grid" x1="${x}" x2="${x}" y1="${padTop - 6}" y2="${H - axisH}"/>`;
      svg += `<text class="viz-tick" x="${x}" y="${H - 7}" text-anchor="middle">${esc(fmt(t))}</text>`;
    }
    svg += `<line class="viz-axis" x1="${x0}" x2="${x0}" y1="${padTop - 6}" y2="${H - axisH}"/>`;

    // خطوط مرجعية
    for (const ref of (o.refLines || [])) {
      const x = X(ref.value);
      svg += `<line class="viz-ref" x1="${x}" x2="${x}" y1="${padTop - 6}" y2="${H - axisH}"/>`;
      svg += `<text class="viz-reflabel" x="${x}" y="${padTop - 10}" text-anchor="middle">${esc(ref.label)}</text>`;
    }

    rows.forEach((r, i) => {
      const y = padTop + i * pitch;
      const by = y + (pitch - bar) / 2;
      const tip = {
        title: r.label,
        rows: series.map((s, k) => ({ k: k + 1, name: s.name, value: fmt(r.values[k]) + unit }))
      };
      if (series.length > 1) tip.rows.push({ k: 0, name: 'الإجمالي', value: fmt(totals[i]) + unit });
      svg += `<g class="viz-mark" tabindex="0" data-tip="${esc(JSON.stringify(tip))}">`;
      svg += `<rect class="viz-hit" x="0" y="${y}" width="${W}" height="${pitch}"/>`;
      svg += `<text class="viz-cat" x="${W - 4}" y="${y + pitch / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`;
      let cursor = 0;
      const vals = r.values.map(num);
      const lastIdx = vals.reduce((a, v, k) => (v > 0 ? k : a), -1);
      vals.forEach((v, k) => {
        if (v <= 0) return;
        const before = cursor;
        cursor += v;
        const xs = before > 0 ? X(before) - 2 : X(before);   // فجوة 2 بين القطاعات المتجاورة
        const end = X(cursor);
        if (xs - end < 1) return;
        svg += `<path class="viz-s${k + 1}" d="${barPath(xs, end, by, bar, k === lastIdx)}"/>`;
      });
      const tipX = X(cursor) - 6;
      svg += `<text class="viz-val" x="${tipX}" y="${y + pitch / 2 + 4}" text-anchor="end">${esc(fmt(totals[i]))}</text>`;
      svg += `</g>`;
    });
    svg += `</svg>`;

    const legend = series.length > 1
      ? `<div class="viz-legend">${series.map((s, k) => `<span><i class="viz-key viz-k${k + 1}"></i>${esc(s.name)}</span>`).join('')}</div>`
      : '';

    const head = `<tr><th>${esc(o.rowHeader || '')}</th>${series.map((s) => `<th>${esc(s.name || 'القيمة')}</th>`).join('')}${series.length > 1 ? '<th>الإجمالي</th>' : ''}</tr>`;
    const body = rows.map((r, i) => `<tr><td>${esc(r.label)}</td>${series.map((_, k) => `<td>${esc(fmt(r.values[k]))}</td>`).join('')}${series.length > 1 ? `<td>${esc(fmt(totals[i]))}</td>` : ''}</tr>`).join('');
    const table = `<details class="viz-table"><summary>عرض كجدول</summary><table><thead>${head}</thead><tbody>${body}</tbody></table></details>`;

    return `<figure class="viz">` +
      `<figcaption class="viz-title">${esc(o.title)}${o.subtitle ? `<small>${esc(o.subtitle)}</small>` : ''}</figcaption>` +
      legend + svg + table + `</figure>`;
  }

  // ───────── التلميحات: عنصر واحد، النصوص عبر textContent فقط ─────────
  function attach(root) {
    if (!root || root.__nvizAttached) return;
    root.__nvizAttached = true;
    let tipEl = null;
    const ensure = () => {
      if (tipEl) return tipEl;
      tipEl = document.createElement('div');
      tipEl.className = 'viz-tip';
      tipEl.hidden = true;
      tipEl.setAttribute('role', 'tooltip');
      root.appendChild(tipEl);
      return tipEl;
    };
    const fill = (el, data) => {
      el.textContent = '';
      const t = document.createElement('div');
      t.className = 'viz-tip-title';
      t.textContent = data.title || '';
      el.appendChild(t);
      for (const r of data.rows || []) {
        const line = document.createElement('div');
        line.className = 'viz-tip-row';
        const key = document.createElement('i');
        key.className = r.k ? 'viz-key viz-k' + r.k : 'viz-key viz-k0';
        const val = document.createElement('b');
        val.textContent = r.value;
        const name = document.createElement('span');
        name.textContent = r.name;
        line.append(key, val, name);
        el.appendChild(line);
      }
    };
    const show = (markEl, clientX, clientY) => {
      let data;
      try { data = JSON.parse(markEl.getAttribute('data-tip') || '{}'); } catch (_) { return; }
      const el = ensure();
      fill(el, data);
      el.hidden = false;
      const box = root.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = clientX - box.left + 12, y = clientY - box.top + 14;
      if (x + w > box.width - 4) x = Math.max(4, clientX - box.left - w - 12);
      if (y + h > box.height - 4) y = Math.max(4, clientY - box.top - h - 10);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    };
    const hide = () => { if (tipEl) tipEl.hidden = true; root.querySelectorAll('.viz-mark.is-hover').forEach((m) => m.classList.remove('is-hover')); };
    root.addEventListener('pointermove', (e) => {
      const m = e.target.closest && e.target.closest('.viz-mark');
      if (!m || !root.contains(m)) { hide(); return; }
      root.querySelectorAll('.viz-mark.is-hover').forEach((x) => { if (x !== m) x.classList.remove('is-hover'); });
      m.classList.add('is-hover');
      show(m, e.clientX, e.clientY);
    });
    root.addEventListener('pointerleave', hide);
    root.addEventListener('focusin', (e) => {
      const m = e.target.closest && e.target.closest('.viz-mark');
      if (!m) return;
      m.classList.add('is-hover');
      const r = m.getBoundingClientRect();
      show(m, r.left + r.width / 2, r.top + r.height / 2);
    });
    root.addEventListener('focusout', hide);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }

  global.NeprasCharts = Object.freeze({ barH, attach });
})(typeof window !== 'undefined' ? window : globalThis);
