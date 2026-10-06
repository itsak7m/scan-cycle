/* Application shell: station map, level screen, game loop, operator panel, I/O strip, forces. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;

  const ST = {
    levels: [], level: null, sim: null, view: null, speed: 1, paused: false, acc: 0, last: 0,
    program: { v: 1, rungs: [] }, userTags: [], root: null, raf: 0, ioState: Object.create(null),
    fatResult: null, listeners: [],
  };
  U.state = ST;

  // ---------------------------------------------------------------- levels
  function loadLevels() {
    try { return JSON.parse(document.getElementById('levels').textContent) || []; } catch (e) { return []; }
  }

  function sandboxLevel() {
    return {
      id: 'SBX', order: 0, sandbox: true,
      title: { en: 'Sandbox', ar: 'ساحة التجربة' },
      workOrder: {
        en: 'Free play. All instructions are unlocked and the whole line is installed. Build anything, force inputs, press the E-stop.',
        ar: 'لعب حر. كل التعليمات مفتوحة والخط كامل. ابني أي شي، اعمل {{force}} للمداخل، واضغط زر الطوارئ.',
      },
      palette: null,
      tags: SC.IO.map((t) => t.name).concat([{ name: 'Run', addr: 'M0.0', type: 'Bool', user: true }, { name: 'Done', addr: 'M0.1', type: 'Bool', user: true }, { name: 'Busy', addr: 'M0.2', type: 'Bool', user: true }]),
      plant: { stations: ['infeed', 'filler', 'stopper', 'capper', 'sealer', 'labeler', 'reject', 'exit', 'tank', 'backup'], bottlesPerMin: 24, startLevelPct: 80 },
      starter: SC.dsl.parseProgram(SC.demo ? SC.demo.lines : []),
      scenarios: [],
    };
  }

  // ---------------------------------------------------------------- sim lifecycle
  function newSim() {
    const L = ST.level;
    ST.sim = SC.sim.create({ level: L, program: ST.program, seed: 1, scenario: {}, userTags: ST.userTags });
    ST.acc = 0;
    if (ST.view) ST.view.setSim(ST.sim);
  }

  // hot-swap the program into the running sim (memory kept)
  U.setProgram = function (program, userTags) {
    ST.program = program;
    if (userTags) ST.userTags = userTags;
    if (!ST.sim) return;
    const tags = SC.mergeTags(SC.levelTags(ST.level), ST.userTags);
    ST.sim.compiled = SC.compile(ST.program, { tags, palette: ST.level.palette || null });
    ST.listeners.forEach((f) => f());
  };

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
    }
    ST.view.draw(ST.paused ? 0 : ST.acc / SC.SCAN_MS);
    updateIO(ts);
    if (ST.ladder && ts - (ST.lastPaint || 0) > 90) { ST.lastPaint = ts; ST.ladder.paint(ST.sim); }
  }

  // ---------------------------------------------------------------- I/O strip + panel
  let ledEls = null, lastIO = 0, panelEls = null;

  function tagsForLevel() {
    return SC.levelTags(ST.level);
  }

  function buildIO(box) {
    const L = ST.level, sim = ST.sim;
    ledEls = [];
    const tags = tagsForLevel();
    const ins = tags.filter((t) => /^I/.test(t.addr)), outs = tags.filter((t) => /^Q/.test(t.addr));
    const mk = (t) => {
      const b = h('button', { class: 'led', type: 'button', title: `${t.name} (${t.addr}) — ${t.desc ? t.desc.en : ''}`, 'aria-label': t.name,
        onclick: () => cycleForce(t) },
        h('span', { class: 'led-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'led-name' }, t.name),
        h('span', { class: 'led-addr' }, U.useCodesys ? SC.addr.toCodesys(t.addr) : t.addr),
        h('span', { class: 'led-val' }, '0'),
        h('span', { class: 'led-lock', 'aria-hidden': 'true' }, '🔒'));
      if (!/^I/.test(t.addr)) b.classList.add('led-out');
      ledEls.push({ tag: t, el: b, val: null, forced: null });
      return b;
    };
    box.append(
      h('div', { class: 'io-group' }, h('h4', null, U.tEl('inputs')), h('div', { class: 'leds' }, ins.map(mk))),
      h('div', { class: 'io-group' }, h('h4', null, U.tEl('outputs')), h('div', { class: 'leds' }, outs.map(mk))),
      h('p', { class: 'muted small' }, U.tEl('forceHint')));
  }

  function cycleForce(t) {
    if (!/^I/.test(t.addr)) return;
    const sim = ST.sim;
    const a = SC.addr.parseAddr(t.addr);
    const cur = sim.forces[a.canon];
    if (a.kind === 'word') return;
    if (cur === undefined) sim.force(t.name, 1);
    else if (cur === 1) sim.force(t.name, 0);
    else sim.force(t.name, null);
    updateForcesBanner();
  }

  function updateForcesBanner() {
    const n = Object.keys(ST.sim.forces).length;
    const b = document.getElementById('forces-banner');
    if (b) {
      b.hidden = n === 0;
      b.querySelector('.fb-n').textContent = n;
    }
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
        L.el.classList.toggle('on', !!v);
        L.el.classList.toggle('forced', f !== undefined);
        L.el.querySelector('.led-val').textContent = a.kind === 'word' ? String(v) : (v ? '1' : '0');
      }
    }
  }

  function buildPanel(box) {
    const L = ST.level;
    const tags = tagsForLevel().filter((t) => t.src === 'panel' && !/^IW/.test(t.addr));
    panelEls = [];
    for (const t of tags) {
      const io = SC.ioByName[t.name];
      const idle = io ? io.def : 0;
      const momentary = io && ['start', 'stop', 'ack', 'reset', 'release', 'setpoint'].indexOf(io.role) >= 0;
      const btn = h('button', { class: 'pbtn' + (t.role === 'stop' || t.name === 'Stop_PB' ? ' pb-stop' : ''), type: 'button', 'aria-pressed': 'false', title: `${t.name} (${t.addr}) — ${t.desc ? t.desc.en : ''}` },
        h('span', { class: 'pb-name' }, t.name.replace(/_/g, ' ')),
        h('span', { class: 'pb-sub' }, momentary ? (idle ? 'NC · hold' : 'NO · hold') : 'switch'));
      const setP = (pressed) => {
        ST.sim.setPanel(t.name, momentary ? (pressed ? (idle ? 0 : 1) : idle) : pressed);
        btn.setAttribute('aria-pressed', String(!!pressed));
        btn.classList.toggle('down', !!pressed);
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
      } else {
        let on = !!idle;
        btn.addEventListener('click', () => { on = !on; setP(on); });
        if (idle) setP(true);
      }
      panelEls.push(btn);
    }
    const estop = h('button', { class: 'pbtn pb-estop', type: 'button', 'aria-pressed': 'false', title: U.S.estopNote.en },
      h('span', { class: 'pb-name' }, '⏻ ', U.t('estop')), h('span', { class: 'pb-sub' }, 'latching'));
    estop.addEventListener('click', () => {
      const on = !ST.sim.P.hw.estop;
      ST.sim.P.hw.estop = on;
      estop.setAttribute('aria-pressed', String(on)); estop.classList.toggle('down', on);
    });
    const door = h('button', { class: 'pbtn', type: 'button', 'aria-pressed': 'false', title: 'Guard door' },
      h('span', { class: 'pb-name' }, U.t('door')), h('span', { class: 'pb-sub' }, U.t('doorClosed')));
    door.addEventListener('click', () => {
      const open = !ST.sim.P.hw.doorOpen;
      ST.sim.P.hw.doorOpen = open;
      door.setAttribute('aria-pressed', String(open)); door.classList.toggle('down', open);
      door.querySelector('.pb-sub').textContent = open ? U.t('doorOpen') : U.t('doorClosed');
    });
    box.append(h('div', { class: 'pbtns' }, panelEls, estop, door), h('p', { class: 'muted small' }, U.tEl('estopNote')));
  }

  // ---------------------------------------------------------------- level screen
  function openLevel(L) {
    cancelAnimationFrame(ST.raf);
    ST.level = L;
    ST.ladder = null;
    ST.userTags = (L.tags || []).filter((t) => typeof t === 'object' && t.user).map((t) => SC.util.clone(t));
    ST.program = SC.util.clone(L.starter || { v: 1, rungs: [] });
    ST.fatResult = null;
    ST.paused = false; ST.speed = 1;
    renderLevel();
  }

  function renderLevel() {
    const L = ST.level;
    const root = ST.root;
    root.innerHTML = '';
    ST.listeners = [];

    const canvas = h('canvas', { id: 'plant', class: 'plant', role: 'img', 'aria-label': 'Side view of the bottling line' });
    const speedBtns = [0.25, 0.5, 1, 2, 4, 8].map((s) => h('button', { type: 'button', class: 'spd' + (s === ST.speed ? ' sel' : ''), 'aria-pressed': String(s === ST.speed),
      onclick: (e) => { ST.speed = s; speedBtns.forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); }); document.getElementById('fastwarn').hidden = s < 8; } }, '×' + s));
    const runBtn = h('button', { type: 'button', class: 'btn', onclick: () => { ST.paused = !ST.paused; runBtn.textContent = ST.paused ? '▶ ' + U.t('run') : '⏸ ' + U.t('pause'); stepBtn.disabled = !ST.paused; } }, '⏸ ' + U.t('pause'));
    const stepBtn = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => { ST.sim.step(true); if (ST.ladder) ST.ladder.paint(ST.sim); } }, '⏭ ' + U.t('step'));
    const restartBtn = h('button', { type: 'button', class: 'btn', onclick: () => { newSim(); buildAll(); } }, '↻ ' + U.t('restart'));
    const ioBox = h('div', { class: 'io' });
    const panelBox = h('div', { class: 'panelbox' });
    const ladderBox = h('div', { id: 'ladder-mount', class: 'ladder-mount' });

    const header = h('header', { class: 'top' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => showMap() }, U.t('back')),
      h('div', { class: 'ttl' }, h('b', null, L.sandbox ? '' : L.id + ' · '), U.lang === 'ar' ? U.arEl(L.title.ar) : U.enEl(L.title.en)),
      h('div', { class: 'grow' }),
      h('div', { id: 'forces-banner', class: 'forces', hidden: true, role: 'status' }, '⚠ ', U.tEl('forcesActive'), ' (', h('span', { class: 'fb-n' }, '0'), ') ',
        h('button', { class: 'btn small', type: 'button', onclick: () => { ST.sim.clearForces(); updateForcesBanner(); } }, U.t('clearForces'))),
      langBtn(), themeBtn());

    const wo = h('aside', { class: 'card workorder' },
      h('h3', null, U.tEl('workOrder')),
      h('p', { lang: 'en', dir: 'ltr' }, L.workOrder.en),
      h('section', { lang: 'ar', dir: 'rtl', class: 'ar-block', html: U.arHtml(L.workOrder.ar) }));

    const stage = h('main', { class: 'stage' },
      h('section', { class: 'card' }, canvas,
        h('div', { class: 'ctrls' }, runBtn, stepBtn, restartBtn, h('span', { class: 'sp' }), h('span', { class: 'muted small' }, U.t('speed') + ':'), speedBtns),
        h('p', { id: 'fastwarn', class: 'warn small', hidden: true }, '⚠ ', U.tEl('fastWarn'))),
      h('section', { class: 'card' }, h('h3', null, U.tEl('panel')), panelBox),
      h('section', { class: 'card' }, h('h3', null, 'I/O'), ioBox),
      h('section', { class: 'card' }, h('h3', null, U.tEl('ladder')), ladderBox),
      h('section', { class: 'card' }, h('h3', null, U.tEl('tags')), h('div', { id: 'tags-mount' })),
      h('details', { class: 'card', ontoggle: (e) => { if (e.target.open) U.mountTransfer(document.getElementById('xfer-mount')); } },
        h('summary', null, h('b', null, U.tEl('transfer'))), h('div', { id: 'xfer-mount' })));

    root.append(header, h('div', { class: 'level-grid' }, wo, stage));

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
      setProgram: (p, u, initial) => { U.setProgram(p, u); if (!initial && U.onProgramChanged) U.onProgramChanged(p, u); },
    };
    ST.ladder = U.Ladder(box, host);
  }

  function programText() {
    return ST.program.rungs.map((r, i) => `Rung ${i + 1}: ` + r.els.map((e) => e.t + (e.a ? '(' + e.a + ')' : '')).join(' ')).join('\n');
  }

  function langBtn() {
    return h('button', { class: 'btn ghost', type: 'button', onclick: () => { U.setLang(U.lang === 'ar' ? 'en' : 'ar'); rerender(); } }, U.t('langBtn'));
  }
  function themeBtn() {
    return h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Toggle dark mode', onclick: () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next); U.store.set('theme', next);
      if (ST.view) ST.view.refreshTheme();
    } }, '◐');
  }

  function rerender() { if (ST.level) { const keep = ST.program; renderLevel(); } else showMap(); }

  // ---------------------------------------------------------------- map
  function showMap() {
    cancelAnimationFrame(ST.raf);
    ST.level = null; ST.sim = null; ledEls = null;
    const root = ST.root;
    root.innerHTML = '';
    const cards = ST.levels.map((L) => h('button', { class: 'lvl', type: 'button', onclick: () => openLevel(L) },
      h('b', null, L.id), h('span', null, U.lang === 'ar' ? L.title.ar : L.title.en)));
    cards.unshift(h('button', { class: 'lvl sbx', type: 'button', onclick: () => openLevel(sandboxLevel()) },
      h('b', null, '∞'), h('span', null, U.t('sandbox')), h('small', null, U.t('sandboxDesc'))));
    root.append(
      h('header', { class: 'top' }, h('div', { class: 'ttl' }, h('b', null, 'Scan Cycle')), h('div', { class: 'grow' }), langBtn(), themeBtn()),
      h('main', { class: 'mapwrap' },
        h('h1', null, U.tEl('app')), h('p', { class: 'lead' }, U.tEl('tagline')),
        h('div', { class: 'levelmap' }, cards),
        h('p', { class: 'muted small' }, U.tEl('offlineNote'))));
  }

  // ---------------------------------------------------------------- boot
  U.start = function () {
    ST.root = document.getElementById('app');
    ST.levels = loadLevels();
    const th = U.store.get('theme', null);
    if (th) document.documentElement.setAttribute('data-theme', th);
    if (location.hash === '#sandbox') openLevel(sandboxLevel());
    else showMap();
  };
  U.onProgramChanged = () => { clearTimeout(U._refT); U._refT = setTimeout(() => { U.refreshTags(); U.refreshTransfer(); }, 150); };
  U.openLevel = openLevel;
  U.showMap = showMap;
  U.rerender = rerender;
})();
