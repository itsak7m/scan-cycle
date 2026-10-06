/* Share a program as a URL (#p=...) and as a 1200x627 share-card PNG. Solutions are never part of this: only the player's own program. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);

  // ---------------------------------------------------------------- compact encoding
  // element -> [r, c, type, ...params in DSL order]
  function pack(level, program, userTags) {
    const rungs = program.rungs.map((rg) => {
      const o = { e: rg.els.map((e) => [e.r, e.c, e.t].concat((SC.dsl.PARAMS[e.t] || []).map((k) => (e[k] === undefined ? '' : e[k])))) };
      if (rg.vb && rg.vb.length) o.v = rg.vb;
      if (rg.note) o.n = rg.note;
      return o;
    });
    const o = { l: level, r: rungs };
    if (userTags && userTags.length) o.u = userTags.map((t) => [t.name, t.addr]);
    return o;
  }

  function unpack(o) {
    if (!o || typeof o.l !== 'string' || !Array.isArray(o.r)) return null;
    const rungs = o.r.map((rg) => {
      const els = (rg.e || []).map((a) => {
        const el = { r: a[0], c: a[1], t: a[2] };
        const keys = SC.dsl.PARAMS[a[2]];
        if (!keys) throw new Error('bad element');
        keys.forEach((k, i) => { if (a[3 + i] !== '' && a[3 + i] !== undefined) el[k] = a[3 + i]; });
        return el;
      });
      const rung = { rows: 1, cols: 8, els, vb: rg.v || [] };
      if (rg.n) rung.note = rg.n;
      return U.ladderNorm(rung);
    });
    const clean = SC.sanitizeProgram({ v: 1, rungs });
    if (!clean) return null;
    const userTags = (Array.isArray(o.u) ? o.u : []).filter((x) => Array.isArray(x) && typeof x[0] === 'string' && /^[A-Za-z_]\w{0,40}$/.test(x[0]) && typeof x[1] === 'string' && SC.addr.parseAddr(x[1])).map((x) => ({ name: x[0], addr: x[1], type: /^MW|^QW|^IW/.test(x[1]) ? 'Int' : 'Bool', user: true, src: 'mem', desc: { en: '', ar: '' } }));
    return { level: o.l, program: clean, userTags };
  }

  const b64u = {
    enc(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(s) {
      s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
      const bin = atob(s); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    },
  };

  // format byte: 'L' = LZ-string, 'B' = base64url (works offline)
  function encode(level, program, userTags, forceB64) {
    const json = JSON.stringify(pack(level, program, userTags));
    if (!forceB64 && globalThis.LZString) return 'L' + globalThis.LZString.compressToEncodedURIComponent(json);
    return 'B' + b64u.enc(json);
  }
  function decode(code) {
    try {
      const f = code[0], body = code.slice(1);
      let json;
      if (f === 'L') { if (!globalThis.LZString) return { error: 'needs-lz' }; json = globalThis.LZString.decompressFromEncodedURIComponent(body); }
      else if (f === 'B') json = b64u.dec(body);
      else return { error: 'format' };
      if (!json) return { error: 'empty' };
      const r = unpack(JSON.parse(json));
      if (!r) return { error: 'shape' };
      // validate: compiles structurally (unknown tags are fine, they come from user tags)
      for (const rg of r.program.rungs) for (const e of rg.els) if (SC.compile.ELEMENTS.indexOf(e.t) < 0) return { error: 'element' };
      return r;
    } catch (e) { return { error: 'parse' }; }
  }
  U.share = { pack, unpack, encode, decode, MAX_URL: 2000 };

  U.shareUrl = function (levelId, program, userTags, forceB64) {
    const base = location.protocol === 'file:' ? 'https://itsak7m.github.io/scan-cycle/' : location.href.split('#')[0].split('?')[0];
    return base + '#p=' + encode(levelId, program, userTags, forceB64);
  };

  // read #p= on load; returns {level, program, userTags} or null
  U.readShareHash = function () {
    const m = /^#p=(.+)$/.exec(location.hash);
    if (!m) return null;
    const r = decode(m[1]);
    return r && !r.error ? r : r;
  };

  // ---------------------------------------------------------------- share card
  function ladderThumb(c, program, x0, y0, w, hMax) {
    const rungs = program.rungs.filter((r) => r.els.length).slice(0, 6);
    if (!rungs.length) return;
    const rowH = Math.min(46, hMax / Math.max(1, rungs.reduce((n, r) => n + r.rows, 0) + rungs.length * 0.3));
    let y = y0;
    const colW = Math.min(52, (w - 20) / 10);
    c.lineWidth = 2;
    for (const rg of rungs) {
      const hgt = rg.rows * rowH;
      c.strokeStyle = '#14262D'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0, y + hgt); c.moveTo(x0 + w, y); c.lineTo(x0 + w, y + hgt); c.stroke();
      c.lineWidth = 1.5;
      for (let r = 0; r < rg.rows; r++) {
        const yy = y + r * rowH + rowH / 2;
        c.strokeStyle = '#5E7279';
        c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + (r === 0 ? w : 0), yy); c.stroke();
      }
      for (const e of rg.els) {
        const cx = x0 + 14 + e.c * colW + colW / 2, cy = y + e.r * rowH + rowH / 2;
        c.strokeStyle = '#14262D'; c.fillStyle = '#14262D'; c.lineWidth = 2;
        if (e.t === 'NO' || e.t === 'NC' || e.t === 'POS' || e.t === 'NEG') {
          c.beginPath(); c.moveTo(cx - 6, cy - 9); c.lineTo(cx - 6, cy + 9); c.moveTo(cx + 6, cy - 9); c.lineTo(cx + 6, cy + 9); if (e.t === 'NC') { c.moveTo(cx - 9, cy + 10); c.lineTo(cx + 9, cy - 10); } c.stroke();
        } else if (e.t === 'OUT' || e.t === 'SET' || e.t === 'RST') {
          c.beginPath(); c.arc(cx - 10, cy, 10, -1.2, 1.2); c.moveTo(cx + 10 + 4, cy - 9); c.arc(cx + 10, cy, 10, 3.14 - 1.2, 3.14 + 1.2, false); c.stroke();
          if (e.t !== 'OUT') { c.font = '700 12px monospace'; c.textAlign = 'center'; c.fillText(e.t === 'SET' ? 'S' : 'R', cx, cy + 4); }
        } else {
          c.fillStyle = '#F7F8F8'; c.fillRect(cx - colW / 2 + 3, cy - rowH / 2 + 4, colW - 6, rowH - 8);
          c.strokeRect(cx - colW / 2 + 3, cy - rowH / 2 + 4, colW - 6, rowH - 8);
          c.fillStyle = '#14262D'; c.font = '700 11px monospace'; c.textAlign = 'center'; c.fillText(e.t, cx, cy + 4);
        }
      }
      for (const [b, g] of rg.vb || []) { c.strokeStyle = '#5E7279'; c.lineWidth = 2; const bx = x0 + 14 + b * colW; c.beginPath(); c.moveTo(bx, y + g * rowH + rowH / 2); c.lineTo(bx, y + (g + 1) * rowH + rowH / 2); c.stroke(); }
      y += hgt + rowH * 0.3;
    }
  }

  U.drawShareCard = function (canvas, L, lv, program) {
    const W = 1200, H = 627;
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    c.fillStyle = '#E9ECEC'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#F7F8F8'; c.fillRect(30, 30, W - 60, H - 60);
    c.strokeStyle = '#C6D0D2'; c.lineWidth = 2; c.strokeRect(30, 30, W - 60, H - 60);
    c.fillStyle = '#0B6E78'; c.fillRect(30, 30, 14, H - 60);
    c.fillStyle = '#14262D'; c.textAlign = 'left';
    c.font = '700 54px system-ui, "Segoe UI", sans-serif'; c.fillText('Scan Cycle', 76, 110);
    c.font = '500 24px system-ui, sans-serif'; c.fillStyle = '#5E7279'; c.fillText('Real PLC ladder logic on a bottling line', 76, 148);
    c.fillStyle = '#14262D'; c.font = '700 40px system-ui, sans-serif'; c.fillText(`${L.id} · ${L.title.en}`, 76, 230);
    c.direction = 'rtl'; c.textAlign = 'right'; c.font = '600 40px "IBM Plex Sans Arabic", "Segoe UI", "Noto Sans Arabic", Tahoma, sans-serif';
    c.fillText(L.title.ar, W - 76, 290); c.direction = 'ltr'; c.textAlign = 'left';
    const n = lv ? lv.stars : 0;
    c.font = '700 72px system-ui, sans-serif'; c.fillStyle = '#9A6B12'; c.fillText('★'.repeat(n) + '☆'.repeat(3 - n), 76, 380);
    c.font = '600 28px system-ui, sans-serif'; c.fillStyle = '#14262D';
    const rungs = program.rungs.filter((r) => r.els.length).length;
    const bpm = lv && lv.best && lv.best.bpm ? lv.best.bpm.toFixed(1) : '—';
    c.fillText(`Bottles/min: ${bpm}`, 76, 450);
    c.fillText(`Rungs: ${rungs}`, 76, 494);
    c.font = '500 22px system-ui, sans-serif'; c.fillStyle = '#5E7279';
    c.fillText('Verified by hidden FAT scenarios — my logic, my test log.', 76, 560);
    ladderThumb(c, program, 560, 330, 560, 230);
    c.fillStyle = '#5E7279'; c.font = '500 18px system-ui, sans-serif'; c.textAlign = 'right';
    c.fillText('itsak7m.github.io/scan-cycle', W - 60, H - 48);
  };

  // ---------------------------------------------------------------- share dialog
  U.openShare = function (L, program, userTags) {
    const lv = L.sandbox ? { stars: 0 } : U.lv(L.id);
    const url = U.shareUrl(L.id, program, userTags, !globalThis.LZString);
    const tooLong = url.length > U.share.MAX_URL;
    const json = JSON.stringify({ level: L.id, program, userTags });
    const canvas = h('canvas', { class: 'share-canvas', width: 1200, height: 627, 'aria-label': 'Share card preview' });
    U.drawShareCard(canvas, L, lv, program);
    const urlBox = h('input', { type: 'text', readonly: true, value: tooLong ? '' : url, 'aria-label': 'Share link' });
    const copy = (text, msg) => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => U.toast(msg), () => { try { urlBox.value = text; urlBox.select(); if (document.execCommand('copy')) U.toast(msg); else throw new Error('copy'); } catch (e) { U.toast(tr('Copy failed — select the text and copy it.', 'فشل النسخ — حدد النص وانسخه.')); } }); };
    const body = h('div', { class: 'share' },
      tooLong ? h('p', { class: 'warn small' }, tr(`The link would be ${url.length} characters (over ${U.share.MAX_URL}). Copy the JSON instead.`, `الرابط ${url.length} حرف (أكثر من ${U.share.MAX_URL}). انسخ الـ JSON بدالو.`)) : h('p', { class: 'small muted' }, `${url.length} ` + tr('characters', 'حرف')),
      h('div', { class: 'maptools' },
        tooLong ? null : h('button', { class: 'btn', type: 'button', onclick: () => copy(url, tr('Link copied', 'اننسخ الرابط')) }, '🔗 ' + tr('Copy link', 'انسخ الرابط')),
        h('button', { class: 'btn', type: 'button', onclick: () => copy(json, tr('JSON copied', 'اننسخ الـ JSON')) }, '{ } ' + tr('Copy JSON', 'انسخ JSON'))),
      tooLong ? null : urlBox,
      h('div', { class: 'canvas-wrap' }, canvas),
      h('div', { class: 'maptools' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => canvas.toBlob((b) => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `scan-cycle-${L.id}.png`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, 'image/png') }, '⬇ ' + tr('Download PNG', 'نزّل PNG')),
        (navigator.canShare && typeof File !== 'undefined') ? h('button', { class: 'btn', type: 'button', onclick: () => canvas.toBlob(async (b) => {
          try { const f = new File([b], `scan-cycle-${L.id}.png`, { type: 'image/png' }); if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Scan Cycle ' + L.id }); else U.toast(tr('Sharing files is not supported here.', 'مشاركة الملفات غير مدعومة هون.')); } catch (e) { /* cancelled */ }
        }, 'image/png') }, '↗ ' + tr('Share…', 'شارك…')) : null));
    U.modal(tr('Share your program', 'شارك برنامجك'), body, (close) => [h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Close', 'سكّر'))], { enterSubmits: false });
  };
})();
