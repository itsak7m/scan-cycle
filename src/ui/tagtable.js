/* Tag table, "same program in TIA Portal / CODESYS" transfer panel. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);

  // ---- schematic device names (-S1, -B2, -Q1 ...) assigned per role in master order
  const DEV = Object.create(null);
  (function () {
    const cnt = {};
    const pre = (t) => {
      switch (t.role) {
        case 'start': case 'stop': case 'ack': case 'reset': case 'release': case 'key': case 'mode': case 'setpoint': case 'process': return '-S';
        case 'estop': return '-K'; case 'guard': return '-S';
        case 'sensor': case 'feedback': case 'encoder': case 'alarm': case 'analog': return '-B';
        case 'actuator': return /Valve|SOL|Pusher|Pump/.test(t.name) ? '-Y' : '-Q';
        case 'signal': return '-H';
      }
      return '-X';
    };
    for (const t of SC.IO) {
      const p = pre(t);
      cnt[p] = (cnt[p] || 0) + 1;
      DEV[t.name] = p + cnt[p];
    }
  })();
  U.deviceName = (name) => DEV[name] || name;

  // ---------------------------------------------------------------- tag table
  function mountTags(box) {
    const ST = U.state;
    box.innerHTML = '';
    const ed = ST.ladder;
    const base = SC.levelTags(ST.level).filter((t) => !t.user);
    const user = ed ? ed.userTags : ST.userTags;
    const used = ed ? ed.usedTags() : new Set();
    const only = (t) => /^(I|Q|M)/.test(t.addr);
    const rows = base.concat(user).filter(only);
    const head = h('thead', null, h('tr', null, ['Name', 'Address', 'Type', 'Comment (EN)', 'Comment (AR)', ''].map((x) => h('th', null, x))));
    const body = h('tbody');
    for (const t of rows) {
      const isUser = !!t.user;
      const addr = U.useCodesys ? SC.addr.toCodesys(t.addr) : t.addr;
      const tr1 = h('tr', { class: isUser ? 'user' : '' });
      if (isUser && ed) {
        const nm = h('input', { type: 'text', value: t.name, 'aria-label': 'Tag name', spellcheck: 'false', onchange: (e) => {
          const v = e.target.value.trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v) || SC.addr.parseAddr(v) || (SC.levelTags(ST.level).concat(ed.userTags)).some((x) => x.name === v && x !== t)) { U.toast(tr('Bad or duplicate name', 'اسم غير صالح أو مكرر')); e.target.value = t.name; return; }
          ed.renameTag(t.name, v); mountTags(box);
        } });
        const en = h('input', { type: 'text', value: (t.desc && t.desc.en) || '', 'aria-label': 'Comment EN', placeholder: '…', onchange: (e) => ed.setTagDesc(t.name, e.target.value, (t.desc && t.desc.ar) || '') });
        const ar = h('input', { type: 'text', value: (t.desc && t.desc.ar) || '', 'aria-label': 'Comment AR', placeholder: '…', dir: 'rtl', lang: 'ar', onchange: (e) => ed.setTagDesc(t.name, (t.desc && t.desc.en) || '', e.target.value) });
        const del = h('button', { type: 'button', class: 'btn small ghost', disabled: used.has(t.name), title: used.has(t.name) ? tr('In use', 'مستخدم') : tr('Delete tag', 'احذف'), onclick: () => { ed.deleteTag(t.name); mountTags(box); } }, '✕');
        tr1.append(h('th', { scope: 'row' }, nm), h('td', { class: 'mono' }, addr), h('td', null, t.type), h('td', null, en), h('td', null, ar), h('td', null, del));
      } else {
        tr1.append(h('th', { scope: 'row', class: 'mono' }, t.name, t.wiring === 'NC' ? h('small', { class: 'muted' }, ' NC') : ''), h('td', { class: 'mono' }, addr), h('td', null, t.type),
          h('td', null, (t.desc && t.desc.en) || ''), h('td', { lang: 'ar', dir: 'rtl' }, (t.desc && t.desc.ar) || ''), h('td'));
      }
      body.append(tr1);
    }
    box.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tags' }, head, body)),
      h('p', { class: 'muted small' }, tr('New tags you type in a dialog are added here automatically as memory bits (M).', 'أي {{tag}} جديد بتكتبه بالنافذة بينضاف هون لحاله كبت ذاكرة (M).').replace(/\{\{|\}\}/g, '')));
  }
  U.mountTags = mountTags;
  U.refreshTags = () => { const b = document.getElementById('tags-mount'); if (b && U.state.level) mountTags(b); };

  // ---------------------------------------------------------------- transfer panel
  // read-only rung. opts: {labelOf(name)->text, rec:{pin,pout,edge} (power flow), addrOf(name)}
  function staticRung(rg, labelOf, opts) {
    opts = opts || {};
    const rec = opts.rec || null;
    const wire = SC.compile.buildWire(rg.rows, rg.cols, new Set(rg.vb.map((b) => b[0] + ',' + b[1]))).wire;
    const W = U.CELL_W, H = U.CELL_H, RAIL = 12;
    const grid = h('div', { class: 'rung-grid static', style: { width: (RAIL * 2 + rg.cols * W) + 'px', height: (rg.rows * H) + 'px' } }, h('div', { class: 'rail left' }), h('div', { class: 'rail right' }));
    for (let r = 0; r < rg.rows; r++) for (let c = 0; c < rg.cols; c++) {
      const el = rg.els.find((e) => e.r === r && e.c === c) || null;
      const lab = el ? U.cellLabels(el, opts.addrOf || (() => '')) : { top: '', bottom: '' };
      const top = el && lab.top ? labelOf(lab.top) : '';
      const pin = rec && rec.pin[c] ? rec.pin[c][r] : undefined, pout = rec && rec.pout[c] ? rec.pout[c][r] : undefined;
      grid.append(h('div', { class: 'cell', dataset: rec ? { pin: pin ? 1 : 0, pout: pout ? 1 : 0 } : null, style: { left: (RAIL + c * W) + 'px', top: (r * H) + 'px', width: W + 'px', height: H + 'px' },
        html: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${top ? `<text class="c-tag" x="42" y="11" text-anchor="middle">${U.esc(top)}</text>` : ''}${U.symbolSvg(el, wire[r][c])}${el && lab.bottom ? `<text class="c-addr" x="42" y="65" text-anchor="middle">${U.esc(lab.bottom)}</text>` : ''}${el && rec ? `<text class="c-state" x="82" y="65" text-anchor="end">${pout ? 'ON' : 'OFF'}</text>` : ''}</svg>` }));
    }
    for (const [b, g] of rg.vb) {
      let on;
      if (rec) on = (b < rg.cols ? (rec.pin[b][g] || rec.pin[b][g + 1]) : (rec.edge[g] || rec.edge[g + 1])) ? 1 : 0;
      grid.append(h('div', { class: 'vbar', dataset: rec ? { on } : null, style: { left: (RAIL + b * W - 2) + 'px', top: (g * H + 40) + 'px', height: H + 'px' } }));
    }
    return h('div', { class: 'rung' }, opts.title ? h('div', { class: 'rung-head' }, h('span', { class: 'rung-n' }, opts.title), opts.note ? h('span', { class: 'small muted' }, opts.note) : null) : null, h('div', { class: 'rung-scroll' }, grid));
  }
  U.staticRung = staticRung;

  function codesysDecls(program, tags) {
    const tm = SC.addr.makeTagMap(tags);
    const used = new Set(), insts = {};
    for (const rg of program.rungs) for (const e of rg.els) {
      for (const k of ['a', 'b', 'o', 'w', 'rs', 'ld', 'cd']) if (typeof e[k] === 'string' && tm.byName[e[k]]) used.add(e[k]);
      if (e.i) insts[e.i] = e.t;
    }
    const lines = ['VAR_GLOBAL'];
    for (const n of used) {
      const t = tm.byName[n];
      lines.push(`  ${n} AT ${SC.addr.toCodesys(t.addr)} : ${t.type === 'Int' ? 'INT' : 'BOOL'};`);
    }
    lines.push('END_VAR', '', 'VAR');
    for (const n in insts) lines.push(`  ${n} : ${insts[n]};`);
    lines.push('END_VAR');
    return lines.join('\n');
  }

  function mountTransfer(box) {
    const ST = U.state;
    box.innerHTML = '';
    const ed = ST.ladder;
    const program = ed ? ed.program : ST.program;
    const tags = SC.mergeTags(SC.levelTags(ST.level), ed ? ed.userTags : ST.userTags);
    let mode = U.store.get('xfer', 'tia');
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const out = h('div', { class: 'xfer-out' });
    function draw() {
      out.innerHTML = '';
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));
      if (mode === 'tia') {
        program.rungs.forEach((rg, i) => out.append(h('div', { class: 'small muted' }, 'Network ' + (i + 1) + (rg.note ? ' — ' + rg.note : '')), staticRung(rg, (n) => (DEV[n] ? DEV[n] : n))));
        out.append(h('p', { class: 'small muted' }, tr('In TIA Portal the symbols show the tag name and the device ID from the schematic (-S1 = push button, -B = sensor, -Q/-Y = actuator).', 'بـ {{TIA Portal}} الرموز بتعرض اسم الـ {{tag}} ورقم الجهاز من المخطط (‎-S1 = زر، ‎-B = حساس، ‎-Q/-Y = مشغّل).').replace(/\{\{|\}\}/g, '')));
      } else {
        out.append(h('pre', { class: 'mono code' }, codesysDecls(program, tags)),
          h('p', { class: 'small muted' }, tr('CODESYS: global variables bound to %IX/%QX/%MX addresses, and one function-block instance per timer or counter.', 'بـ {{CODESYS}}: متغيرات عامة مربوطة بعناوين %IX/%QX/%MX، و{{instance}} واحد لكل مؤقت أو عدّاد.').replace(/\{\{|\}\}/g, '')));
      }
    }
    for (const [m, label] of [['tia', 'TIA Portal'], ['codesys', 'CODESYS']]) {
      tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab', dataset: { m }, onclick: () => { mode = m; U.store.set('xfer', m); draw(); } }, label));
    }
    box.append(tabs, out);
    draw();
  }
  U.mountTransfer = mountTransfer;
  U.refreshTransfer = () => { const b = document.getElementById('xfer-mount'); if (b && b.closest('details') && b.closest('details').open && U.state.level) mountTransfer(b); };
})();
