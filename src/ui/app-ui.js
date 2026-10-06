/* Application shell: station map, level screen, game loop, operator panel, I/O strip, forces, replay. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);

  const ST = {
    levels: [], level: null, sim: null, view: null, speed: 1, paused: false, acc: 0, last: 0,
    program: { v: 1, rungs: [] }, userTags: [], root: null, raf: 0, ladder: null, replay: null, panels: null, lastPaint: 0,
  };
  U.state = ST;
  let ledEls = null, lastIO = 0;

  // ---------------------------------------------------------------- levels
  function sandboxLevel() {
    return {
      id: 'SBX', order: 0, sandbox: true, concept: 'free play',
      title: { en: 'Sandbox', ar: 'ساحة التجربة' },
      workOrder: {
        en: 'Free play. All instructions are unlocked and the whole line is installed. Build anything, force inputs, press the E-stop.',
        ar: 'لعب حر. كل التعليمات مفتوحة والخط كامل. ابني أي شي، اعمل {{force}} للمداخل، واضغط زر الطوارئ.',
      },
      palette: null,
      tags: SC.IO.map((t) => t.name).concat(SC.demo.tags.filter((t) => typeof t === 'object')),
      plant: { stations: ['infeed', 'filler', 'stopper', 'capper', 'sealer', 'labeler', 'reject', 'exit', 'tank', 'backup'], bottlesPerMin: 24, startLevelPct: 80 },
      starter: SC.dsl.parseProgram(SC.demo.lines),
      scenarios: [], datasheets: [], glossary: [], hints: [],
    };
  }

  // ---------------------------------------------------------------- sim lifecycle
  function levelWithTags() { return Object.assign({}, ST.level, { tags: (ST.level.tags || []).concat(ST.userTags.filter((t) => !(ST.level.tags || []).some((x) => x.name === t.name))) }); }

  function newSim() {
    ST.sim = SC.sim.create({ level: ST.level, program: ST.program, seed: 1, scenario: {}, userTags: ST.userTags });
    ST.acc = 0; ST.replay = null;
    if (ST.view) ST.view.setSim(ST.sim);
    const bar = document.getElementById('replay-bar'); if (bar) bar.hidden = true;
    document.body.classList.remove('replaying');
  }

  // hot-swap the program into the running sim (memory kept)
  U.setProgram = function (program, userTags) {
    ST.program = program;
    if (userTags) ST.userTags = userTags;
    if (!ST.sim || ST.replay) return;
    const tags = SC.mergeTags(SC.levelTags(ST.level), ST.userTags);
    const c = SC.compile(ST.program, { tags, palette: ST.level.palette || null });
    if (c.ok || !ST.sim.compiled.ok) ST.sim.compiled = c; // a program with errors is not "downloaded": the PLC keeps running the last good one
    for (const t of ST.userTags) if (!ST.sim.tagByName[t.name]) ST.sim.tagByName[t.name] = Object.assign({ _a: SC.addr.parseAddr(t.addr) }, t);
  };

  function persistProgram(p, u) {
    if (!ST.level) return;
    if (ST.level.sandbox) { U.data.sandbox = { program: p, userTags: u }; }
    else { const lv = U.lv(ST.level.id); lv.program = p; lv.userTags = u; }
    U.save();
  }

  // ---------------------------------------------------------------- replay
  function startReplay(sc, tFail) {
    const ed = ST.ladder;
    const sim = SC.sim.create({ level: levelWithTags(), program: ed.program, scenario: sc, seed: sc.seed, userTags: ed.userTags });
    sim.runUntil(Math.max(0, tFail - 2000));
    sim.replayInfo = { title: sc.title ? (U.lang === 'ar' ? sc.title.ar : sc.title.en) : sc.id, tFail };
    ST.sim = sim; ST.view.setSim(sim);
    ST.replay = { sc, tFail, tEnd: tFail + 1500 };
    ST.paused = false; ST.speed = 1; ST.acc = 0;
    document.body.classList.add('replaying');
    const bar = document.getElementById('replay-bar');
    bar.hidden = false;
    bar.querySelector('.rb-t').textContent = tr('REPLAY: ', 'إعادة: ') + sim.replayInfo.title + ' — ' + tr('failure at', 'الفشل عند') + ' t = ' + (tFail / 1000).toFixed(2) + ' s';
    window.scrollTo({ top: 0, behavior: U.motion() });
  }

  function stopReplay() { newSim(); ST.paused = false; }

  // ---------------------------------------------------------------- main loop
  function frame(ts) {
    ST.raf = requestAnimationFrame(frame);
    if (!ST.sim) return;
    const dt = Math.min(250, ts - (ST.last || ts));
    ST.last = ts;
    if (!ST.paused) {
      ST.acc += dt * ST.speed;
      const n = Math.min(400, Math.floor(ST.acc / SC.SCAN_MS));
      for (let i = 0; i < n; i++) ST.sim.step(i === n - 1);
      ST.acc -= n * SC.SCAN_MS;
      if (n >= 400) ST.acc = 0;
      if (ST.replay && ST.sim.t >= ST.replay.tEnd) { ST.paused = true; const t = document.querySelector('#replay-bar .rb-t'); if (t) t.textContent += ' — ' + tr('replay finished', 'انتهت الإعادة'); }
    }
    ST.view.draw(ST.paused ? 0 : ST.acc / SC.SCAN_MS);
    updateIO(ts);
    if (ST.ladder && ts - ST.lastPaint > 90) { ST.lastPaint = ts; ST.ladder.paint(ST.sim); }
  }

  // ---------------------------------------------------------------- I/O strip + panel
  function buildIO(box) {
    ledEls = [];
    const tags = SC.levelTags(ST.level);
    const ins = tags.filter((t) => /^I/.test(t.addr)), outs = tags.filter((t) => /^Q/.test(t.addr));
    const mk = (t) => {
      const b = h('button', { class: 'led' + (/^I/.test(t.addr) ? '' : ' led-out'), type: 'button', title: `${t.name} (${t.addr}) — ${t.desc ? t.desc.en : ''}`, onclick: () => cycleForce(t) },
        h('span', { class: 'led-dot', 'aria-hidden': 'true' }), h('span', { class: 'led-name' }, t.name),
        h('span', { class: 'led-addr' }, U.useCodesys ? SC.addr.toCodesys(t.addr) : t.addr), h('span', { class: 'led-val' }, '0'), h('span', { class: 'led-lock', 'aria-hidden': 'true' }, '🔒'));
      ledEls.push({ tag: t, el: b, val: null, forced: null });
      return b;
    };
    box.append(
      h('div', { class: 'io-group' }, h('h4', null, U.tEl('inputs')), h('div', { class: 'leds' }, ins.map(mk))),
      h('div', { class: 'io-group' }, h('h4', null, U.tEl('outputs')), h('div', { class: 'leds' }, outs.map(mk))),
      h('p', { class: 'muted small' }, U.tEl('forceHint')));
  }

  function cycleForce(t) {
    if (!/^I/.test(t.addr) || ST.replay) return;
    const a = SC.addr.parseAddr(t.addr);
    if (a.kind === 'word') return;
    const cur = ST.sim.forces[a.canon];
    if (cur === undefined) ST.sim.force(t.name, 1); else if (cur === 1) ST.sim.force(t.name, 0); else ST.sim.force(t.name, null);
    updateForcesBanner();
  }

  function updateForcesBanner() {
    const n = Object.keys(ST.sim.forces).length;
    const b = document.getElementById('forces-banner');
    if (b) { b.hidden = n === 0; b.querySelector('.fb-n').textContent = n; }
  }

  function updateIO(ts) {
    if (!ledEls || ts - lastIO < 90) return;
    lastIO = ts;
    const sim = ST.sim;
    for (const L of ledEls) {
      const a = SC.addr.parseAddr(L.tag.addr);
      const v = sim.st[a.arr][a.idx];
      const f = a.arr === 'I' || a.arr === 'IW' ? sim.forces[a.canon] : undefined;
      if (L.val !== v || L.forced !== f) {
        L.val = v; L.forced = f;
        L.el.classList.toggle('on', !!v); L.el.classList.toggle('forced', f !== undefined);
        L.el.title = `${L.tag.name} (${L.tag.addr}) = ${v}${f !== undefined ? ' — FORCED' : ''}`;
        L.el.querySelector('.led-val').textContent = a.kind === 'word' ? String(v) : (v ? '1' : '0');
      }
    }
  }

  function buildPanel(box) {
    const tags = SC.levelTags(ST.level).filter((t) => t.src === 'panel' && !/^IW/.test(t.addr));
    const btns = [];
    for (const t of tags) {
      const io = SC.ioByName[t.name];
      const idle = io ? io.def : 0;
      const momentary = io && ['start', 'stop', 'ack', 'reset', 'release', 'setpoint'].indexOf(io.role) >= 0;
      const btn = h('button', { class: 'pbtn' + (t.name === 'Stop_PB' ? ' pb-stop' : ''), type: 'button', 'aria-pressed': 'false', title: `${t.name} (${t.addr}) — ${t.desc ? t.desc.en : ''}` },
        h('span', { class: 'pb-name' }, t.name.replace(/_/g, ' ')), h('span', { class: 'pb-sub' }, momentary ? (idle ? 'NC · hold' : 'NO · hold') : 'switch'));
      const setP = (pressed) => {
        ST.sim.setPanel(t.name, momentary ? (pressed ? (idle ? 0 : 1) : idle) : pressed);
        btn.setAttribute('aria-pressed', String(!!pressed)); btn.classList.toggle('down', !!pressed);
      };
      if (momentary) {
        let startSteps = 0, releasing = false;
        const down = () => { if (btn.classList.contains('down') && !releasing) return; releasing = false; startSteps = ST.sim.steps; setP(true); };
        // a quick tap must still be seen by the PLC: keep the button down for at least 4 scans (unless paused)
        const up = () => {
          if (!btn.classList.contains('down')) return;
          releasing = true;
          const wait = () => {
            if (!releasing) return;
            if (ST.paused || !ST.sim || ST.sim.steps - startSteps >= 4) { releasing = false; setP(false); return; }
            requestAnimationFrame(wait);
          };
          wait();
        };
        btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture && btn.setPointerCapture(e.pointerId); down(); });
        btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
        btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); down(); } });
        btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
        btn.addEventListener('click', (e) => { if (e.detail === 0 && !btn.classList.contains('down')) { down(); setTimeout(up, 60); } }); // assistive technology / voice activation
      } else {
        let on = !!idle;
        btn.addEventListener('click', () => { on = !on; setP(on); });
        if (idle) setP(true);
      }
      btns.push(btn);
    }
    const estop = h('button', { class: 'pbtn pb-estop', type: 'button', 'aria-pressed': 'false', title: U.S.estopNote.en }, h('span', { class: 'pb-name' }, '⏻ ', U.t('estop')), h('span', { class: 'pb-sub' }, 'latching'));
    estop.addEventListener('click', () => { const on = !ST.sim.P.hw.estop; ST.sim.P.hw.estop = on; estop.setAttribute('aria-pressed', String(on)); estop.classList.toggle('down', on); });
    const door = h('button', { class: 'pbtn', type: 'button', 'aria-pressed': 'false', title: 'Guard door' }, h('span', { class: 'pb-name' }, U.t('door')), h('span', { class: 'pb-sub' }, U.t('doorClosed')));
    door.addEventListener('click', () => { const open = !ST.sim.P.hw.doorOpen; ST.sim.P.hw.doorOpen = open; door.setAttribute('aria-pressed', String(open)); door.classList.toggle('down', open); door.querySelector('.pb-sub').textContent = open ? U.t('doorOpen') : U.t('doorClosed'); });
    box.append(h('div', { class: 'pbtns' }, btns, estop, door), h('p', { class: 'muted small' }, U.tEl('estopNote')));
  }

  // ---------------------------------------------------------------- level screen
  function openLevel(L, override) {
    cancelAnimationFrame(ST.raf);
    ST.level = L; ST.ladder = null; ST.replay = null;
    ST.paused = false; ST.speed = 1;
    let saved = null, savedTags = null;
    if (L.sandbox) { saved = U.data.sandbox && U.data.sandbox.program; savedTags = U.data.sandbox && U.data.sandbox.userTags; }
    else { const lv = U.lv(L.id); saved = lv.program; savedTags = lv.userTags; }
    ST.userTags = savedTags && savedTags.length ? SC.util.clone(savedTags) : (L.tags || []).filter((t) => typeof t === 'object' && t.user).map((t) => SC.util.clone(t));
    const cleanSaved = saved ? SC.sanitizeProgram(saved) : null;
    ST.program = cleanSaved ? SC.util.clone(cleanSaved) : SC.util.clone(SC.dsl.programFrom(L.starter) || { v: 1, rungs: [] });
    if (override) {
      const lvUser = (L.tags || []).filter((t) => typeof t === 'object' && t.user);
      ST.program = override.program; ST.userTags = SC.mergeTags(lvUser, override.userTags).map((t) => SC.util.clone(t));
    }
    try { renderLevel(); } catch (err) {
      // a broken saved/shared program must never lock the level: fall back to the starter
      U.toast(tr('That program could not be loaded. Starting fresh.', 'ما قدرت أحمّل هالبرنامج. بلّشنا من جديد.'));
      ST.program = SC.util.clone(SC.dsl.programFrom(L.starter) || { v: 1, rungs: [] }); ST.userTags = [];
      if (!L.sandbox) { const lv0 = U.lv(L.id); lv0.program = null; lv0.userTags = []; U.save(); }
      renderLevel();
    }
    if (override) persistProgram(ST.program, ST.userTags);
  }

  function renderLevel() {
    const L = ST.level;
    const root = ST.root;
    root.innerHTML = '';

    const canvas = h('canvas', { id: 'plant', class: 'plant', role: 'img', 'aria-label': 'Side view of the bottling line' });
    const speedBtns = [0.25, 0.5, 1, 2, 4, 8].map((s) => h('button', { type: 'button', class: 'spd' + (s === ST.speed ? ' sel' : ''), 'aria-pressed': String(s === ST.speed),
      onclick: (e) => { ST.speed = s; speedBtns.forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); }); document.getElementById('fastwarn').hidden = s < 8; } }, '×' + s));
    const runBtn = h('button', { type: 'button', class: 'btn', onclick: () => { ST.paused = !ST.paused; runBtn.textContent = ST.paused ? '▶ ' + U.t('run') : '⏸ ' + U.t('pause'); stepBtn.disabled = !ST.paused; } }, '⏸ ' + U.t('pause'));
    const stepBtn = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { ST.sim.step(true); if (ST.ladder) ST.ladder.paint(ST.sim); } }, '⏭ ' + U.t('step'));
    const restartBtn = h('button', { type: 'button', class: 'btn', onclick: () => { newSim(); buildAll(); } }, '↻ ' + U.t('restart'));
    const ioBox = h('div', { class: 'io' }), panelBox = h('div', { class: 'panelbox' }), ladderBox = h('div', { id: 'ladder-mount', class: 'ladder-mount' });
    const reportBox = h('div', { id: 'report-mount', class: 'o-report' });
    const lv = L.sandbox ? null : U.lv(L.id);

    const header = h('header', { class: 'top' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => showMap() }, U.t('back')),
      h('div', { class: 'ttl' }, h('b', null, L.sandbox ? '' : L.id + ' · '), U.lang === 'ar' ? U.arEl(L.title.ar) : U.enEl(L.title.en)),
      lv ? h('span', { class: 'stars hstars', id: 'hdr-stars', 'aria-label': lv.stars + ' of 3 stars' }, U.starsText(lv.stars)) : null,
      h('div', { class: 'grow' }),
      h('div', { id: 'forces-banner', class: 'forces', hidden: true, role: 'status' }, '⚠ ', U.tEl('forcesActive'), ' (', h('span', { class: 'fb-n' }, '0'), ') ',
        h('button', { class: 'btn small', type: 'button', onclick: () => { ST.sim.clearForces(); updateForcesBanner(); } }, U.t('clearForces'))),
      langBtn(), themeBtn());

    const replayBar = h('div', { id: 'replay-bar', class: 'replay-bar', hidden: true, role: 'status' }, h('span', { class: 'rb-t' }), h('button', { class: 'btn small', type: 'button', onclick: stopReplay }, '■ ' + tr('Stop replay', 'أوقف الإعادة')));

    const plantCard = h('section', { class: 'card o-plant' }, canvas,
      h('div', { class: 'ctrls' }, runBtn, stepBtn, restartBtn, h('span', { class: 'sp' }), h('span', { class: 'muted small' }, U.t('speed') + ':'), speedBtns),
      h('p', { id: 'fastwarn', class: 'warn small', hidden: true }, '⚠ ', U.tEl('fastWarn')));
    const panelCard = h('section', { class: 'card o-panel' }, h('h3', null, U.tEl('panel')), panelBox);
    const ioCard = h('section', { class: 'card o-io' }, h('h3', null, 'I/O'), ioBox);
    const ladderCard = h('section', { class: 'card o-ladder' }, h('div', { class: 'card-h' }, h('h3', null, U.tEl('ladder')), h('button', { class: 'btn small', type: 'button', onclick: () => U.openShare(L, ST.ladder.program, ST.ladder.userTags) }, '↗ ' + tr('Share', 'شارك'))), ladderBox, h('p', { id: 'autosave-note', class: 'warn small', hidden: U.autosaveOk !== false }, tr('Autosave is unavailable in this browser — use Export on the map.', 'الحفظ التلقائي مش متاح بهالمتصفح — استخدم التصدير من الخريطة.')));
    const tagsCard = h('section', { class: 'card o-tags' }, h('h3', null, U.tEl('tags')), h('div', { id: 'tags-mount' }));
    const xferCard = h('details', { class: 'card o-xfer', ontoggle: (e) => { if (e.target.open) U.mountTransfer(document.getElementById('xfer-mount')); } }, h('summary', null, h('b', null, U.tEl('transfer'))), h('div', { id: 'xfer-mount' }));

    let left;
    if (L.sandbox) {
      left = [h('section', { class: 'card o-wo' }, h('h3', null, U.tEl('workOrder')), h('p', { lang: 'en' }, L.workOrder.en), h('section', { lang: 'ar', dir: 'rtl', class: 'ar-block', html: U.arHtml(L.workOrder.ar) }))];
      ST.panels = null;
    } else {
      const env = { L, ladder: null, panels: null, reportBox, sim: () => ST.sim, replay: startReplay, onStars: () => { const s = document.getElementById('hdr-stars'); if (s) s.textContent = U.starsText(U.lv(L.id).stars); } };
      const panels = U.buildLevelPanels(L, { runFat: () => { env.ladder = ST.ladder; U.runFat(env); } });
      env.panels = panels; ST.panels = panels; ST.env = env;
      left = [panels.wo, panels.ds, panels.fat.el];
    }

    root.append(header, replayBar, h('main', { class: 'level-grid' },
      h('div', { class: 'col-left' }, left),
      h('div', { class: 'col-right' }, plantCard, panelCard, ioCard, ladderCard, reportBox, tagsCard, xferCard)));

    ST.view = SC.ui.PlantView(canvas);
    function buildAll() {
      ioBox.innerHTML = ''; panelBox.innerHTML = '';
      buildIO(ioBox); buildPanel(panelBox);
      mountLadder(ladderBox);
      U.mountTags(document.getElementById('tags-mount'));
    }
    newSim();
    buildAll();
    ST.last = 0;
    ST.raf = requestAnimationFrame(frame);
  }

  function mountLadder(box) {
    box.innerHTML = '';
    const L = ST.level;
    const host = {
      program: ST.program, userTags: ST.userTags,
      baseTags: () => SC.levelTags(L).filter((t) => !t.user),
      palette: () => (L.palette ? L.palette : null),
      setProgram: (p, u, initial) => { U.setProgram(p, u); if (!initial) { persistProgram(p, u); U.onProgramChanged(p, u); } },
    };
    ST.ladder = U.Ladder(box, host);
  }

  function langBtn() { return h('button', { class: 'btn ghost', type: 'button', onclick: () => { U.setLang(U.lang === 'ar' ? 'en' : 'ar'); rerender(); } }, U.t('langBtn')); }
  function themeBtn() {
    return h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Toggle dark mode', onclick: () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next); U.store.set('theme', next);
      if (ST.view) ST.view.refreshTheme();
    } }, '◐');
  }
  function rerender() { if (ST.level) { const keep = ST.level; openLevel(keep); } else showMap(); }

  // ---------------------------------------------------------------- map
  function showMap() {
    cancelAnimationFrame(ST.raf);
    ST.level = null; ST.sim = null; ST.ladder = null; ledEls = null; ST.replay = null;
    document.body.classList.remove('replaying');
    const root = ST.root;
    root.innerHTML = '';
    const nextIdx = ST.levels.findIndex((L) => !U.lv(L.id).solved);
    const cards = ST.levels.map((L, i) => {
      const lv = U.lv(L.id);
      return h('button', { class: 'lvl' + (i === nextIdx ? ' next' : '') + (lv.solved ? ' done' : ''), type: 'button', onclick: () => openLevel(L), 'aria-label': `${L.id} ${L.title.en}, ${lv.stars} stars` },
        h('b', null, L.id), h('span', null, U.lang === 'ar' ? L.title.ar : L.title.en),
        h('span', { class: 'stars small' }, U.starsText(lv.stars)), i === nextIdx ? h('small', { class: 'nextmark' }, '▶ ' + tr('next', 'التالي')) : null);
    });
    cards.unshift(h('button', { class: 'lvl sbx', type: 'button', onclick: () => openLevel(sandboxLevel()) }, h('b', null, '∞'), h('span', null, U.t('sandbox')), h('small', null, U.t('sandboxDesc'))));
    const due = U.glossary.dueIds().length;
    const importInput = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const ok = U.importData(await f.text());
      U.toast(ok ? tr('Progress imported.', 'انستوردت البيانات.') : tr('That file is not a valid Scan Cycle save.', 'الملف هاد مش حفظ صالح.'));
      if (ok) showMap();
    } });
    const review = h('div', { id: 'review-mount' });
    root.append(
      h('header', { class: 'top' }, h('div', { class: 'ttl' }, h('b', null, 'Scan Cycle')), h('div', { class: 'grow' }), langBtn(), themeBtn()),
      h('main', { class: 'mapwrap' },
        h('h1', null, U.tEl('app')), h('p', { class: 'lead' }, U.tEl('tagline')),
        h('div', { class: 'maptools' },
          h('button', { class: 'btn', type: 'button', onclick: () => { review.innerHTML = ''; U.glossary.review(review, showMap); review.scrollIntoView({ behavior: U.motion() }); } }, '🔤 ' + tr('Term review', 'مراجعة المصطلحات') + (due ? ` (${due} ${tr('due', 'مستحق')})` : '')),
          h('span', { class: 'stars' }, '★ ' + U.totalStars() + '/' + (ST.levels.length * 3))),
        review,
        h('div', { class: 'levelmap' }, cards),
        h('details', { class: 'card' }, h('summary', null, tr('Save, share and reset', 'حفظ ومشاركة وتصفير')),
          h('div', { class: 'maptools' },
            h('button', { class: 'btn', type: 'button', onclick: () => U.exportData() }, '⬇ ' + tr('Export progress', 'صدّر التقدم')),
            h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, '⬆ ' + tr('Import progress', 'استورد التقدم')), importInput,
            h('button', { class: 'btn', type: 'button', onclick: () => { if (confirm(tr('Delete ALL progress in this browser?', 'تحذف كل التقدم بهالمتصفح؟'))) { U.resetData(); showMap(); } } }, tr('Reset progress', 'صفّر التقدم'))),
          h('p', { class: 'muted small', hidden: U.autosaveOk !== false }, tr('Autosave is unavailable — use Export.', 'الحفظ التلقائي مش متاح — استخدم التصدير.'))),
        h('p', { class: 'muted small' }, U.tEl('offlineNote'))));
  }

  // ---------------------------------------------------------------- boot
  U.start = function () {
    try { start2(); } catch (err) {
      document.getElementById('app').innerHTML = '';
      document.getElementById('app').append(h('main', { class: 'stub' }, h('h1', null, 'Scan Cycle'),
        h('p', { class: 'warn' }, 'Something went wrong while loading your saved data: ' + (err && err.message)),
        h('button', { class: 'btn', type: 'button', onclick: () => U.exportData() }, 'Export saved data'), ' ',
        h('button', { class: 'btn primary', type: 'button', onclick: () => { try { U.resetData(); } catch (e2) { /* ignore */ } location.reload(); } }, 'Reset and reload')));
    }
  };
  function start2() {
    ST.root = document.getElementById('app');
    if (!document.getElementById('toast')) document.body.append(h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }));
    ST.levels = SC.levels.loadAll();
    U.glossary.init(ST.levels);
    U.useCodesys = !!U.store.get('codesys', false);
    const th = U.store.get('theme', null);
    if (th) document.documentElement.setAttribute('data-theme', th);
    const q = new URLSearchParams(location.search);
    if (q.get('theme') === 'light' || q.get('theme') === 'dark') document.documentElement.setAttribute('data-theme', q.get('theme'));
    const open = q.get('level') || (location.hash.indexOf('#level=') === 0 ? location.hash.slice(7) : '');
    const sh = U.readShareHash();
    if (sh && sh.error) U.toast(tr('Could not read the shared link.', 'ما قدرت أقرا الرابط المشارك.'));
    let opened = false;
    if (sh && !sh.error) {
      const L = sh.level === 'SBX' ? sandboxLevel() : ST.levels.find((l) => l.id === sh.level);
      const had = L && !L.sandbox && U.lv(L.id).program && U.lv(L.id).program.rungs.some((r) => r.els.length);
      if (L && (!had || confirm(tr('Replace your saved program for this level with the shared one?', 'تستبدل برنامجك المحفوظ بهالمستوى بالبرنامج المشارك؟')))) { openLevel(L, { program: sh.program, userTags: sh.userTags }); U.toast(tr('Shared program loaded.', 'انحمّل البرنامج المشارك.')); opened = true; }
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (er) { /* ignore */ }
    }
    // ?level=L02&demo=["ladder text", ...]  loads a program written as ladder text (docs, screenshots, support)
    if (!opened && q.get('demo') && open && ST.levels.find((l) => l.id === open)) {
      try {
        const L = ST.levels.find((l) => l.id === open);
        const program = SC.dsl.parseProgram(JSON.parse(q.get('demo')));
        openLevel(L, { program, userTags: SC.fixtures.autoTags(program, L) });
        opened = true;
      } catch (e) { U.toast('demo: ' + e.message); }
    }
    if (!opened) {
      if (location.hash === '#sandbox') openLevel(sandboxLevel());
      else if (open && ST.levels.find((l) => l.id === open)) openLevel(ST.levels.find((l) => l.id === open));
      else showMap();
    }
    if (q.has('fat') && ST.env) setTimeout(() => { ST.env.ladder = ST.ladder; U.runFat(ST.env); }, 400);
    const focus = q.get('focus'); // ?focus=ladder|report|fat|plant scrolls there (docs, screenshots)
    if (focus && /^[a-z]+$/.test(focus)) document.body.classList.add('focus-' + focus); // hides the other cards (screenshots)
  }
  U.onProgramChanged = () => { clearTimeout(U._refT); U._refT = setTimeout(() => { U.refreshTags(); U.refreshTransfer(); }, 150); };
  U.openLevel = openLevel;
  U.showMap = showMap;
  U.rerender = rerender;
})();
