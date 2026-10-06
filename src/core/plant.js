/* Plant model: the oral-syrup bottling line. Deterministic (seeded PRNG kept in the state), 10 ms steps.
 *
 * Units: mm along the conveyor, ms of simulated time. Numbers are "game values", chosen for playability.
 * Hardwired layer: when the E-stop is pressed or the guard door is open, motor / valve / solenoid power
 * is cut regardless of what the ladder does. The PLC only receives EStop_OK and is graded on its own outputs.
 *
 * Bottle slots are numbered 0,1,2... in generation order (cfg.badIdx etc. refer to those numbers).
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const prng = SC.prng;

  const DEFAULTS = {
    stations: ['infeed', 'filler', 'exit'],
    convLen: 1850, v: 150, speedPct: 100,
    bottlesPerMin: 24, jitterMs: 200, genDelayMs: 0, genOn: true,
    R: 30, minGap: 100, spawnX: 0, beam: 3,
    x: { infeed: 150, nozzle: 500, stopper: 530, fillPE: 530, level: 500, cap: 760, capCheck: 860, foil: 900, seal: 1000, label: 1180, reject: 1320, exit: 1700, backup: 1760, blockX: 1800 },
    capacity: 1.0, target: 0.9, okLevel: 0.88, fillSeconds: 3.0, nozzleTol: 40, fillMode: 'timed',
    stopperTravelMs: 400, pusherTravelMs: 150, pusherReach: 40, pumpTravelMs: 1500,
    capperStrokeMs: 300, capperTol: 35, labelerTol: 40, sealExposureMs: 300, meltMs: 2000,
    encPitch: 50,
    autoCap: 0, outfeedPull: false, // autoCap = x (mm) of a stand-alone capper machine that caps every bottle (0 = off); outfeedPull = downstream conveyor carries away the bottle waiting at blockX when the outfeed is free, even with our motor OFF
    tankPct: 80, tankPerFillPct: 0.5,
    badIdx: [], badFlow: 0.6, missingCapIdx: [], noFoilIdx: [], challengeIdx: [], missingBottleIdx: [], doubleIdx: [], fallenIdx: [],
    preload: [],
  };

  const OUT_NAMES = ['Conveyor_Motor', 'Fill_Valve', 'Stopper_SOL', 'Capper_Run', 'Sealer_Enable', 'Labeler_Trig', 'Reject_Pusher', 'Pump_Fwd', 'Pump_Rev'];

  function makeCfg(over) {
    const cfg = JSON.parse(JSON.stringify(DEFAULTS));
    over = over || {};
    for (const k in over) {
      if (k === 'x' || k === 'layout') Object.assign(cfg.x, over[k]);
      else if (k === 'startLevelPct') cfg.tankPct = over[k];
      else cfg[k] = JSON.parse(JSON.stringify(over[k]));
    }
    return cfg;
  }

  const has = (cfg, s) => cfg.stations.indexOf(s) >= 0;

  function init(over, seed) {
    const cfg = makeCfg(over);
    const P = {
      cfg, t: 0, rng: prng.seedOf(seed | 0), nextId: 1, seq: 0,
      nextSpawn: cfg.genDelayMs, pendingDouble: false,
      bottles: [],
      hw: { estop: false, doorOpen: false }, relayOpen: false,
      stopper: { pos: 0 }, pusher: { pos: 0, hit: false }, pump: { pos: 0 },
      tank: { pct: cfg.tankPct },
      faults: { peStuckOn: {}, peStuckOff: {}, peMisaligned: {}, peChatter: {}, valveWornSeal: false, airLow: false, airLost: false, capFeederEmpty: false, encoderSlip: false },
      flags: { outfeedBlocked: false, genOn: cfg.genOn !== false },
      enc: { acc: cfg.encPitch / 2, n: 0, mute: false },
      capper: { prev: 0, timer: -1, applied: false }, labeler: { prev: 0 }, fill: { dryOpen: false },
      counts: { spawned: 0, out: 0, good: 0, rejected: 0, spills: 0, wastedCaps: 0, wastedLabels: 0, goodLost: 0, melted: 0, badShipped: 0, filled: 0, runMs: 0, stopMs: 0, dist: 0 },
      outs: {}, sens: {},
    };
    for (const pb of cfg.preload) {
      P.bottles.push(newBottle(P, -1, Object.assign({ level: 0 }, pb)));
    }
    P.bottles.sort((a, b) => b.x - a.x);
    P.sens = computeSensors(P);
    return P;
  }

  function newBottle(P, k, over) {
    const c = P.cfg;
    const bad = c.badIdx.indexOf(k) >= 0;
    const b = {
      id: P.nextId++, seq: k, x: c.spawnX, level: 0, capped: false, sealed: false, labeled: false,
      bad, flowMul: bad ? c.badFlow : 1, noCap: c.missingCapIdx.indexOf(k) >= 0, noFoil: c.noFoilIdx.indexOf(k) >= 0,
      challenge: c.challengeIdx.indexOf(k) >= 0, fallen: c.fallenIdx.indexOf(k) >= 0,
      sealMs: 0, melted: false, spilled: false, filledFlag: false, miss: {}, px: c.spawnX,
    };
    if (b.challenge) b.bad = true;
    Object.assign(b, over || {});
    if (over && over.x !== undefined) b.px = over.x;
    return b;
  }

  function isDefective(P, b) {
    const c = P.cfg;
    if (b.challenge || b.fallen || b.melted) return true;
    if (has(c, 'filler') && (b.level < c.okLevel - 1e-9)) return true;
    if (has(c, 'capper') && !b.capped) return true;
    if (has(c, 'sealer') && !b.sealed) return true;
    if (has(c, 'labeler') && !b.labeled) return true;
    return false;
  }

  // ------------------------------------------------------------------ sensors
  function eyeBlocked(P, name, ex) {
    const c = P.cfg;
    const reach = c.R + c.beam;
    let blocked = false;
    for (const b of P.bottles) {
      if (Math.abs(b.x - ex) > reach) continue;
      if (P.faults.peMisaligned[name]) {
        if (b.miss[name] === undefined) b.miss[name] = prng.next(P) < 0.3;
        if (b.miss[name]) continue;
      }
      blocked = true;
      break;
    }
    if (P.faults.peStuckOn[name]) return 1;
    if (P.faults.peStuckOff[name]) return 0;
    if (P.faults.peChatter[name]) return prng.next(P) < 0.5 ? 1 : 0;
    return blocked ? 1 : 0;
  }

  function near(P, x, tol, pred) {
    let best = null, bd = 1e9;
    for (const b of P.bottles) {
      const d = Math.abs(b.x - x);
      if (d <= tol && d < bd && (!pred || pred(b))) { best = b; bd = d; }
    }
    return best;
  }

  function computeSensors(P) {
    const c = P.cfg, x = c.x, s = {};
    s.PE_Infeed = eyeBlocked(P, 'PE_Infeed', x.infeed);
    s.PE_Fill = eyeBlocked(P, 'PE_Fill', x.fillPE);
    s.PE_Cap = eyeBlocked(P, 'PE_Cap', x.cap);
    s.PE_Reject = eyeBlocked(P, 'PE_Reject', x.reject);
    s.PE_Exit = eyeBlocked(P, 'PE_Exit', x.exit);
    s.PE_Backup = eyeBlocked(P, 'PE_Backup', x.backup);
    s.Level_OK = near(P, x.level, 40, (b) => b.level >= c.okLevel) ? 1 : 0;
    s.Cap_Present = near(P, x.capCheck, 35, (b) => b.capped) ? 1 : 0;
    s.Foil_Present = near(P, x.foil, 35, (b) => b.capped && !b.noFoil) ? 1 : 0;
    s.Challenge_Bottle = near(P, x.reject, 40, (b) => b.challenge) ? 1 : 0;
    s.Stopper_Ext = P.stopper.pos >= 0.97 ? 1 : 0;
    s.Stopper_Ret = P.stopper.pos <= 0.03 ? 1 : 0;
    s.Air_OK = P.faults.airLost ? 0 : 1;
    s.Tank_LSL = P.tank.pct < 15 ? 1 : 0;
    s.Tank_LSLL = P.tank.pct < 5 ? 1 : 0;
    s.Tank_Level = Math.round(Math.max(0, Math.min(100, P.tank.pct)) * 276.48);
    s.Pump_Home = P.pump.pos <= 0.02 ? 1 : 0;
    s.Pump_Full = P.pump.pos >= 0.98 ? 1 : 0;
    s.Conv_Encoder = !P.enc.mute && P.enc.acc < c.encPitch / 2 ? 1 : 0;
    s.EStop_OK = P.hw.estop ? 0 : 1; // E-stop chain only; the guard door has its own bit (both open the safety relay)
    s.Door_Closed = P.hw.doorOpen ? 0 : 1;
    return s;
  }

  // ------------------------------------------------------------------ step
  function pushOff(P, b) {
    const i = P.bottles.indexOf(b);
    if (i >= 0) P.bottles.splice(i, 1);
  }

  function addFill(P, b, amount) {
    const c = P.cfg;
    if (b.fallen) { if (!b.spilled) { b.spilled = true; P.counts.spills++; } return; }
    b.level += amount;
    if (b.level > c.capacity) {
      b.level = c.capacity;
      if (!b.spilled) { b.spilled = true; P.counts.spills++; }
    }
    if (!b.filledFlag && b.level >= c.okLevel) {
      b.filledFlag = true;
      P.counts.filled++;
      P.tank.pct = Math.max(0, P.tank.pct - c.tankPerFillPct);
    }
  }

  function stepMut(P, out, dt) {
    const c = P.cfg, x = c.x;
    P.t += dt;
    P.relayOpen = P.hw.estop || P.hw.doorOpen;
    const pw = !P.relayOpen;
    const o = {};
    for (const n of OUT_NAMES) o[n] = pw && out && out[n] ? 1 : 0;
    P.outs = {};
    if (out) for (const k in out) P.outs[k] = out[k] ? 1 : 0;

    // ---- generator
    if (P.flags.genOn !== false) {
      const last = P.bottles.length ? P.bottles[P.bottles.length - 1] : null; // lowest x
      const gapOk = !last || last.x >= c.minGap;
      if (P.pendingDouble && gapOk) {
        P.pendingDouble = false;
        P.bottles.push(newBottle(P, P.seq - 1, { seq: P.seq - 1, double: true }));
        P.counts.spawned++;
      } else if (P.t >= P.nextSpawn && gapOk) {
        const k = P.seq++;
        const period = 60000 / Math.max(1, c.bottlesPerMin);
        P.nextSpawn += Math.max(period * 0.5, period + prng.range(P, -c.jitterMs, c.jitterMs));
        if (c.missingBottleIdx.indexOf(k) < 0) {
          P.bottles.push(newBottle(P, k));
          P.counts.spawned++;
          if (c.doubleIdx.indexOf(k) >= 0) P.pendingDouble = true;
        }
      }
    }

    // ---- air / cylinders
    const air = !P.faults.airLost;
    const slow = P.faults.airLow ? 3 : 1;
    if (air) {
      const sd = dt / (c.stopperTravelMs * slow);
      P.stopper.pos = Math.max(0, Math.min(1, P.stopper.pos + (o.Stopper_SOL ? sd : -sd)));
      const pd = dt / (c.pusherTravelMs * slow);
      P.pusher.pos = Math.max(0, Math.min(1, P.pusher.pos + (o.Reject_Pusher ? pd : -pd)));
    }
    if (P.pusher.pos < 0.2) P.pusher.hit = false;
    if (P.pusher.pos >= 0.8 && !P.pusher.hit) {
      const b = near(P, x.reject, c.pusherReach);
      if (b) {
        P.pusher.hit = true;
        pushOff(P, b);
        P.counts.rejected++;
        if (!isDefective(P, b)) P.counts.goodLost++;
      }
    }

    // ---- conveyor
    const dx = o.Conveyor_Motor ? (c.v * c.speedPct / 100) * dt / 1000 : 0;
    if (o.Conveyor_Motor) { P.counts.runMs += dt; P.counts.dist += dx; } else P.counts.stopMs += dt;
    const holdX = x.stopper - c.R;
    P.bottles.sort((a, b) => b.x - a.x);
    let ahead = null;
    const gone = [];
    for (const b of P.bottles) {
      b.px = b.x; // previous position, for smooth rendering
      let nx = b.x + dx;
      if (c.outfeedPull && !dx && !P.flags.outfeedBlocked && b.x >= x.blockX - 1e-9) nx = b.x + (c.v * c.speedPct / 100) * dt / 1000;
      if (ahead) nx = Math.min(nx, ahead.x - c.minGap);
      if (P.stopper.pos > 0.5 && b.x <= holdX + 1e-9) nx = Math.min(nx, holdX);
      if (P.flags.outfeedBlocked) nx = Math.min(nx, x.blockX);
      b.x = Math.max(b.x, nx);
      ahead = b;
      if (b.x > c.convLen) gone.push(b);
    }
    for (const b of gone) {
      pushOff(P, b);
      P.counts.out++;
      if (isDefective(P, b)) P.counts.badShipped++; else P.counts.good++;
    }

    // ---- stand-alone capper machine (autoCap): caps every bottle that passes its position, unless the bottle is a miss (noCap) or the feeder is empty
    if (c.autoCap) {
      for (const b of P.bottles) {
        if (!b.capDone && b.x >= c.autoCap) { b.capDone = true; if (!(b.noCap || P.faults.capFeederEmpty)) b.capped = true; }
      }
    }

    // ---- encoder
    P.enc.acc += dx;
    while (P.enc.acc >= c.encPitch) {
      P.enc.acc -= c.encPitch;
      P.enc.n++;
      P.enc.mute = P.faults.encoderSlip && P.enc.n % 50 === 49;
    }

    // ---- filling
    const under = near(P, x.nozzle, c.nozzleTol);
    if (c.fillMode === 'timed') {
      if (o.Fill_Valve) {
        if (under) {
          let flow = c.target / c.fillSeconds * under.flowMul * (P.faults.valveWornSeal ? 0.75 : 1);
          if (P.tank.pct <= 0) flow = 0;
          addFill(P, under, flow * dt / 1000);
        } else if (!P.fill.dryOpen) { P.fill.dryOpen = true; P.counts.spills++; }
      } else P.fill.dryOpen = false;
    } else {
      // piston filler: the pump moves the product, the valve routes it to the nozzle
      const pf = o.Pump_Fwd, pr = o.Pump_Rev;
      const pd = dt / c.pumpTravelMs;
      if (pr && !pf) P.pump.pos = Math.min(1, P.pump.pos + pd);
      else if (pf && !pr) {
        const d = Math.min(P.pump.pos, pd);
        P.pump.pos -= d;
        if (o.Fill_Valve && d > 0) {
          if (under) addFill(P, under, d * c.target * under.flowMul);
          else if (!P.fill.dryOpen) { P.fill.dryOpen = true; P.counts.spills++; }
        }
      }
      if (!o.Fill_Valve) P.fill.dryOpen = false;
    }

    // ---- capper (rising edge = one stroke)
    const cr = o.Capper_Run;
    if (cr && !P.capper.prev && P.capper.timer < 0) { P.capper.timer = 0; P.capper.applied = false; }
    P.capper.prev = cr;
    if (P.capper.timer >= 0) {
      P.capper.timer += dt;
      if (!P.capper.applied && P.capper.timer >= c.capperStrokeMs / 2) {
        P.capper.applied = true;
        const b = near(P, x.cap, c.capperTol);
        if (b) { if (!(b.noCap || P.faults.capFeederEmpty)) b.capped = true; }
        else P.counts.wastedCaps++;
      }
      if (P.capper.timer >= c.capperStrokeMs) P.capper.timer = -1;
    }

    // ---- sealer
    for (const b of P.bottles) {
      if (Math.abs(b.x - x.seal) <= 40 && o.Sealer_Enable && b.capped) {
        b.sealMs += dt;
        if (b.sealMs >= c.sealExposureMs && !b.noFoil && !b.melted) b.sealed = true;
        if (b.sealMs > c.meltMs && !b.melted) { b.melted = true; b.sealed = false; P.counts.melted++; }
      }
    }

    // ---- labeler (rising edge)
    const lt = o.Labeler_Trig;
    if (lt && !P.labeler.prev) {
      const b = near(P, x.label, c.labelerTol);
      if (b) b.labeled = true; else P.counts.wastedLabels++;
    }
    P.labeler.prev = lt;

    P.sens = computeSensors(P);
  }

  function clone(P) { return JSON.parse(JSON.stringify(P)); }
  function step(P, out, dt) { const n = clone(P); stepMut(n, out, dt); return n; }

  // ------------------------------------------------------------------ events / faults
  function applyEvent(P, ev) {
    if (ev.estop !== undefined) P.hw.estop = !!ev.estop;
    if (ev.door !== undefined) P.hw.doorOpen = ev.door === 'open' || ev.door === true;
    if (ev.fault) setFault(P, ev.fault, ev.arg, true);
    if (ev.clear) setFault(P, ev.clear, ev.arg, false);
    if (ev.plantSet) {
      for (const k in ev.plantSet) {
        const v = ev.plantSet[k];
        if (k === 'tankPct') P.tank.pct = v;
        else if (k === 'outfeedBlocked') P.flags.outfeedBlocked = !!v;
        else if (k === 'genOn') P.flags.genOn = !!v;
        else if (k === 'bottlesPerMin' || k === 'speedPct' || k === 'jitterMs' || k === 'fillSeconds') P.cfg[k] = v;
        else if (k === 'pumpTravelMs' || k === 'stopperTravelMs') P.cfg[k] = v;
        else if (k === 'spawnBottle') P.bottles.push(newBottle(P, -1, typeof v === 'object' ? v : {}));
        else if (k === 'clearLine') { if (v) P.bottles = []; } // the operator removes every bottle by hand (line clearance)
      }
    }
  }

  function setFault(P, name, arg, on) {
    const f = P.faults;
    if (['peStuckOn', 'peStuckOff', 'peMisaligned', 'peChatter'].indexOf(name) >= 0) {
      if (on) f[name][arg] = true; else delete f[name][arg];
    } else if (name in f) f[name] = !!on;
  }

  // ------------------------------------------------------------------ KPIs
  function kpis(P) {
    const c = P.cfg, n = P.counts;
    const tmin = Math.max(P.t, 1) / 60000;
    const runS = n.runMs / 1000;
    const availability = P.t > 0 ? n.runMs / P.t : 0;
    const performance = runS > 0 ? Math.min(1, n.dist / (c.v * runS)) : 0;
    const total = n.out + n.rejected;
    const quality = total > 0 ? n.good / total : 1;
    return {
      out: n.out, good: n.good, rejected: n.rejected, spills: n.spills, wastedCaps: n.wastedCaps, goodLost: n.goodLost,
      melted: n.melted, badShipped: n.badShipped, filledCount: n.filled, bottlesPerMin: n.out / tmin,
      availability, performance, quality, oee: availability * performance * quality,
      overflow: n.spills > 0,
    };
  }

  function refreshSensors(P) { P.sens = computeSensors(P); }

  SC.plant = { DEFAULTS, makeCfg, init, stepMut, step, clone, applyEvent, setFault, kpis, isDefective, OUT_NAMES, has, refreshSensors };
})();
