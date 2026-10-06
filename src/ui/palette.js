/* Palette popover, parameter dialogs and tag helpers for the ladder editor. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const A = SC.addr;

  // ---------------------------------------------------------------- modal
  function modal(title, body, buttons, opts) {
    opts = opts || {};
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const opener = document.activeElement;
    const app = document.getElementById('app');
    if (app) app.inert = true; // nothing behind the dialog can be reached
    const close = (v) => {
      back.remove(); document.removeEventListener('keydown', onKey, true);
      if (app) app.inert = false;
      if (opener && opener.isConnected && opener.focus) opener.focus();
      if (opts.onClose) opts.onClose(v);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = Array.from(box.querySelectorAll('input,select,textarea,button')).filter((x) => !x.disabled && !x.hidden && x.offsetParent !== null);
        if (f.length) { const i = f.indexOf(document.activeElement); const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1); e.preventDefault(); f[n].focus(); }
        return;
      }
      if (e.key === 'Enter' && box.contains(e.target) && opts.enterSubmits !== false && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); if (opts.onEnter) opts.onEnter(); }
    }
    box.append(h('h3', { class: 'modal-t' }, title), body, h('div', { class: 'modal-btns' }, buttons(close)));
    back.append(box);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    const first = box.querySelector('input,select,button.primary');
    if (first) setTimeout(() => first.focus(), 0);
    return { close, box };
  }
  U.modal = modal;

  // ---------------------------------------------------------------- tags
  function allTags(ctx) { return ctx.tags(); }
  function tagKind(t) { const a = A.parseAddr(t.addr); return a ? a.kind : null; }

  // Resolve text typed into a tag field. kind: 'bit' | 'bitw' | 'edge' | 'int' | 'intw' | 'intval'
  // returns {ok, value, created?, error?}
  function resolveTag(text, kind, ctx) {
    text = String(text === undefined ? '' : text).trim();
    if (!text) return { ok: false, error: { en: 'Required', ar: 'مطلوب' } };
    const want = kind === 'bit' || kind === 'bitw' || kind === 'edge' ? 'bit' : 'word';
    const write = kind === 'bitw' || kind === 'edge' || kind === 'intw';
    if (kind === 'intval' && /^-?\d+$/.test(text)) return { ok: true, value: text };
    if (kind === 'intval' && /^T#/i.test(text)) return A.parseTime(text) !== null ? { ok: true, value: text } : { ok: false, error: { en: 'Not a valid time literal', ar: 'قيمة وقت غير صالحة' } };
    const tags = allTags(ctx);
    const tm = A.makeTagMap(tags);
    let a = null, tag = tm.byName[text];
    if (tag) a = A.parseAddr(tag.addr);
    else a = A.parseAddr(text);
    if (a) {
      if (a.kind !== want) return { ok: false, error: want === 'bit' ? { en: 'This is not a bit (Bool) tag', ar: 'هاد مش tag من نوع Bool' } : { en: 'This is not an Int (word) tag', ar: 'هاد مش tag من نوع Int' } };
      if (write && (a.arr === 'I' || a.arr === 'IW')) return { ok: false, error: { en: 'Inputs cannot be written', ar: 'ما بصير نكتب على مدخل' } };
      if (kind === 'edge' && a.arr !== 'M') return { ok: false, error: { en: 'Edge memory must be an M bit', ar: 'ذاكرة الـ edge لازم تكون بت M' } };
      return { ok: true, value: text };
    }
    const m = /^([A-Za-z_]\w*)\.(Q|QU|QD|ET|CV|PT)$/.exec(text);
    if (m && ctx.insts().indexOf(m[1]) >= 0) {
      if (write) return { ok: false, error: { en: 'Block outputs cannot be written', ar: 'مخارج البلوكات ما بتنكتب' } };
      if (want === 'bit' && /^Q/.test(m[2])) return { ok: true, value: text };
      if (want === 'word' && !/^Q/.test(m[2])) return { ok: true, value: text };
      return { ok: false, error: { en: 'Wrong type for this field', ar: 'نوع غير مناسب لهالحقل' } };
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
      if (A.parseAddr(text)) return { ok: false, error: { en: 'Bad name', ar: 'اسم غير صالح' } };
      if (SC.ioByName[text]) return { ok: false, error: { en: 'This name belongs to a machine I/O point that this level does not use. Pick another name.', ar: 'هالاسم تبع نقطة I/O بالماكينة وهالمستوى ما بيستخدمها. اختار اسم ثاني.' } };
      const addr = A.nextFreeAddr(tags.concat((ctx.usedAddrs ? ctx.usedAddrs() : []).map((a) => ({ addr: a }))), want);
      if (!addr) return { ok: false, error: { en: 'No free memory addresses left', ar: 'ما ضل عناوين ذاكرة فاضية' } };
      return { ok: true, value: text, created: { name: text, addr, type: want === 'bit' ? 'Bool' : 'Int', user: true, src: 'mem', desc: { en: '', ar: '' } } };
    }
    return { ok: false, error: { en: 'Use letters, digits and _ (start with a letter)', ar: 'استخدم حروف وأرقام و _ (وابدأ بحرف)' } };
  }

  function describeTag(text, ctx) {
    const t = A.makeTagMap(allTags(ctx)).byName[String(text).trim()];
    if (!t) return null;
    const d = t.desc || {};
    return { name: t.name, addr: U.useCodesys ? A.toCodesys(t.addr) : t.addr, type: t.type, en: d.en || '', ar: d.ar || '', wiring: t.wiring };
  }

  // ---------------------------------------------------------------- field definitions
  const LAB = {
    a: { en: 'Tag', ar: 'الـ {{Tag}}' }, inst: { en: 'Instance name', ar: 'اسم الـ {{instance}}' },
    pt: { en: 'PT (preset time)', ar: 'PT (الوقت المحدد)' }, pv: { en: 'PV (preset value)', ar: 'PV (القيمة المحددة)' },
    rs: { en: 'R (reset) — optional', ar: 'R (تصفير) — اختياري' }, ld: { en: 'LD (load) — optional', ar: 'LD (تحميل) — اختياري' },
    cd: { en: 'CD (count down) — optional', ar: 'CD (عدّ تنازلي) — اختياري' },
    op: { en: 'Operator', ar: 'العملية' }, a1: { en: 'IN1', ar: 'IN1' }, b1: { en: 'IN2', ar: 'IN2' },
    inp: { en: 'IN', ar: 'IN' }, out: { en: 'OUT', ar: 'OUT' }, w: { en: 'Word (Int tag)', ar: 'الـ {{Word}} (Int tag)' }, bit: { en: 'Bit shifted in', ar: 'البت الداخل' },
    edge: { en: 'Edge memory (own M bit)', ar: 'ذاكرة الـ {{edge}} (بت M خاص)' },
  };

  function fieldsFor(t) {
    switch (t) {
      case 'NO': case 'NC': return [{ k: 'a', kind: 'bit', lab: LAB.a }];
      case 'OUT': case 'SET': case 'RST': return [{ k: 'a', kind: 'bitw', lab: LAB.a }];
      case 'POS': case 'NEG': return [{ k: 'a', kind: 'edge', lab: LAB.edge }];
      case 'TON': case 'TOF': case 'TP': return [{ k: 'i', kind: 'inst', lab: LAB.inst }, { k: 'pt', kind: 'time', lab: LAB.pt }];
      case 'TONR': return [{ k: 'i', kind: 'inst', lab: LAB.inst }, { k: 'pt', kind: 'time', lab: LAB.pt }, { k: 'rs', kind: 'bit?', lab: LAB.rs }];
      case 'CTU': return [{ k: 'i', kind: 'inst', lab: LAB.inst }, { k: 'pv', kind: 'intval', lab: LAB.pv }, { k: 'rs', kind: 'bit?', lab: LAB.rs }];
      case 'CTD': return [{ k: 'i', kind: 'inst', lab: LAB.inst }, { k: 'pv', kind: 'intval', lab: LAB.pv }, { k: 'ld', kind: 'bit?', lab: LAB.ld }];
      case 'CTUD': return [{ k: 'i', kind: 'inst', lab: LAB.inst }, { k: 'pv', kind: 'intval', lab: LAB.pv }, { k: 'cd', kind: 'bit?', lab: LAB.cd }, { k: 'rs', kind: 'bit?', lab: LAB.rs }, { k: 'ld', kind: 'bit?', lab: LAB.ld }];
      case 'CMP': return [{ k: 'a', kind: 'intval', lab: LAB.a1 }, { k: 'op', kind: 'op', lab: LAB.op }, { k: 'b', kind: 'intval', lab: LAB.b1 }];
      case 'MOVE': return [{ k: 'a', kind: 'intval', lab: LAB.inp }, { k: 'o', kind: 'intw', lab: LAB.out }];
      case 'ADD': case 'SUB': return [{ k: 'a', kind: 'intval', lab: LAB.a1 }, { k: 'b', kind: 'intval', lab: LAB.b1 }, { k: 'o', kind: 'intw', lab: LAB.out }];
      case 'SHL': case 'SHR': return [{ k: 'w', kind: 'intw', lab: LAB.w }, { k: 'b', kind: 'bit', lab: LAB.bit }];
    }
    return [];
  }

  function suggestInst(t, ctx) {
    const used = ctx.insts();
    for (let n = 1; n < 99; n++) { const nm = `DB_${t}_${n}`; if (used.indexOf(nm) < 0) return nm; }
    return `DB_${t}`;
  }
  function suggestEdge(ctx) {
    const names = allTags(ctx).map((x) => x.name);
    for (let n = 1; n < 99; n++) if (names.indexOf('Edge_' + n) < 0) return 'Edge_' + n;
    return 'Edge';
  }

  // normalise a time typed by the player; returns {value} or {ask:true} / {error}
  function normTime(txt) {
    txt = String(txt).trim();
    if (/^T#/i.test(txt)) return A.parseTime(txt) !== null ? { value: 'T#' + txt.slice(2).toLowerCase() } : { error: { en: 'Not a valid time. Example: T#3s or T#500ms', ar: 'وقت غير صالح. مثال: T#3s أو T#500ms' } };
    if (/^\d+(\.\d+)?\s*(ms|s|m|h)$/i.test(txt)) return { value: 'T#' + txt.replace(/\s+/g, '').toLowerCase(), fixed: true };
    if (/^\d+(\.\d+)?$/.test(txt)) return { ask: txt };
    return { error: { en: 'Not a valid time. Example: T#3s or T#500ms', ar: 'وقت غير صالح. مثال: T#3s أو T#500ms' } };
  }

  // ---------------------------------------------------------------- parameter dialog
  // existing: element object or null.  done(el, createdTags[]) is called on OK.
  function openParams(ctx, type, existing, done) {
    const meta = U.ELMAP[type];
    const fields = fieldsFor(type);
    const inputs = {}, errs = {}, hints = {};
    const lang = U.lang;
    const dlBit = 'dl-bit', dlInt = 'dl-int';
    document.querySelectorAll('#' + dlBit + ',#' + dlInt).forEach((n) => n.remove());
    const tags = allTags(ctx);
    const insts = ctx.instDefs();
    const dl1 = h('datalist', { id: dlBit }), dl2 = h('datalist', { id: dlInt });
    for (const t of tags) {
      const k = tagKind(t);
      (k === 'bit' ? dl1 : dl2).append(h('option', { value: t.name }, t.addr));
    }
    for (const nm in insts) { dl1.append(h('option', { value: nm + '.Q' })); dl2.append(h('option', { value: nm + '.ET' }), h('option', { value: nm + '.CV' })); }
    const body = h('div', { class: 'form' }, dl1, dl2,
      h('p', { class: 'muted small' }, lang === 'ar' ? U.arEl(meta.tip.ar) : U.enEl(meta.tip.en)));
    fields.forEach((f) => {
      let inp;
      const init = existing && existing[f.k] !== undefined ? String(existing[f.k]) : '';
      if (f.kind === 'op') {
        inp = h('select', { id: 'f-' + f.k }, ['>=', '>', '==', '<>', '<', '<='].map((o) => h('option', { value: o, selected: (existing ? existing.op : '>=') === o }, o)));
      } else {
        let val = init;
        if (!existing) {
          if (f.kind === 'inst') val = suggestInst(type, ctx);
          else if (f.kind === 'edge') val = suggestEdge(ctx);
          else if (f.kind === 'time') val = 'T#3s';
          else if (f.k === 'pv') val = '5';
        }
        inp = h('input', { id: 'f-' + f.k, type: 'text', value: val, autocomplete: 'off', spellcheck: 'false', list: f.kind === 'bit' || f.kind === 'bitw' || f.kind === 'bit?' || f.kind === 'edge' ? dlBit : (f.kind === 'intval' || f.kind === 'intw') ? dlInt : null, placeholder: f.kind === 'time' ? 'T#3s' : '' });
      }
      inputs[f.k] = inp;
      errs[f.k] = h('div', { class: 'err small', role: 'alert' });
      hints[f.k] = h('div', { class: 'muted small' });
      const upd = () => {
        if (f.kind === 'op' || f.kind === 'inst' || f.kind === 'time') return;
        const d = describeTag(inp.value, ctx);
        hints[f.k].textContent = d ? `${d.addr} · ${d.type}${d.wiring ? ' · wired ' + d.wiring : ''}${d.en ? ' — ' + d.en : ''}` : '';
      };
      inp.addEventListener('input', upd); upd();
      const row = h('label', { class: 'frow', for: 'f-' + f.k },
        h('span', { class: 'flab' }, lang === 'ar' ? U.arEl(f.lab.ar) : U.enEl(f.lab.en)), inp, hints[f.k], errs[f.k]);
      if (f.kind === 'time') {
        const chips = h('div', { class: 'chips' }, ['T#500ms', 'T#1s', 'T#2s', 'T#3s', 'T#5s', 'T#10s'].map((c) => h('button', { type: 'button', class: 'chip', onclick: () => { inp.value = c; } }, c)));
        row.append(chips);
      }
      body.append(row);
    });
    const askBox = h('div', { class: 'ask', hidden: true });
    body.append(askBox);

    let dlg;
    function submit() {
      Object.values(errs).forEach((e) => { e.textContent = ''; });
      const el = { t: type };
      const created = [];
      let bad = false;
      const setErr = (k, e) => { errs[k].textContent = lang === 'ar' ? e.ar : e.en; bad = true; };
      // work on a ctx that remembers tags created while resolving
      const tmp = { tags: () => ctx.tags().concat(created), insts: ctx.insts };
      for (const f of fields) {
        const raw = inputs[f.k].value;
        if (f.kind === 'op') { el.op = raw; continue; }
        if (f.kind === 'inst') {
          const nm = raw.trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) { setErr(f.k, { en: 'Use letters, digits and _', ar: 'استخدم حروف وأرقام و _' }); continue; }
          const def = insts[nm];
          if (def && def.type !== type && !(existing && existing.i === nm)) { setErr(f.k, { en: `${nm} is already a ${def.type}`, ar: `${nm} مستخدم كـ ${def.type}` }); continue; }
          el.i = nm; continue;
        }
        if (f.kind === 'time') {
          const r = normTime(raw);
          if (r.error) { setErr(f.k, r.error); continue; }
          if (r.ask) {
            askBox.hidden = false; askBox.innerHTML = '';
            askBox.append(h('p', null, lang === 'ar' ? U.arEl(`"${r.ask}" — ثواني ولا ميلي ثانية؟`) : U.enEl(`"${r.ask}" — seconds or milliseconds?`)),
              h('button', { type: 'button', class: 'btn', onclick: () => { inputs[f.k].value = `T#${r.ask}s`; askBox.hidden = true; } }, `T#${r.ask}s`),
              h('button', { type: 'button', class: 'btn', onclick: () => { inputs[f.k].value = `T#${r.ask}ms`; askBox.hidden = true; } }, `T#${r.ask}ms`));
            bad = true; continue;
          }
          el.pt = r.value;
          if (r.fixed) inputs[f.k].value = r.value;
          continue;
        }
        if (f.kind === 'bit?') {
          if (!raw.trim()) continue;
          const r = resolveTag(raw, 'bit', tmp);
          if (!r.ok) { setErr(f.k, r.error); continue; }
          if (r.created) created.push(r.created);
          el[f.k] = r.value; continue;
        }
        const r = resolveTag(raw, f.kind === 'intval' ? 'intval' : f.kind, tmp);
        if (!r.ok && f.kind === 'intval') {
          const r2 = resolveTag(raw, 'int', tmp);
          if (!r2.ok) { setErr(f.k, r2.error); continue; }
          if (r2.created) created.push(r2.created);
          el[f.k] = r2.value; continue;
        }
        if (!r.ok) { setErr(f.k, r.error); continue; }
        if (r.created) created.push(r.created);
        el[f.k] = f.kind === 'intval' && /^-?\d+$/.test(r.value) && (f.k === 'pv' || type === 'CMP' || type === 'MOVE' || type === 'ADD' || type === 'SUB') ? parseInt(r.value, 10) : r.value;
      }
      if (bad) return;
      dlg.close('ok');
      done(el, created);
    }
    dlg = modal((existing ? (lang === 'ar' ? 'تعديل ' : 'Edit ') : '') + (lang === 'ar' ? meta.en : meta.en), body,
      (close) => [h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, lang === 'ar' ? 'إلغاء' : 'Cancel'),
        h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'OK')],
      { onEnter: submit });
    return dlg;
  }

  // ---------------------------------------------------------------- palette popover
  const GROUPS = [
    { id: 'contacts', en: 'Contacts', ar: 'ملامسات' },
    { id: 'outputs', en: 'Outputs & math', ar: 'مخارج وحساب' },
    { id: 'blocks', en: 'Timers & counters', ar: 'مؤقتات وعدّادات' },
  ];

  // actions: {pick(type), edit(), del(), branch(), barLeft(), barRight(), canEdit, hasEl}
  function openPalette(anchor, ctx, info, actions) {
    closePalette();
    const lang = U.lang;
    const allowed = ctx.palette();
    const pop = h('div', { class: 'pal', role: 'dialog', 'aria-label': lang === 'ar' ? 'اختر تعليمة' : 'Choose an instruction' });
    const done = (fn) => (e) => { closePalette(); fn(e); };
    pop.append(h('div', { class: 'pal-head' }, h('span', { class: 'small muted' }, `Rung ${info.ri + 1} · row ${info.r + 1} · col ${info.c + 1}`),
      h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Close', onclick: () => closePalette(true) }, '✕')));
    if (info.hasEl) {
      pop.append(h('div', { class: 'pal-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: done(actions.edit) }, '✎ ' + (lang === 'ar' ? 'تعديل' : 'Edit')),
        h('button', { class: 'btn small', type: 'button', onclick: done(actions.del) }, '🗑 ' + (lang === 'ar' ? 'حذف' : 'Delete'))));
    }
    for (const g of GROUPS) {
      const items = U.EL.filter((e) => e.group === g.id && (!allowed || allowed.indexOf(e.t) >= 0));
      if (!items.length) continue;
      pop.append(h('h5', null, lang === 'ar' ? g.ar : g.en),
        h('div', { class: 'pal-grid' }, items.map((e) => h('button', { type: 'button', class: 'pal-btn', title: (lang === 'ar' ? e.tip.ar.replace(/\{\{|\}\}/g, '') : e.tip.en) + (e.key ? ` [${e.key.toUpperCase()}]` : ''), 'aria-label': e.en,
          html: U.iconSvg(e.t) + `<span>${U.esc(e.t)}${e.key ? ` <kbd>${U.esc(e.key.toUpperCase())}</kbd>` : ''}</span>`, onclick: done(() => actions.pick(e.t)) }))));
    }
    if (!allowed || allowed.indexOf('BRANCH') >= 0) {
      pop.append(h('h5', null, lang === 'ar' ? 'فروع متوازية' : 'Parallel branch'),
        h('div', { class: 'pal-actions' },
          h('button', { class: 'btn small', type: 'button', title: 'Open a branch below this cell (OR)', onclick: done(actions.branch) }, '⎇ ' + (lang === 'ar' ? 'فرع حول الخلية' : 'Branch around cell')),
          h('button', { class: 'btn small', type: 'button', onclick: done(actions.barLeft) }, '┃← ' + (lang === 'ar' ? 'خط عمودي يسار' : 'Bar left')),
          h('button', { class: 'btn small', type: 'button', onclick: done(actions.barRight) }, '→┃ ' + (lang === 'ar' ? 'خط عمودي يمين' : 'Bar right'))));
    }
    document.body.append(pop);
    // position
    const r = anchor.getBoundingClientRect();
    const narrow = window.innerWidth < 700;
    if (narrow) { pop.classList.add('sheet'); }
    else {
      const w = pop.offsetWidth, hh = pop.offsetHeight;
      let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      let top = r.bottom + 6;
      if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 6);
      pop.style.left = left + window.scrollX + 'px'; pop.style.top = top + window.scrollY + 'px';
    }
    U._pal = { pop, anchor, onClose: info.onClose };
    const first = pop.querySelector('.pal-btn');
    if (first) first.focus();
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); }, 0);
    function outside(e) { if (!pop.contains(e.target)) closePalette(true); }
    function escKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closePalette(true); } }
    pop._cleanup = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escKey, true); };
  }

  function closePalette(refocus) {
    const p = U._pal;
    if (!p) return;
    p.pop._cleanup && p.pop._cleanup();
    p.pop.remove();
    U._pal = null;
    if (refocus && p.anchor && p.anchor.focus) p.anchor.focus();
  }

  U.openPalette = openPalette;
  U.closePalette = closePalette;
  U.openParams = openParams;
  U.resolveTag = resolveTag;
  U.normTime = normTime;
  U.describeTag = describeTag;
})();
