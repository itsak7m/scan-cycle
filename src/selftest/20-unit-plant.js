/* Unit tests for the plant model, the sim and the scenario runner. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;

  const DEMO = SC.demo.lines, DEMO_TAGS = SC.demo.tags;

  function mkSim(lines, plant, tags, extra) {
    const level = Object.assign({ tags: tags || DEMO_TAGS, plant: plant || {} }, extra || {});
    return SC.sim.create({ level, program: SC.dsl.parseProgram(lines), seed: 5, scenario: {} });
  }

  T.suite('plant: conveyor, accumulation, hardwired safety', (t) => {
    let s = mkSim(['(Conveyor_Motor)'], { bottlesPerMin: 60 });
    s.runUntil(3000);
    t.ok(s.P.bottles.length > 0 && s.P.bottles[0].x > 300, 'motor on: bottles move down the line', JSON.stringify(s.P.bottles.map((b) => Math.round(b.x))));
    s = mkSim(['(Conveyor_Motor)'], { bottlesPerMin: 60 });
    s.runUntil(1000);
    const x0 = s.P.bottles[0].x;
    s.step(); s.step();
    t.ok(s.P.bottles[0].x > x0, 'moves 1.5 mm per scan');
    t.ok(Math.abs((s.P.bottles[0].x - x0) - 3) < 0.01, 'speed is 150 mm/s', String(s.P.bottles[0].x - x0));

    s = mkSim(['Run (Conveyor_Motor)'], { bottlesPerMin: 60 }, DEMO_TAGS);
    s.runUntil(500);
    t.eq(s.P.counts.dist, 0, 'motor off: nothing moves');

    // queue never overlaps
    s = mkSim(['/Busy (Conveyor_Motor)', 'PE_Fill (Busy)'], { bottlesPerMin: 90, jitterMs: 0 });
    s.runUntil(20000);
    const xs = s.P.bottles.map((b) => b.x).sort((a, b) => a - b);
    let minGap = 1e9; for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
    t.ok(xs.length > 3 && minGap >= 99.9, 'bottles queue up without overlapping (min gap 100 mm)', 'minGap=' + minGap);

    // E-stop cuts motor power even if the ladder keeps the output on
    s = mkSim(['(Conveyor_Motor)'], { bottlesPerMin: 60 });
    s.runUntil(2000);
    SC.plant.applyEvent(s.P, { estop: true });
    s.step();
    const d = s.P.counts.dist;
    s.runUntil(4000);
    t.eq(s.P.counts.dist, d, 'E-stop: motor power is cut by the safety relay, bad program or not');
    t.eq(s.read('Conveyor_Motor'), 1, 'the PLC output bit itself is still 1 (the PLC is graded on its own logic)');
    t.eq(s.read('EStop_OK'), 0, 'EStop_OK = 0');
    SC.plant.applyEvent(s.P, { estop: false });
    s.step(); s.step();
    t.eq(s.read('EStop_OK'), 1, 'released: relay closes again (auto reset) — the PLC must prevent the restart');
    SC.plant.applyEvent(s.P, { door: 'open' });
    s.step(); s.step();
    t.eq([s.read('Door_Closed'), s.read('EStop_OK'), s.P.relayOpen], [0, 1, true], 'door open: Door_Closed = 0, EStop_OK stays 1, but the relay still cuts motor power');
  });

  T.suite('plant: stopper, filler, level', (t) => {
    // forced start: Start_PB forced on -> demo program runs the line
    let s = mkSim(DEMO, { bottlesPerMin: 30, convLen: 800 });
    s.force('Start_PB', 1);
    s.runUntil(40000);
    t.ok(s.P.counts.filled >= 6, 'demo program fills bottles (forcing Start_PB moves the line)', 'filled=' + s.P.counts.filled);
    t.eq(s.P.counts.spills, 0, 'no spills with a 3.0 s fill');
    t.ok(s.P.counts.out >= 1, 'bottles leave the line');
    t.eq(s.P.counts.badShipped, 0, 'every shipped bottle was filled');

    // timed fill levels
    function fillFor(ms, mul) {
      const lv = { tags: ['Fill_Valve', 'PE_Fill', 'Conveyor_Motor'], plant: { bottlesPerMin: 30, preload: [{ x: 500 }], genOn: false } };
      const q = SC.sim.create({ level: lv, program: SC.dsl.parseProgram([]), seed: 1, scenario: {} });
      q.P.bottles[0].flowMul = mul || 1;
      const out = { Fill_Valve: 1 };
      for (let i = 0; i < ms / 10; i++) SC.plant.stepMut(q.P, out, 10);
      out.Fill_Valve = 0; SC.plant.stepMut(q.P, out, 10);
      return q;
    }
    let q = fillFor(3000);
    t.ok(Math.abs(q.P.bottles[0].level - 0.9) < 0.005, '3.0 s of fill valve = 90 % level', String(q.P.bottles[0].level));
    t.eq(q.P.sens.Level_OK, 1, 'Level_OK = 1 at 90 %');
    t.eq(q.P.counts.spills, 0, 'no overflow');
    q = fillFor(2500);
    t.eq(q.P.sens.Level_OK, 0, '2.5 s: underfilled, Level_OK = 0');
    q = fillFor(3600);
    t.eq(q.P.counts.spills, 1, '3.6 s: overflow counted once');
    t.eq(q.P.bottles[0].level, 1, 'level clamps at capacity');

    // valve open without bottle = spill
    q = fillFor(100);
    q.P.bottles.length = 0;
    SC.plant.stepMut(q.P, { Fill_Valve: 1 }, 10);
    t.eq(q.P.counts.spills, 1, 'valve open with no bottle under the nozzle counts a spill');

    // stopper holds a bottle at the filler
    s = mkSim(['(Conveyor_Motor)', '(Stopper_SOL)'], { bottlesPerMin: 60 }, ['Conveyor_Motor', 'Stopper_SOL', 'PE_Fill', 'Stopper_Ext', 'Stopper_Ret']);
    s.runUntil(6000);
    const lead = s.P.bottles[0];
    t.ok(Math.abs(lead.x - 500) < 0.01, 'extended stopper holds the first bottle at the nozzle (x = 500)', String(lead.x));
    t.eq([s.read('PE_Fill'), s.read('Stopper_Ext'), s.read('Stopper_Ret')], [1, 1, 0], 'PE_Fill on, Stopper_Ext on, Stopper_Ret off');
    t.ok(s.P.bottles.length >= 3, 'the others queue behind it');
  });

  T.suite('plant: cylinders, faults, reject, encoder', (t) => {
    const tags = ['Conveyor_Motor', 'Stopper_SOL', 'Stopper_Ext', 'Stopper_Ret', 'Air_OK', 'Reject_Pusher', 'PE_Reject', 'Conv_Encoder', 'PE_Fill'];
    function sim(lines, plant) { return mkSim(lines, plant, tags); }
    let s = sim(['(Stopper_SOL)'], { genOn: false });
    s.runUntil(380);
    t.eq(s.read('Stopper_Ext'), 0, 'stopper still travelling at 380 ms');
    s.runUntil(420);
    t.eq(s.read('Stopper_Ext'), 1, 'stopper extended after about 400 ms');
    s = sim(['(Stopper_SOL)'], { genOn: false });
    SC.plant.setFault(s.P, 'airLow', null, true);
    s.runUntil(900);
    t.eq(s.read('Stopper_Ext'), 0, 'airLow: travel time x3 (not yet at 0.9 s)');
    s.runUntil(1300);
    t.eq(s.read('Stopper_Ext'), 1, 'airLow: extended by 1.3 s');
    s = sim(['(Stopper_SOL)'], { genOn: false });
    s.runUntil(200);
    SC.plant.setFault(s.P, 'airLost', null, true);
    s.runUntil(1500);
    t.eq([s.read('Stopper_Ext'), s.read('Air_OK')], [0, 0], 'airLost: cylinder frozen, Air_OK = 0');

    // reject pusher removes a bottle standing at the reject station; neighbours untouched
    s = sim(['(Reject_Pusher)'], { genOn: false, preload: [{ x: 1320, level: 0.9 }, { x: 1220, level: 0.9 }, { x: 1420, level: 0.9 }] });
    s.runUntil(300);
    t.eq(s.P.counts.rejected, 1, 'pusher pulse rejects exactly one bottle');
    t.eq(s.P.bottles.map((b) => Math.round(b.x)).sort().join(','), '1220,1420', 'the neighbours stay on the line');
    t.eq(s.P.counts.goodLost, 1, 'pushing a good (filled) bottle counts goodLost');

    // encoder: one rising edge per 50 mm
    s = sim(['(Conveyor_Motor)'], { genOn: false });
    let edges = 0, prev = s.read('Conv_Encoder');
    for (let i = 0; i < 400; i++) { s.step(); const v = s.read('Conv_Encoder'); if (v && !prev) edges++; prev = v; }
    // 400 scans * 1.5 mm = 600 mm -> 12 pitches
    t.ok(edges === 11 || edges === 12, 'encoder gives one rising edge per pitch (600 mm = 12 edges)', 'edges=' + edges);

    // photo-eye faults
    s = sim(['(Conveyor_Motor)'], { genOn: false });
    SC.plant.setFault(s.P, 'peStuckOn', 'PE_Fill', true);
    s.step(); s.step();
    t.eq(s.read('PE_Fill'), 1, 'peStuckOn: PE_Fill = 1 with no bottle');
  });

  T.suite('plant: capper, sealer, labeler', (t) => {
    const lv = (extra) => Object.assign({ tags: ['Capper_Run', 'Sealer_Enable', 'Labeler_Trig', 'Cap_Present', 'Foil_Present'], plant: { stations: ['infeed', 'filler', 'capper', 'sealer', 'labeler', 'exit'], genOn: false } }, extra || {});
    const mk = (plant, lines) => SC.sim.create({ level: lv({ plant: Object.assign({ stations: ['infeed', 'filler', 'capper', 'sealer', 'labeler', 'exit'], genOn: false }, plant) }), program: SC.dsl.parseProgram(lines), seed: 1, scenario: {} });
    let s = mk({ preload: [{ x: 760, level: 0.9 }] }, ['(Capper_Run)']);
    s.runUntil(600);
    t.eq(s.P.bottles[0].capped, true, 'capper stroke caps the bottle at the capper');
    s = mk({ preload: [{ x: 300 }] }, ['(Capper_Run)']);
    s.runUntil(600);
    t.eq(s.P.counts.wastedCaps, 1, 'capper stroke with no bottle wastes a cap');
    s = mk({ preload: [{ x: 1000, capped: true }] }, ['(Sealer_Enable)']);
    s.runUntil(500);
    t.eq(s.P.bottles[0].sealed, true, 'sealer seals a capped bottle');
    s.runUntil(2600);
    t.eq([s.P.counts.melted, s.P.bottles[0].sealed], [1, false], 'a bottle stalled under the coil for > 2 s melts');
    s = mk({ preload: [{ x: 1180, level: 0.9 }] }, ['(Labeler_Trig)']);
    s.runUntil(100);
    t.eq(s.P.bottles[0].labeled, true, 'labeler trigger labels the bottle in front of it');
  });

  T.suite('scenario runner', (t) => {
    const level = { tags: DEMO_TAGS.concat(['Level_OK']), plant: { bottlesPerMin: 30 } };
    const prog = SC.dsl.parseProgram(DEMO);
    let r = SC.scenario.runScenario(level, prog, {
      id: 'x', seed: 1, durationMs: 4000,
      events: [{ t: 0, press: 'Start_PB', ms: 500 }],
      asserts: [
        { t: 1000, expect: { Run: true }, msg: { en: 'run', ar: 'تشغيل' } },
        { t: 1000, expect: { Conveyor_Motor: true } },
        { window: [0, 4000], never: { spills: { gte: 1 } } },
      ],
    });
    t.ok(r.pass, 'passing scenario passes', JSON.stringify(r.failures[0] || ''));
    r = SC.scenario.runScenario(level, prog, {
      id: 'y', seed: 1, durationMs: 3000,
      events: [{ t: 0, press: 'Start_PB', ms: 500 }],
      asserts: [{ t: 1000, expect: { Conveyor_Motor: false }, msg: { en: 'must be off', ar: 'لازم off' } }],
    });
    t.ok(!r.pass && r.firstFailure.msg.en === 'must be off', 'failing assertion is reported with its message');
    t.eq(r.firstFailure.actual, { Conveyor_Motor: 1 }, 'failure carries the actual value');
    r = SC.scenario.runScenario(level, prog, {
      id: 'z', seed: 1, durationMs: 3000, events: [{ t: 0, press: 'Start_PB', ms: 500 }],
      asserts: [{ when: { Run: true }, within: 100, expect: { Conveyor_Motor: true } }, { when: { Run: true }, within: 1, expect: { Fill_Valve: true }, tol: 0 }],
    });
    t.eq(r.failures.length, 1, 'when/within: second obligation fails, first passes');
    r = SC.scenario.runScenario(level, prog, { id: 'k', seed: 1, durationMs: 100, events: [], asserts: [{ t: 10, expect: { NoSuchTag: true } }] });
    t.ok(!r.pass && r.failures[0].kind === 'bad_scenario', 'unknown keys in a scenario are flagged');
    // determinism of whole runs
    const sc = { id: 'd', seed: 77, durationMs: 15000, events: [{ t: 0, press: 'Start_PB', ms: 300 }], asserts: [] };
    const a = SC.scenario.runScenario(level, prog, sc, { keepSim: true }), b = SC.scenario.runScenario(level, prog, sc, { keepSim: true });
    t.eq(SC.fingerprint(a.sim.st) + JSON.stringify(a.sim.P), SC.fingerprint(b.sim.st) + JSON.stringify(b.sim.P), 'same seed -> identical plant and PLC state after a 15 s run');
    // forces block passing
    const lv2 = Object.assign({ scenarios: [{ id: 'q', seed: 1, durationMs: 500, events: [], asserts: [] }] }, level);
    const rl = SC.scenario.runLevel(lv2, prog, { forces: { Start_PB: 1 } });
    t.ok(!rl.pass, 'a level cannot pass while forces are active');
  });
})();
