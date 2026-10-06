/* Level self-test: structure of every level, then (selftest.html only) every reference solution against every
 * scenario + hidden variants, and every documented wrong solution must FAIL with the right diagnostic. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;
  const lines = [];

  T.summary = () => lines.join('\n');

  T.suite('levels: structure', (t) => {
    const levels = SC.levels.loadAll();
    const gmap = SC.levels.glossaryMap(levels);
    t.ok(true, `${levels.length} level(s) embedded`);
    const only = new URLSearchParams(location.search).get('only') || '';
    for (const L of levels) {
      if (only && L.id.indexOf(only) < 0 && only !== 'levels') continue;
      const bad = SC.levels.validate(L, gmap);
      t.ok(bad.length === 0, `${L.id} structure`, bad.join('; '));
    }
  });

  const fx = SC.levels.loadFixtures();
  T.suite('levels: reference solutions & wrong solutions', (t) => {
    const levels = SC.levels.loadAll();
    if (!fx) { t.ok(true, 'fixtures are only embedded in selftest.html (skipped here)'); return; }
    const only = new URLSearchParams(location.search).get('only') || '';
    for (const L of levels) {
      if (only && L.id.indexOf(only) < 0 && only !== 'levels') continue;
      const t0 = Date.now();
      const sol = fx.solutions[L.id];
      if (!sol) { t.ok(false, `${L.id} has a reference solution`, `levels/solutions/${L.id}.json is missing`); continue; }
      const ev = SC.fixtures.evaluate(L, sol, { stopAtFirst: false });
      const fails = ev.run.results.filter((r) => !r.pass);
      const first = fails[0];
      t.ok(ev.pass, `${L.id} reference solution passes all ${ev.run.results.length} scenarios (visible + hidden)`,
        first ? `${first.scenario.id}: ${(first.firstFailure.msg.en)} @ ${first.firstFailure.t} ms, expected ${JSON.stringify(first.firstFailure.expected)} got ${JSON.stringify(first.firstFailure.actual)}` : '');
      const cmp = SC.compile(ev.program, { tags: SC.mergeTags(SC.levelTags(L), ev.userTags), palette: L.palette });
      t.ok(cmp.ok, `${L.id} reference solution compiles inside the level palette`, JSON.stringify(cmp.errors.slice(0, 2)));
      const warn = SC.lint(ev.program, SC.mergeTags(SC.levelTags(L), ev.userTags));
      t.ok(warn.length === 0, `${L.id} reference solution has no lint warnings (two-star possible)`, warn.map((w) => w.id).join(','));
      const lean = (L.badges || []).find((b) => b.id === 'lean');
      if (lean) t.ok(ev.program.rungs.length <= lean.maxRungs, `${L.id} reference meets the "lean" badge (${lean.maxRungs} rungs)`, `has ${ev.program.rungs.length}`);

      const wrongs = Object.keys(fx.wrong).filter((k) => fx.wrong[k].level === L.id || k.indexOf(L.id + '-') === 0);
      t.ok(wrongs.length >= 3, `${L.id} has at least 3 documented wrong solutions`, `has ${wrongs.length}`);
      let ok = 0;
      for (const k of wrongs) {
        const w = fx.wrong[k];
        const e2 = SC.fixtures.evaluate(L, w, { stopAtFirst: true });
        const ff = e2.run.firstFail ? e2.run.firstFail.firstFailure : null;
        const diags = SC.diag.run(L, e2.program, { failure: ff, tags: SC.mergeTags(SC.levelTags(L), e2.userTags) });
        const ids = diags.map((d) => d.id);
        const good = !e2.pass && (!w.diag || ids.indexOf(w.diag) >= 0);
        if (good) ok++;
        t.ok(!e2.pass, `${k} fails the FAT (it is a wrong solution)`, w.note || '');
        if (w.diag) t.ok(ids.indexOf(w.diag) >= 0, `${k} is diagnosed as "${w.diag}"`, `got [${ids.join(', ')}]`);
      }
      lines.push(`${L.id}: ${ev.run.results.length} scenarios pass, wrong solutions ${ok}/${wrongs.length} fail as expected  (${Date.now() - t0} ms)`);
    }
  });
})();
