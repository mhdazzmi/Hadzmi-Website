// Lekat — helper UI ala iOS: ikon, sheet, action sheet, dialog, toast, segmented, switch.
(function (G) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  const P = {
    stack: 'M4 7.5 12 3l8 4.5-8 4.5-8-4.5Zm0 4.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5',
    plus: 'M12 5v14M5 12h14',
    search: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21',
    chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
    gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14.2 3h-4l-.4 2.5a7.6 7.6 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1c.7.6 1.5 1 2.4 1.4l.4 2.5h4l.4-2.5c.9-.3 1.7-.8 2.4-1.4l2.4 1 2-3.4-2-1.6Z',
    chevR: 'm9 5 7 7-7 7', chevL: 'm15 5-7 7 7 7', chevD: 'm5 9 7 7 7-7',
    close: 'M6 6l12 12M18 6 6 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
    edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
    trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    pause: 'M8 5v14M16 5v14',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3h.01',
    speaker: 'M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5Z',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
    mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3',
    tag: 'M3 12V4h8l10 10-8 8L3 12Zm5-4h.01',
    download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
    upload: 'M12 20V9m0 0-4 4m4-4 4 4M5 4h14',
    filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5Z',
    sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
    check: 'm5 12 5 5 9-10',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13',
    play: 'M8 5v14l11-7z',
    folder: 'M3 6h6l2 2h10v11H3z',
    flame: 'M12 21a7 7 0 0 0 7-7c0-4-3-6-4-9-1 2-2 3-4 3 0-2 0-4-1-5-2 3-5 6-5 11a7 7 0 0 0 7 7Z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4'
  };
  const icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ''}"/></svg>`;

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, action) {
    let t = $('#toast');
    if (!t) { t = h('<div id="toast" class="toast glass" role="status"></div>'); document.body.appendChild(t); }
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 4500 : 2200);
  }

  // ---------- Sheet (modal bawah, bisa ditarik turun) ----------
  const sheetStack = [];
  function sheet({ title, body, left, right, onClose, full, cls }) {
    const back = h(`<div class="sheet-back"></div>`);
    const el = h(`<div class="sheet ${full ? 'full' : ''} ${cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
      <div class="grabber"></div>
      <div class="sheet-head">
        <div class="sh-l">${left || `<button type="button" class="btn-txt" data-close>Tutup</button>`}</div>
        <div class="sh-t">${esc(title || '')}</div>
        <div class="sh-r">${right || ''}</div>
      </div>
      <div class="sheet-body"></div></div>`);
    const bodyEl = el.querySelector('.sheet-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    document.body.append(back, el);
    requestAnimationFrame(() => { back.classList.add('in'); el.classList.add('in'); });
    const api = {
      el, body: bodyEl,
      close() {
        if (api.closed) return; api.closed = true;
        el.classList.remove('in'); back.classList.remove('in');
        setTimeout(() => { el.remove(); back.remove(); }, 380);
        const i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
        onClose && onClose();
      }
    };
    back.onclick = api.close;
    el.querySelectorAll('[data-close]').forEach(b => b.onclick = api.close);
    // tarik turun untuk menutup
    let y0 = null, dy = 0;
    const head = el.querySelector('.sheet-head'), grab = el.querySelector('.grabber');
    const start = e => { y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; };
    const move = e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; };
    const end = () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 110) api.close(); y0 = null; };
    [head, grab].forEach(x => { x.addEventListener('touchstart', start, { passive: true }); x.addEventListener('touchmove', move, { passive: true }); x.addEventListener('touchend', end); });
    sheetStack.push(api);
    return api;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length && !document.querySelector('.alert-back')) sheetStack[sheetStack.length - 1].close(); });

  // ---------- Action sheet ----------
  function actions(items, title) {
    return new Promise(res => {
      const back = h('<div class="sheet-back"></div>');
      const el = h(`<div class="actsheet"><div class="act-group glass-strong">${title ? `<div class="act-title">${esc(title)}</div>` : ''}${items.filter(Boolean).map((it, i) => `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}</div><button type="button" class="act-cancel glass-strong" data-i="-1">Batal</button></div>`);
      const list = items.filter(Boolean);
      document.body.append(back, el);
      requestAnimationFrame(() => { back.classList.add('in'); el.classList.add('in'); });
      const done = (i) => { el.classList.remove('in'); back.classList.remove('in'); setTimeout(() => { el.remove(); back.remove(); }, 300); res(i); if (i >= 0 && list[i].fn) list[i].fn(); };
      back.onclick = () => done(-1);
      el.querySelectorAll('button').forEach(b => b.onclick = () => done(+b.dataset.i));
    });
  }

  // ---------- Alert / prompt / confirm ----------
  function alertBox({ title, msg, input, buttons, value, placeholder, multiline }) {
    return new Promise(res => {
      const back = h('<div class="alert-back"></div>');
      const el = h(`<div class="alert glass-strong" role="alertdialog">
        <div class="al-body">${title ? `<div class="al-title">${esc(title)}</div>` : ''}${msg ? `<div class="al-msg">${esc(msg)}</div>` : ''}
        ${input ? (multiline ? `<textarea class="al-input" rows="4" placeholder="${esc(placeholder || '')}">${esc(value || '')}</textarea>` : `<input class="al-input" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}">`) : ''}</div>
        <div class="al-btns ${buttons.length > 2 ? 'stack' : ''}">${buttons.map((b, i) => `<button type="button" data-i="${i}" class="${b.style || ''}">${esc(b.label)}</button>`).join('')}</div></div>`);
      back.appendChild(el); document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('in'));
      const inp = el.querySelector('.al-input');
      if (inp) { setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 60); }
      const done = (i) => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); res({ i, value: inp ? inp.value : null }); };
      el.querySelectorAll('button').forEach(b => b.onclick = () => done(+b.dataset.i));
      if (inp && !multiline) inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(buttons.length - 1); if (e.key === 'Escape') done(0); });
    });
  }
  const confirm = async (title, msg, okLabel, danger) => (await alertBox({ title, msg, buttons: [{ label: 'Batal' }, { label: okLabel || 'OK', style: danger ? 'danger bold' : 'bold' }] })).i === 1;
  const prompt = async (title, value, placeholder, msg) => { const r = await alertBox({ title, msg, input: true, value, placeholder, buttons: [{ label: 'Batal' }, { label: 'Simpan', style: 'bold' }] }); return r.i === 1 ? r.value : null; };
  const info = (title, msg) => alertBox({ title, msg, buttons: [{ label: 'OK', style: 'bold' }] });

  // ---------- Kontrol form ----------
  const sw = (name, on) => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label>`;
  const seg = (name, opts, val) => `<div class="seg" data-name="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(val) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  function bindSeg(root, fn) {
    $$('.seg', root).forEach(s => s.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', s).forEach(x => x.classList.toggle('on', x === b));
      fn && fn(s.dataset.name, b.dataset.v);
    }));
  }
  const segVal = (root, name) => { const b = $(`.seg[data-name="${name}"] .on`, root); return b ? b.dataset.v : null; };

  function haptic() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }

  G.UI = { $, $$, esc, h, icon, toast, sheet, actions, alertBox, confirm, prompt, info, sw, seg, bindSeg, segVal, haptic };
})(window);
