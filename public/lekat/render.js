// Lekat — renderer template kartu ala Anki: {{Field}}, {{#F}}…{{/F}}, {{^F}}, {{FrontSide}}, {{cloze:F}},
// {{type:F}}, {{type:cloze:F}}, {{tts en_US:F}}, {{text:F}}, {{hint:F}}, {{image-occlusion}}, [sound:file].
(function (G) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tmpDiv = document.createElement('template'); // isi template tidak memuat gambar/audio
  function stripHtml(h) {
    h = String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(div|p|li)>/gi, ' ').replace(/\[sound:[^\]]+\]/g, '');
    tmpDiv.innerHTML = h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
    return (tmpDiv.content.textContent || '').replace(/ /g, ' ');
  }
  function parseOcc(s) {
    try { const o = typeof s === 'string' ? JSON.parse(s || '{}') : (s || {}); return { mode: o.mode || 'hideAll', shapes: Array.isArray(o.shapes) ? o.shapes : [] }; }
    catch (e) { return { mode: 'hideAll', shapes: [] }; }
  }

  // ---------- Media ----------
  const urlCache = new Map();
  function mediaUrl(name) {
    if (/^(https?:|data:|blob:)/i.test(name)) return name;
    let key = name; try { key = decodeURIComponent(name); } catch (e) {}
    if (urlCache.has(key)) return urlCache.get(key);
    const m = G.DB.get('media', key);
    if (!m) return name;
    // belum ada di perangkat ini: pakai link bertanda tangan dari R2 sambil diunduh di latar belakang
    if (!m.blob) return (G.Sync && G.Sync.signedUrl(m)) || name;
    const u = URL.createObjectURL(m.blob); urlCache.set(key, u); return u;
  }
  function resolveMedia(html) {
    return html.replace(/(<img[^>]*?\ssrc=)(["'])([^"']+)\2/gi, (all, a, q, src) => a + q + esc(mediaUrl(src)) + q)
      .replace(/\[sound:([^\]]+)\]/g, (_, f) => `<button type="button" class="play-btn" data-sound="${esc(f)}" aria-label="Putar audio"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`);
  }

  // ---------- Cloze ----------
  // Mendukung {{c1::jawaban}} dan {{c1::jawaban::petunjuk}}, termasuk cloze bersarang sederhana.
  function renderCloze(text, ord, side) {
    const n = ord + 1;
    function parse(s, start, depth) {
      let res = '', pos = start;
      while (pos < s.length) {
        const open = s.indexOf('{{c', pos), close = s.indexOf('}}', pos);
        if (close === -1 && open === -1) { res += s.slice(pos); return [res, s.length]; }
        if (open !== -1 && (close === -1 || open < close) && /^\{\{c\d+::/.test(s.slice(open))) {
          res += s.slice(pos, open);
          const m = s.slice(open).match(/^\{\{c(\d+)::/);
          const [inner, end] = parse(s, open + m[0].length, depth + 1);
          res += fmt(+m[1], inner);
          pos = end + 2;
        } else if (close !== -1 && depth > 0) {
          res += s.slice(pos, close); return [res, close];
        } else if (close !== -1) {
          res += s.slice(pos, close + 2); pos = close + 2;
        } else { res += s.slice(pos); return [res, s.length]; }
      }
      return [res, pos];
    }
    function fmt(c, inner) {
      let ans = inner, hint = '';
      const k = splitHint(inner); ans = k[0]; hint = k[1];
      if (c !== n) return ans;
      if (side === 'q') return `<span class="cloze" data-ord="${c}">[${hint ? esc(hint) : '…'}]</span>`;
      return `<span class="cloze revealed">${ans}</span>`;
    }
    function splitHint(s) {
      // pisahkan "::" level atas (bukan di dalam cloze bersarang)
      const depth = 0;
      for (let k = 0; k < s.length - 1; k++) {
        if (s[k] === '<' ) { const e = s.indexOf('>', k); if (e > 0) { k = e; continue; } }
        if (s.startsWith('::', k) && depth === 0) return [s.slice(0, k), stripHtml(s.slice(k + 2))];
      }
      return [s, ''];
    }
    return parse(String(text || ''), 0, 0)[0];
  }
  function clozeAnswers(text, ord) {
    const out = []; const n = ord + 1;
    String(text || '').replace(/\{\{c(\d+)::([\s\S]*?)(?:::[^}]*)?\}\}/g, (_, c, a) => { if (+c === n) out.push(stripHtml(a)); });
    return out;
  }

  // ---------- Image occlusion ----------
  function renderIO(note, ord, side) {
    const occ = parseOcc(note.fields.Occlusions);
    const img = (note.fields.Image || '').match(/src=["']([^"']+)["']/);
    const src = img ? img[1] : stripHtml(note.fields.Image).trim();
    const target = ord + 1;
    let masks = '';
    for (const s of occ.shapes) {
      const c = s.c || 1;
      const isT = c === target;
      if (!isT && occ.mode === 'hideOne') continue;
      const cls = isT ? (side === 'q' ? 'io-mask target' : 'io-mask target revealed') : 'io-mask other';
      const style = `left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%`;
      masks += `<div class="${cls}" style="${style}">${isT && side === 'q' ? '<span>?</span>' : ''}${s.label && side === 'a' && isT ? '' : ''}</div>`;
    }
    return `<div class="io-wrap"><img src="${esc(src)}" alt="">${masks}</div>`;
  }

  // ---------- Type answer ----------
  function typeDiff(given, correct) {
    given = given.trim(); correct = correct.trim();
    if (!given) return `<div class="type-cmp"><div class="type-correct">${esc(correct)}</div></div>`;
    if (given.toLowerCase() === correct.toLowerCase() && given === correct) return `<div class="type-cmp ok"><span class="good">${esc(correct)}</span> <span class="type-ok">✓</span></div>`;
    // LCS sederhana per karakter
    const a = given, b = correct, m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, gOut = '', cOut = '';
    while (i < m && j < n) {
      if (a[i].toLowerCase() === b[j].toLowerCase()) { gOut += `<span class="good">${esc(a[i])}</span>`; cOut += `<span class="good">${esc(b[j])}</span>`; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { gOut += `<span class="bad">${esc(a[i])}</span>`; i++; }
      else { gOut += `<span class="miss">-</span>`; cOut += `<span class="missed">${esc(b[j])}</span>`; j++; }
    }
    while (i < m) { gOut += `<span class="bad">${esc(a[i++])}</span>`; }
    while (j < n) { gOut += `<span class="miss">-</span>`; cOut += `<span class="missed">${esc(b[j++])}</span>`; }
    return `<div class="type-cmp"><div class="type-given">${gOut}</div><div class="type-arrow">↓</div><div class="type-correct">${cOut}</div></div>`;
  }

  // ---------- Template ----------
  function renderTemplate(tpl, note, nt, ctx) {
    const fields = note.fields || {};
    const get = (name) => {
      name = name.trim();
      if (name === 'Tags') return (note.tags || []).join(' ');
      if (name === 'Type') return nt.name;
      if (name === 'Deck') return ctx.deckName || '';
      if (name === 'Card') return (nt.tmpls[ctx.ord] || nt.tmpls[0] || {}).name || '';
      if (name === 'FrontSide') return ctx.frontSide || '';
      return fields[name] != null ? fields[name] : '';
    };
    const nonEmpty = (name) => stripHtml(get(name)).trim().length > 0 || /<img/i.test(get(name));
    // section {{#F}}..{{/F}} dan {{^F}}..{{/F}} (bisa bersarang, diproses berulang)
    let prev;
    do {
      prev = tpl;
      tpl = tpl.replace(/\{\{([#^])([^}]+)\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\2\}\}/g, (_, t, name, body) => {
        const ok = nonEmpty(name);
        return (t === '#' ? ok : !ok) ? body : '';
      });
    } while (tpl !== prev);
    return tpl.replace(/\{\{([^#^/{}][^{}]*?)\}\}/g, (_, tag) => {
      tag = tag.trim();
      if (tag === 'image-occlusion') return ctx.probe ? 'x' : renderIO(note, ctx.ord, ctx.side);
      if (tag === 'FrontSide') return ctx.frontSide || '';
      const parts = tag.split(':');
      const fname = parts.pop();
      const filters = parts.map(p => p.trim());
      let val = get(fname);
      if (!filters.length) return ctx.probe ? val : val;
      const f0 = filters[0];
      if (f0 === 'type') {
        const isCloze = filters[1] === 'cloze';
        const correct = isCloze ? clozeAnswers(val, ctx.ord).join(', ') : stripHtml(val).trim();
        if (ctx.probe) return '';
        if (ctx.side === 'q') return `<div class="type-wrap"><input class="type-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ketik jawaban…" data-correct="${esc(correct)}"></div>`;
        return typeDiff(ctx.typed || '', correct);
      }
      if (f0 === 'cloze') return renderCloze(val, ctx.ord, ctx.side);
      if (f0 === 'text') return esc(stripHtml(val));
      if (f0 === 'hint') return stripHtml(val).trim() ? `<details class="hint"><summary>Petunjuk</summary>${val}</details>` : '';
      if (/^tts\b/.test(f0)) {
        const lang = (f0.split(/\s+/)[1] || 'en_US').replace('_', '-');
        const text = stripHtml(filters[1] === 'cloze' ? renderCloze(val, ctx.ord, ctx.side) : val).trim();
        if (!text) return '';
        return `<button type="button" class="play-btn tts" data-tts="${esc(text)}" data-lang="${esc(lang)}" aria-label="Dengarkan"><svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1A9 9 0 0 0 14 3.2z"/></svg></button>`;
      }
      return val;
    });
  }

  function renderCard(card, opts) {
    const note = G.DB.get('notes', card.noteId);
    const nt = G.DB.get('notetypes', note.typeId);
    const t = nt.kind === 'std' ? nt.tmpls[card.ord] || nt.tmpls[0] : nt.tmpls[0];
    const deck = G.DB.get('decks', card.deckId);
    const ctx = { ord: card.ord, deckName: deck ? deck.name : '' };
    const q = renderTemplate(t.q, note, nt, Object.assign({}, ctx, { side: 'q' }));
    const a = renderTemplate(t.a, note, nt, Object.assign({}, ctx, { side: 'a', frontSide: q.replace(/<div class="type-wrap">[\s\S]*?<\/div>/g, ''), typed: (opts && opts.typed) || '' }));
    return { q: resolveMedia(q), a: resolveMedia(a), css: nt.css || '', note, nt };
  }

  G.Render = { esc, stripHtml, renderTemplate, renderCard, renderCloze, clozeAnswers, parseOcc, mediaUrl, resolveMedia, typeDiff };
})(window);
