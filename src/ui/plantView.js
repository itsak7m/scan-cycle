/* Canvas 2D side view of the bottling line. Reads sim.P, never changes it. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  SC.ui = SC.ui || {};

  const W = 960, H = 280, X0 = 10, K = 0.5;       // px = X0 + mm * K
  const BELT_Y = 206, BELT_H = 12;               // top of the belt = bottle base
  const BW = 28, BH = 40, NECK_H = 11;           // bottle drawing size (px)
  const px = (x) => X0 + x * K;

  function PlantView(canvas) {
    const ctx = canvas.getContext('2d');
    const stat = document.createElement('canvas');
    const view = { canvas, sim: null, colors: {}, reduced: false, ghosts: [], seen: Object.create(null), lastReject: 0, dpr: 1 };
    const mq = globalThis.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    view.reduced = !!(mq && mq.matches);

    function cssVar(n, fb) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }
    view.refreshTheme = function () {
      view.colors = {
        ground: cssVar('--ground', '#E9ECEC'), surface: cssVar('--surface', '#F7F8F8'), ink: cssVar('--ink', '#14262D'),
        muted: cssVar('--muted', '#5E7279'), line: cssVar('--line', '#C6D0D2'), power: cssVar('--power', '#0B6E78'),
        alarm: cssVar('--alarm', '#B3461E'), ok: cssVar('--ok', '#2F6B4C'), amber: cssVar('--amber', '#9A6B12'),
      };
      view.staticDirty = true;
    };
    view.setSim = function (sim) { view.sim = sim; view.ghosts = []; view.seen = Object.create(null); view.staticDirty = true; };

    view.resize = function () {
      const cssW = Math.max(320, canvas.clientWidth || W);
      const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      view.dpr = dpr;
      view.scale = cssW / W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssW * (H / W) * dpr);
      stat.width = canvas.width; stat.height = canvas.height;
      view.staticDirty = true;
    };

    // ---------------------------------------------------------------- helpers
    function rr(c, x, y, w, h, r) {
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, h, r);
      else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    }
    function text(c, s, x, y, size, color, align, weight) {
      c.font = `${weight || 500} ${size}px ui-monospace, Consolas, Menlo, monospace`;
      c.fillStyle = color; c.textAlign = align || 'center'; c.textBaseline = 'alphabetic';
      c.fillText(s, x, y);
    }
    const has = (s) => view.sim.P.cfg.stations.indexOf(s) >= 0;

    // ---------------------------------------------------------------- static layer
    function drawStatic() {
      const c = stat.getContext('2d');
      const k = view.scale * view.dpr;
      c.setTransform(k, 0, 0, k, 0, 0);
      c.clearRect(0, 0, W, H);
      const col = view.colors, P = view.sim.P, cfg = P.cfg, x = cfg.x;
      c.fillStyle = col.surface; c.fillRect(0, 0, W, H);
      // belt
      const bx0 = px(0) - 6, bx1 = px(cfg.convLen) + 6;
      c.fillStyle = col.line; rr(c, bx0, BELT_Y, bx1 - bx0, BELT_H, 5); c.fill();
      c.strokeStyle = col.muted; c.lineWidth = 1.5; rr(c, bx0, BELT_Y, bx1 - bx0, BELT_H, 5); c.stroke();
      c.fillStyle = col.muted;
      for (let lx = bx0 + 30; lx < bx1; lx += 150) c.fillRect(lx, BELT_Y + BELT_H, 5, 22);
      c.fillRect(bx0, BELT_Y + BELT_H + 22, bx1 - bx0, 3);
      // infeed funnel
      if (has('infeed')) {
        c.strokeStyle = col.muted; c.lineWidth = 1.5; c.setLineDash([4, 3]);
        c.beginPath(); c.moveTo(X0 - 4, BELT_Y - 60); c.lineTo(X0 - 4, BELT_Y - 1); c.stroke(); c.setLineDash([]);
        text(c, 'INFEED', px(60), BELT_Y + 40, 10, col.muted);
      }
      // filler head + nozzle housing
      if (has('filler')) {
        const fx = px(x.nozzle);
        c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1.5;
        rr(c, fx - 34, 70, 68, 34, 4); c.fill(); c.stroke();
        c.fillStyle = col.ink; c.fillRect(fx - 4, 104, 8, 22);
        text(c, 'FILLER', fx, 62, 11, col.ink, 'center', 700);
      }
      // capper
      if (has('capper')) {
        const cx = px(x.cap);
        c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1.5;
        rr(c, cx - 30, 70, 60, 34, 4); c.fill(); c.stroke();
        text(c, 'CAPPER', cx, 62, 11, col.ink, 'center', 700);
      }
      if (has('sealer')) {
        const sx = px(x.seal);
        c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1.5;
        rr(c, sx - 30, 80, 60, 24, 12); c.fill(); c.stroke();
        c.beginPath(); c.arc(sx, 92, 6, 0, 6.3); c.stroke();
        text(c, 'SEALER', sx, 72, 11, col.ink, 'center', 700);
      }
      if (has('labeler')) {
        const lx = px(x.label);
        c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1.5;
        rr(c, lx - 30, 70, 60, 34, 4); c.fill(); c.stroke();
        text(c, 'LABELER', lx, 62, 11, col.ink, 'center', 700);
      }
      if (has('reject')) {
        const rx = px(x.reject);
        c.strokeStyle = col.ink; c.lineWidth = 1.5; c.fillStyle = col.surface;
        rr(c, rx - 20, 36, 40, 24, 3); c.fill(); c.stroke();
        text(c, 'REJECT', rx, 28, 11, col.ink, 'center', 700);
        // chute below the belt
        c.setLineDash([3, 3]); c.beginPath(); c.moveTo(rx - 18, BELT_Y + BELT_H + 4); c.lineTo(rx - 26, BELT_Y + BELT_H + 40); c.lineTo(rx + 26, BELT_Y + BELT_H + 40); c.lineTo(rx + 18, BELT_Y + BELT_H + 4); c.stroke(); c.setLineDash([]);
      }
      if (has('exit')) text(c, 'OUTFEED →', px(cfg.convLen) - 40, BELT_Y + 40, 10, col.muted);
      // tank
      if (has('tank')) {
        c.strokeStyle = col.ink; c.lineWidth = 1.5; c.fillStyle = col.surface;
        rr(c, 12, 8, 54, 64, 5); c.fill(); c.stroke();
        text(c, 'TANK', 39, 84, 10, col.muted);
      }
      view.staticDirty = false;
    }

    // ---------------------------------------------------------------- dynamic parts
    function drawBottle(c, cx, b, alpha) {
      const col = view.colors, cfg = view.sim.P.cfg;
      const y0 = BELT_Y;
      c.lineWidth = 1.5;
      // glass
      c.fillStyle = 'rgba(201,139,43,0.14)'; c.strokeStyle = col.ink;
      rr(c, cx - BW / 2, y0 - BH, BW, BH, 5); c.fill();
      // liquid
      const lh = Math.max(0, Math.min(1, b.level / cfg.capacity)) * (BH - 4);
      if (lh > 0.5) { c.fillStyle = '#C98B2B'; rr(c, cx - BW / 2 + 1.5, y0 - 2 - lh, BW - 3, lh, 3); c.fill(); }
      c.strokeStyle = col.ink; rr(c, cx - BW / 2, y0 - BH, BW, BH, 5); c.stroke();
      // neck
      c.fillStyle = 'rgba(201,139,43,0.14)'; c.strokeStyle = col.ink;
      rr(c, cx - 6, y0 - BH - NECK_H, 12, NECK_H + 1, 2); c.fill(); c.stroke();
      if (b.capped) { c.fillStyle = col.power; rr(c, cx - 8, y0 - BH - NECK_H - 6, 16, 7, 2); c.fill(); }
      if (b.sealed) { c.strokeStyle = col.surface; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 6, y0 - BH - NECK_H + 2); c.lineTo(cx + 6, y0 - BH - NECK_H + 2); c.stroke(); }
      if (b.labeled) { c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1; rr(c, cx - 10, y0 - 28, 20, 16, 2); c.fill(); c.stroke(); c.fillStyle = col.ink; c.fillRect(cx - 7, y0 - 23, 14, 1.5); c.fillRect(cx - 7, y0 - 19, 9, 1.5); }
      if (b.challenge) { c.fillStyle = col.alarm; c.beginPath(); c.moveTo(cx, y0 - BH - NECK_H - 16); c.lineTo(cx - 6, y0 - BH - NECK_H - 6); c.lineTo(cx + 6, y0 - BH - NECK_H - 6); c.closePath(); c.fill(); text(c, 'T', cx, y0 - BH - NECK_H - 19, 9, col.alarm, 'center', 700); }
      if (b.melted) { c.strokeStyle = col.alarm; c.lineWidth = 2; c.setLineDash([3, 2]); rr(c, cx - BW / 2 - 2, y0 - BH - 2, BW + 4, BH + 4, 6); c.stroke(); c.setLineDash([]); }
    }

    function eyeList(P) {
      const x = P.cfg.x, out = [];
      const add = (name, ex, st) => { if (has(st)) out.push({ name, x: ex }); };
      add('PE_Infeed', x.infeed, 'infeed');
      add('PE_Fill', x.fillPE, 'filler');
      add('PE_Cap', x.cap, 'capper');
      add('PE_Reject', x.reject, 'reject');
      add('PE_Exit', x.exit, 'exit');
      add('PE_Backup', x.backup, 'backup');
      return out;
    }

    function trackRejects(P) {
      // bottles that vanish before reaching the end of the line were pushed off by the reject pusher
      const now = Object.create(null);
      for (const b of P.bottles) now[b.id] = b;
      for (const id in view.seen) {
        if (!now[id]) {
          const b = view.seen[id];
          if (b.x < P.cfg.convLen - 5) view.ghosts.push({ b, t0: P.t, x: b.x });
        }
      }
      view.seen = now;
    }

    view.draw = function (alpha) {
      const sim = view.sim;
      if (!sim) return;
      if (view.staticDirty) drawStatic();
      const k = view.scale * view.dpr;
      const c = ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(stat, 0, 0);
      c.setTransform(k, 0, 0, k, 0, 0);
      const col = view.colors, P = sim.P, cfg = P.cfg, x = cfg.x;
      alpha = alpha || 0;
      trackRejects(P);

      // belt chevrons: they move exactly with the conveyor
      c.strokeStyle = col.muted; c.lineWidth = 1;
      const off = (P.counts.dist % 40) * K;
      for (let lx = X0 + off - 20; lx < px(cfg.convLen); lx += 20) {
        if (lx < X0) continue;
        c.beginPath(); c.moveTo(lx, BELT_Y + 3); c.lineTo(lx + 4, BELT_Y + BELT_H / 2); c.lineTo(lx, BELT_Y + BELT_H - 3); c.stroke();
      }

      // photo-eyes (blocked = thick solid beam + filled receiver + "ON"; clear = thin dashed + hollow)
      for (const e of eyeList(P)) {
        const ex = px(e.x), on = !!P.sens[e.name];
        c.strokeStyle = on ? col.alarm : col.muted; c.lineWidth = on ? 3 : 1;
        c.setLineDash(on ? [] : [3, 3]);
        c.beginPath(); c.moveTo(ex, 128); c.lineTo(ex, BELT_Y - 1); c.stroke(); c.setLineDash([]);
        c.fillStyle = col.surface; c.strokeStyle = on ? col.alarm : col.muted; c.lineWidth = 1.5;
        rr(c, ex - 4, 120, 8, 8, 1); c.fill(); c.stroke();
        if (on) { c.fillStyle = col.alarm; rr(c, ex - 4, 120, 8, 8, 1); c.fill(); }
        text(c, e.name.replace('PE_', 'PE ') + (on ? ' ●' : ' ○'), ex, 118 + ((e.name === 'PE_Fill' || e.name === 'PE_Backup') ? -10 : 0), 9, on ? col.alarm : col.muted, 'center', on ? 700 : 500);
      }

      // stopper rod
      if (has('stopper')) {
        const sx = px(x.stopper), y = 100 + P.stopper.pos * 88;
        c.fillStyle = col.surface; c.strokeStyle = col.ink; c.lineWidth = 1.5;
        rr(c, sx - 5, 88, 10, 22, 2); c.fill(); c.stroke();
        c.fillStyle = col.ink; c.fillRect(sx - 2, 108, 4, Math.max(0, y - 108)); c.fillRect(sx - 6, y - 2, 12, 5);
        text(c, P.stopper.pos >= 0.97 ? 'EXT' : P.stopper.pos <= 0.03 ? 'RET' : '…', sx, 84, 9, col.muted);
      }

      // nozzle stream
      const valveOn = P.outs.Fill_Valve && !P.relayOpen || (P.cfg.fillMode === 'piston' && P.outs.Fill_Valve && !P.relayOpen);
      if (has('filler') && valveOn) {
        const fx = px(x.nozzle);
        c.strokeStyle = '#C98B2B'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, 126); c.lineTo(fx, BELT_Y - 20); c.stroke();
      }
      // piston pump
      if (has('pump')) {
        const fx = px(x.nozzle) - 70;
        c.strokeStyle = col.ink; c.lineWidth = 1.5; c.fillStyle = col.surface;
        rr(c, fx - 12, 70, 24, 56, 3); c.fill(); c.stroke();
        c.fillStyle = col.ink; c.fillRect(fx - 10, 72 + (1 - P.pump.pos) * 40, 20, 5);
        text(c, 'PUMP', fx, 64, 10, col.ink, 'center', 700);
        text(c, P.pump.pos <= 0.02 ? 'HOME' : P.pump.pos >= 0.98 ? 'FULL' : '…', fx, 138, 9, col.muted);
      }
      // reject pusher arm
      if (has('reject')) {
        const rx = px(x.reject), y = 60 + P.pusher.pos * 100;
        c.fillStyle = col.ink; c.fillRect(rx - 3, 60, 6, Math.max(0, y - 60)); c.fillRect(rx - 14, y, 28, 5);
      }
      // capper / sealer / labeler activity flags
      if (has('capper') && P.capper.timer >= 0) { c.fillStyle = col.power; c.fillRect(px(x.cap) - 4, 104, 8, 6 + Math.sin(P.capper.timer / 300 * Math.PI) * 18); }
      if (has('sealer') && P.outs.Sealer_Enable && !P.relayOpen) { c.strokeStyle = col.alarm; c.lineWidth = 2; c.beginPath(); c.arc(px(x.seal), 92, 10, 0, 6.3); c.stroke(); text(c, 'ON', px(x.seal), 120, 9, col.alarm, 'center', 700); }
      if (has('labeler') && P.outs.Labeler_Trig && !P.relayOpen) text(c, 'LABEL', px(x.label), 120, 9, col.power, 'center', 700);

      // tank level
      if (has('tank')) {
        const lh = Math.max(0, Math.min(1, P.tank.pct / 100)) * 52;
        c.fillStyle = '#C98B2B'; c.fillRect(15, 68 - lh, 48, lh);
        c.strokeStyle = col.alarm; c.lineWidth = 1; c.setLineDash([2, 2]);
        const y15 = 68 - 0.15 * 52, y5 = 68 - 0.05 * 52;
        c.beginPath(); c.moveTo(12, y15); c.lineTo(66, y15); c.moveTo(12, y5); c.lineTo(66, y5); c.stroke(); c.setLineDash([]);
        text(c, Math.round(P.tank.pct) + '%', 39, 46, 11, col.ink, 'center', 700);
        if (P.sens.Tank_LSL) text(c, P.sens.Tank_LSLL ? '▲ LSLL' : '▲ LSL', 39, 100, 10, col.alarm, 'center', 700);
      }

      // bottles
      for (const b of P.bottles) {
        const bx = b.x + (b.x - (b.px === undefined ? b.x : b.px)) * alpha;
        drawBottle(c, px(bx), b, alpha);
      }
      // rejected bottles fall off the line
      for (let i = view.ghosts.length - 1; i >= 0; i--) {
        const g = view.ghosts[i], age = P.t - g.t0;
        if (age > 700) { view.ghosts.splice(i, 1); continue; }
        c.save(); c.globalAlpha = 1 - age / 700; c.translate(0, age * 0.12);
        drawBottle(c, px(g.x), g.b, 0); c.restore();
      }

      // stack light + lamps
      const sx = W - 40;
      const lamp = (yy, on, letter, color) => {
        c.fillStyle = on ? color : col.surface; c.strokeStyle = color; c.lineWidth = 2;
        c.beginPath(); c.arc(sx, yy, 10, 0, 6.3); c.fill(); c.stroke();
        text(c, letter, sx, yy + 3.5, 11, on ? col.surface : color, 'center', 700);
      };
      lamp(26, P.outs.Stack_Red, 'R', col.alarm); lamp(52, P.outs.Stack_Amber, 'A', col.amber); lamp(78, P.outs.Stack_Green, 'G', col.ok);
      const lx = W - 92;
      if (P.outs.Alarm_Lamp) { c.fillStyle = col.alarm; c.beginPath(); c.moveTo(lx, 16); c.lineTo(lx - 10, 34); c.lineTo(lx + 10, 34); c.closePath(); c.fill(); text(c, '!', lx, 32, 12, col.surface, 'center', 700); }
      if (P.outs.Horn) text(c, 'HORN', lx, 52, 10, col.alarm, 'center', 700);
      if (P.outs.Batch_Lamp) text(c, 'BATCH ✓', lx, 70, 10, col.ok, 'center', 700);
      if (P.outs.CIP_Done) text(c, 'CIP ✓', lx, 84, 10, col.ok, 'center', 700);

      // hardwired safety relay lamp
      if (P.relayOpen) {
        c.fillStyle = col.alarm; rr(c, W / 2 - 150, 6, 300, 22, 4); c.fill();
        text(c, '⚠ SAFETY RELAY OPEN — power cut (hardwired)', W / 2, 21, 12, col.surface, 'center', 700);
      } else {
        text(c, 'safety relay: closed', 96, 272, 10, col.muted, 'left');
      }
      // line label
      text(c, 't = ' + (sim.t / 1000).toFixed(2) + ' s', W - 10, 272, 10, col.muted, 'right');
      // replay overlay: ghost marker at the failure point
      if (sim.replayInfo) {
        const ri = sim.replayInfo, past = sim.t >= ri.tFail;
        c.fillStyle = col.surface; c.globalAlpha = .88; rr(c, 8, 106, 300, 24, 4); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = past ? col.alarm : col.power; c.lineWidth = 2; rr(c, 8, 106, 300, 24, 4); c.stroke();
        text(c, (past ? '✖ FAILURE POINT PASSED' : '▶ REPLAY') + '  t=' + (sim.t / 1000).toFixed(2) + 's  (fail @ ' + (ri.tFail / 1000).toFixed(2) + 's)', 16, 122, 11, past ? col.alarm : col.power, 'left', 700);
      }
    };

    view.refreshTheme();
    view.resize();
    if (globalThis.ResizeObserver) new ResizeObserver(() => view.resize()).observe(canvas);
    return view;
  }

  SC.ui.PlantView = PlantView;
})();
