/* L04 diagnostics: stop at the filler, release latch cleared by the sensor */
(function () {
  'use strict';
  const D = globalThis.SC.diag;

  // any coil that is a memory bit (not the conveyor itself) or a seal-in on its own contact
  function hasMemory(ctx) {
    return ctx.program.rungs.some((rg, ri) => {
      const els = ctx.rungEls(ri);
      return els.some((x) => (x.e.t === 'OUT' || x.e.t === 'SET') && ctx.roleOf(x.e.a) !== 'actuator') ||
        els.some((x) => x.e.t === 'OUT' && els.some((y) => y.e.t === 'NO' && y.e.a === x.e.a));
    });
  }

  // bottle at the filler at power-up, Release tapped for 0.1 s: the conveyor must run while the bottle is still in the beam
  const RESTOP = {
    id: 'diag-L04-restop', seed: 7, durationMs: 2500, plant: { genOn: false, preload: [{ x: 500 }] },
    events: [{ t: 1000, press: 'Release_PB', ms: 100 }],
    asserts: [{ window: [1020, 1350], always: { Conveyor_Motor: true } }],
  };
  // two bottles arrive one after the other: after the first Release the second one must stop too
  const RUNAWAY = {
    id: 'diag-L04-runaway', seed: 8, durationMs: 7000, plant: { genOn: false, preload: [{ x: 420 }, { x: 300 }] },
    events: [{ t: 2500, press: 'Release_PB', ms: 500 }],
    asserts: [{ when: { PE_Fill: true }, within: 0, tol: 10, expect: { Conveyor_Motor: false } }],
  };
  // bottle already in the beam at the first scan
  const POWERUP = {
    id: 'diag-L04-powerup', seed: 9, durationMs: 700, plant: { genOn: false, preload: [{ x: 500 }] },
    events: [],
    asserts: [{ window: [10, 500], always: { Conveyor_Motor: false } }],
  };

  D.add('release_no_memory', {
    msg: {
      en: 'Release goes straight to the conveyor with no memory, so the belt runs only while the button is pressed. Then the bottle is still in the beam and it stops again. Add a memory bit that remembers "this bottle was released".',
      ar: 'الـ {{Release}} موصول مباشرة بالناقل بدون ذاكرة، فالناقل بيشتغل بس طول ما الزر مضغوط. بعدين القنينة لسا بالشعاع وبتوقف مرة ثانية. زيد بت ذاكرة بيتذكّر إنه هاي القنينة انحرّرت.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.usesTag('Release_PB') && !hasMemory(ctx) && !ctx.probe(RESTOP).pass,
  });

  D.add('restop_same_bottle', {
    msg: {
      en: 'Release clears your stop memory, but PE_Fill sets it again at once, because the same bottle is still in the beam. Remember the release until PE_Fill goes back to 0.',
      ar: 'الـ {{Release}} بيمسح ذاكرة التوقيف، بس {{PE_Fill}} بيرجّعها فورًا لأنه نفس القنينة لسا بالشعاع. تذكّر التحرير لحد ما {{PE_Fill}} يرجع 0.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.usesTag('Release_PB') && hasMemory(ctx) && !ctx.probe(RESTOP).pass,
  });

  D.add('release_latch_not_cleared', {
    msg: {
      en: 'The "released" memory is never cleared. After the first Release it stays ON, so the next bottles do not stop. Let PE_Fill = 0 clear it: put PE_Fill in series with the memory.',
      ar: 'ذاكرة "انحرّرت" ما بتنمسح أبدًا. بعد أول {{Release}} بتضل شغّالة، فالقناني الجاية ما بتوقف. خلّي {{PE_Fill}} = 0 يمسحها: حط {{PE_Fill}} على التوالي مع الذاكرة.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.usesTag('Release_PB') && !ctx.probe(RUNAWAY).pass,
  });

  D.add('powerup_bottle_ignored', {
    msg: {
      en: 'A bottle that is already in the beam at power-up is not stopped. Your stop only works for a bottle that arrives after the beam was clear. PE_Fill = 1 must stop the conveyor, whenever it happens.',
      ar: 'القنينة اللي أصلًا بالشعاع لحظة التشغيل ما بتتوقف. التوقيف تبعك بيشتغل بس لقنينة بتوصل بعد ما كان الشعاع فاضي. {{PE_Fill}} = 1 لازم يوقف الناقل، متى ما صار.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.usesTag('PE_Fill') && !ctx.probe(POWERUP).pass,
  });

  D.add('release_not_used', {
    msg: {
      en: 'Release_PB is never used, so a stopped bottle can never go. The Release button must let the bottle leave.',
      ar: '{{Release_PB}} ما انستخدم أبدًا، فالقنينة الواقفة ما بتقدر تمشي. {{Release}} تبع المشغّل لازم يخلّي القنينة تمشي.',
    },
    test: (ctx) => ctx.usesTag('PE_Fill') && !ctx.usesTag('Release_PB'),
  });
})();
