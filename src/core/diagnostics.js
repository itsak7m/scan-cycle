/* Diagnostics: recognise classic mistakes from the program (and the failing test) and explain them in one line.
 *
 *   SC.diag.add('id', {msg:{en,ar} | (ctx)=>({en,ar}), test:(ctx)=>bool})
 *   Level files in src/core/diag/Lxx.js add their own. level.diagnostics = [ids] picks which ones to check, in order.
 *
 * ctx: {level, program, tags, tagMap, failure, els:[{ri,r,c,e}], ofType(...t), writers(tag), readers(tag), usesTag(tag),
 *       tag(name), probe(scenario)->result, rungEls(ri), compiled}
 */
(function () {
  'use strict';
  const SC = globalThis.SC;

  const reg = Object.create(null);
  const FIELDS = ['a', 'b', 'o', 'w', 'rs', 'ld', 'cd'];

  function add(id, def) { reg[id] = Object.assign({ id }, def); }

  function buildCtx(level, program, tags, failure) {
    const tagMap = SC.addr.makeTagMap(tags);
    const els = [];
    program.rungs.forEach((rg, ri) => (rg.els || []).forEach((e) => els.push({ ri, r: e.r, c: e.c, e })));
    const ctx = {
      level, program, tags, tagMap, failure: failure || null, els,
      compiled: SC.compile(program, { tags, palette: level.palette || null }),
      tag: (n) => tagMap.byName[n] || null,
      ofType: (...ts) => els.filter((x) => ts.indexOf(x.e.t) >= 0),
      writers: (n) => els.filter((x) => ['OUT', 'SET', 'RST'].indexOf(x.e.t) >= 0 && x.e.a === n),
      readers: (n) => els.filter((x) => ['NO', 'NC', 'POS', 'NEG'].indexOf(x.e.t) >= 0 && x.e.a === n),
      usesTag: (n) => els.some((x) => FIELDS.some((f) => x.e[f] === n)),
      rungEls: (ri) => els.filter((x) => x.ri === ri),
      find: (pred) => els.find(pred) || null,
      roleOf: (n) => (tagMap.byName[n] || {}).role,
      probe: (sc) => SC.scenario.runScenario(level, program, sc, { userTags: tags.filter((t) => t.user) }),
    };
    return ctx;
  }

  // compile-error codes that are themselves a classic mistake
  const CODE_TO_ID = { bad_time: 'pt_not_time_literal' };

  function run(level, program, opts) {
    opts = opts || {};
    const tags = opts.tags || SC.mergeTags(SC.levelTags(level));
    const ctx = buildCtx(level, program, tags, opts.failure);
    const out = [];
    const seen = new Set();
    const push = (id, msg) => { if (!seen.has(id)) { seen.add(id); out.push({ id, msg }); } };
    for (const e of ctx.compiled.errors) {
      const id = CODE_TO_ID[e.code];
      if (id && reg[id]) push(id, typeof reg[id].msg === 'function' ? reg[id].msg(ctx) : reg[id].msg);
    }
    const ids = (level.diagnostics || []).concat(GENERIC);
    for (const id of ids) {
      const d = reg[id];
      if (!d || seen.has(id)) continue;
      let hit = false;
      try { hit = !!d.test(ctx); } catch (er) { hit = false; }
      if (hit) push(id, typeof d.msg === 'function' ? d.msg(ctx) : d.msg);
    }
    return out;
  }

  // ---------------------------------------------------------------- generic diagnostics
  const GENERIC = ['nc_on_start', 'nc_on_nc_stop', 'double_coil', 'edge_bit_reused', 'shared_instance', 'pt_not_time_literal', 'add_without_edge'];

  add('nc_on_start', {
    msg: (ctx) => {
      const x = ctx.find((y) => y.e.t === 'NC' && ['start', 'ack', 'reset', 'release'].indexOf(ctx.roleOf(y.e.a)) >= 0);
      const n = x ? x.e.a : 'the button';
      return { en: `You used an NC contact on ${n}. A button that is not pressed has bit 0, and an NC contact passes power when the bit is 0 — so it acts as if the button is pressed all the time.`,
        ar: `استخدمت NC contact على ${n}. الزر وهو مش مضغوط قيمته 0، والـ NC بيمرّر الـ power لما البت 0 — فبيشتغل وكأن الزر مضغوط طول الوقت.` };
    },
    test: (ctx) => !!ctx.find((y) => y.e.t === 'NC' && ['start', 'ack', 'reset', 'release'].indexOf(ctx.roleOf(y.e.a)) >= 0),
  });
  add('nc_on_nc_stop', {
    msg: (ctx) => {
      const x = ctx.find((y) => y.e.t === 'NC' && ['stop', 'estop'].indexOf(ctx.roleOf(y.e.a)) >= 0 && (ctx.tag(y.e.a) || {}).wiring === 'NC');
      const n = x ? x.e.a : 'Stop_PB';
      return { en: `Your Stop contact is NC (-|/|-) but ${n} is wired normally closed. The contact symbol tests the BIT, not the device: the bit is 1 when the button is idle, so use an NO contact.`,
        ar: `الـ contact تبعك NC (-|/|-) بس ${n} موصول NC. رمز الـ contact بيفحص الـ بت مش الجهاز: البت = 1 لما الزر مش مضغوط، فاستخدم NO contact.` };
    },
    test: (ctx) => !!ctx.find((y) => y.e.t === 'NC' && ['stop', 'estop'].indexOf(ctx.roleOf(y.e.a)) >= 0 && (ctx.tag(y.e.a) || {}).wiring === 'NC'),
  });
  add('double_coil', {
    msg: { en: 'Double coil: two coils write the same bit. The last one in the scan wins, so the first one is useless. Use ONE coil and put the conditions in parallel.', ar: 'Double coil: ملفين بيكتبوا على نفس البت. الأخير بالـ scan بيغلب، فالأول ما إله فايدة. استخدم ملف واحد وحط الشروط على التوازي.' },
    test: (ctx) => SC.lint(ctx.program, ctx.tags).some((l) => l.id === 'double_coil'),
  });
  add('edge_bit_reused', {
    msg: { en: 'Two edge contacts share one memory bit. Every edge contact needs its OWN M bit to remember the last state.', ar: 'اتنين edge contacts بيشاركوا نفس بت الذاكرة. كل edge لازم بت M خاص فيه عشان يتذكر الحالة السابقة.' },
    test: (ctx) => SC.lint(ctx.program, ctx.tags).some((l) => l.id === 'edge_bit_reused'),
  });
  add('shared_instance', {
    msg: { en: 'Two blocks use the same instance name, so the second one overwrites the first. Give each timer or counter its own name.', ar: 'بلوكين بنفس اسم الـ instance فالثاني بيمسح الأول. اعطي كل مؤقت أو عدّاد اسمه الخاص.' },
    test: (ctx) => SC.lint(ctx.program, ctx.tags).some((l) => l.id === 'shared_instance'),
  });
  add('pt_not_time_literal', {
    msg: { en: 'The preset time must be a time literal like T#3s. A plain number is not a time.', ar: 'الوقت المحدد لازم يكون بصيغة وقت مثل T#3s. الرقم العادي مش وقت.' },
    test: (ctx) => ctx.compiled.errors.some((e) => e.code === 'bad_time'),
  });
  add('add_without_edge', {
    msg: { en: 'ADD runs on EVERY scan while it has power, so the value jumps by 100 per second. Put a positive-edge contact in front of it.', ar: 'الـ ADD بينفّذ بكل scan طول ما في power، فالقيمة بتزيد 100 بالثانية. حط positive-edge contact قبله.' },
    test: (ctx) => SC.lint(ctx.program, ctx.tags).some((l) => l.id === 'add_without_edge'),
  });

  SC.diag = { add, run, registry: reg, buildCtx, GENERIC };
})();
