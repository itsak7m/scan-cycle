/* L11 diagnostics: latched alarms, Ack, flashing lamp, debounce, priority.
 * They are behavioural: each one runs a tiny extra scenario against the player's program (ctx.probe). */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');
  const ack = (t) => ({ t, set: { Ack_PB: true } });
  const ackEnd = (t) => ({ t, set: { Ack_PB: false } });
  const sc = (id, durationMs, events, asserts) => ({ id: 'diag-' + id, seed: 7, durationMs, events, asserts });

  // the alarm comes and goes, nobody presses Ack: the horn must still be ON afterwards
  D.add('alarm_not_latched', {
    msg: { en: 'The alarm disappears when the input goes OFF. An alarm must LATCH (SET or seal-in): it stays until it is acknowledged, even if the cause is already gone.', ar: plain('الإنذار بيختفي لما المدخل ينطفي. الإنذار لازم يتثبّت ({{latch}}) بـ SET أو seal-in: بيضل لحد ما ينعمله {{Ack}}، حتى لو السبب راح.') },
    test: (ctx) => !ctx.probe(sc('latched', 4000, [{ t: 500, plantSet: { tankPct: 4 } }, { t: 1000, plantSet: { tankPct: 50 } }], [{ window: [1100, 3900], always: { Horn: true } }])).pass,
  });

  // Ack while the alarm is still active: the horn must go OFF
  D.add('horn_not_silenced', {
    msg: { en: 'Ack does not silence the horn while the alarm is still active. Ack means "I saw it": the horn stops at once, and the lamp turns steady while the alarm is active.', ar: plain('{{Ack}} ما بيسكّت البوق والإنذار لسا موجود. {{Ack}} معناه "شفته": البوق بيوقف فورًا، والمصباح بيصير ثابت طول ما الإنذار موجود.') },
    test: (ctx) => !ctx.probe(sc('silence', 5000, [{ t: 500, plantSet: { tankPct: 4 } }, ack(2000), ackEnd(2300)], [{ window: [2100, 4900], always: { Horn: false } }])).pass,
  });

  // the lamp must flash while the alarm is not acknowledged
  D.add('lamp_never_flashes', {
    msg: { en: 'The lamp does not flash. A new, unacknowledged alarm must FLASH the lamp (steady means "acknowledged"). Build a flasher with two timers: each one starts the other.', ar: plain('المصباح ما بيومض. الإنذار الجديد اللي ما انعمله {{Ack}} لازم يخلّي المصباح يومض (الثابت معناه "تم الإقرار"). ابنِ {{flasher}} بمؤقّتين: كل واحد بيشغّل التاني.') },
    test: (ctx) => !ctx.probe(sc('flash', 5000, [{ t: 500, plantSet: { tankPct: 4 } }], [{ t: 3000, expect: { Alarm_Lamp: true }, tol: 1500 }, { t: 3000, expect: { Alarm_Lamp: false }, tol: 1500 }])).pass,
  });

  // LSL only: filling must go on
  D.add('lsl_stops_fill', {
    msg: { en: 'LSL (low level) only WARNS. Your program stops filling when LSL is ON. Only LSLL (low-low level) may stop the filler.', ar: plain('{{LSL}} (مستوى منخفض) تحذير بس. برنامجك بيوقف التعبئة لما {{LSL}} شغّال. بس {{LSLL}} (مستوى منخفض جدًا) من حقه يوقف الحشّاء.') },
    test: (ctx) => !ctx.probe(sc('lsl', 4000, [{ t: 500, plantSet: { tankPct: 12 } }], [{ window: [600, 3900], always: { Fill_Valve: true } }])).pass,
  });

  // a 2 s blockage, or a chattering eye, must not raise the jam alarm
  D.add('jam_no_debounce', {
    msg: { en: 'A jam alarm comes too early. A bottle that only passes the back-up eye, or a chattering eye, is not a jam. Wait with a TON timer (5 s) that restarts every time PE_Backup drops.', ar: plain('إنذار الانحشار بيجي بدري. القنينة اللي بتمرّ بس من عين التراكم، أو العين المرتعشة، مش انحشار. استنى بمؤقّت {{TON}} (5 ثواني) بيبدأ من جديد كل ما {{PE_Backup}} ينزل.') },
    test: (ctx) => !ctx.probe(sc('jam2s', 5000, [{ t: 500, fault: 'peStuckOn', arg: 'PE_Backup' }, { t: 2500, clear: 'peStuckOn', arg: 'PE_Backup' }], [{ window: [0, 4900], always: { Horn: false } }])).pass
      || !ctx.probe(sc('chatter', 7000, [{ t: 500, fault: 'peChatter', arg: 'PE_Backup' }], [{ window: [0, 6900], always: { Horn: false } }])).pass,
  });

  // LSL acknowledged, then LSLL comes: the horn must sound again (each alarm has its own Ack state)
  D.add('alarm_not_new_after_ack', {
    msg: { en: 'A new alarm does not sound the horn when an older alarm was already acknowledged. Every alarm needs its own "new" event: use a rising edge (-|P|-) on EACH alarm to set the not-acknowledged bit again.', ar: plain('إنذار جديد ما شغّل البوق لأنه إنذار أقدم كان انعمله {{Ack}}. كل إنذار بده حدثه "الجديد": استخدم {{rising edge}} (-|P|-) على كل إنذار لتشغّل بت (لسا ما انعمل {{Ack}}) من جديد.') },
    test: (ctx) => !ctx.probe(sc('escalate', 6000, [{ t: 500, plantSet: { tankPct: 12 } }, ack(1500), ackEnd(1800), { t: 3000, plantSet: { tankPct: 4 } }], [{ t: 3000, expect: { Horn: true }, tol: 50 }])).pass,
  });
})();
