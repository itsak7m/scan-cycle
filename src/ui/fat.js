/* Running the FAT, awarding stars, and the "explain your logic in English" step. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const starsOf = (lv) => (lv.solved ? (lv.cleanPass ? (lv.explained ? 3 : 2) : 1) : 0);

  // env: {L, ladder, sim (live sim), panels, reportBox, replay(fn), onStars()}
  U.runFat = async function (env) {
    const { L, ladder, panels, reportBox } = env;
    const fat = panels.fat;
    if (env.sim().forcesActive()) {
      fat.setStatus('⚠ ' + tr('A level cannot pass while forces are active. Clear all forces first.', 'المستوى ما بينجح والـ forces شغّالة. امسحها أول.'), 'warn');
      const b = document.getElementById('forces-banner');
      if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1200); }
      return;
    }
    const chk = ladder.check();
    if (!chk.compiled.ok) {
      fat.setStatus('✖ ' + tr(`Fix the ${chk.compiled.errors.length} compile error(s) first.`, `صلّح ${chk.compiled.errors.length} خطأ تجميع أول.`), 'warn');
      const e = chk.compiled.errors[0];
      if (e && e.rung >= 0) ladder.focus(e.rung, e.r || 0, e.c || 0);
      return;
    }
    fat.setBusy(true); fat.resetMarks(); reportBox.innerHTML = '';
    fat.setStatus(tr('Running tests…', 'عم بشغّل الفحوصات…'), '');
    const lv = U.lv(L.id);
    lv.attempts++;
    const program = ladder.program, userTags = ladder.userTags;
    const lvx = Object.assign({}, L, { tags: (L.tags || []).concat(userTags) });
    let firstFail = null, ran = 0, bpm = 0;
    for (const sc of L.scenarios) {
      fat.mark(sc.id, 'run'); await tick();
      const r = SC.scenario.runScenario(lvx, program, sc, { failFast: true, userTags });
      ran++;
      if (r.pass && r.metrics) bpm = Math.max(bpm, r.metrics.bottlesPerMin || 0);
      fat.mark(sc.id, r.pass ? 'pass' : 'fail');
      if (!r.pass && !firstFail) firstFail = { r, sc, hidden: false };
    }
    if (!firstFail) {
      fat.mark('__hidden', 'run'); await tick();
      for (let k = 0; k < L.hidden.count; k++) {
        const sc = SC.scenario.makeHidden(L, k);
        if (!sc) continue;
        const r = SC.scenario.runScenario(lvx, program, sc, { failFast: true, userTags });
        ran++;
        if (!r.pass) { firstFail = { r, sc, hidden: true }; break; }
        if (k % 2 === 1) await tick();
      }
      fat.mark('__hidden', firstFail ? 'fail' : 'pass');
    }
    fat.setBusy(false);
    if (firstFail) {
      lv.fails++; U.save();
      fat.setStatus('✖ ' + tr('Not yet. Read the report below, then fix your program.', 'لسا. اقرا التقرير تحت وبعدين صلّح برنامجك.'), 'warn');
      U.renderReport(reportBox, { level: L, program, userTags, scenario: firstFail.sc, failure: firstFail.r.firstFailure, hidden: firstFail.hidden, replay: env.replay });
      fat.refreshHints();
      return;
    }
    // pass
    const lint = SC.lint(program, SC.mergeTags(SC.levelTags(L), userTags));
    const wasSolved = lv.solved;
    lv.solved = true;
    const clean = lint.length === 0 && !lv.hint3;
    if (clean) lv.cleanPass = true;
    const rungs = program.rungs.filter((r) => r.els.length).length;
    if (!lv.best || rungs < lv.best.rungs || (lint.length === 0 && lv.best.lint !== 0)) lv.best = { rungs: Math.min(rungs, lv.best ? lv.best.rungs : rungs), lint: lint.length === 0 ? 0 : (lv.best ? lv.best.lint : lint.length) };
    if (bpm > 0 && lv.best) lv.best.bpm = Math.max(lv.best.bpm || 0, bpm);
    lv.program = program; lv.userTags = userTags;
    lv.stars = Math.max(lv.stars || 0, starsOf(lv));
    U.save(true);
    fat.setStatus('✔ ' + tr(`All ${ran} tests passed (visible + hidden).`, `نجحت كل الـ ${ran} فحوصات (الظاهرة والمخفية).`), 'ok');
    fat.refreshStars();
    if (env.onStars) env.onStars();
    reportBox.append(successCard(env, lint, !wasSolved));
  };

  function successCard(env, lint, firstTime) {
    const { L, ladder } = env;
    const lv = U.lv(L.id);
    const card = h('div', { class: 'report success' });
    card.append(h('h3', { class: 'ok' }, '✔ ' + tr('FAT passed', 'نجح فحص FAT'), ' ', h('span', { class: 'stars' }, U.starsText(lv.stars))));
    const msgs = [];
    if (lint.length) msgs.push(tr(`⚠ ${lint.length} lint warning(s) left — fix them for the second star.`, `⚠ بقي ${lint.length} تحذير — صلّحهم للنجمة الثانية.`));
    if (lv.hint3) msgs.push(tr('Hint 3 was used, so the second star is not possible on this level.', 'استخدمت التلميح 3 فما في نجمة ثانية بهالمستوى.'));
    msgs.forEach((m) => card.append(h('p', { class: 'warn small' }, m)));
    if (lv.solved && !lv.explained) card.append(explainPanel(env));
    else if (lv.explained) card.append(h('p', { class: 'ok' }, '✔ ' + tr('You explained your logic in English.', 'شرحت منطقك بالإنجليزي.')));
    const levels = U.state.levels;
    const idx = levels.findIndex((x) => x.id === L.id);
    const next = levels[idx + 1];
    card.append(h('div', { class: 'rp-btns' },
      next ? h('button', { type: 'button', class: 'btn primary', onclick: () => U.openLevel(next) }, tr('Next level', 'المستوى التالي') + ' → ' + next.id) : null,
      h('button', { type: 'button', class: 'btn', onclick: () => U.showMap() }, tr('Station map', 'خريطة المحطات'))));
    return card;
  }

  // ---------------------------------------------------------------- explain your logic
  function explainPanel(env) {
    const { L, ladder } = env;
    const lv = U.lv(L.id);
    const names = SC.levelTags(L).map((t) => t.name).concat(ladder.userTags.map((t) => t.name));
    const used = ladder.usedTags();
    const dropdown = L.order <= 6;
    const wrap = h('div', { class: 'explain' }, h('h4', null, '★★★ ' + tr('Explain your logic in English', 'اشرح منطقك بالإنجليزي')),
      h('p', { class: 'small muted' }, dropdown ? tr('Complete each sentence with the dropdown lists.', 'كمّل كل جملة بالقوائم.') : tr('Write one or two sentences for each prompt, in your own words.', 'اكتب جملة أو جملتين لكل سؤال بكلماتك.')));
    const parts = [];
    L.explain.frames.forEach((f, i) => {
      const box = h('div', { class: 'ex-frame' });
      const getters = [];
      if (dropdown) {
        const line = h('p', { class: 'ex-line', lang: 'en' });
        const re = /\{(\w+)\}/g;
        let last = 0, m;
        while ((m = re.exec(f.en))) {
          line.append(f.en.slice(last, m.index));
          const key = m[1];
          if (/^(time|count|value)$/.test(key)) {
            const inp = h('input', { type: 'text', class: 'ex-in', 'aria-label': key, placeholder: key, size: 8 });
            line.append(inp); getters.push(() => inp.value.trim());
          } else {
            const sel = h('select', { class: 'ex-in', 'aria-label': key }, h('option', { value: '' }, '— ' + key + ' —'), names.map((n) => h('option', { value: n }, n)));
            line.append(sel); getters.push(() => sel.value);
          }
          last = m.index + m[0].length;
        }
        line.append(f.en.slice(last));
        box.append(line);
        parts.push({
          compose: () => { let k = 0; return f.en.replace(/\{(\w+)\}/g, () => getters[k++]() || '…'); },
          ok: () => getters.every((g) => g()),
          tagsOk: () => { const picked = getters.map((g) => g()).filter((v) => names.indexOf(v) >= 0); return !picked.length || picked.filter((v) => used.has(v)).length * 2 >= picked.length; },
        });
      } else {
        const prompt = f.en.replace(/\{(\w+)\}/g, '…');
        const ta = h('textarea', { class: 'ex-ta', rows: 2, lang: 'en', 'aria-label': prompt, placeholder: prompt });
        box.append(h('p', { class: 'ex-line', lang: 'en' }, prompt), ta);
        parts.push({ ok: () => ta.value.trim().split(/\s+/).filter(Boolean).length >= 4, compose: () => ta.value.trim(), tagsOk: () => true });
      }
      wrap.append(box);
    });
    const msg = h('p', { class: 'small', role: 'status' });
    const speak = U.glossary.canSpeak ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => U.glossary.speak(parts.map((p) => p.compose()).join('. ')) }, '🔊 ' + tr('Read it back', 'اسمعها')) : null;
    const done = h('button', { type: 'button', class: 'btn primary', onclick: () => {
      const bad = parts.findIndex((p) => !p.ok());
      if (bad >= 0) { msg.className = 'small warn'; msg.textContent = tr(`Sentence ${bad + 1} is not finished.`, `الجملة ${bad + 1} مش مكتملة.`); return; }
      const wrong = parts.findIndex((p) => !p.tagsOk());
      if (wrong >= 0) { msg.className = 'small warn'; msg.textContent = tr(`Sentence ${wrong + 1}: some chosen tags are not in your program. Check them.`, `الجملة ${wrong + 1}: بعض الـ tags اللي اخترتها مش ببرنامجك. راجعها.`); return; }
      parts.forEach((p, i) => { lv.explain[i] = p.compose(); });
      lv.explained = true;
      lv.stars = Math.max(lv.stars || 0, starsOf(lv));
      U.save(true);
      msg.className = 'small ok'; msg.textContent = '✔ ' + tr('Saved. Nice English!', 'انحفظت. إنجليزيتك حلوة!');
      done.disabled = true;
      if (env.onStars) env.onStars();
      const sb = document.querySelector('.starbox'); if (sb && env.panels) env.panels.fat.refreshStars();
    } }, tr('Done', 'تم'));
    wrap.append(h('div', { class: 'rp-btns' }, done, speak), msg);
    return wrap;
  }
})();
