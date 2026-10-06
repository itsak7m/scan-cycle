/* FAT scenario runner: runs a scenario against a program and checks the assertions.
 *
 * scenario: {id, seed, durationMs, plant?:{...}, events:[...], asserts:[...], title?:{en,ar}}
 *   events:  {t, set:{tag:value}} | {t, press:"Start_PB", ms} | {t, estop:bool} | {t, door:"open"|"closed"}
 *            {t, fault:name, arg} | {t, clear:name, arg} | {t, plantSet:{...}}
 *   asserts: {t, expect:{key:value}, tol?, msg?}          value must hold at some sample in [t-tol, t+tol]
 *            {window:[a,b], never:{...}} / {window:[a,b], always:{...}}
 *            {when:{...}, within:ms, expect:{...}, tol?}  after every rising edge of `when`
 *   keys: tag names, addresses (Q0.0), instance fields (DB_T.ET), plant metrics (filledCount, spills, ...)
 *   values: true/false/number or {gte,gt,lte,lt,eq,ne}
 * Sample time = the time at which the scan read its inputs; outputs are the result of that scan.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const DEFAULT_TOL = 20;

  function matchVal(v, exp) {
    if (v === undefined) return false;
    if (typeof exp === 'boolean') return (v ? true : false) === exp;
    if (typeof exp === 'number') return v === exp;
    if (exp && typeof exp === 'object') {
      for (const op in exp) {
        const e = exp[op];
        if (op === 'gte' && !(v >= e)) return false;
        if (op === 'gt' && !(v > e)) return false;
        if (op === 'lte' && !(v <= e)) return false;
        if (op === 'lt' && !(v < e)) return false;
        if (op === 'eq' && !(v === e)) return false;
        if (op === 'ne' && !(v !== e)) return false;
        if (['gte', 'gt', 'lte', 'lt', 'eq', 'ne'].indexOf(op) < 0) return false; // unknown operator: never vacuously true
      }
      return true;
    }
    return false;
  }

  function matchCond(sim, cond) {
    for (const k in cond) if (!matchVal(sim.read(k), cond[k])) return false;
    return true;
  }

  function actualOf(sim, cond) {
    const o = {};
    for (const k in cond) { const v = sim.read(k); o[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v; }
    return o;
  }

  const fmtVal = (e) => (typeof e === 'boolean' ? (e ? 'ON' : 'OFF') : typeof e === 'object' ? Object.keys(e).map((k) => `${k} ${e[k]}`).join(', ') : String(e));
  const fmtCond = (c) => Object.keys(c).map((k) => `${k} = ${fmtVal(c[k])}`).join(' and ');
  const sec = (ms) => (ms / 1000).toFixed(2) + ' s';

  function defaultMsg(a, kind) {
    if (kind === 'at') return { en: `Expected ${fmtCond(a.expect)} at t = ${sec(a.t)}`, ar: `المتوقع ${fmtCond(a.expect)} عند t = ${sec(a.t)}` };
    if (kind === 'never') return { en: `${fmtCond(a.never)} must never happen between ${sec(a.window[0])} and ${sec(a.window[1])}`, ar: `ممنوع يصير ${fmtCond(a.never)} بين ${sec(a.window[0])} و ${sec(a.window[1])}` };
    if (kind === 'always') return { en: `${fmtCond(a.always)} must hold between ${sec(a.window[0])} and ${sec(a.window[1])}`, ar: `لازم يضل ${fmtCond(a.always)} بين ${sec(a.window[0])} و ${sec(a.window[1])}` };
    return { en: `After ${fmtCond(a.when)}, expected ${fmtCond(a.expect)} within ${a.within} ms`, ar: `بعد ${fmtCond(a.when)} المتوقع ${fmtCond(a.expect)} خلال ${a.within} ms` };
  }

  // opts: {seed, failFast, trace, forces, userTags, upTo (ms, stop early), rec}
  function runScenario(level, program, scenario, opts) {
    opts = opts || {};
    const sim = SC.sim.create({ level, program, scenario, seed: opts.seed !== undefined ? opts.seed : scenario.seed, trace: !!opts.trace, userTags: opts.userTags });
    if (opts.forces) for (const k in opts.forces) sim.force(k, opts.forces[k]);
    const dur = scenario.durationMs || 10000;
    const asserts = (scenario.asserts || []).map((a, i) => {
      const kind = a.never ? 'never' : a.always ? 'always' : a.when ? 'within' : 'at';
      const tol = a.tol === undefined ? DEFAULT_TOL : a.tol;
      const o = { a, i, kind, tol, done: false, ok: false, obligations: [], prevWhen: false };
      if (kind === 'at') { o.from = a.t - tol; o.to = a.t + tol; }
      return o;
    });
    const failures = [];
    const fail = (o, tFail, extra) => {
      const a = o.a;
      const cond = o.kind === 'never' ? a.never : o.kind === 'always' ? a.always : a.expect;
      failures.push(Object.assign({
        idx: o.i, kind: o.kind, t: tFail, at: a.t !== undefined ? a.t : (a.window ? a.window[0] : tFail),
        msg: a.msg || defaultMsg(a, o.kind), expected: cond, actual: actualOf(sim, cond), assertId: a.id || ('#' + (o.i + 1)),
      }, extra || {}));
    };
    const unknownKeys = [];
    for (const o of asserts) {
      const a = o.a;
      for (const c of [a.expect, a.never, a.always, a.when]) if (c) for (const k in c) if (!sim.isKnownKey(k)) unknownKeys.push(k);
    }
    for (const o of asserts) if (o.kind === 'at' && o.a.t > dur + 1) unknownKeys.push('(assert at ' + o.a.t + ' ms is after the end of the run)');
    if (unknownKeys.length) failures.push({ idx: -1, kind: 'bad_scenario', t: 0, at: 0, msg: { en: 'Scenario problem: ' + unknownKeys[0], ar: 'مشكلة بالسيناريو: ' + unknownKeys[0] }, expected: {}, actual: {}, assertId: 'scenario' });

    const stopAt = opts.upTo !== undefined ? opts.upTo : dur;
    while (sim.t < stopAt) {
      sim.step();
      const ts = sim.t - sim.dt;
      for (const o of asserts) {
        if (o.done) continue;
        const a = o.a;
        if (o.kind === 'at') {
          if (ts >= o.from && ts <= o.to) {
            if (!o.ok && matchCond(sim, a.expect)) o.ok = true;
            if (ts >= o.to && !o.ok) { o.done = true; fail(o, ts); }
          }
          if (ts >= o.to) o.done = true;
        } else if (o.kind === 'never' || o.kind === 'always') {
          if (ts >= a.window[0] && ts <= a.window[1]) {
            const m = matchCond(sim, o.kind === 'never' ? a.never : a.always);
            if ((o.kind === 'never' && m) || (o.kind === 'always' && !m)) { o.done = true; fail(o, ts); }
          }
          if (ts > a.window[1]) o.done = true;
        } else {
          const w = matchCond(sim, a.when);
          if (w && !o.prevWhen) o.obligations.push({ t0: ts, deadline: ts + (a.within || 0) + o.tol });
          o.prevWhen = w;
          if (o.obligations.length) {
            const ok = matchCond(sim, a.expect);
            const keep = [];
            for (const ob of o.obligations) {
              if (ok) continue;
              if (ts >= ob.deadline) { fail(o, ts, { at: ob.t0 }); o.done = true; break; }
              keep.push(ob);
            }
            o.obligations = keep;
          }
        }
      }
      if (opts.failFast && failures.length) break;
    }
    // flush obligations whose deadline is inside the run but never evaluated (end of run)
    if (stopAt >= dur) {
      for (const o of asserts) {
        if (o.done) continue;
        if (o.kind === 'at' && !o.ok && o.from <= dur) fail(o, dur);
        if (o.kind === 'within') for (const ob of o.obligations) if (ob.deadline <= dur) { fail(o, dur, { at: ob.t0 }); break; }
      }
    }
    failures.sort((x, y) => x.t - y.t || x.idx - y.idx);
    return {
      id: scenario.id, pass: failures.length === 0, failures, firstFailure: failures[0] || null,
      metrics: SC.plant.kpis(sim.P), audit: sim.audit, sim: opts.keepSim ? sim : null, forcesActive: sim.forcesActive(),
    };
  }

  // ------------------------------------------------------------------ hidden variants
  // level.hidden = {count, seedBase, base?:[scenarioIds], vary:{plant:{key:[loPct,hiPct]}, jitterMs:[lo,hi], shiftMs:[lo,hi], bottlesPerMinPct:[lo,hi]}}
  function makeHidden(level, k) {
    const h = level.hidden || {};
    const vis = (level.scenarios || []).filter((s) => !h.base || h.base.indexOf(s.id) >= 0);
    if (!vis.length) return null;
    const base = vis[k % vis.length];
    const seed = (h.seedBase || 1000) + k;
    const o = { rng: SC.prng.seedOf(seed * 7919 + 13) };
    const sc = SC.util.clone(base);
    sc.id = `${base.id}~h${k}`;
    sc.seed = seed;
    sc.hidden = true;
    const v = h.vary || {};
    sc.plant = sc.plant || {};
    if (v.jitterMs) sc.plant.jitterMs = Math.round(SC.prng.range(o, v.jitterMs[0], v.jitterMs[1]));
    if (v.genDelayMs) sc.plant.genDelayMs = Math.round(SC.prng.range(o, v.genDelayMs[0], v.genDelayMs[1]));
    if (v.bottlesPerMinPct) {
      const b = sc.plant.bottlesPerMin || (level.plant && level.plant.bottlesPerMin) || SC.plant.DEFAULTS.bottlesPerMin;
      sc.plant.bottlesPerMin = Math.round(b * (1 + SC.prng.range(o, v.bottlesPerMinPct[0], v.bottlesPerMinPct[1]) / 100) * 10) / 10;
    }
    for (const key in v.plant || {}) {
      const range = v.plant[key];
      const baseV = sc.plant[key] !== undefined ? sc.plant[key] : (level.plant && level.plant[key] !== undefined ? level.plant[key] : SC.plant.DEFAULTS[key]);
      if (typeof baseV === 'number') sc.plant[key] = Math.round(baseV * (1 + SC.prng.range(o, range[0], range[1]) / 100) * 1000) / 1000;
    }
    if (v.shiftMs) {
      const sh = Math.round(SC.prng.range(o, v.shiftMs[0], v.shiftMs[1]) / 10) * 10;
      for (const e of sc.events || []) e.t += sh;
      for (const a of sc.asserts || []) {
        if (a.t !== undefined) a.t += sh;
        if (a.window) a.window = [a.window[0] + sh, a.window[1] + sh];
      }
      sc.durationMs = (sc.durationMs || 0) + sh;
    }
    return sc;
  }

  // runs visible scenarios, then hidden variants. opts: {failFast, skipHidden, userTags, forces}
  function runLevel(level, program, opts) {
    opts = opts || {};
    const results = [];
    let firstFail = null;
    const push = (sc, hidden) => {
      const r = runScenario(level, program, sc, { failFast: true, userTags: opts.userTags, forces: opts.forces });
      r.hidden = !!hidden;
      r.scenario = sc;
      results.push(r);
      if (!r.pass && !firstFail) firstFail = r;
      return r.pass;
    };
    for (const sc of level.scenarios || []) { if (!push(sc, false) && opts.stopAtFirst) break; }
    if (!opts.skipHidden && !(opts.stopAtFirst && firstFail)) {
      const n = (level.hidden && level.hidden.count) || 0;
      for (let k = 0; k < n; k++) {
        const sc = makeHidden(level, k);
        if (sc && !push(sc, true) && opts.stopAtFirst) break;
      }
    }
    return { pass: results.every((r) => r.pass) && !(opts.forces && Object.keys(opts.forces).length), results, firstFail };
  }

  SC.scenario = { runScenario, runLevel, makeHidden, matchCond, DEFAULT_TOL };
})();
