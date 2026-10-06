/* Left-hand learning panels of a level: work order (EN + AR), datasheets, worked example, FAT list, hints, glossary, stars. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);
  const arPlain = (s) => String(s).replace(/\{\{|\}\}/g, '');

  const stars = (n, max) => '★'.repeat(n) + '☆'.repeat((max || 3) - n);

  // ---------------------------------------------------------------- work order
  function workOrderCard(L) {
    const lv = U.lv(L.id);
    const card = h('section', { class: 'card o-wo' });
    card.append(h('h3', null, U.tEl('workOrder')), h('p', { class: 'concept small muted' }, tr('New:', 'جديد:') + ' ' + L.concept));
    const p = h('p', { lang: 'en', dir: 'ltr', class: 'wo-en' });
    U.glossary.linkText(p, L.workOrder.en, L.glossary);
    card.append(p);
    const ar = h('section', { lang: 'ar', dir: 'rtl', class: 'ar-block', html: U.arHtml(L.workOrder.ar) });
    // Arabic visible on the first open of a level, collapsed afterwards
    const first = !U.data.seenWO[L.id];
    U.data.seenWO[L.id] = 1; U.save();
    ar.hidden = !first;
    const tog = h('button', { type: 'button', class: 'btn small ghost', 'aria-expanded': String(first), onclick: () => { ar.hidden = !ar.hidden; tog.setAttribute('aria-expanded', String(!ar.hidden)); } }, 'AR · عربي');
    card.append(h('div', { class: 'wo-tools' }, tog, U.glossary.speakBtn(L.workOrder.en)), ar);
    if (!U.data.settings.howto) {
      const box = h('div', { class: 'howto', role: 'note' },
        h('b', null, tr('How to play', 'كيف تلعب')),
        h('ol', null,
          h('li', null, tr('Read the work order. Tap a dotted word to see its Arabic meaning.', 'اقرا أمر الشغل. اضغط على أي كلمة منقّطة لتشوف معناها بالعربي.')),
          h('li', null, tr('In the ladder, tap an empty cell, choose an instruction, then choose a tag.', 'بالـ ladder اضغط على خلية فاضية، اختار تعليمة، وبعدين اختار الـ tag.')),
          h('li', null, tr('Test it on the line: hold the buttons in the operator panel.', 'جرّبه على الخط: اضغط وثبّت الأزرار بلوحة المشغّل.')),
          h('li', null, tr('Press Run FAT. If a test fails you get a report that shows where.', 'اضغط Run FAT. إذا فشل فحص بيطلعلك تقرير بيبيّن وين.'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { U.data.settings.howto = 1; U.save(); box.remove(); } }, tr('Got it', 'تمام')));
      card.append(box);
    }
    return card;
  }

  // ---------------------------------------------------------------- datasheets + example
  function datasheetCard(L) {
    const card = h('section', { class: 'card o-ds' }, h('h3', null, U.tEl('datasheet')));
    L.datasheets.forEach((d, i) => {
      const det = h('details', { class: 'ds', open: i === 0 }, h('summary', null, h('b', null, U.lang === 'ar' ? d.title.ar : d.title.en)));
      det.append(h('table', { class: 'tags small' }, h('tbody', null, d.rows.map((r) => h('tr', null, h('td', { class: 'mono' }, r[0]), h('td', null, r[1]))))));
      if (d.note) det.append(h('p', { class: 'small' }, h('span', { lang: 'en' }, d.note.en), h('br'), h('span', { lang: 'ar', dir: 'rtl', html: U.arHtml(d.note.ar) })));
      if (d.timing) det.append(h('div', { class: 'tl-wrap', html: U.timingSvg(d.timing) }));
      card.append(det);
    });
    const ex = L.example;
    if (ex && ex.mode === 'full' && ex.lines) {
      const det = h('details', { class: 'ds ex', open: true }, h('summary', null, h('b', null, '📘 ' + (ex.title ? (U.lang === 'ar' ? ex.title.ar : ex.title.en) : tr('Worked example', 'مثال محلول')))));
      const prog = SC.dsl.parseProgram(ex.lines);
      prog.rungs.forEach((rg, i) => {
        det.append(U.staticRung(rg, (n) => n, { title: 'Rung ' + (i + 1) }));
        const e = (ex.explain || []).find((x) => x.rung === i + 1);
        if (e) det.append(h('p', { class: 'small' }, h('span', { lang: 'en' }, e.en), h('br'), h('span', { lang: 'ar', dir: 'rtl', html: U.arHtml(e.ar) })));
      });
      det.append(h('p', { class: 'small muted' }, tr('This is a DIFFERENT task with other devices. Same idea, your turn.', 'هاي مهمة مختلفة بأجهزة ثانية. نفس الفكرة، والدور عليك.')));
      card.append(det);
    } else if (ex && ex.mode === 'completion') {
      card.append(h('p', { class: 'small ok-note' }, '🧩 ' + tr('Completion exercise: the editor already holds part of the program. Finish it.', 'تمرين إكمال: المحرر فيه جزء من البرنامج. كمّله.')));
    }
    return card;
  }

  // ---------------------------------------------------------------- FAT list + hints + glossary + stars
  function fatCard(L, api) {
    const card = h('section', { class: 'card o-fat' });
    card.append(h('h3', null, 'FAT'));
    const list = h('ol', { class: 'fatlist' });
    const items = {};
    L.scenarios.forEach((s) => {
      const li = h('li', { dataset: { id: s.id } }, h('span', { class: 'fl-ic', 'aria-hidden': 'true' }, '○'), h('span', { class: 'fl-t', lang: U.lang }, U.lang === 'ar' ? h('span', { lang: 'ar', dir: 'rtl', html: U.arHtml(s.title.ar) }) : s.title.en), h('span', { class: 'fl-s sr-only' }, ''));
      list.append(li); items[s.id] = li;
    });
    const hid = h('li', { class: 'fl-hidden' }, h('span', { class: 'fl-ic', 'aria-hidden': 'true' }, '○'), h('span', null, `${L.hidden.count} ` + tr('hidden variants', 'نسخ مخفية') + ' — ' + tr('random timing and seeds', 'توقيت وبذور عشوائية')));
    list.append(hid);
    const runBtn = h('button', { type: 'button', class: 'btn primary fat-btn', onclick: () => api.runFat() }, '▶ ' + tr('Run FAT', 'شغّل فحص FAT'));
    const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
    card.append(runBtn, status, list);

    // hints
    const hbox = h('div', { class: 'hints' });
    const hshow = h('div', { class: 'hint-show' });
    const hbtns = [0, 1, 2].map((i) => h('button', { type: 'button', class: 'btn small', onclick: () => showHint(i) }, tr('Hint ', 'تلميح ') + (i + 1)));
    function showHint(i) {
      const lv = U.lv(L.id);
      if (i === 2 && lv.fails < 2) { U.toast(tr('Hint 3 unlocks after two failed FAT runs.', 'التلميح 3 بينفتح بعد محاولتين فاشلتين.')); return; }
      const hh = L.hints[i];
      lv.hint = Math.max(lv.hint, i + 1);
      if (i === 2) lv.hint3 = true;
      U.save();
      hshow.innerHTML = '';
      hshow.append(h('p', null, h('b', null, tr('Hint ', 'تلميح ') + (i + 1) + ': '), h('span', { lang: 'en' }, hh.en), h('br'), h('span', { lang: 'ar', dir: 'rtl', html: U.arHtml(hh.ar) })));
      if (hh.lines) { const pr = SC.dsl.parseProgram(hh.lines); pr.rungs.forEach((rg) => hshow.append(U.staticRung(rg, (n) => n, { title: tr('Partial rung', 'rung جزئي') }))); }
      refreshHints();
    }
    function refreshHints() {
      const lv = U.lv(L.id);
      hbtns[2].disabled = lv.fails < 2;
      hbtns[2].title = lv.fails < 2 ? tr('Unlocks after two failed FAT runs', 'بينفتح بعد محاولتين فاشلتين') : '';
      hbtns.forEach((b, i) => { b.classList.toggle('used', lv.hint > i); });
      if (lv.hint3) hint3Note.hidden = false;
    }
    const hint3Note = h('p', { class: 'small muted', hidden: true }, tr('Hint 3 used: the second star is no longer possible on this level.', 'استخدمت التلميح 3: النجمة الثانية ما عاد ممكنة بهالمستوى.'));
    hbox.append(h('h4', null, U.tEl('hints')), h('div', { class: 'hint-btns' }, hbtns), hshow, hint3Note);
    card.append(hbox);

    // glossary chips
    const gl = h('div', { class: 'gl' }, h('h4', null, tr('Terms in this level', 'مصطلحات هالمستوى')));
    const chips = h('div', { class: 'chips' });
    L.glossary.forEach((id) => { const d = U.glossary.get(id); if (d) chips.append(U.glossary.termBtn(id, d.en.replace(/\s*\(.*?\)\s*/g, ' ').trim())); });
    gl.append(chips);
    card.append(gl);

    // stars
    const starBox = h('div', { class: 'starbox' });
    card.append(starBox);
    function refreshStars() {
      const lv = U.lv(L.id);
      starBox.innerHTML = '';
      const lean = (L.badges || []).find((b) => b.id === 'lean');
      starBox.append(h('p', null, h('b', { class: 'stars', 'aria-label': lv.stars + ' of 3 stars' }, stars(lv.stars)), ' ',
        h('span', { class: 'small muted' }, tr('★ all tests pass · ★★ no lint warnings and no hint 3 · ★★★ + explain your logic', '★ كل الفحوصات نجحت · ★★ بدون تحذيرات وبدون تلميح 3 · ★★★ + اشرح منطقك'))));
      const b = [];
      if (lv.best && lean && lv.best.rungs <= lean.maxRungs) b.push('🏅 ' + tr('Lean: ≤ ' + lean.maxRungs + ' rungs', 'مختصر: ≤ ' + lean.maxRungs + ' rungs'));
      if (lv.best && lv.best.lint === 0) b.push('🏅 ' + tr('Clean: no lint warnings', 'نظيف: بدون تحذيرات'));
      if (lv.solved && !lv.hint) b.push('🏅 ' + tr('Solved without hints', 'محلول بدون تلميحات'));
      if (b.length) starBox.append(h('p', { class: 'small' }, b.join('  ')));
    }

    return {
      el: card, refreshHints, refreshStars,
      setStatus(t, cls) { status.textContent = t; status.className = 'small ' + (cls || ''); },
      setBusy(b) { runBtn.disabled = b; },
      mark(id, state) { // 'pass' | 'fail' | 'run' | null
        const li = id === '__hidden' ? hid : items[id];
        if (!li) return;
        const ic = li.querySelector('.fl-ic');
        ic.textContent = state === 'pass' ? '✔' : state === 'fail' ? '✖' : state === 'run' ? '…' : '○';
        li.classList.toggle('pass', state === 'pass'); li.classList.toggle('fail', state === 'fail');
        const sr = li.querySelector('.fl-s'); if (sr) sr.textContent = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : '';
      },
      resetMarks() { Object.keys(items).forEach((k) => this.mark(k, null)); this.mark('__hidden', null); },
    };
  }

  U.buildLevelPanels = function (L, api) {
    const wo = workOrderCard(L);
    const ds = datasheetCard(L);
    const fat = fatCard(L, api);
    fat.refreshHints(); fat.refreshStars();
    return { wo, ds, fat };
  };
  U.starsText = stars;
})();
