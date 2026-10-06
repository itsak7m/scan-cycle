/* L05 diagnostics: TON fill timer */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const D = SC.diag;

  // one bottle sitting at the filler at power-up: it must get exactly one fill, no overflow
  const SINGLE = {
    id: 'diag-L05-single', seed: 5, durationMs: 9000, plant: { genOn: false, preload: [{ x: 500 }] },
    events: [],
    asserts: [{ window: [0, 9000], never: { overflow: true } }, { t: 8900, expect: { filledCount: { eq: 1 } } }],
  };
  // no bottle at all: the valve must stay closed
  const NOBOTTLE = {
    id: 'diag-L05-nobottle', seed: 6, durationMs: 3000, plant: { genOn: false },
    events: [],
    asserts: [{ window: [0, 3000], always: { Fill_Valve: false } }],
  };

  const timerRungHas = (ctx, tag) => ctx.ofType('TON', 'TP').some((x) => ctx.rungEls(x.ri).some((y) => (y.e.t === 'NO' || y.e.t === 'NC') && y.e.a === tag));

  D.add('timer_fed_by_own_output', {
    msg: {
      en: 'The timer input comes from Fill_Valve, the output the timer itself controls. When the time is up the valve closes, the timer resets and the valve opens again, so the bottle is filled over and over. Feed the timer from PE_Fill (a bottle is present).',
      ar: 'مدخل المؤقّت جاي من {{Fill_Valve}}، المخرج اللي المؤقّت نفسه بيتحكم فيه. لما الوقت يخلص الصمام بيسكّر، المؤقّت بيرجع للصفر والصمام بيفتح من جديد، فالقنينة بتنعبّى مرات ومرات. غذّي المؤقّت من {{PE_Fill}} (في قنينة).',
    },
    test: (ctx) => ctx.compiled.ok && timerRungHas(ctx, 'Fill_Valve') && !ctx.probe(SINGLE).pass,
  });

  D.add('refill_same_bottle', {
    msg: {
      en: 'The timer depends on the conveyor. When the timer finishes, the conveyor starts and resets the timer, so the same bottle is filled again. Keep the timer on PE_Fill only, and use its output Q (a "filled" memory) to close the valve and release the bottle.',
      ar: 'المؤقّت معتمد على الناقل. لما المؤقّت يخلص، الناقل بيشتغل وبيرجّع المؤقّت للصفر، فنفس القنينة بتنعبّى مرة ثانية. خلّي المؤقّت على {{PE_Fill}} بس، واستخدم مخرجه {{Q}} (ذاكرة "انعبّت") عشان تسكّر الصمام وتحرّر القنينة.',
    },
    test: (ctx) => ctx.compiled.ok && timerRungHas(ctx, 'Conveyor_Motor') && !ctx.probe(SINGLE).pass,
  });

  D.add('fill_without_bottle', {
    msg: {
      en: 'The valve opens when no bottle is at the filler. Put PE_Fill (a bottle is present) in series with the valve coil.',
      ar: 'الصمام بيفتح وما في قنينة عند الحشّاء. حط {{PE_Fill}} (في قنينة) على التوالي مع ملف الصمام.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Fill_Valve').length > 0 && !ctx.probe(NOBOTTLE).pass,
  });

  D.add('fill_time_wrong', {
    msg: (ctx) => {
      const x = ctx.ofType('TON').find((y) => { const ms = SC.addr.parseTime(y.e.pt); return ms !== null && Math.abs(ms - 3000) > 60; });
      const ms = x ? SC.addr.parseTime(x.e.pt) : 0;
      const s = (ms / 1000).toFixed(1);
      return {
        en: `The timer preset is ${s} s, but the bottle needs exactly 3.0 s of valve time: 3.0 s gives 90 %, and Level_OK needs 88 %. Too short is an underfill, too long is an overflow.`,
        ar: `الزمن المحدد للمؤقّت ${s} s، بس القنينة بدها 3.0 ثواني بالضبط: 3.0 ثواني بتعطي 90 %، والـ {{Level_OK}} بده 88 %. القصير {{underfill}} والطويل {{overflow}}.`,
      };
    },
    test: (ctx) => ctx.compiled.ok && ctx.ofType('TON').some((y) => { const ms = SC.addr.parseTime(y.e.pt); return ms !== null && Math.abs(ms - 3000) > 60; }) && !ctx.probe(SINGLE).pass,
  });

  // bottle at the filler at power-up: the conveyor must stay OFF during the fill ...
  const HOLD = {
    id: 'diag-L05-hold', seed: 12, durationMs: 3000, plant: { genOn: false, preload: [{ x: 500 }] },
    events: [], asserts: [{ window: [10, 1900], always: { Conveyor_Motor: false } }],
  };
  // ... and run after it (the bottle is released by itself)
  const RELEASE = {
    id: 'diag-L05-release', seed: 13, durationMs: 6000, plant: { genOn: false, preload: [{ x: 500 }] },
    events: [], asserts: [{ t: 4250, expect: { Conveyor_Motor: true }, tol: 1750 }],
  };

  D.add('conveyor_runs_while_filling', {
    msg: {
      en: 'The conveyor does not stop while the bottle is being filled, so the bottle moves away from the nozzle. Stop the conveyor while a bottle is at the filler (PE_Fill = 1) and the fill is running.',
      ar: 'الناقل ما بيوقف طول ما القنينة عم تنعبّى، فالقنينة بتبعد عن الفوهة. وقّف الناقل طول ما في قنينة عند الحشّاء ({{PE_Fill}} = 1) والتعبئة شغّالة.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.usesTag('PE_Fill') && !ctx.probe(HOLD).pass,
  });

  D.add('bottle_not_released', {
    msg: {
      en: 'The bottle is never released after the fill. When the timer is done (its output Q), the conveyor must run by itself: use Q (or a "filled" memory) in the conveyor rung.',
      ar: 'القنينة ما بتنحرّر أبدًا بعد التعبئة. لما المؤقّت يخلص (مخرجه {{Q}})، الناقل لازم يشتغل لحاله: استخدم {{Q}} (أو ذاكرة "انعبّت") بدرجة الناقل.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Conveyor_Motor').length > 0 && ctx.probe(HOLD).pass && !ctx.probe(RELEASE).pass,
  });
})();
