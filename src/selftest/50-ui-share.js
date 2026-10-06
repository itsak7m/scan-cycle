/* Share link encoding: round trip + size budget. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;

  T.suite('share: link encoding', (t) => {
    const lines = [
      '[Reset_PB | Ready] EStop_OK Door_Closed (Ready)',
      '[Start_PB | Conveyor_Motor] Stop_PB Ready (Conveyor_Motor)',
      'Conveyor_Motor PE_Fill /Filled Fill_Valve_Req',
      'Fill_Valve_Req TON(DB_Fill,T#3s) (S:Filled)',
      '/PE_Fill (R:Filled)',
      'PE_Exit POS(Edge_1) CTU(DB_Batch,12,Reset_PB) (Batch_Lamp)',
      'Level_OK /Level_OK PE_Reject POS(Edge_2) TP(DB_Rej,T#500ms) (Reject_Pusher)',
      '[Start_PB | Run] Stop_PB (Run)',
      'Run CMP(>=,Step,2) MOVE(3,Step)',
      'Run Tank_LSLL (Alarm_Lamp)',
    ];
    const prog = SC.dsl.parseProgram(lines);
    const tags = [{ name: 'Ready', addr: 'M0.0' }, { name: 'Filled', addr: 'M0.1' }, { name: 'Fill_Valve_Req', addr: 'M0.2' }, { name: 'Run', addr: 'M0.3' }];
    const code = SC.ui.share.encode('L03', prog, tags, true);
    t.ok(code[0] === 'B', 'offline format uses the B (base64url) prefix');
    const dec = SC.ui.share.decode(code);
    t.ok(!dec.error, 'decodes without error', JSON.stringify(dec.error));
    t.eq(dec.level, 'L03', 'level id survives');
    t.eq(dec.program.rungs.map((r) => r.els.length), prog.rungs.map((r) => r.els.length), 'same number of elements per rung');
    t.eq(JSON.stringify(dec.program.rungs.map((r) => r.els.map((e) => [e.r, e.c, e.t, e.a, e.i, e.pt]))), JSON.stringify(prog.rungs.map((r) => r.els.map((e) => [e.r, e.c, e.t, e.a, e.i, e.pt]))), 'element positions and parameters survive');
    t.eq(JSON.stringify(dec.program.rungs[1].vb), JSON.stringify(prog.rungs[1].vb), 'branch bars survive');
    const url = 'https://itsak7m.github.io/scan-cycle/#p=' + code;
    t.ok(url.length < 2000, 'a 10-rung program fits in a 2000 character URL even without LZ-string', 'length ' + url.length);
    t.ok(SC.ui.share.decode('Zgarbage').error, 'garbage is rejected');
    t.ok(SC.ui.share.decode('B' + 'not valid base64 !!').error, 'broken base64 is rejected');
    t.ok(SC.ui.share.decode('B' + btoa('{"l":"L01","r":"x"}').replace(/=/g, '')).error, 'wrong shape is rejected');
    const evil = SC.ui.share.decode('B' + btoa(JSON.stringify({ l: 'L01', r: [{ e: [[0, 0, 'EVAL', 'x']] }] })).replace(/=/g, ''));
    t.ok(evil.error, 'unknown instruction types are rejected');
  });

  T.suite('progress: export / import validation', (t) => {
    const U = SC.ui;
    t.ok(!U.validateImport(null), 'null is not a save');
    t.ok(!U.validateImport({ v: 2, levels: {} }), 'wrong version is rejected');
    t.ok(!U.validateImport({ v: 1, levels: { x: {} } }), 'bad level id is rejected');
    t.ok(!U.validateImport({ v: 1, levels: { L01: { program: { rungs: 5 } } } }), 'bad program shape is rejected');
    t.ok(U.validateImport({ v: 1, levels: { L01: { stars: 2, program: { rungs: [] } } } }), 'a valid save is accepted');
  });
})();
