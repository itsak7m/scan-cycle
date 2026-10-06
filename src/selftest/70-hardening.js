/* Regression tests for problems found in review: untrusted programs, silent false passes, lint gaps. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;
  const b64 = (o) => 'B' + btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  T.suite('hardening: untrusted programs', (t) => {
    t.eq(SC.ui.share.decode(b64({ l: 'L01', r: [{ e: [['x', 0, 'NO', 'Start_PB']] }] })).error ? 'rejected' : 'accepted', 'rejected', 'a string row in a share link is rejected');
    t.ok(SC.ui.share.decode(b64({ l: 'L01', r: [{ e: [[1.5, 0, 'NO', 'Start_PB']] }] })).error, 'a fractional row is rejected');
    t.ok(SC.ui.share.decode(b64({ l: 'L01', r: new Array(60).fill({ e: [] }) })).error, 'too many rungs are rejected');
    t.ok(SC.ui.share.decode(b64({ l: 'L01', r: [{ e: [[0, 0, 'NO', { a: 1 }]] }] })).error, 'an object where a tag name is expected is rejected');
    t.eq(SC.sanitizeProgram({ rungs: [{}] }).rungs[0].els, [], 'a rung without els becomes an empty rung');
    t.eq(SC.sanitizeProgram({ rungs: [null] }), null, 'a null rung is rejected');
    t.eq(SC.sanitizeProgram({ rungs: [{ els: [{ r: 0, c: 99, t: 'NO' }] }] }), null, 'a column outside the grid is rejected');
    const evil = { v: 1, rungs: [null, { els: [null] }, { els: [{ r: 0, c: 1.5, t: 'NO', a: 'X' }] }, { rows: 'x', vb: [null] }] };
    let threw = false, res;
    try { res = SC.compile(evil, { tags: [] }); } catch (e) { threw = true; }
    t.ok(!threw && !res.ok, 'compile() never throws on a malformed program');
    t.ok(!SC.ui.validateImport({ v: 1, levels: { L01: { program: { rungs: [{}] } } } }) === false, 'an import with a sparse rung is sanitised, not crashing');
    t.ok(!SC.ui.validateImport({ v: 1, levels: { L01: { program: { rungs: [null] } } } }), 'an import with a null rung is rejected');
    const r = SC.compile(SC.dsl.parseProgram(['A MOVE(40000,MW10)']), { tags: [{ name: 'A', addr: 'I0.0' }] });
    t.ok(r.errors.some((e) => e.code === 'const_range'), 'a constant outside the Int range is a compile error');
  });

  T.suite('hardening: scenario runner cannot pass vacuously', (t) => {
    const level = { tags: ['Conveyor_Motor'], plant: {} };
    const prog = SC.dsl.parseProgram([]);
    const run = (asserts, dur) => SC.scenario.runScenario(level, prog, { id: 'x', seed: 1, durationMs: dur || 1000, events: [], asserts });
    t.ok(!run([{ t: 1000, expect: { Conveyor_Motor: true } }]).pass, 'an assert at the very end of the run is checked');
    t.ok(!run([{ t: 1500, expect: { Conveyor_Motor: true } }]).pass, 'an assert after the end of the run is not silently skipped');
    t.ok(!run([{ t: 500, expect: { Conveyor_Motor: { ge: 1 } } }]).pass, 'an unknown operator never passes');
    t.ok(run([{ t: 500, expect: { Conveyor_Motor: false } }]).pass, 'a true assert still passes');
  });

  T.suite('hardening: lint and blocks', (t) => {
    const tags = [{ name: 'A', addr: 'I0.0' }, { name: 'Run', addr: 'M0.0' }, { name: 'Foo', addr: 'Q0.0' }, { name: 'Door', addr: 'I0.3', wiring: 'NC', role: 'guard' }];
    const L = (lines) => SC.lint(SC.dsl.parseProgram(lines), tags).map((x) => x.id);
    t.ok(L(['A (Run)', 'A POS(Run) (Foo)']).includes('edge_bit_shared'), 'an edge bit that a coil also writes is flagged');
    t.ok(!L(['A POS(Edge1) (Foo)']).includes('edge_bit_shared'), 'a private edge bit is fine');
    t.ok(L(['/Door (Foo)']).includes('nc_on_nc_stop'), 'an NC contact on an NC-wired guard door is flagged');
    const h = SC.testkit.kit(['A TP(DB_T,T#100ms) (Y)']);
    h.set('A', 1); h.scan(30); h.set('A', 0); h.scan(2);
    t.eq(h.inst('DB_T').ET, 0, 'TP: ET is 0 once the pulse is over and IN is low');
  });
})();
