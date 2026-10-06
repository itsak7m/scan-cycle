/* Datasheet timing diagrams and the FAT failure report (timeline + active rungs + self-regulation question + replay). */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);

  // ---------------------------------------------------------------- datasheet timing diagram
  // timing: {step (ms per slot), unit, signals:[{name, wave:'0011'}]}
  U.timingSvg = function (timing) {
    const slot = 34, labelW = 104, rowH = 28, n = Math.max(...timing.signals.map((s) => s.wave.length));
    const W = labelW + n * slot + 8, H = timing.signals.length * rowH + 22;
    let s = `<svg class="timing" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Timing diagram">`;
    timing.signals.forEach((sg, i) => {
      const y0 = i * rowH + 6, hi = y0 + 4, lo = y0 + 18;
      s += `<text class="tm-l" x="2" y="${y0 + 16}">${U.esc(sg.name)}</text>`;
      let d = '';
      let prev = null;
      for (let k = 0; k < sg.wave.length; k++) {
        const v = sg.wave[k] === '1' ? 1 : 0, x = labelW + k * slot, y = v ? hi : lo;
        if (prev === null) d += `M${x} ${y}`;
        else if (v !== prev) d += `L${x} ${prev ? hi : lo}L${x} ${y}`;
        d += `L${x + slot} ${y}`;
        prev = v;
      }
      s += `<path class="tm-w" d="${d}" fill="none"/>`;
      s += `<text class="tm-v" x="${labelW - 6}" y="${hi + 7}" text-anchor="end">1</text><text class="tm-v" x="${labelW - 6}" y="${lo + 4}" text-anchor="end">0</text>`;
    });
    const ay = timing.signals.length * rowH + 14;
    for (let k = 0; k <= n; k += 2) {
      const x = labelW + k * slot;
      s += `<path class="tm-g" d="M${x} 2V${ay - 10}"/><text class="tm-v" x="${x}" y="${ay + 4}" text-anchor="middle">${(k * (timing.step || 500) / (timing.unit === 's' ? 1 : 1000)).toFixed(1)}s</text>`;
    }
    return s + '</svg>';
  };

  // ---------------------------------------------------------------- failure timeline
  const fmtVal = (v) => (v === true || v === 1 ? 'ON' : v === false || v === 0 ? 'OFF' : String(v));
  const sec = (ms) => (ms / 1000).toFixed(2) + ' s';

  function timelineSvg(sigs, t0, t1, tFail) {
    const labelW = 120, W = 640, pw = W - labelW - 10, rowH = 26, H = sigs.length * rowH + 28;
    const X = (t) => labelW + (Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0) * pw;
    let s = `<svg class="timing tl" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="I/O timeline before the failure">`;
    sigs.forEach((sg, i) => {
      const y0 = i * rowH + 4, hi = y0 + 4, lo = y0 + 18;
      s += `<text class="tm-l ${sg.key ? 'tm-key' : ''}" x="2" y="${y0 + 16}">${U.esc(sg.name)}</text>`;
      if (!sg.analog) {
        let d = '';
        sg.segs.forEach((seg, k) => {
          const x = X(seg[0]), y = seg[1] ? hi : lo;
          if (k === 0) d += `M${x} ${y}`;
          else d += `L${x} ${sg.segs[k - 1][1] ? hi : lo}L${x} ${y}`;
        });
        const last = sg.segs[sg.segs.length - 1];
        d += `L${X(t1)} ${last[1] ? hi : lo}`;
        s += `<path class="tm-w" d="${d}" fill="none"/>`;
      } else {
        sg.segs.forEach((seg, k) => { const x = X(seg[0]); s += `<text class="tm-v" x="${x + 2}" y="${y0 + 14}">${seg[1]}</text>`; });
      }
      if (sg.expect !== undefined && !sg.analog) {
        const y = (sg.expect === true || sg.expect === 1) ? hi : lo;
        s += `<circle class="tm-exp" cx="${X(tFail)}" cy="${y}" r="5" fill="none"/>`;
      }
    });
    const ay = sigs.length * rowH + 12;
    const step = (t1 - t0) > 3000 ? 1000 : 500;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      s += `<path class="tm-g" d="M${X(t)} 2V${ay - 8}"/><text class="tm-v" x="${X(t)}" y="${ay + 6}" text-anchor="middle">${(t / 1000).toFixed(1)}s</text>`;
    }
    s += `<path class="tm-fail" d="M${X(tFail)} 0V${ay - 6}"/><text class="tm-failt" x="${X(tFail) - 3}" y="${ay + 6}" text-anchor="end">✖ ${(tFail / 1000).toFixed(2)}s</text>`;
    return s + '</svg>';
  }

  // changes of `tag` over the whole trace: [[t, v], ...] sorted
  function changesOf(trace, tag) { return trace.filter((x) => x.tag === tag).map((x) => [x.t, x.v]); }
  function segsFor(chg, t0) {
    let v0 = 0;
    const inside = [];
    for (const c of chg) { if (c[0] <= t0) v0 = c[1]; else inside.push(c); }
    return [[t0, v0]].concat(inside);
  }

  // ---------------------------------------------------------------- the report
  // ctx: {level, program, userTags, scenario, failure, hidden, replay(fn)}
  U.renderReport = function (box, ctx) {
    box.innerHTML = '';
    const { level, program, userTags, scenario, failure } = ctx;
    const tags = SC.mergeTags(SC.levelTags(level), userTags);
    const lv = Object.assign({}, level, { tags: (level.tags || []).concat(userTags) });
    const tFail = failure.t;
    const t0 = Math.max(0, tFail - 2000), t1 = tFail + 150;
    const title = scenario.title ? (U.lang === 'ar' ? scenario.title.ar : scenario.title.en) : scenario.id;
    const msg = failure.msg || { en: '', ar: '' };

    // replay up to the failure to get the trace
    const res = SC.scenario.runScenario(lv, program, scenario, { trace: true, keepSim: true, upTo: t1, userTags });
    const sim = res.sim;
    const trace = sim.trace;

    // signals to plot
    const keyNames = Object.keys(failure.expected || {}).filter((k) => sim.tagByName[k] && sim.tagByName[k]._a);
    const changed = {};
    for (const x of trace) if (x.t >= t0 && x.t <= tFail + 10) changed[x.tag] = true;
    const levelNames = SC.levelTags(level).filter((t) => /^[IQ]/.test(t.addr) && !/^IW|^QW/.test(t.addr)).map((t) => t.name);
    const others = levelNames.filter((n) => changed[n] && keyNames.indexOf(n) < 0);
    others.sort((a, b) => (/^Q/.test(sim.tagByName[a].addr) ? 0 : 1) - (/^Q/.test(sim.tagByName[b].addr) ? 0 : 1));
    const names = keyNames.concat(others).slice(0, 9);
    const sigs = names.map((n) => ({ name: n, key: keyNames.indexOf(n) >= 0, segs: segsFor(changesOf(trace, n), t0), expect: failure.expected ? failure.expected[n] : undefined }));

    const head = h('div', { class: 'rp-head' }, h('h3', { class: 'warn' }, '✖ ', tr('FAT failed', 'فشل فحص {{FAT}}').replace(/\{\{|\}\}/g, ''), ': ', title, ctx.hidden ? h('small', null, ' · ' + tr('hidden variant', 'نسخة مخفية')) : null));
    const lines = h('div', { class: 'rp-msg' },
      h('p', { lang: 'en' }, msg.en),
      h('p', { lang: 'ar', dir: 'rtl', html: U.arHtml(msg.ar || '') }));

    const exp = failure.expected || {};
    const act = failure.actual || {};
    const expTxt = Object.keys(exp).map((k) => `${k} = ${typeof exp[k] === 'object' ? JSON.stringify(exp[k]) : fmtVal(exp[k])}`).join(', ');
    const actTxt = Object.keys(exp).map((k) => `${k} = ${fmtVal(act[k])}`).join(', ');
    const where = failure.kind === 'bad_scenario' ? '' : h('p', { class: 'rp-diff mono' },
      tr('Expected', 'المتوقع'), ' ', h('b', null, expTxt), ' ', tr('at', 'عند'), ' t = ', sec(failure.at !== undefined && failure.kind === 'at' ? failure.at : tFail), h('br'),
      tr('Actual', 'الفعلي'), ' ', h('b', { class: 'warn' }, actTxt), ' ', tr('at', 'عند'), ' t = ', sec(tFail));

    // timeline + table
    const tl = h('details', { open: true, class: 'rp-sec' }, h('summary', null, tr('I/O timeline (last 2 seconds)', 'خط زمني للمداخل والمخارج (آخر ثانيتين)')),
      h('div', { class: 'tl-wrap', html: names.length ? timelineSvg(sigs, t0, t1, tFail) : '' }),
      h('p', { class: 'small muted' }, tr('Filled line = bit 1, low line = bit 0. The circle marks what the test expected at the failure time.', 'الخط العالي = البت 1، والواطي = 0. الدائرة بتبيّن شو كان متوقع بوقت الفشل.')));
    const rows = trace.filter((x) => x.t >= t0 && x.t <= tFail + 10 && (names.indexOf(x.tag) >= 0)).slice(-24);
    if (rows.length) {
      tl.append(h('table', { class: 'tags small' }, h('thead', null, h('tr', null, h('th', null, 't'), h('th', null, 'tag'), h('th', null, '→'))),
        h('tbody', null, rows.map((x) => h('tr', null, h('td', { class: 'mono' }, sec(x.t)), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, fmtVal(x.v)))))));
    }

    // rungs at the failing scan
    const sim2 = SC.sim.create({ level: lv, program, scenario, seed: scenario.seed, userTags });
    sim2.runUntil(tFail);
    sim2.step(true);
    const rungsBox = h('details', { open: true, class: 'rp-sec' }, h('summary', null, tr('Your rungs at the failing scan', 'الـ rungs تبعك بلحظة الفشل')));
    if (sim2.compiled.ok && sim2.rec) {
      program.rungs.forEach((rg, ri) => {
        const rec = sim2.rec[ri];
        if (rec) rungsBox.append(U.staticRung(rg, (n) => n, { rec, title: 'Rung ' + (ri + 1), note: rg.note || '', addrOf: (n) => (sim2.tagByName[n] ? sim2.tagByName[n].addr : '') }));
      });
      rungsBox.append(h('p', { class: 'small muted' }, tr('Bold line + filled symbol + ON = power flows. Thin line + hollow + OFF = no power.', 'خط عريض + رمز معبّى + ON = في power. خط رفيع + فاضي + OFF = ما في power.')));
    } else rungsBox.append(h('p', { class: 'warn' }, tr('The program has errors, so it did not run.', 'البرنامج فيه أخطاء فما اشتغل.')));

    // self-regulation question
    const q = (() => {
      const k = keyNames[0];
      if (!k) return tr('What did you expect to happen at this time, and which rung controls it?', 'شو كنت متوقع يصير بهالوقت، وأي rung بيتحكم فيه؟');
      const wr = program.rungs.map((rg, ri) => ({ ri, w: rg.els.some((e) => (e.t === 'OUT' || e.t === 'SET' || e.t === 'RST') && e.a === k) })).find((x) => x.w);
      const want = exp[k];
      if (wr) return tr(`Which condition in rung ${wr.ri + 1} was ${want === true || want === 1 ? 'FALSE' : 'TRUE'} at t = ${sec(tFail)}? Why?`, `أي شرط بالـ rung ${wr.ri + 1} كان ${want === true || want === 1 ? 'FALSE' : 'TRUE'} عند t = ${sec(tFail)}؟ ليش؟`);
      return tr(`${k} should be ${typeof exp[k] === 'object' ? 'different' : fmtVal(exp[k])} at t = ${sec(tFail)}. Which rung writes ${k}? What decides it?`, `الـ ${k} لازم يكون ${typeof exp[k] === 'object' ? 'مختلف' : fmtVal(exp[k])} عند t = ${sec(tFail)}. أي rung بيكتب ${k}؟ شو اللي بيقرر؟`);
    })();
    const qBox = h('div', { class: 'rp-q' }, h('b', null, '❓ '), q);

    // classic mistakes
    const diags = SC.diag.run(level, program, { failure, tags });
    const dBox = diags.length ? h('div', { class: 'rp-diag' }, diags.slice(0, 2).map((d) => h('p', null, h('b', null, '💡 '), h('span', { lang: 'en' }, d.msg.en), h('br'), h('span', { lang: 'ar', dir: 'rtl', html: U.arHtml(d.msg.ar) })))) : null;

    const btns = h('div', { class: 'rp-btns' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => ctx.replay && ctx.replay(scenario, tFail) }, '▶ ' + tr('Replay to t − 2 s', 'إعادة تشغيل حتى t − 2 s')),
      h('button', { type: 'button', class: 'btn', onclick: () => { box.innerHTML = ''; } }, tr('Close report', 'سكّر التقرير')));

    box.append(h('div', { class: 'report' }, head, lines, where, qBox, dBox, tl, rungsBox, btns, h('p', { class: 'small muted' }, tr('Your program was not changed. Fix it and run the FAT again.', 'برنامجك ما تغيّر. صلّحه وشغّل الـ {{FAT}} مرة ثانية.').replace(/\{\{|\}\}/g, ''))));
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
})();
