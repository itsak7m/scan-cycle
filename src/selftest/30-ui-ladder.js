/* Headless tests for the ladder editor model (the DOM exists in the test page). */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;

  function mk(level) {
    const container = document.createElement('div');
    const host = { program: { v: 1, rungs: [] }, userTags: [], last: null, baseTags: () => SC.levelTags(level), palette: () => level.palette || null,
      setProgram(p, u) { host.last = { p, u }; } };
    const ed = SC.ui.Ladder(container, host);
    return { ed, host, container };
  }

  T.suite('ladder editor: build a seal-in with the editor API', (t) => {
    const level = { tags: ['Start_PB', 'Stop_PB', 'EStop_OK', 'Conveyor_Motor'], palette: ['NO', 'NC', 'OUT', 'BRANCH'], plant: { bottlesPerMin: 20 } };
    const { ed, host, container } = mk(level);
    t.eq(ed.program.rungs.length, 1, 'starts with one empty rung');
    ed.ops.place(0, 0, 0, { t: 'NO', a: 'Start_PB' });
    ed.ops.makeBranch(0, 0, 0);
    t.eq([ed.program.rungs[0].rows, ed.program.rungs[0].vb.length], [2, 2], 'branch around a cell adds a row and two bars');
    const r = SC.ui.resolveTag('Run', 'bitw', ed.ctx);
    t.ok(r.ok && r.created && r.created.addr === 'M0.0', 'a new name becomes memory bit M0.0', JSON.stringify(r));
    ed.ops.place(0, 1, 0, { t: 'NO', a: 'Run' }, [r.created]);
    ed.ops.place(0, 0, 1, { t: 'NO', a: 'Stop_PB' });
    ed.ops.place(0, 0, 2, { t: 'NO', a: 'EStop_OK' });
    ed.ops.place(0, 0, 3, { t: 'OUT', a: 'Run' });
    ed.ops.addRung(1);
    ed.ops.place(1, 0, 0, { t: 'NO', a: 'Run' });
    ed.ops.place(1, 0, 1, { t: 'OUT', a: 'Conveyor_Motor' });
    const chk = ed.check();
    t.eq(chk.compiled.errors.length, 0, 'compiles without errors');
    t.eq(chk.lint.map((x) => x.id), [], 'no lint warnings');
    t.ok(host.last && host.last.u.length === 1, 'host is notified with the user tag table');
    // run it
    const res = SC.scenario.runScenario(Object.assign({}, level, { tags: level.tags.concat(ed.userTags) }), ed.program, {
      id: 'seal', seed: 1, durationMs: 6000,
      events: [{ t: 500, press: 'Start_PB', ms: 300 }, { t: 3000, press: 'Stop_PB', ms: 300 }],
      asserts: [
        { t: 400, expect: { Conveyor_Motor: false } },
        { t: 1500, expect: { Conveyor_Motor: true } },
        { t: 2900, expect: { Conveyor_Motor: true } },
        { t: 3500, expect: { Conveyor_Motor: false } },
        { t: 5500, expect: { Conveyor_Motor: false } },
      ],
    });
    t.ok(res.pass, 'the editor-built program passes a start/stop scenario', JSON.stringify(res.failures[0] || ''));
    // DOM sanity
    t.eq(container.querySelectorAll('.rung').length, 2, 'two rungs rendered');
    t.ok(container.querySelectorAll('.cell.filled').length === 7, 'seven filled cells rendered', String(container.querySelectorAll('.cell.filled').length));
    // undo / redo
    ed.doUndo(); ed.doUndo();
    t.eq(ed.program.rungs[1] ? ed.program.rungs[1].els.length : 0, 0, 'undo removes the last edits');
    ed.doRedo();
    t.eq(ed.program.rungs[1].els.length, 1, 'redo brings one back');
    // palette enforcement
    ed.ops.place(0, 0, 4, { t: 'TON', i: 'DB_X', pt: 'T#1s' });
    t.ok(ed.check().compiled.errors.some((e) => e.code === 'not_allowed'), 'an element outside the level palette is an error');
  });

  T.suite('ladder editor: moves, limits, tags', (t) => {
    const level = { tags: ['Start_PB', 'Conveyor_Motor'], palette: null };
    const { ed } = mk(level);
    ed.ops.place(0, 0, 0, { t: 'NO', a: 'Start_PB' });
    ed.ops.moveEl(0, { r: 0, c: 0 }, { r: 0, c: 3 });
    t.eq(ed.program.rungs[0].els[0].c, 3, 'move an element to another cell');
    ed.ops.place(0, 0, 4, { t: 'OUT', a: 'Conveyor_Motor' });
    ed.ops.moveEl(0, { r: 0, c: 3 }, { r: 0, c: 4 });
    t.eq(ed.program.rungs[0].els.length, 2, 'cannot drop on an occupied cell');
    ed.ops.removeEl(0, 0, 3);
    t.eq(ed.program.rungs[0].els.length, 1, 'delete');
    for (let i = 0; i < 6; i++) ed.ops.toggleBar(0, 1, i);
    t.ok(ed.program.rungs[0].rows <= 4, 'a rung never grows past 4 rows');
    // grid grows with the program
    ed.ops.place(0, 0, 9, { t: 'NO', a: 'Start_PB' });
    t.ok(ed.program.rungs[0].cols >= 11, 'columns grow on demand');
    // tag tools
    let r = SC.ui.resolveTag('2bad', 'bit', ed.ctx);
    t.ok(!r.ok, 'a name starting with a digit is rejected');
    r = SC.ui.resolveTag('Start_PB', 'bitw', ed.ctx);
    t.ok(!r.ok, 'cannot write to an input');
    r = SC.ui.resolveTag('M0.4', 'edge', ed.ctx);
    t.ok(r.ok, 'a raw M address is accepted');
    r = SC.ui.resolveTag('I0.0', 'edge', ed.ctx);
    t.ok(!r.ok, 'edge memory must be M');
    t.eq(SC.ui.normTime('3s').value, 'T#3s', 'time typed as 3s becomes T#3s');
    t.eq(SC.ui.normTime('3').ask, '3', 'a bare 3 asks seconds or milliseconds');
    t.ok(SC.ui.normTime('abc').error, 'garbage time is an error');
    t.eq(SC.ui.normTime('t#500MS').value, 'T#500ms', 'literal is normalised');
    // rename a user tag updates the program
    const c = SC.ui.resolveTag('Seal', 'bitw', ed.ctx);
    ed.ops.place(0, 0, 5, { t: 'OUT', a: 'Seal' }, [c.created]);
    ed.renameTag('Seal', 'Latch');
    t.ok(ed.program.rungs[0].els.some((e) => e.a === 'Latch') && !ed.program.rungs[0].els.some((e) => e.a === 'Seal'), 'rename tag updates every reference');
    t.eq(ed.deleteTag('Latch'), false, 'a tag in use cannot be deleted');
  });
})();
