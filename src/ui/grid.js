/* Ladder editor: grid of focusable cells, parallel branches, undo/redo, power-flow display in run mode.
 *
 * Program JSON (see core/dsl.js):  rung = {rows, cols, els:[{r,c,t,...}], vb:[[boundary,gap],...], note}
 * A vertical bar [b, g] sits on column boundary b between rows g and g+1.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const W = 84, H = 68, RAIL = 12, MAXR = 4, MINC = 8, MAXC = 16;

  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);

  U.toast = U.toast || function (msg) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(U._toastT); U._toastT = setTimeout(() => t.classList.remove('show'), 2600);
  };

  function normRung(rg) {
    if (!Array.isArray(rg.els)) rg.els = [];
    if (!Array.isArray(rg.vb)) rg.vb = [];
    let maxR = 0, maxC = 0;
    for (const e of rg.els) { maxR = Math.max(maxR, e.r); maxC = Math.max(maxC, e.c); }
    for (const b of rg.vb) maxR = Math.max(maxR, b[1] + 1);
    rg.rows = Math.max(1, Math.min(MAXR, maxR + 1));
    rg.cols = Math.max(MINC, Math.min(MAXC, maxC + 2));
    const seen = new Set();
    rg.vb = rg.vb.filter((b) => { const k = b[0] + ',' + b[1]; if (seen.has(k) || b[0] > rg.cols || b[1] > rg.rows - 2) return false; seen.add(k); return true; });
    rg.els.sort((a, b) => a.c - b.c || a.r - b.r);
    return rg;
  }
  const emptyRung = () => normRung({ rows: 1, cols: MINC, els: [], vb: [] });
  const findEl = (rg, r, c) => rg.els.find((e) => e.r === r && e.c === c) || null;

  function Ladder(container, host) {
    const ed = { program: SC.util.clone(host.program), userTags: SC.util.clone(host.userTags || []), undo: [], redo: [], sel: { ri: 0, r: 0, c: 0 }, refs: [], drag: null, lastPaint: [] };
    if (!ed.program.rungs.length) ed.program.rungs.push(emptyRung());
    ed.program.rungs.forEach(normRung);

    // ------------------------------------------------------------ context for dialogs
    const ctx = {
      tags: () => host.baseTags().concat(ed.userTags),
      instDefs: () => {
        const o = {};
        ed.program.rungs.forEach((rg) => rg.els.forEach((e) => { if (e.i && !o[e.i]) o[e.i] = { type: e.t }; }));
        return o;
      },
      insts: () => Object.keys(ctx.instDefs()),
      usedAddrs: () => { const out = []; ed.program.rungs.forEach((rg) => rg.els.forEach((e) => ['a', 'b', 'o', 'w', 'rs', 'ld', 'cd'].forEach((k) => { if (typeof e[k] === 'string' && SC.addr.parseAddr(e[k])) out.push(e[k]); }))); return out; },
      palette: () => host.palette(),
    };
    ed.ctx = ctx;
    const addrOf = (name) => {
      const t = ctx.tags().find((x) => x.name === name);
      const a = t ? t.addr : name;
      return U.useCodesys ? SC.addr.toCodesys(a) : a;
    };

    // ------------------------------------------------------------ history
    const snap = () => JSON.stringify({ p: ed.program, u: ed.userTags });
    function commit(prevSnap) {
      ed.undo.push(prevSnap);
      if (ed.undo.length > 100) ed.undo.shift();
      ed.redo = [];
      ed.program.rungs.forEach(normRung);
      afterChange();
    }
    function restore(s) {
      const o = JSON.parse(s);
      ed.program = o.p; ed.userTags = o.u;
      ed.sel.ri = Math.min(ed.sel.ri, ed.program.rungs.length - 1);
      afterChange();
    }
    ed.doUndo = () => { if (!ed.undo.length) return; ed.redo.push(snap()); restore(ed.undo.pop()); };
    ed.doRedo = () => { if (!ed.redo.length) return; ed.undo.push(snap()); restore(ed.redo.pop()); };
    function afterChange() {
      render();
      host.setProgram(ed.program, ed.userTags);
      if (!ed.skipFocus) focusSel();
      ed.skipFocus = false;
    }
    ed.setProgram = (p, u) => {
      ed.program = SC.util.clone(p); ed.userTags = SC.util.clone(u || ed.userTags);
      if (!ed.program.rungs.length) ed.program.rungs.push(emptyRung());
      ed.program.rungs.forEach(normRung);
      ed.undo = []; ed.redo = [];
      render();
    };

    // ------------------------------------------------------------ mutations
    function mutate(fn) {
      const before = snap();
      const ok = fn();
      if (ok === false) return;
      commit(before);
    }
    function place(ri, r, c, el, created) {
      mutate(() => {
        const rg = ed.program.rungs[ri];
        rg.els = rg.els.filter((e) => !(e.r === r && e.c === c));
        rg.els.push(Object.assign({ r, c }, el));
        for (const t of created || []) if (!ed.userTags.some((u) => u.name === t.name)) ed.userTags.push(t);
      });
    }
    function removeEl(ri, r, c) {
      mutate(() => {
        const rg = ed.program.rungs[ri];
        const n = rg.els.length;
        rg.els = rg.els.filter((e) => !(e.r === r && e.c === c));
        if (rg.els.length === n) return false;
      });
    }
    function toggleBar(ri, b, g) {
      const pal = host.palette();
      if (pal && pal.indexOf('BRANCH') < 0) { U.toast(tr('Parallel branches are not unlocked in this level yet.', 'الفروع المتوازية غير مفتوحة بهالمستوى بعد.')); return; }
      mutate(() => {
        const rg = ed.program.rungs[ri];
        if (g + 1 >= MAXR) { U.toast(tr('A rung can have at most 4 rows.', 'الـ rung فيه 4 صفوف كحد أقصى.')); return false; }
        const i = rg.vb.findIndex((x) => x[0] === b && x[1] === g);
        if (i >= 0) rg.vb.splice(i, 1); else rg.vb.push([b, g]);
      });
    }
    function makeBranch(ri, r, c) {
      const pal = host.palette();
      if (pal && pal.indexOf('BRANCH') < 0) { U.toast(tr('Parallel branches are not unlocked in this level yet.', 'الفروع المتوازية غير مفتوحة بهالمستوى بعد.')); return; }
      mutate(() => {
        const rg = ed.program.rungs[ri];
        if (r + 1 >= MAXR) { U.toast(tr('A rung can have at most 4 rows.', 'الـ rung فيه 4 صفوف كحد أقصى.')); return false; }
        for (const bc of [c, c + 1]) if (!rg.vb.some((x) => x[0] === bc && x[1] === r)) rg.vb.push([bc, r]);
        ed.sel = { ri, r: r + 1, c };
      });
    }
    function moveEl(ri, from, to) {
      mutate(() => {
        const rg = ed.program.rungs[ri];
        const e = findEl(rg, from.r, from.c);
        if (!e || findEl(rg, to.r, to.c) || to.r >= MAXR) return false;
        e.r = to.r; e.c = to.c;
        ed.sel = { ri, r: to.r, c: to.c };
      });
    }
    function addRung(at) {
      mutate(() => { ed.program.rungs.splice(at, 0, emptyRung()); ed.sel = { ri: at, r: 0, c: 0 }; });
    }
    function delRung(ri) {
      if (ed.program.rungs.length <= 1) {
        if (!ed.program.rungs[0].els.length && !ed.program.rungs[0].vb.length) return;
        mutate(() => { ed.program.rungs[0] = emptyRung(); });
        return;
      }
      mutate(() => { ed.program.rungs.splice(ri, 1); ed.sel = { ri: Math.max(0, ri - 1), r: 0, c: 0 }; });
    }
    function moveRung(ri, d) {
      const j = ri + d;
      if (j < 0 || j >= ed.program.rungs.length) return;
      mutate(() => { const a = ed.program.rungs; [a[ri], a[j]] = [a[j], a[ri]]; ed.sel.ri = j; });
    }
    function setNote(ri, txt) { // no re-render: the note input keeps focus and value
      if ((ed.program.rungs[ri].note || '') === txt) return;
      const before = snap();
      ed.program.rungs[ri].note = txt;
      ed.undo.push(before); ed.redo = [];
      host.setProgram(ed.program, ed.userTags);
    }

    // ------------------------------------------------------------ dialogs / palette
    function openFor(ri, r, c, anchor) {
      const rg = ed.program.rungs[ri];
      const el = findEl(rg, r, c);
      const acts = {
        pick: (t) => U.openParams(ctx, t, null, (e, created) => place(ri, r, c, e, created)),
        edit: () => U.openParams(ctx, el.t, el, (e, created) => place(ri, r, c, e, created)),
        del: () => removeEl(ri, r, c),
        branch: () => makeBranch(ri, r, c),
        barLeft: () => toggleBar(ri, c, r),
        barRight: () => toggleBar(ri, c + 1, r),
      };
      U.openPalette(anchor, ctx, { ri, r, c, hasEl: !!el }, acts);
    }
    ed.openFor = openFor;
    function quickPlace(ri, r, c, t) {
      const el = findEl(ed.program.rungs[ri], r, c);
      U.openParams(ctx, t, el && el.t === t ? el : null, (e, created) => place(ri, r, c, e, created));
    }

    // ------------------------------------------------------------ rendering
    let checkCache = null;
    function check() {
      const tags = ctx.tags();
      const compiled = SC.compile(ed.program, { tags, palette: host.palette() });
      const lint = SC.lint(ed.program, tags);
      const cellMsg = new Map();
      const addMsg = (ri, r, c, sev, msg) => {
        if (r === undefined) return;
        const k = ri + ':' + r + ':' + c;
        if (!cellMsg.has(k)) cellMsg.set(k, []);
        cellMsg.get(k).push({ sev, msg });
      };
      for (const e of compiled.errors) addMsg(e.rung, e.r, e.c, 'error', e.msg);
      for (const l of lint) addMsg(l.rung, l.r, l.c, l.sev, l.msg);
      checkCache = { compiled, lint, cellMsg };
      return checkCache;
    }
    ed.check = () => checkCache || check();

    function render() {
      const nr = ed.program.rungs.length;
      ed.sel.ri = Math.max(0, Math.min(nr - 1, ed.sel.ri));
      const rg0 = ed.program.rungs[ed.sel.ri];
      ed.sel.r = Math.max(0, Math.min(rg0.rows - 1, ed.sel.r)); ed.sel.c = Math.max(0, Math.min(rg0.cols - 1, ed.sel.c));
      const chk = check();
      const keep = container.scrollTop;
      container.innerHTML = '';
      ed.refs = [];
      const tb = h('div', { class: 'ld-tb' },
        h('button', { type: 'button', class: 'btn small', onclick: () => addRung(ed.program.rungs.length) }, '＋ ' + tr('Rung', 'Rung')),
        h('button', { type: 'button', class: 'btn small', disabled: !ed.undo.length, onclick: ed.doUndo, title: 'Ctrl+Z' }, '↶ ' + tr('Undo', 'تراجع')),
        h('button', { type: 'button', class: 'btn small', disabled: !ed.redo.length, onclick: ed.doRedo, title: 'Ctrl+Y' }, '↷ ' + tr('Redo', 'إعادة')),
        h('span', { class: 'grow' }),
        statusChip(chk),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { U.useCodesys = !U.useCodesys; U.store.set('codesys', U.useCodesys); render(); if (U.refreshTags) U.refreshTags(); } }, U.useCodesys ? 'CODESYS %IX' : 'Siemens I0.0'));
      container.append(tb);
      const list = h('div', { class: 'ld-rungs', role: 'group', 'aria-label': tr('Ladder program', 'برنامج الـ ladder') });
      ed.program.rungs.forEach((rg, ri) => list.append(renderRung(rg, ri, chk)));
      container.append(list);
      container.append(renderIssues(chk));
      container.append(h('details', { class: 'ld-keys' }, h('summary', null, tr('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')),
        h('p', { class: 'small muted' }, 'Arrows: move · Enter/F2: edit · N: NO · C: NC · O: coil · S: set · R: reset · P: edge · T: timer · U: counter · =: compare · M: move · B: branch bar · Shift+↓: toggle bar · Delete: clear · Ctrl+Z / Ctrl+Y: undo / redo · Esc: close')));
      container.scrollTop = keep;
    }

    function statusChip(chk) {
      const ne = chk.compiled.errors.length, nw = chk.lint.length;
      if (ne) return h('span', { class: 'chip-st bad', role: 'status' }, '✖ ' + ne + ' ' + tr('errors — fix them to run', 'أخطاء — صلّحها عشان يشتغل'));
      if (nw) return h('span', { class: 'chip-st warn', role: 'status' }, '⚠ ' + nw + ' ' + tr('warnings', 'تحذيرات'));
      return h('span', { class: 'chip-st ok', role: 'status' }, '✔ ' + tr('Compiled', 'تم التجميع'));
    }

    function renderIssues(chk) {
      const box = h('div', { class: 'ld-issues' });
      const row = (sev, ri, r, c, msg) => h('button', { type: 'button', class: 'iss ' + sev, onclick: () => { if (ri >= 0) { ed.sel = { ri, r: r || 0, c: c || 0 }; focusSel(); } } },
        (sev === 'error' ? '✖ ' : '⚠ '), ri >= 0 ? `Rung ${ri + 1}: ` : '', (U.lang === 'ar' ? msg.ar : msg.en));
      chk.compiled.errors.forEach((e) => box.append(row('error', e.rung, e.r, e.c, e.msg)));
      chk.lint.forEach((l) => box.append(row(l.sev === 'error' ? 'error' : 'warn', l.rung, l.r, l.c, l.msg)));
      return box;
    }

    function renderRung(rg, ri, chk) {
      const wire = SC.compile.buildWire(rg.rows, rg.cols, new Set(rg.vb.map((b) => b[0] + ',' + b[1]))).wire;
      const refs = { cells: new Map(), bars: [], el: null, rung: rg };
      ed.refs[ri] = refs;
      const stage = h('div', { class: 'rung-stage', style: { width: (RAIL * 2 + rg.cols * W) + 'px', height: (rg.rows * H) + 'px' } });
      const grid = h('div', { class: 'rung-grid', role: 'grid', 'aria-label': 'Rung ' + (ri + 1) });
      const overlay = h('div', { class: 'rung-overlay', 'aria-hidden': 'true' }, h('div', { class: 'rail left' }), h('div', { class: 'rail right' }));
      stage.append(grid, overlay);
      for (let r = 0; r < rg.rows; r++) {
        const row = h('div', { role: 'row', class: 'rowwrap' });
        for (let c = 0; c < rg.cols; c++) {
          const el = findEl(rg, r, c);
          const cell = makeCell(ri, rg, r, c, el, wire[r][c], chk);
          refs.cells.set(r + ',' + c, { el: cell, e: el, pin: -1, pout: -1 });
          row.append(cell);
        }
        grid.append(row);
      }
      // vertical bars + handles
      const barSet = new Set(rg.vb.map((b) => b[0] + ',' + b[1]));
      for (let b = 0; b <= rg.cols; b++) {
        for (let g = 0; g < Math.min(rg.rows, MAXR - 1); g++) {
          const on = barSet.has(b + ',' + g);
          if (!on && rg.rows < 2 && !(g === 0 && rg.rows === 1 && false)) continue;
          if (!on && g > rg.rows - 2) continue;
          const x = RAIL + b * W, y1 = g * H + 40, y2 = (g + 1) * H + 40;
          if (on) {
            const bar = h('div', { class: 'vbar', style: { left: (x - 2) + 'px', top: y1 + 'px', height: (y2 - y1) + 'px' } });
            overlay.append(bar);
            refs.bars.push({ el: bar, b, g, on: -1 });
          }
          overlay.append(h('button', { type: 'button', class: 'bh' + (on ? ' on' : ''), tabindex: '-1', 'aria-label': tr(on ? 'Remove vertical bar' : 'Add vertical bar', on ? 'حذف الخط العمودي' : 'إضافة خط عمودي'),
            style: { left: (x - 11) + 'px', top: ((y1 + y2) / 2 - 11) + 'px' }, onclick: () => toggleBar(ri, b, g) }, on ? '' : '+'));
        }
      }
      const head = h('div', { class: 'rung-head' },
        h('span', { class: 'rung-n' }, 'Rung ' + (ri + 1)),
        h('input', { class: 'rung-note', type: 'text', value: rg.note || '', placeholder: tr('Comment…', 'تعليق…'), 'aria-label': 'Rung ' + (ri + 1) + ' comment', onchange: (e) => setNote(ri, e.target.value) }),
        h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Move rung up', disabled: ri === 0, onclick: () => moveRung(ri, -1) }, '↑'),
        h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Move rung down', disabled: ri === ed.program.rungs.length - 1, onclick: () => moveRung(ri, 1) }, '↓'),
        h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Delete rung', onclick: () => delRung(ri) }, '✕'));
      const out = h('div', { class: 'rung', dataset: { ri } }, head, h('div', { class: 'rung-scroll' }, stage));
      refs.el = out;
      return out;
    }

    function makeCell(ri, rg, r, c, el, isWire, chk) {
      const lab = el ? U.cellLabels(el, addrOf) : { top: '', bottom: '' };
      const msgs = chk.cellMsg.get(ri + ':' + r + ':' + c) || [];
      const sel = ed.sel.ri === ri && ed.sel.r === r && ed.sel.c === c;
      const name = el ? (U.ELMAP[el.t] ? U.ELMAP[el.t].en : el.t) : tr('empty', 'فاضي');
      const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`
        + (lab.top ? `<text class="c-tag" x="42" y="11" text-anchor="middle">${U.esc(lab.top.length > 12 ? lab.top.slice(0, 11) + '…' : lab.top)}</text>` : '')
        + U.symbolSvg(el, isWire)
        + (lab.bottom ? `<text class="c-addr" x="42" y="65" text-anchor="middle">${U.esc(lab.bottom)}</text>` : '')
        + (el ? '<text class="c-state" x="82" y="65" text-anchor="end"></text>' : '')
        + (msgs.length ? `<text class="c-warn ${msgs.some((m) => m.sev === 'error') ? 'err' : ''}" x="3" y="11">${msgs.some((m) => m.sev === 'error') ? '✖' : '⚠'}</text>` : '')
        + '</svg>';
      const label = `Rung ${ri + 1}, row ${r + 1}, column ${c + 1}: ${name}${el && lab.top ? ' ' + lab.top : ''}${msgs.length ? '. ' + msgs.map((m) => (U.lang === 'ar' ? m.msg.ar : m.msg.en)).join(' ') : ''}`;
      const cell = h('div', { class: 'cell' + (el ? ' filled' : '') + (sel ? ' sel' : '') + (msgs.length ? ' has-msg' : ''), role: 'gridcell', tabindex: sel ? '0' : '-1',
        'aria-label': label, title: msgs.length ? msgs.map((m) => (U.lang === 'ar' ? m.msg.ar : m.msg.en)).join('\n') : (el ? lab.top : ''),
        dataset: { ri, r, c }, style: { left: (RAIL + c * W) + 'px', top: (r * H) + 'px', width: W + 'px', height: H + 'px' }, html: svg });
      cell.addEventListener('focus', () => {
        ed.sel = { ri, r, c };
        container.querySelectorAll('.cell[tabindex="0"]').forEach((n) => { n.tabIndex = -1; });
        cell.tabIndex = 0;
      });
      cell.addEventListener('pointerdown', (e) => onPointerDown(e, ri, r, c, cell));
      cell.addEventListener('keydown', (e) => onKey(e, ri, r, c, cell));
      return cell;
    }

    function focusSel() {
      const refs = ed.refs[ed.sel.ri];
      if (!refs) return;
      const k = refs.cells.get(ed.sel.r + ',' + ed.sel.c);
      if (k) { k.el.tabIndex = 0; if (ed.focusAfter !== false) k.el.focus({ preventScroll: false }); }
    }

    // ------------------------------------------------------------ pointer: click / drag to move
    function onPointerDown(e, ri, r, c, cell) {
      if (e.button !== undefined && e.button !== 0) return;
      const rg = ed.program.rungs[ri];
      const el = findEl(rg, r, c);
      const canDrag = e.pointerType !== 'touch'; // on touch a swipe must scroll the rung, never drag an element
      const st = { ri, r, c, x: e.clientX, y: e.clientY, moved: false, el, ghost: null, target: null, id: e.pointerId };
      ed.drag = st;
      const move = (ev) => {
        if (!st.el || !canDrag) return;
        const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
        if (!st.moved && Math.hypot(dx, dy) > 8) {
          st.moved = true;
          cell.classList.add('dragging');
          try { cell.setPointerCapture(st.id); } catch (er) { /* ignore */ }
          st.ghost = h('div', { class: 'drag-ghost', html: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${U.symbolSvg(st.el, false)}</svg>` });
          document.body.append(st.ghost);
        }
        if (st.moved) {
          st.ghost.style.left = (ev.clientX - W / 2) + 'px'; st.ghost.style.top = (ev.clientY - H / 2) + 'px';
          const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList && n.classList.contains('cell'));
          document.querySelectorAll('.cell.drop').forEach((n) => n.classList.remove('drop'));
          st.target = under && +under.dataset.ri === ri ? { r: +under.dataset.r, c: +under.dataset.c } : null;
          if (under && st.target) under.classList.add('drop');
        }
      };
      const cancel = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
        cell.classList.remove('dragging'); if (st.ghost) st.ghost.remove();
        document.querySelectorAll('.cell.drop').forEach((n) => n.classList.remove('drop'));
        ed.drag = null;
      };
      const up = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
        cell.classList.remove('dragging');
        if (st.ghost) st.ghost.remove();
        document.querySelectorAll('.cell.drop').forEach((n) => n.classList.remove('drop'));
        ed.drag = null;
        if (st.moved) {
          if (st.target && (st.target.r !== r || st.target.c !== c)) moveEl(ri, { r, c }, st.target);
        } else {
          ed.sel = { ri, r, c };
          cell.focus();
          openFor(ri, r, c, cell);
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
    }

    // ------------------------------------------------------------ keyboard
    function moveFocus(ri, r, c, dr, dc) {
      const rungs = ed.program.rungs;
      let nr = r + dr, nc = c + dc, nri = ri;
      if (nc < 0) nc = 0;
      if (nc >= rungs[nri].cols) nc = rungs[nri].cols - 1;
      if (nr < 0) { if (nri > 0) { nri--; nr = rungs[nri].rows - 1; } else nr = 0; }
      else if (nr >= rungs[nri].rows) { if (nri < rungs.length - 1) { nri++; nr = 0; } else nr = rungs[nri].rows - 1; }
      nc = Math.min(nc, rungs[nri].cols - 1);
      ed.sel = { ri: nri, r: nr, c: nc };
      focusSel();
    }

    function onKey(e, ri, r, c, cell) {
      if (e.target !== cell) return;
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? ed.doRedo() : ed.doUndo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); ed.doRedo(); return; }
      if (mod || e.altKey) return;
      if (e.shiftKey && k === 'ArrowDown') { e.preventDefault(); toggleBar(ri, c, r); return; }
      if (k === 'ArrowUp') { e.preventDefault(); moveFocus(ri, r, c, -1, 0); return; }
      if (k === 'ArrowDown') { e.preventDefault(); moveFocus(ri, r, c, 1, 0); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); moveFocus(ri, r, c, 0, -1); return; }
      if (k === 'ArrowRight') { e.preventDefault(); moveFocus(ri, r, c, 0, 1); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeEl(ri, r, c); return; }
      const rg = ed.program.rungs[ri];
      const el = findEl(rg, r, c);
      if (k === 'Enter' || k === 'F2' || k === ' ') {
        e.preventDefault();
        if (el) U.openParams(ctx, el.t, el, (ne, created) => place(ri, r, c, ne, created));
        else openFor(ri, r, c, cell);
        return;
      }
      if (k === 'b' || k === 'B') { e.preventDefault(); e.shiftKey ? toggleBar(ri, c + 1, r) : makeBranch(ri, r, c); return; }
      const map = { n: 'NO', c: 'NC', o: 'OUT', s: 'SET', r: 'RST', p: 'POS', t: 'TON', u: 'CTU', '=': 'CMP', m: 'MOVE' };
      const t = map[k.toLowerCase()];
      if (t) {
        e.preventDefault();
        const allowed = host.palette();
        if (allowed && allowed.indexOf(t) < 0) { U.toast(tr(`${t} is not unlocked in this level yet.`, `${t} غير مفتوح بهالمستوى بعد.`)); return; }
        quickPlace(ri, r, c, t);
      }
    }

    // ------------------------------------------------------------ run mode: power flow
    let lastRec = null;
    ed.paint = function (sim) {
      if (!sim || !sim.compiled.ok || !sim.rec || sim.compiled.rungs.length !== ed.program.rungs.length) { if (lastRec) { clearPaint(); lastRec = null; } return; }
      lastRec = sim.rec;
      sim.rec.forEach((rec, ri) => {
        const refs = ed.refs[ri];
        if (!rec || !refs || !rec.pin || rec.pin.length !== refs.rung.cols) return; // rec from a program version that is no longer on screen
        for (const [key, k] of refs.cells) {
          const [r, c] = key.split(',').map(Number);
          const pin = rec.pin[c] ? rec.pin[c][r] : 0, pout = rec.pout[c] ? rec.pout[c][r] : 0;
          if (k.pin !== pin) { k.pin = pin; k.el.dataset.pin = pin; }
          if (k.pout !== pout) {
            k.pout = pout; k.el.dataset.pout = pout;
            const st = k.el.querySelector('.c-state');
            if (st) st.textContent = pout ? 'ON' : 'OFF';
          }
          if (k.e && k.e.i) {
            const s = sim.st.inst[k.e.i];
            const live = k.el.querySelector('.blk-live');
            if (s && live) {
              const t = /^T/.test(k.e.t) ? (s.ET / 1000).toFixed(2) + ' s' : 'CV ' + s.CV;
              if (k.live !== t) { k.live = t; live.textContent = t; }
            }
          }
        }
        for (const b of refs.bars) {
          const on = (b.b < refs.rung.cols ? ((rec.pin[b.b][b.g] || rec.pin[b.b][b.g + 1]) ? 1 : 0) : ((rec.edge[b.g] || rec.edge[b.g + 1]) ? 1 : 0));
          if (b.on !== on) { b.on = on; b.el.dataset.on = on; }
        }
      });
    };
    function clearPaint() {
      container.querySelectorAll('.cell').forEach((n) => { delete n.dataset.pin; delete n.dataset.pout; const st = n.querySelector('.c-state'); if (st) st.textContent = ''; });
      container.querySelectorAll('.vbar').forEach((n) => { delete n.dataset.on; });
      ed.refs.forEach((rf) => { if (rf) { for (const k of rf.cells.values()) { k.pin = -1; k.pout = -1; } rf.bars.forEach((b) => { b.on = -1; }); } });
    }

    // programmatic API (also used by the self-test and the tag table)
    ed.ops = { place, removeEl, toggleBar, makeBranch, moveEl, addRung, delRung, moveRung, setNote };
    const FIELDS = ['a', 'b', 'o', 'w', 'rs', 'ld', 'cd'];
    ed.renameTag = (from, to) => {
      ed.skipFocus = true;
      mutate(() => {
        const t = ed.userTags.find((x) => x.name === from);
        if (!t) return false;
        t.name = to;
        ed.program.rungs.forEach((rg) => rg.els.forEach((e) => {
          for (const k of FIELDS) if (typeof e[k] === 'string' && e[k] === from) e[k] = to;
        }));
      });
    };
    ed.usedTags = () => {
      const used = new Set();
      ed.program.rungs.forEach((rg) => rg.els.forEach((e) => FIELDS.forEach((k) => { if (typeof e[k] === 'string') used.add(e[k]); })));
      return used;
    };
    ed.deleteTag = (name) => {
      if (ed.usedTags().has(name)) return false;
      ed.skipFocus = true;
      mutate(() => { ed.userTags = ed.userTags.filter((t) => t.name !== name); });
      return true;
    };
    ed.setTagDesc = (name, en, ar) => {
      const t = ed.userTags.find((x) => x.name === name);
      if (!t) return;
      ed.skipFocus = true;
      mutate(() => { t.desc = { en, ar }; });
    };
    ed.focus = (ri, r, c) => { ed.sel = { ri, r, c }; focusSel(); };
    ed.close = () => { U.closePalette(); };
    render();
    host.setProgram(ed.program, ed.userTags, true);
    ed.focusAfter = true;
    return ed;
  }

  U.Ladder = Ladder;
  U.ladderNorm = normRung;
})();
