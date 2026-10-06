/* Ladder symbols (IEC conventions) as inline SVG, plus element metadata. Cell box: 84 x 68, wire at y = 40. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;

  const CELL_W = 84, CELL_H = 68, WIRE_Y = 40;

  // t: element type, key: keyboard shortcut in the editor, group: palette group
  const EL = [
    { t: 'NO', group: 'contacts', key: 'n', en: 'NO contact', ar: 'ملامس {{NO}}', tip: { en: 'Normally open contact: passes power when its bit is 1.', ar: 'ملامس مفتوح عادةً: بيمرّر الـ power لما البت = 1.' } },
    { t: 'NC', group: 'contacts', key: 'c', en: 'NC contact', ar: 'ملامس {{NC}}', tip: { en: 'Normally closed contact: passes power when its bit is 0.', ar: 'ملامس مغلق عادةً: بيمرّر الـ power لما البت = 0.' } },
    { t: 'POS', group: 'contacts', key: 'p', en: 'Positive edge', ar: 'حافة صاعدة', tip: { en: 'Passes power for exactly one scan when the power on its left goes 0 → 1. Needs its own M bit.', ar: 'بيمرّر الـ power لـ scan واحد بالضبط لما الـ power قبله ينتقل 0 ← 1. بده بت M خاص فيه.' } },
    { t: 'NEG', group: 'contacts', key: '', en: 'Negative edge', ar: 'حافة هابطة', tip: { en: 'Passes power for one scan when the power on its left goes 1 → 0. Needs its own M bit.', ar: 'بيمرّر الـ power لـ scan واحد لما الـ power قبله ينتقل 1 ← 0. بده بت M خاص فيه.' } },
    { t: 'CMP', group: 'contacts', key: '=', en: 'Compare', ar: 'مقارنة', tip: { en: 'Passes power when IN1 op IN2 is true.', ar: 'بيمرّر الـ power لما IN1 op IN2 تكون صح.' } },
    { t: 'OUT', group: 'outputs', key: 'o', en: 'Coil', ar: 'ملف {{Coil}}', tip: { en: 'Writes the rung power into its bit on every scan.', ar: 'بيكتب الـ power بالبت كل {{scan}}.' } },
    { t: 'SET', group: 'outputs', key: 's', en: 'Set coil', ar: 'ملف {{Set}}', tip: { en: 'If power: bit := 1. Otherwise it does nothing (the bit keeps its value).', ar: 'إذا في power: البت := 1. غير هيك ما بيعمل شي (البت بيضل زي ما هو).' } },
    { t: 'RST', group: 'outputs', key: 'r', en: 'Reset coil', ar: 'ملف {{Reset}}', tip: { en: 'If power: bit := 0. Otherwise it does nothing.', ar: 'إذا في power: البت := 0. غير هيك ما بيعمل شي.' } },
    { t: 'MOVE', group: 'outputs', key: 'm', en: 'Move', ar: 'نقل {{Move}}', tip: { en: 'When powered: OUT := IN.', ar: 'لما في power: OUT := IN.' } },
    { t: 'ADD', group: 'outputs', key: '', en: 'Add', ar: 'جمع {{Add}}', tip: { en: 'When powered, on EVERY scan: OUT := IN1 + IN2. Put an edge contact before it!', ar: 'لما في power، بكل {{scan}}: OUT := IN1 + IN2. حط {{edge}} قبله!' } },
    { t: 'SUB', group: 'outputs', key: '', en: 'Subtract', ar: 'طرح {{Sub}}', tip: { en: 'When powered, on EVERY scan: OUT := IN1 - IN2.', ar: 'لما في power، بكل {{scan}}: OUT := IN1 - IN2.' } },
    { t: 'SHL', group: 'outputs', key: '', en: 'Shift left', ar: 'إزاحة يسار', tip: { en: 'When powered: shift the word left by 1, bit 0 := the IN bit.', ar: 'لما في power: إزاحة الـ {{word}} لليسار بمقدار 1، والبت 0 := بت الـ IN.' } },
    { t: 'SHR', group: 'outputs', key: '', en: 'Shift right', ar: 'إزاحة يمين', tip: { en: 'When powered: shift the word right by 1, bit 15 := the IN bit.', ar: 'لما في power: إزاحة الـ {{word}} لليمين بمقدار 1، والبت 15 := بت الـ IN.' } },
    { t: 'TON', group: 'blocks', key: 't', en: 'TON on-delay', ar: 'مؤقّت {{TON}}', tip: { en: 'Q turns on after IN has been on for PT. IN off resets it.', ar: 'الـ Q بيشتغل بعد ما الـ IN يضل شغّال مدة PT. لما الـ IN ينطفي بيرجع للصفر.' } },
    { t: 'TOF', group: 'blocks', key: '', en: 'TOF off-delay', ar: 'مؤقّت {{TOF}}', tip: { en: 'Q follows IN on; after IN drops, Q stays on for PT.', ar: 'الـ Q بيتبع الـ IN؛ بعد ما الـ IN ينطفي، الـ Q بيضل شغّال مدة PT.' } },
    { t: 'TP', group: 'blocks', key: '', en: 'TP pulse', ar: 'مؤقّت {{TP}} نبضة', tip: { en: 'A rising edge on IN gives a pulse of exactly PT. Not retriggerable while running.', ar: 'حافة صاعدة على IN بتعطي نبضة مدتها PT بالضبط. ما بتنعاد وهي شغّالة.' } },
    { t: 'TONR', group: 'blocks', key: '', en: 'TONR retentive', ar: 'مؤقّت {{TONR}} محتفظ', tip: { en: 'Like TON, but the elapsed time is kept when IN drops. R resets it.', ar: 'زي {{TON}} بس بيحتفظ بالوقت لما الـ IN ينطفي. الـ R بيصفّره.' } },
    { t: 'CTU', group: 'blocks', key: 'u', en: 'CTU count up', ar: 'عدّاد {{CTU}}', tip: { en: 'Counts rising edges on CU. Q = CV ≥ PV. R resets.', ar: 'بيعدّ الحواف الصاعدة على CU. الـ Q = CV ≥ PV. الـ R بيصفّر.' } },
    { t: 'CTD', group: 'blocks', key: '', en: 'CTD count down', ar: 'عدّاد {{CTD}}', tip: { en: 'LD loads PV; counts down on rising edges. Q = CV ≤ 0.', ar: 'الـ LD بيحمّل PV؛ بيعدّ تنازليًا. الـ Q = CV ≤ 0.' } },
    { t: 'CTUD', group: 'blocks', key: '', en: 'CTUD up/down', ar: 'عدّاد {{CTUD}}', tip: { en: 'Up on CU edges, down on CD edges.', ar: 'بيزيد على حواف CU وبينقص على حواف CD.' } },
  ];
  const ELMAP = Object.create(null);
  EL.forEach((e) => { ELMAP[e.t] = e; });

  const trunc = (s, n) => { s = String(s === undefined ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const X = (s) => U.esc(s);

  // label shown above the symbol and small text below it
  function labels(el, addrOf) {
    switch (el.t) {
      case 'NO': case 'NC': case 'OUT': case 'SET': case 'RST': case 'POS': case 'NEG':
        return { top: el.a || '?', bottom: el.a ? addrOf(el.a) : '' };
      case 'TON': case 'TOF': case 'TP': case 'TONR': case 'CTU': case 'CTD': case 'CTUD':
        return { top: el.i || '?', bottom: '' };
      default: return { top: '', bottom: '' };
    }
  }

  // inner SVG markup for a cell. `el` null = empty wire cell (only when `wire`)
  function symbolSvg(el, wire) {
    const w = '<path class="w-in" d="M0 40 H%a"/><path class="w-out" d="M%b 40 H84"/>';
    const wires = (a, b) => `<path class="w-in" d="M0 ${WIRE_Y} H${a}"/><path class="w-out" d="M${b} ${WIRE_Y} H${CELL_W}"/>`;
    if (!el) return wire ? `<path class="w-in" d="M0 ${WIRE_Y} H42"/><path class="w-out" d="M42 ${WIRE_Y} H${CELL_W}"/>` : '';
    switch (el.t) {
      case 'NO': return wires(33, 51) + '<path class="sym" d="M33 26 V54 M51 26 V54"/><rect class="sym-fill" x="34.5" y="27" width="15" height="26"/>';
      case 'NC': return wires(33, 51) + '<path class="sym" d="M33 26 V54 M51 26 V54"/><rect class="sym-fill" x="34.5" y="27" width="15" height="26"/><path class="sym" d="M30 55 L54 25"/>';
      case 'POS': case 'NEG': return wires(33, 51) + '<path class="sym" d="M33 26 V54 M51 26 V54"/><rect class="sym-fill" x="34.5" y="27" width="15" height="26"/>' + `<text class="sym-t" x="42" y="45" text-anchor="middle">${el.t === 'POS' ? 'P' : 'N'}</text>`;
      case 'OUT': return wires(30, 54) + '<path class="sym" d="M34 26 Q25 40 34 54 M50 26 Q59 40 50 54"/><ellipse class="sym-fill" cx="42" cy="40" rx="8" ry="12"/>';
      case 'SET': case 'RST': return wires(30, 54) + '<path class="sym" d="M34 26 Q25 40 34 54 M50 26 Q59 40 50 54"/><ellipse class="sym-fill" cx="42" cy="40" rx="8" ry="12"/>' + `<text class="sym-t" x="42" y="45" text-anchor="middle">${el.t === 'SET' ? 'S' : 'R'}</text>`;
      case 'TON': case 'TOF': case 'TP': case 'TONR':
        return wires(6, 78) + '<rect class="sym blk" x="6" y="15" width="72" height="50" rx="3"/>'
          + `<text class="blk-h" x="42" y="29" text-anchor="middle">${el.t}</text>`
          + `<text class="blk-p" x="10" y="43">IN</text><text class="blk-p" x="74" y="43" text-anchor="end">Q</text>`
          + `<text class="blk-p blk-pt" x="42" y="57" text-anchor="middle">PT ${X(trunc(el.pt, 9))}</text>`
          + '<text class="blk-live" x="42" y="12" text-anchor="middle"></text>';
      case 'CTU': case 'CTD': case 'CTUD':
        return wires(6, 78) + '<rect class="sym blk" x="6" y="15" width="72" height="50" rx="3"/>'
          + `<text class="blk-h" x="42" y="29" text-anchor="middle">${el.t}</text>`
          + `<text class="blk-p" x="10" y="43">${el.t === 'CTD' ? 'CD' : 'CU'}</text><text class="blk-p" x="74" y="43" text-anchor="end">Q</text>`
          + `<text class="blk-p blk-pt" x="42" y="57" text-anchor="middle">PV ${X(trunc(el.pv, 6))}${el.rs ? ' R' : el.ld ? ' LD' : ''}</text>`
          + '<text class="blk-live" x="42" y="12" text-anchor="middle"></text>';
      case 'CMP':
        return wires(6, 78) + '<rect class="sym blk" x="6" y="20" width="72" height="42" rx="3"/>'
          + `<text class="blk-p" x="42" y="34" text-anchor="middle">${X(trunc(el.a, 10))}</text>`
          + `<text class="blk-h" x="42" y="47" text-anchor="middle">${X(el.op === '<>' ? '≠' : el.op === '>=' ? '≥' : el.op === '<=' ? '≤' : el.op || '?')}</text>`
          + `<text class="blk-p" x="42" y="59" text-anchor="middle">${X(trunc(el.b, 10))}</text>`;
      case 'MOVE': case 'ADD': case 'SUB':
        return wires(6, 78) + '<rect class="sym blk" x="6" y="15" width="72" height="50" rx="3"/>'
          + `<text class="blk-h" x="42" y="29" text-anchor="middle">${el.t}</text>`
          + (el.t === 'MOVE'
            ? `<text class="blk-p" x="42" y="44" text-anchor="middle">${X(trunc(el.a, 10))}</text><text class="blk-p" x="42" y="58" text-anchor="middle">→ ${X(trunc(el.o, 8))}</text>`
            : `<text class="blk-p" x="42" y="43" text-anchor="middle">${X(trunc(el.a, 5))} ${el.t === 'ADD' ? '+' : '−'} ${X(trunc(el.b, 5))}</text><text class="blk-p" x="42" y="58" text-anchor="middle">→ ${X(trunc(el.o, 8))}</text>`);
      case 'SHL': case 'SHR':
        return wires(6, 78) + '<rect class="sym blk" x="6" y="15" width="72" height="50" rx="3"/>'
          + `<text class="blk-h" x="42" y="29" text-anchor="middle">${el.t}</text>`
          + `<text class="blk-p" x="42" y="44" text-anchor="middle">${X(trunc(el.w, 10))}</text><text class="blk-p" x="42" y="58" text-anchor="middle">in: ${X(trunc(el.b, 7))}</text>`;
    }
    return '';
  }

  // palette icon (smaller, no wire power classes)
  function iconSvg(t) {
    const demo = { NO: { t: 'NO' }, NC: { t: 'NC' }, POS: { t: 'POS' }, NEG: { t: 'NEG' }, OUT: { t: 'OUT' }, SET: { t: 'SET' }, RST: { t: 'RST' } }[t];
    const el = demo || { t, pt: 'T#3s', pv: 5, op: '>=', a: 'A', b: 'B', o: 'O', w: 'W', i: '' };
    return `<svg class="ico" viewBox="0 0 ${CELL_W} ${CELL_H}" width="56" height="45" aria-hidden="true">${symbolSvg(el, false)}</svg>`;
  }

  U.CELL_W = CELL_W; U.CELL_H = CELL_H; U.WIRE_Y = WIRE_Y;
  U.EL = EL; U.ELMAP = ELMAP;
  U.symbolSvg = symbolSvg; U.iconSvg = iconSvg; U.cellLabels = labels;
})();
