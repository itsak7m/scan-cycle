/* UI strings (EN + AR). Arabic strings may contain {{English terms}} which become <bdi lang="en">. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;

  const S = {
    app: { en: 'Scan Cycle', ar: 'دورة المسح' },
    tagline: { en: 'Write real PLC ladder logic. Run a bottling line. Pass the FAT.', ar: 'اكتب {{ladder logic}} حقيقي، شغّل خط تعبئة، وانجح بفحص {{FAT}}.' },
    map: { en: 'Station map', ar: 'خريطة المحطات' },
    sandbox: { en: 'Sandbox', ar: 'ساحة التجربة' },
    sandboxDesc: { en: 'Every instruction, the whole line. No work order — just play.', ar: 'كل التعليمات وكل الخط. ما في أمر شغل — جرّب براحتك.' },
    back: { en: '← Map', ar: '← الخريطة' },
    workOrder: { en: 'Work order', ar: 'أمر الشغل' },
    datasheet: { en: 'Datasheet', ar: 'ورقة البيانات' },
    hints: { en: 'Hints', ar: 'تلميحات' },
    run: { en: 'Run', ar: 'تشغيل' },
    pause: { en: 'Pause', ar: 'إيقاف مؤقت' },
    step: { en: 'Next scan', ar: 'الـ scan التالي' },
    restart: { en: 'Restart line', ar: 'إعادة تشغيل الخط' },
    speed: { en: 'Speed', ar: 'السرعة' },
    fastWarn: { en: 'Fast-forward can make sensors miss bottles — that is a real scan-time lesson.', ar: 'التسريع ممكن يخلّي الحساسات تفوّت القناني — هاد درس حقيقي عن زمن الـ {{scan}}.' },
    estop: { en: 'E-STOP', ar: 'طوارئ' },
    estopNote: { en: 'Hardwired: the safety relay cuts motor, valve and solenoid power. The PLC only sees EStop_OK.', ar: 'موصول بالأسلاك: رلاي السلامة بيقطع الكهربا عن المحرك والصمامات. الـ {{PLC}} بس بيشوف {{EStop_OK}}.' },
    door: { en: 'Guard door', ar: 'باب الحماية' },
    doorOpen: { en: 'Open', ar: 'مفتوح' },
    doorClosed: { en: 'Closed', ar: 'مغلق' },
    panel: { en: 'Operator panel', ar: 'لوحة المشغّل' },
    hold: { en: 'hold to press', ar: 'اضغط وثبّت' },
    inputs: { en: 'Inputs', ar: 'المداخل' },
    outputs: { en: 'Outputs', ar: 'المخارج' },
    forcesActive: { en: 'FORCES ACTIVE', ar: 'في {{forces}} شغّالة' },
    clearForces: { en: 'Clear all forces', ar: 'امسح كل الـ {{forces}}' },
    forceHint: { en: 'Click an input to force it: auto → 1 → 0 → auto. A level cannot pass while forces are active.', ar: 'اضغط على أي مدخل لعمل {{force}}: تلقائي ← 1 ← 0 ← تلقائي. المستوى ما بينجح والـ {{forces}} شغّالة.' },
    ladder: { en: 'Ladder program', ar: 'برنامج الـ {{Ladder}}' },
    tags: { en: 'Tag table', ar: 'جدول الـ {{Tags}}' },
    runFat: { en: 'Run FAT', ar: 'شغّل فحص {{FAT}}' },
    langBtn: { en: 'عربي', ar: 'English' },
    theme: { en: 'Theme', ar: 'المظهر' },
    transfer: { en: 'Same program in TIA Portal / CODESYS', ar: 'نفس البرنامج بـ {{TIA Portal}} / {{CODESYS}}' },
    soon: { en: 'Coming soon', ar: 'قريبًا' },
    locked: { en: 'Locked', ar: 'مقفل' },
    offlineNote: { en: 'Works offline. Your progress is saved in this browser.', ar: 'بيشتغل بدون إنترنت. تقدمك محفوظ بهاد المتصفح.' },
  };

  U.lang = U.store.get('lang', 'en');
  U.setLang = (l) => { U.lang = l; U.store.set('lang', l); document.documentElement.lang = 'en'; };

  // text node (current language)
  U.t = (key) => {
    const s = S[key];
    if (!s) return key;
    return U.lang === 'ar' ? s.ar : s.en;
  };
  // element: bilingual element with proper lang/dir
  U.tEl = (key, tag) => {
    const s = S[key];
    if (!s) return U.h(tag || 'span', null, key);
    return U.lang === 'ar' ? U.arEl(s.ar, tag) : U.enEl(s.en, tag);
  };
  // both languages stacked (used for work orders)
  U.S = S;
})();
