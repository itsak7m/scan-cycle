/* L06 diagnostics: pneumatic stopper, reed-switch feedback, air pressure */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const D = SC.diag;

  const NEVER_FILL_BEFORE_EXT = { window: [0, 99999], never: { Fill_Valve: true, Stopper_Ext: false } };
  const NEVER_CONV_IN_TRANSIT = { window: [0, 99999], never: { Conveyor_Motor: true, Stopper_SOL: false, Stopper_Ext: false, Stopper_Ret: false } };
  const preloaded = (id, durationMs, events, asserts) => ({ id, seed: 11, durationMs, plant: { genOn: false, preload: [{ x: 500 }] }, events, asserts });

  // bottle at the filler at power-up, stopper retracted, normal air
  const P_EXT = preloaded('diag-L06-ext', 4000, [], [NEVER_FILL_BEFORE_EXT]);
  const P_RET = preloaded('diag-L06-ret', 9000, [], [NEVER_CONV_IN_TRANSIT]);
  // the same with a slow cylinder (low air)
  const P_SLOW = preloaded('diag-L06-slow', 15000, [{ t: 0, fault: 'airLow' }], [NEVER_FILL_BEFORE_EXT, NEVER_CONV_IN_TRANSIT]);
  // air lost during the fill: valve and conveyor must be OFF
  const P_AIRFILL = preloaded('diag-L06-airfill', 4500, [{ t: 2000, fault: 'airLost' }], [
    { window: [2020, 4500], always: { Fill_Valve: false } }, { window: [2020, 4500], always: { Conveyor_Motor: false } }]);

  const shortTimer = (ctx) => ctx.ofType('TON', 'TP').some((x) => { const ms = SC.addr.parseTime(x.e.pt); return ms !== null && ms <= 2000; });

  D.add('fill_before_extended', {
    msg: {
      en: 'The fill started before Stopper_Ext said the stopper is extended. Put Stopper_Ext (the reed switch) in series with the valve, and with the timer input.',
      ar: 'التعبئة بدأت قبل ما {{Stopper_Ext}} يقول إنه الـ {{stopper}} ممدود. حط {{Stopper_Ext}} (الـ {{reed switch}}) على التوالي مع الصمام ومع مدخل المؤقّت.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Fill_Valve').length > 0 && !ctx.probe(P_EXT).pass,
  });

  D.add('conveyor_before_retracted', {
    msg: {
      en: 'The conveyor started while the stopper was still retracting. After the fill, the conveyor needs Stopper_Ret = 1 (the reed switch says retracted).',
      ar: 'الناقل اشتغل والـ {{stopper}} لسا عم ينسحب. بعد التعبئة، الناقل بده {{Stopper_Ret}} = 1 (الـ {{reed switch}} بيقول مسحوب).',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Conveyor_Motor').length > 0 && !ctx.probe(P_RET).pass,
  });

  D.add('delay_instead_of_feedback', {
    msg: {
      en: 'A fixed delay is used where the reed switch should be. With low air or a longer travel time the cylinder is still moving when your time is up. Wait for Stopper_Ext and Stopper_Ret instead of a timer.',
      ar: 'استخدمت تأخير ثابت مكان الـ {{reed switch}}. لما الهوا منخفض أو زمن الحركة أطول، الأسطوانة لسا بتتحرك لما وقتك يخلص. استنى {{Stopper_Ext}} و{{Stopper_Ret}} بدل المؤقّت.',
    },
    test: (ctx) => ctx.compiled.ok && shortTimer(ctx) && !ctx.probe(P_SLOW).pass,
  });

  D.add('air_not_checked', {
    msg: {
      en: 'Air_OK is never used. When the air pressure is lost, the conveyor and the valve must stop: put Air_OK in series with them.',
      ar: '{{Air_OK}} ما انستخدم أبدًا. لما يروح ضغط الهوا، الناقل والصمام لازم يوقفوا: حط {{Air_OK}} على التوالي معهم.',
    },
    test: (ctx) => !ctx.usesTag('Air_OK') && (ctx.writers('Conveyor_Motor').length > 0 || ctx.writers('Fill_Valve').length > 0),
  });

  D.add('tp_ignores_air_loss', {
    msg: {
      en: 'A TP pulse keeps running when its input drops, so the valve stayed open after the air was lost. Put an Air_OK contact AFTER the TP block, in front of the valve coil.',
      ar: 'نبضة الـ {{TP}} بتضل شغّالة لما مدخلها ينطفي، فالصمام ضل مفتوح بعد ما راح الهوا. حط {{Air_OK}} بعد بلوك الـ {{TP}}، قبل ملف الصمام.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.ofType('TP').length > 0 && ctx.usesTag('Air_OK') && !ctx.probe(P_AIRFILL).pass,
  });

  D.add('valve_ignores_air', {
    msg: {
      en: 'The fill valve stayed open after the air was lost. "Hold everything" includes the valve: put Air_OK in series with the valve and with the timer input.',
      ar: 'صمام التعبئة ضل مفتوح بعد ما راح الهوا. "وقّف كل شي" يعني الصمام كمان: حط {{Air_OK}} على التوالي مع الصمام ومع مدخل المؤقّت.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.ofType('TP').length === 0 && ctx.usesTag('Air_OK') && ctx.writers('Fill_Valve').length > 0 && !ctx.probe(P_AIRFILL).pass,
  });

  // one bottle at power-up: exactly one fill, no overflow (a timer that restarts when the stopper moves refills the bottle)
  const P_ONCE = preloaded('diag-L06-once', 9000, [], [{ window: [0, 9000], never: { overflow: true } }]);
  // the fill is done: the stopper must retract (Stopper_Ret = 1)
  const P_RETRACT = preloaded('diag-L06-retract', 9000, [], [{ when: { Fill_Valve: true }, within: 6000, tol: 0, expect: { Stopper_Ret: true } }]);
  // a bottle is on its way and the filler is empty: the conveyor must run to bring it
  const P_BRING = { id: 'diag-L06-bring', seed: 14, durationMs: 700, plant: { genOn: false, preload: [{ x: 150 }] }, events: [], asserts: [{ window: [10, 500], always: { Conveyor_Motor: true } }] };

  D.add('fill_restarts_when_stopper_moves', {
    msg: {
      en: 'The timer input includes Stopper_Ext. When the stopper starts to retract, Stopper_Ext drops, the timer resets and the valve opens again: the bottle is filled twice. Keep a "filled" memory that stays ON until the bottle has left (PE_Fill = 0).',
      ar: 'مدخل المؤقّت فيه {{Stopper_Ext}}. لما الـ {{stopper}} يبدأ ينسحب، {{Stopper_Ext}} بينزل، المؤقّت بيرجع للصفر والصمام بيفتح من جديد: القنينة بتنعبّى مرتين. استخدم ذاكرة "انعبّت" بتضل شغّالة لحد ما القنينة تروح ({{PE_Fill}} = 0).',
    },
    test: (ctx) => ctx.compiled.ok && ctx.ofType('TON', 'TP').some((x) => ctx.rungEls(x.ri).some((y) => y.e.t === 'NO' && y.e.a === 'Stopper_Ext')) && !ctx.probe(P_ONCE).pass,
  });

  D.add('stopper_not_retracted', {
    msg: {
      en: 'The stopper never retracts after the fill, so the bottle cannot leave. Stopper_SOL must go OFF when the fill is done.',
      ar: 'الـ {{stopper}} ما بينسحب أبدًا بعد التعبئة، فالقنينة ما بتقدر تمشي. {{Stopper_SOL}} لازم ينطفي لما تخلص التعبئة.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Stopper_SOL').length > 0 && ctx.probe(P_ONCE).pass && !ctx.probe(P_RETRACT).pass,
  });

  D.add('conveyor_blocked_when_empty', {
    msg: {
      en: 'The conveyor does not run to bring the next bottle. When the filler is empty (PE_Fill = 0) the conveyor runs. Stopper_Ret is needed only AFTER the fill, to release the bottle.',
      ar: 'الناقل ما بيشتغل عشان يجيب القنينة الجاية. لما الحشّاء فاضية ({{PE_Fill}} = 0) الناقل بيشتغل. {{Stopper_Ret}} بس لازم بعد التعبئة، عشان تتحرّر القنينة.',
    },
    test: (ctx) => ctx.compiled.ok && ctx.writers('Conveyor_Motor').length > 0 && !ctx.probe(P_BRING).pass,
  });
})();
