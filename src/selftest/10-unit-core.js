/* Unit tests for the PLC engine: one timing diagram per instruction. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const T = SC.test;

  const TAGS = [
    { name: 'A', addr: 'I0.0', type: 'Bool' }, { name: 'B', addr: 'I0.1', type: 'Bool' }, { name: 'C', addr: 'I0.2', type: 'Bool' },
    { name: 'Stop', addr: 'I0.3', type: 'Bool', wiring: 'NC', role: 'stop' },
    { name: 'Y', addr: 'Q0.0', type: 'Bool' }, { name: 'Z', addr: 'Q0.1', type: 'Bool' }, { name: 'X', addr: 'Q0.2', type: 'Bool' },
    { name: 'M1', addr: 'M0.0', type: 'Bool' }, { name: 'M2', addr: 'M0.1', type: 'Bool' }, { name: 'M3', addr: 'M0.2', type: 'Bool' },
    { name: 'W1', addr: 'MW10', type: 'Int' }, { name: 'W2', addr: 'MW12', type: 'Int' }, { name: 'W3', addr: 'MW14', type: 'Int' },
  ];

  // test harness: build from ladder text
  function kit(lines, opts) {
    const prog = Array.isArray(lines) ? SC.dsl.parseProgram(lines) : lines;
    const c = SC.compile(prog, Object.assign({ tags: TAGS }, opts || {}));
    if (!c.ok) throw new Error('compile: ' + JSON.stringify(c.errors));
    const st = SC.newState();
    const addrOf = (n) => SC.addr.parseAddr((TAGS.find((t) => t.name === n) || { addr: n }).addr);
    const h = {
      c, st, prog,
      set(n, v) { const a = addrOf(n); if (a.kind === 'bit') st[a.arr][a.idx] = v ? 1 : 0; else st[a.arr][a.idx] = v; },
      get(n) { const a = addrOf(n); return st[a.arr][a.idx]; },
      scan(k) { for (let i = 0; i < (k || 1); i++) SC.scanMut(c, st); },
      ms(ms) { h.scan(Math.round(ms / 10)); },
      inst: (n) => st.inst[n],
    };
    return h;
  }
  SC.testkit = { kit, TAGS };

  T.suite('time literals & addresses', (t) => {
    const P = SC.addr.parseTime, F = SC.addr.formatTime;
    t.eq(P('T#3s'), 3000, 'T#3s = 3000 ms');
    t.eq(P('T#500ms'), 500, 'T#500ms');
    t.eq(P('T#1m30s'), 90000, 'T#1m30s');
    t.eq(P('T#1.5s'), 1500, 'T#1.5s');
    t.eq(P('t#2s'), 2000, 'lower case ok');
    t.eq(P('3s'), null, '"3s" is not a literal');
    t.eq(P('T#'), null, 'T# alone is invalid');
    t.eq(P('T#3x'), null, 'unknown unit');
    t.eq(P(3), null, 'a number is not a literal');
    t.eq(F(3000), 'T#3s', 'format 3000');
    t.eq(F(90500), 'T#1m30s500ms', 'format 90500');
    t.eq(F(0), 'T#0ms', 'format 0');
    t.eq(F(P('T#2m5s20ms')), 'T#2m5s20ms', 'round trip');
    const a = SC.addr.parseAddr('I0.5');
    t.eq([a.kind, a.arr, a.idx], ['bit', 'I', 5], 'I0.5');
    t.eq(SC.addr.parseAddr('%QX1.2').canon, 'Q1.2', 'CODESYS %QX1.2');
    t.eq(SC.addr.parseAddr('MW10').idx, 10, 'MW10');
    t.eq(SC.addr.parseAddr('I0.8'), null, 'I0.8 invalid bit');
    t.eq(SC.addr.parseAddr('Start'), null, 'name is not an address');
    t.eq(SC.addr.toCodesys('Q0.6'), '%QX0.6', 'to CODESYS');
  });

  T.suite('ladder text layout', (t) => {
    const r = SC.dsl.parseRung('[Start_PB | Motor] /Stop_PB (Motor)');
    t.eq([r.rows, r.cols], [2, 3], 'seal-in is 2 rows x 3 cols');
    t.eq(r.els.map((e) => `${e.t}@${e.r},${e.c}`).join(' '), 'NO@0,0 NO@1,0 NC@0,1 OUT@0,2', 'seal-in elements');
    t.eq(JSON.stringify(r.vb), '[[0,0],[1,0]]', 'seal-in bars');
    let threw = false;
    try { SC.dsl.parseRung('[a | [b | c]]'); } catch (e) { threw = true; }
    t.ok(threw, 'nested groups rejected');
    const r2 = SC.dsl.parseRung('TON(DB_T,T#3s) CMP(>=,MW10,5) (S:Y) (R:Z)');
    t.eq(r2.els[0], { r: 0, c: 0, t: 'TON', i: 'DB_T', pt: 'T#3s' }, 'TON args');
    t.eq(r2.els[1], { r: 0, c: 1, t: 'CMP', op: '>=', a: 'MW10', b: 5 }, 'CMP args');
    t.eq(r2.els[2].t + r2.els[3].t, 'SETRST', 'S/R coils');
  });

  T.suite('contacts, coils, rung evaluation', (t) => {
    let h = kit(['A (Y)']);
    h.scan(); t.eq(h.get('Y'), 0, 'NO contact, input off -> coil off');
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'input on -> coil on within 1 scan');
    h.set('A', 0); h.scan(); t.eq(h.get('Y'), 0, 'input off -> coil off within 1 scan');

    h = kit(['/A (Y)']);
    h.scan(); t.eq(h.get('Y'), 1, 'NC contact passes when bit = 0');
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 0, 'NC contact blocks when bit = 1');

    h = kit(['A B (Y)']);
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 0, 'series AND: one input -> off');
    h.set('B', 1); h.scan(); t.eq(h.get('Y'), 1, 'series AND: both -> on');

    h = kit(['[A | B] (Y)']);
    h.scan(); t.eq(h.get('Y'), 0, 'parallel OR: none -> off');
    h.set('B', 1); h.scan(); t.eq(h.get('Y'), 1, 'parallel OR: B -> on');
    h.set('B', 0); h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'parallel OR: A -> on');

    h = kit(['[A B | C] (Y)']);
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 0, 'A and no B, no C -> off');
    h.set('C', 1); h.scan(); t.eq(h.get('Y'), 1, 'C branch -> on');

    h = kit(['A (Y) (Z)']);
    h.set('A', 1); h.scan(); t.eq([h.get('Y'), h.get('Z')], [1, 1], 'two coils in series both follow');

    h = kit(['[A | B] [C | Stop] (Y)']);
    h.set('A', 1); h.set('Stop', 1); h.scan(); t.eq(h.get('Y'), 1, 'two groups in series (A, Stop)');
    h.set('Stop', 0); h.scan(); t.eq(h.get('Y'), 0, 'second group opens');
  });

  T.suite('seal-in (latch with feedback)', (t) => {
    const h = kit(['[A | Y] Stop (Y)']);
    h.set('Stop', 1);
    h.scan(); t.eq(h.get('Y'), 0, 'idle');
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'start pressed');
    h.set('A', 0); h.scan(3); t.eq(h.get('Y'), 1, 'stays on after release');
    h.set('Stop', 0); h.scan(); t.eq(h.get('Y'), 0, 'stop (NC wired, bit 0) drops it');
    h.set('Stop', 1); h.scan(5); t.eq(h.get('Y'), 0, 'stays off');
    h.set('A', 1); h.set('Stop', 0); h.scan(); t.eq(h.get('Y'), 0, 'stop wins over start');
  });

  T.suite('scan order and double coil', (t) => {
    let h = kit(['A (Y)', '/B (Y)']);
    h.set('A', 1); h.set('B', 1); h.scan();
    t.eq(h.get('Y'), 0, 'double coil: the last write wins (rung 2 writes 0)');
    h = kit(['Y (Z)', 'A (Y)']);
    h.set('A', 1); h.scan();
    t.eq([h.get('Y'), h.get('Z')], [1, 0], 'rung 1 reads Y before rung 2 sets it (1 scan old)');
    h.scan(); t.eq(h.get('Z'), 1, 'one scan later Z follows');
    h = kit(['A (Y)', 'Y (Z)']);
    h.set('A', 1); h.scan();
    t.eq([h.get('Y'), h.get('Z')], [1, 1], 'rung 2 sees the write of rung 1 in the same scan');
    h = kit(['A (S:Y)', 'B (R:Y)']);
    h.set('A', 1); h.scan(); h.set('A', 0); h.scan(4); t.eq(h.get('Y'), 1, 'Set holds');
    h.set('B', 1); h.scan(); t.eq(h.get('Y'), 0, 'Reset clears');
    h = kit(['A (S:Y)', 'A (R:Y)']);
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 0, 'S then R in same scan: last executed wins (R)');
  });

  T.suite('edge contacts (POS / NEG)', (t) => {
    let h = kit(['POS(M1) (Y)'].map((s) => s), {});
    // POS needs power on its left: use A in front
    h = kit(['A POS(M1) (Y)']);
    h.scan(); t.eq(h.get('Y'), 0, 'no edge when input idle');
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'rising edge -> 1 scan pulse');
    h.scan(); t.eq(h.get('Y'), 0, 'next scan Y is 0 again (one scan only)');
    h.scan(20); t.eq(h.get('Y'), 0, 'held input does not retrigger');
    h.set('A', 0); h.scan(); h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'second press gives a second pulse');
    h = kit(['A NEG(M1) (Y)']);
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 0, 'NEG: no pulse on rising edge');
    h.set('A', 0); h.scan(); t.eq(h.get('Y'), 1, 'NEG: falling edge of the left power -> 1 scan pulse');
    h.scan(); t.eq(h.get('Y'), 0, 'NEG: only one scan');
    // NEG used inside a branch: edge on the contact itself
    h = kit(['[A | M1] NEG(M2) (Y)']);
    t.ok(true, 'NEG layout compiles');
    // pulse shorter than one scan is missed (input image is a snapshot)
    h = kit(['A (Y)']);
    h.set('A', 0); h.scan(); h.scan();
    t.eq(h.get('Y'), 0, 'a pulse that is never present at scan time is never seen');
  });

  T.suite('TON on-delay', (t) => {
    const h = kit(['A TON(DB_T,T#3s) (Y)']);
    h.set('A', 1);
    h.scan(299); t.eq(h.get('Y'), 0, 'Q still 0 after 299 scans (2.99 s)');
    h.scan(); t.eq([h.get('Y'), h.inst('DB_T').ET], [1, 3000], 'Q = 1 on scan 300, ET = PT');
    h.scan(50); t.eq(h.inst('DB_T').ET, 3000, 'ET stops at PT');
    h.set('A', 0); h.scan(); t.eq([h.get('Y'), h.inst('DB_T').ET], [0, 0], 'IN false resets ET and Q at once');
    h.set('A', 1); h.scan(100); h.set('A', 0); h.scan(); h.set('A', 1); h.scan(299);
    t.eq(h.get('Y'), 0, 'a drop of IN restarts the timing');
    h.scan(); t.eq(h.get('Y'), 1, 'and it fires 3 s after the new rising edge');
    const g = kit(['TON(DB_T,T#0ms) (Y)']);
    g.scan(); t.eq(g.get('Y'), 1, 'PT = 0 fires at once');
  });

  T.suite('TOF off-delay', (t) => {
    const h = kit(['A TOF(DB_T,T#2s) (Y)']);
    h.scan(); t.eq(h.get('Y'), 0, 'idle');
    h.set('A', 1); h.scan(); t.eq(h.get('Y'), 1, 'Q follows IN at once');
    h.set('A', 0); h.scan(); t.eq(h.get('Y'), 1, 'Q holds after IN falls');
    h.scan(198); t.eq(h.get('Y'), 1, 'still on at 1.99 s');
    h.scan(); t.eq(h.get('Y'), 0, 'off after PT (2.0 s)');
    h.set('A', 1); h.scan(); h.set('A', 0); h.scan(100); h.set('A', 1); h.scan(); h.set('A', 0); h.scan(199);
    t.eq(h.get('Y'), 1, 'IN rising during the delay restarts it');
  });

  T.suite('TP pulse', (t) => {
    const h = kit(['A TP(DB_T,T#500ms) (Y)']);
    h.scan(); t.eq(h.get('Y'), 0, 'idle');
    h.set('A', 1); h.scan();
    t.eq(h.get('Y'), 1, 'pulse starts on the rising edge scan');
    let on = 1;
    for (let i = 0; i < 80; i++) { h.scan(); on += h.get('Y'); }
    t.eq(on, 50, 'pulse is exactly PT long (50 scans = 500 ms) even though IN stays high');
    t.eq(h.get('Y'), 0, 'and ends');
    const g = kit(['A TP(DB_T,T#500ms) (Y)']);
    g.set('A', 1); g.scan(); g.set('A', 0); g.scan(10);
    t.eq(g.get('Y'), 1, 'a short IN pulse still gives the full pulse');
    g.set('A', 1); g.scan(); g.set('A', 0); g.scan(5);
    let n = 0; for (let i = 0; i < 80; i++) { g.scan(); n += g.get('Y'); }
    t.ok(n < 40, 'not retriggerable while running (pulse ends 500 ms after the first edge)', 'n=' + n);
    g.scan(20); g.set('A', 1); g.scan(); t.eq(g.get('Y'), 1, 'a new edge after the pulse starts a new pulse');
  });

  T.suite('TONR retentive timer', (t) => {
    const h = kit(['A TONR(DB_T,T#3s,B) (Y)']);
    h.set('A', 1); h.scan(100);
    t.eq(h.inst('DB_T').ET, 1000, 'accumulates 1 s');
    h.set('A', 0); h.scan(50);
    t.eq(h.inst('DB_T').ET, 1000, 'ET is kept while IN is false');
    h.set('A', 1); h.scan(199); t.eq(h.get('Y'), 0, '1.99 s more is not enough');
    h.scan(); t.eq(h.get('Y'), 1, 'total 3 s reached -> Q');
    h.set('B', 1); h.scan(); t.eq([h.get('Y'), h.inst('DB_T').ET], [0, 0], 'R resets ET and Q');
    h.scan(5); t.eq(h.get('Y'), 0, 'R wins while IN is still high');
  });

  T.suite('counters', (t) => {
    let h = kit(['A CTU(DB_C,3,B) (Y)']);
    for (let i = 0; i < 2; i++) { h.set('A', 1); h.scan(); h.set('A', 0); h.scan(); }
    t.eq([h.inst('DB_C').CV, h.get('Y')], [2, 0], 'two pulses -> CV 2, Q off');
    h.set('A', 1); h.scan(50);
    t.eq([h.inst('DB_C').CV, h.get('Y')], [3, 1], 'third pulse (long) counts once -> Q');
    h.set('A', 0); h.scan(); h.set('A', 1); h.scan();
    t.eq(h.inst('DB_C').CV, 4, 'counts beyond PV');
    h.set('B', 1); h.scan(); t.eq([h.inst('DB_C').CV, h.get('Y')], [0, 0], 'R zeroes CV and Q');
    h.set('A', 0); h.scan(); h.set('A', 1); h.scan(); t.eq(h.inst('DB_C').CV, 0, 'R has priority over the count');
    h.set('B', 0); h.scan(); h.set('A', 0); h.scan(); h.set('A', 1); h.scan(); t.eq(h.inst('DB_C').CV, 1, 'counting resumes after R released');

    h = kit(['A CTD(DB_D,2,B) (Y)']);
    h.scan(); t.eq(h.get('Y'), 1, 'CTD: CV = 0 -> Q = 1 before load');
    h.set('B', 1); h.scan(); h.set('B', 0); h.scan();
    t.eq([h.inst('DB_D').CV, h.get('Y')], [2, 0], 'LD loads PV, Q off');
    h.set('A', 1); h.scan(); h.set('A', 0); h.scan(); h.set('A', 1); h.scan();
    t.eq([h.inst('DB_D').CV, h.get('Y')], [0, 1], 'two edges count down to 0, Q on');

    h = kit(['A CTUD(DB_U,3,B) (Y)']);
    h.set('A', 1); h.set('B', 1); h.scan();
    t.eq(h.inst('DB_U').CV, 0, 'up and down edge in the same scan -> no change');
    h.set('B', 0); h.scan(); h.set('A', 0); h.scan(); h.set('A', 1); h.scan();
    t.eq(h.inst('DB_U').CV, 1, 'up edge alone -> +1');
    h.set('A', 0); h.scan(); h.set('B', 1); h.scan();
    t.eq(h.inst('DB_U').CV, 0, 'down edge alone -> -1');
  });

  T.suite('compare, move, math, shift', (t) => {
    let h = kit(['CMP(>=,W1,5) (Y)']);
    h.set('W1', 4); h.scan(); t.eq(h.get('Y'), 0, '4 >= 5 false');
    h.set('W1', 5); h.scan(); t.eq(h.get('Y'), 1, '5 >= 5 true');
    for (const [op, a, b, exp] of [['==', 3, 3, 1], ['<>', 3, 3, 0], ['>', 4, 3, 1], ['<', 4, 3, 0], ['<=', 3, 3, 1]]) {
      h = kit([`CMP(${op},W1,W2) (Y)`]);
      h.set('W1', a); h.set('W2', b); h.scan(); t.eq(h.get('Y'), exp, `CMP ${a} ${op} ${b}`);
    }
    h = kit(['A MOVE(7,W1)']);
    h.scan(); t.eq(h.get('W1'), 0, 'MOVE needs power');
    h.set('A', 1); h.scan(); t.eq(h.get('W1'), 7, 'MOVE const -> tag');
    h = kit(['A ADD(W1,1,W1)']);
    h.set('A', 1); h.scan(10); t.eq(h.get('W1'), 10, 'ADD without an edge runs every scan (10 scans -> 10)');
    h = kit(['A POS(M1) ADD(W1,1,W1)']);
    h.set('A', 1); h.scan(10); t.eq(h.get('W1'), 1, 'ADD behind an edge runs once');
    h = kit(['A SUB(W1,2,W2)']);
    h.set('W1', 9); h.set('A', 1); h.scan(); t.eq(h.get('W2'), 7, 'SUB');
    h = kit(['A SHL(W1,B)']);
    h.set('A', 1); h.set('B', 1); h.scan(); t.eq(h.get('W1'), 1, 'SHL: bit0 := IN');
    h.set('B', 0); h.scan(); t.eq(h.get('W1'), 2, 'SHL shifts left');
    h.scan(); t.eq(h.get('W1'), 4, 'SHL again');
    h = kit(['A CMP(>,DB_T.ET,T#1s) TON(DB_T,T#5s)']);
    t.ok(true, 'instance field operand compiles');
  });

  T.suite('compile errors', (t) => {
    const c = (lines) => SC.compile(SC.dsl.parseProgram(lines), { tags: TAGS });
    let r = c(['Nope (Y)']);
    t.eq(r.errors[0] && r.errors[0].code, 'unknown_tag', 'unknown tag');
    r = c(['A (A)']);
    t.eq(r.errors[0] && r.errors[0].code, 'write_to_input', 'coil on an input');
    r = c(['A TON(DB_T,3) (Y)']);
    t.eq(r.errors[0] && r.errors[0].code, 'bad_time', 'PT = 3 is not a time literal');
    r = c(['A TON(DB_T,T#3s) (Y)']);
    t.ok(r.ok, 'valid program compiles');
    r = SC.compile(SC.dsl.parseProgram(['A TON(DB_T,T#3s) (Y)']), { tags: TAGS, palette: ['NO', 'OUT'] });
    t.eq(r.errors[0] && r.errors[0].code, 'not_allowed', 'palette is enforced');
    r = c(['A POS(W1) (Y)']);
    t.ok(r.errors.length > 0, 'edge memory must be an M bit');
    r = c(['A TON(DB_T,T#3s) (Y)', 'A CTU(DB_T,3) (Z)']);
    t.eq(r.errors[0] && r.errors[0].code, 'inst_type_clash', 'one instance cannot be TON and CTU');
  });

  T.suite('lint', (t) => {
    const L = (lines) => SC.lint(SC.dsl.parseProgram(lines), TAGS).map((x) => x.id);
    t.ok(L(['A (Y)', 'B (Y)']).includes('double_coil'), 'double coil');
    t.ok(!L(['A (S:Y)', 'B (R:Y)']).includes('double_coil'), 'S/R pair is not a double coil');
    t.ok(L(['A TON(DB_T,T#1s) (Y)', 'B TON(DB_T,T#1s) (Z)']).includes('shared_instance'), 'shared timer instance');
    t.ok(L(['A POS(M1) (Y)', 'B POS(M1) (Z)']).includes('edge_bit_reused'), 'edge bit reused');
    t.ok(L(['Stop /Stop (Y)']).includes('nc_on_nc_stop'), 'NC contact on an NC-wired stop');
    t.ok(!L(['Stop (Y)']).includes('nc_on_nc_stop'), 'NO contact on stop is fine');
    t.ok(L(['A ADD(W1,1,W1)']).includes('add_without_edge'), 'ADD without edge');
    t.ok(!L(['A POS(M1) ADD(W1,1,W1)']).includes('add_without_edge'), 'ADD behind edge');
    const p = SC.dsl.parseProgram(['[A | B] (Y)']);
    p.rungs[0].vb.pop();
    t.ok(SC.lint(p, TAGS).some((x) => x.id === 'branch_open'), 'branch opened but not closed');
    t.eq(L(['[A | Y] /Stop (Y)']).join(','), 'nc_on_nc_stop', 'only the expected lint on a seal-in');
  });

  T.suite('determinism and purity', (t) => {
    const prog = SC.dsl.parseProgram([
      '[A | Y] Stop TON(DB_T,T#300ms) (Y)', 'B POS(M1) ADD(W1,1,W1)', 'C CTU(DB_C,5,Stop) (Z)', 'A TP(DB_P,T#200ms) (X)',
    ]);
    const c = SC.compile(prog, { tags: TAGS });
    function run(seed) {
      const o = { rng: SC.prng.seedOf(seed) };
      let st = SC.newState();
      for (let i = 0; i < 3000; i++) {
        st = SC.cloneState(st);
        st.I[0] = SC.prng.next(o) < 0.2 ? 1 : 0;
        st.I[1] = SC.prng.next(o) < 0.2 ? 1 : 0;
        st.I[2] = SC.prng.next(o) < 0.2 ? 1 : 0;
        st.I[3] = SC.prng.next(o) < 0.9 ? 1 : 0;
        st = SC.scan(c, st);
      }
      return SC.fingerprint(st);
    }
    t.eq(run(7), run(7), 'same seed, same inputs -> identical state after 3000 scans');
    t.ok(run(7) !== run(8), 'different seed gives a different run');
    const st = SC.newState(); st.I[0] = 1;
    const before = SC.fingerprint(st);
    SC.scan(c, st);
    t.eq(SC.fingerprint(st), before, 'scan() does not touch its input state');
    const a = SC.prng.next({ rng: SC.prng.seedOf(1) }), b = SC.prng.next({ rng: SC.prng.seedOf(1) });
    t.eq(a, b, 'PRNG is deterministic');
  });
})();
