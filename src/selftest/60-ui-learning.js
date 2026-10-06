/* Learning-layer UI: failure report, glossary links, timing diagrams (rendered into detached DOM). */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;

  T.suite('ui: failure report, glossary, diagrams', (t) => {
    const levels = SC.levels.loadAll();
    const L = levels[0];
    if (!L) { t.ok(true, 'no levels embedded (skipped)'); return; }
    const U = SC.ui;
    U.glossary.init(levels);
    // a wrong program: NC contact on Start
    const program = SC.dsl.parseProgram(['/Start_PB (Conveyor_Motor)']);
    const run = SC.scenario.runScenario(L, program, L.scenarios[0], { failFast: true });
    t.ok(!run.pass && run.firstFailure, 'the wrong program fails the first scenario');
    const box = document.createElement('div');
    U.renderReport(box, { level: L, program, userTags: [], scenario: L.scenarios[0], failure: run.firstFailure, hidden: false, replay() {} });
    t.ok(box.querySelector('.report'), 'report renders');
    t.ok(box.querySelector('svg.tl'), 'report has an I/O timeline');
    t.eq(box.querySelectorAll('.rung').length, 1, 'report shows the active rung');
    t.ok(box.querySelector('.rung .cell[data-pout]'), 'rungs carry power-flow data');
    t.ok(/NC contact/.test(box.textContent), 'the classic mistake is explained');
    t.ok(/Which condition in rung 1/.test(box.textContent), 'a self-regulation question is asked');
    t.ok(box.querySelectorAll('button').length >= 2, 'replay and close buttons exist');

    const p = document.createElement('p');
    U.glossary.linkText(p, L.workOrder.en, L.glossary);
    t.ok(true, 'glossary links build without error');
    // term words that belong to the level glossary become buttons
    const lvWithTerm = levels.find((x) => /normally closed|seal-in|interlock|timer/i.test(x.workOrder.en) && x.glossary.length);
    if (lvWithTerm) {
      const q = document.createElement('p');
      U.glossary.linkText(q, lvWithTerm.workOrder.en, lvWithTerm.glossary);
      t.ok(q.querySelector('button.term'), `${lvWithTerm.id}: a glossary term in the work order is tappable`);
    }
    const ds = L.datasheets.find((d) => d.timing);
    if (ds) {
      const svg = U.timingSvg(ds.timing);
      t.ok(/<svg/.test(svg) && /<path/.test(svg), 'timing diagram renders SVG');
    }
    // glossary map: every listed term of every level is defined
    const gmap = SC.levels.glossaryMap(levels);
    const missing = [];
    levels.forEach((x) => x.glossary.forEach((id) => { if (!gmap[id]) missing.push(id); }));
    t.eq(missing, [], 'every glossary id used by a level is defined');
  });
})();
