/* Simulation = PLC (compiled program + memory) + plant + operator panel + forces + scenario events.
 * The same object drives the interactive game loop and the headless FAT runner, so replays are identical.
 *
 * One step():  events -> sensor snapshot into the input image -> scan -> outputs to plant -> plant step.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const A = SC.addr;

  const INPUT_IO = SC.IO.filter((t) => t.addr[0] === 'I').map((t) => Object.assign({ _a: A.parseAddr(t.addr) }, t));
  const OUTPUT_IO = SC.IO.filter((t) => t.src === 'out').map((t) => Object.assign({ _a: A.parseAddr(t.addr) }, t));

  // press events -> set events (NC buttons idle at 1)
  function prepareEvents(events) {
    const out = [];
    for (const ev of events || []) {
      if (ev.press) {
        const io = SC.ioByName[ev.press];
        const idle = io ? io.def : 0;
        out.push({ t: ev.t, set: { [ev.press]: idle ? 0 : 1 } });
        out.push({ t: ev.t + (ev.ms || 200), set: { [ev.press]: idle } });
      } else out.push(ev);
    }
    return out.map((e, i) => Object.assign({ _i: i }, e)).sort((a, b) => a.t - b.t || a._i - b._i);
  }

  const METRIC_KEYS = ['out', 'good', 'rejected', 'spills', 'wastedCaps', 'goodLost', 'melted', 'badShipped', 'filledCount', 'overflow', 'bottlesPerMin', 'availability', 'performance', 'quality', 'oee', 'wastedLabels', 'spawned', 'estopTrips', 'auditCount', 'auditUnauthorized'];

  function create(opts) {
    const level = opts.level || {};
    const scenario = opts.scenario || {};
    const seed = opts.seed !== undefined ? opts.seed : (scenario.seed || 1);
    const tags = SC.mergeTags(SC.levelTags(level), opts.userTags || []);
    const allTags = SC.IO.map((t) => t).concat(tags.filter((t) => !SC.ioByName[t.name]));
    const tagByName = Object.create(null);
    for (const t of allTags) tagByName[t.name] = Object.assign({ _a: A.parseAddr(t.addr) }, t);
    for (const t of tags) tagByName[t.name] = Object.assign({ _a: A.parseAddr(t.addr) }, tagByName[t.name] || {}, t);

    const compiled = SC.compile(opts.program || { v: 1, rungs: [] }, { tags, palette: level.palette || null });
    const st = SC.newState();
    for (const addr in level.init || {}) {
      const a = A.parseAddr(addr);
      if (a) st[a.arr][a.idx] = level.init[addr];
    }
    const plantCfg = Object.assign({}, level.plant || {}, scenario.plant || {});
    const P = SC.plant.init(plantCfg, seed);

    const panel = Object.create(null);
    for (const io of INPUT_IO) if (io.src === 'panel') panel[io.name] = io.def | 0;
    const events = prepareEvents(scenario.events);

    const sim = {
      level, scenario, compiled, st, P, panel, forces: Object.create(null), events, evIdx: 0,
      t: 0, dt: SC.SCAN_MS, trace: null, prevVals: null, tagByName, rec: null, steps: 0, audit: [], watch: {},
    };
    if (opts.trace) { sim.trace = []; sim.prevVals = Object.create(null); }
    for (const nm of level.watchLog || []) sim.watch[nm] = undefined;

    function resolveInput(key) {
      if (SC.ioByName[key] && SC.ioByName[key].addr[0] === 'I') return SC.ioByName[key];
      const a = A.parseAddr(key);
      if (a) return INPUT_IO.find((io) => io._a.canon === a.canon) || null;
      return null;
    }
    sim.resolveInput = resolveInput;

    function applyEvent(ev) {
      if (ev.set) {
        for (const k in ev.set) {
          const io = resolveInput(k);
          if (io) panel[io.name] = ev.set[k] === true ? 1 : ev.set[k] === false ? 0 : ev.set[k];
        }
      }
      SC.plant.applyEvent(P, ev);
      if (ev.audit) sim.audit.push({ t: sim.t, note: ev.audit });
    }

    sim.setPanel = (name, v) => {
      const io = resolveInput(name);
      if (io && io.src === 'panel') panel[io.name] = v === true ? 1 : v === false ? 0 : v;
    };

    sim.force = (key, v) => {
      const a = A.parseAddr(SC.ioByName[key] ? SC.ioByName[key].addr : key);
      if (!a || a.arr !== 'I' && a.arr !== 'IW') return false;
      if (v === null || v === undefined) delete sim.forces[a.canon];
      else sim.forces[a.canon] = v === true ? 1 : v === false ? 0 : v;
      return true;
    };
    sim.forcesActive = () => Object.keys(sim.forces).length > 0;
    sim.clearForces = () => { sim.forces = Object.create(null); };

    sim.read = (key) => {
      const t = tagByName[key];
      let a = t ? t._a : A.parseAddr(key);
      if (a) return st[a.arr][a.idx];
      const m = /^([A-Za-z_]\w*)\.(Q|QU|QD|ET|CV|PT)$/.exec(key);
      if (m) { const s = st.inst[m[1]]; return s ? s[m[2]] : 0; }
      return sim.metric(key);
    };

    sim.metric = (key) => {
      const n = P.counts;
      switch (key) {
        case 'out': case 'good': case 'rejected': case 'spills': case 'wastedCaps': case 'goodLost': case 'melted': case 'badShipped': case 'wastedLabels': case 'spawned': return n[key];
        case 'filledCount': return n.filled;
        case 'overflow': return n.spills > 0 ? 1 : 0;
        case 'auditCount': return sim.audit.filter((e) => e.tag !== undefined).length;                 // logged changes of watched tags (level.watchLog)
        case 'auditUnauthorized': return sim.audit.filter((e) => e.tag !== undefined && !e.key).length; // ... made while Supervisor_Key was OFF
        case 'bottlesPerMin': case 'availability': case 'performance': case 'quality': case 'oee': return SC.plant.kpis(P)[key];
      }
      return undefined;
    };
    sim.isKnownKey = (key) => !!(tagByName[key] || A.parseAddr(key) || /^([A-Za-z_]\w*)\.(Q|QU|QD|ET|CV|PT)$/.test(key) || METRIC_KEYS.indexOf(key) >= 0);

    function recordTrace() {
      const cur = sim.prevVals;
      for (const nm in tagByName) {
        const t = tagByName[nm];
        if (!t._a) continue;
        const v = st[t._a.arr][t._a.idx];
        if (cur[nm] !== v) { cur[nm] = v; sim.trace.push({ t: sim.t, tag: nm, v }); }
      }
    }

    sim.step = (withRec) => {
      let applied = false;
      while (sim.evIdx < events.length && events[sim.evIdx].t <= sim.t) { applyEvent(events[sim.evIdx++]); applied = true; }
      if (applied) SC.plant.refreshSensors(P); // a hardwired event (E-stop, door, fault) is visible to this very scan
      // sensor snapshot -> input image
      for (const io of INPUT_IO) {
        const f = sim.forces[io._a.canon];
        let v;
        if (f !== undefined) v = f;
        else if (io.src === 'panel') v = panel[io.name];
        else v = P.sens[io.name];
        if (v === undefined) v = 0;
        if (io._a.kind === 'bit') st.I[io._a.idx] = v ? 1 : 0;
        else st[io._a.arr][io._a.idx] = v | 0;
      }
      if (compiled.ok) {
        if (withRec) { sim.rec = []; SC.scanMut(compiled, st, sim.dt, sim.rec); } else SC.scanMut(compiled, st, sim.dt);
      } else { st.t += sim.dt; st.scans++; }
      const out = {};
      for (const io of OUTPUT_IO) out[io.name] = st.Q[io._a.idx];
      for (const nm in sim.watch) {
        const v = sim.read(nm);
        if (sim.watch[nm] !== undefined && sim.watch[nm] !== v) sim.audit.push({ t: sim.t, tag: nm, from: sim.watch[nm], to: v, key: panel.Supervisor_Key ? 1 : 0 });
        sim.watch[nm] = v;
      }
      if (sim.trace) recordTrace();
      SC.plant.stepMut(P, out, sim.dt);
      sim.t += sim.dt;
      sim.steps++;
    };

    sim.runUntil = (ms) => { while (sim.t < ms) sim.step(); };
    return sim;
  }

  SC.sim = { create, INPUT_IO, OUTPUT_IO, prepareEvents, METRIC_KEYS };
})();
