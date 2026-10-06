/* L12 diagnostics: PackML states on the stack light. Behavioural: each one runs a tiny extra scenario (ctx.probe). */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');
  const press = (name, t, ms) => ({ t, press: name, ms: ms || 300 });
  const sc = (id, durationMs, events, asserts, plant) => ({ id: 'diag-' + id, seed: 9, durationMs, events, asserts, plant: plant || {} });

  // a bottle that waits ~1 s at the end must not pause the conveyor
  D.add('blocked_no_debounce', {
    msg: { en: 'The conveyor pauses too early. A bottle that only waits a moment at the end of the line is not a blockage. Pause only after PE_Backup was ON for 2 s without a break (TON, 2 s).', ar: plain('الناقل بيوقف بدري. القنينة اللي بتستنى لحظة بس بآخر الخط مش انسداد. أوقف الناقل بس بعد ما {{PE_Backup}} يكون شغّال ثانيتين متواصلتين ({{TON}}، 2 ثانية).') },
    test: (ctx) => !ctx.probe(sc('block-short', 5000, [press('Start_PB', 500), { t: 300, plantSet: { outfeedBlocked: true } }, { t: 2500, plantSet: { outfeedBlocked: false } }], [{ window: [700, 4500], always: { Conveyor_Motor: true } }], { preload: [{ x: 1550 }] })).pass,
  });

  // the blockage is gone: the conveyor must resume by itself
  D.add('blocked_not_resumed', {
    msg: { en: 'The line does not resume after the blockage is gone. Suspended-Blocked is not latched: it lasts only while PE_Backup is ON for 2 s. When PE_Backup drops, the conveyor must run again by itself.', ar: plain('الخط ما رجع اشتغل بعد ما الانسداد راح. {{Suspended-Blocked}} مش مثبّت ({{latched}}): بيضل بس طول ما {{PE_Backup}} شغّال ثانيتين. لما {{PE_Backup}} ينزل، الناقل لازم يرجع يشتغل لحاله.') },
    test: (ctx) => !ctx.probe(sc('block-resume', 9000, [press('Start_PB', 500), { t: 300, plantSet: { outfeedBlocked: true } }, { t: 6000, plantSet: { outfeedBlocked: false } }], [{ t: 7500, expect: { Conveyor_Motor: true }, tol: 700 }], { preload: [{ x: 1700 }] })).pass,
  });

  // air lost: Held = steady amber, stays held after the air returns
  D.add('held_like_suspended', {
    msg: { en: 'Held and Suspended are mixed up. A fault INSIDE the line (air lost) is Held: STEADY amber, conveyor stopped, and it stays held after the air comes back until the operator presses Start. Suspended (flashing amber) is only for things OUTSIDE the line and clears by itself.', ar: plain('{{Held}} و{{Suspended}} متلخبطين. العطل جوّا الخط (ضغط الهواء راح) هو {{Held}}: أصفر ثابت، الناقل واقف، وبيضل محتجز بعد ما يرجع الهواء لحد ما المشغّل يضغط {{Start}}. {{Suspended}} (أصفر وامض) بس للأشياء اللي من برا الخط وبيروح لحاله.') },
    test: (ctx) => !ctx.probe(sc('held', 8000, [press('Start_PB', 500), { t: 2000, fault: 'airLost' }, { t: 4000, clear: 'airLost' }], [{ window: [4200, 7900], always: { Conveyor_Motor: false, Stack_Amber: true } }])).pass,
  });

  // a gap between bottles must not flash the amber light
  D.add('starved_no_debounce', {
    msg: { en: 'The amber light reacts to every gap between two bottles. Starved means NO bottle at the infeed for more than 3 s. Use a TON (3 s) that restarts every time PE_Infeed sees a bottle.', ar: plain('الضوء الأصفر بيتفاعل مع كل فراغ بين قنينتين. {{Starved}} معناه ما في أي قنينة عند المدخل أكتر من 3 ثواني. استخدم {{TON}} (3 ثواني) بيبدأ من جديد كل ما {{PE_Infeed}} يشوف قنينة.') },
    test: (ctx) => !ctx.probe(sc('gaps', 9000, [press('Start_PB', 500)], [{ window: [3000, 8900], always: { Stack_Amber: false } }])).pass,
  });

  // Starved only changes the light; the conveyor keeps running
  D.add('starved_stops_conveyor', {
    msg: { en: 'The conveyor stops when no bottles arrive. Starved only changes the light: the conveyor must keep running (otherwise no bottle can ever arrive). Only Blocked pauses the conveyor.', ar: plain('الناقل بيوقف لما ما في قناني بتوصل. {{Starved}} بيغيّر الضوء بس: الناقل لازم يضل شغّال (غير هيك ما رح توصل ولا قنينة). بس {{Blocked}} بيوقف الناقل.') },
    test: (ctx) => !ctx.probe(sc('starve-run', 10000, [press('Start_PB', 500), { t: 1000, plantSet: { genOn: false } }], [{ window: [6500, 9900], always: { Conveyor_Motor: true } }])).pass,
  });

  D.add('mode_ignored', {
    msg: { en: 'Mode_Auto is never used. The line must run only in Auto mode: in Manual mode (Mode_Auto = 0) it is Stopped (red).', ar: plain('{{Mode_Auto}} ما انستخدم. الخط لازم يشتغل بس بالوضع الأوتوماتيكي: بالوضع اليدوي ({{Mode_Auto}} = 0) هو {{Stopped}} (أحمر).') },
    test: (ctx) => !ctx.usesTag('Mode_Auto'),
  });
})();
