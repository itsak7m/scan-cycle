/* Helpers for hidden fixtures (reference + wrong solutions) and for any program written as ladder text:
 * unknown names are auto-declared as memory bits / words so authors can write  "[Start | Run] /Stop (Run)"  directly.
 *
 * fixture: {lines:[...]} | program JSON, plus optional {userTags:[{name,addr,type}], level, diag, note}
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const A = SC.addr;

  const BIT_FIELDS = { NO: ['a'], NC: ['a'], OUT: ['a'], SET: ['a'], RST: ['a'], POS: ['a'], NEG: ['a'], TONR: ['rs'], CTU: ['rs'], CTD: ['ld'], CTUD: ['rs', 'ld', 'cd'], SHL: ['b'], SHR: ['b'] };
  const INT_FIELDS = { CMP: ['a', 'b'], MOVE: ['a', 'o'], ADD: ['a', 'b', 'o'], SUB: ['a', 'b', 'o'], CTU: ['pv'], CTD: ['pv'], CTUD: ['pv'], SHL: ['w'], SHR: ['w'] };

  function kindOf(el, tok) {
    if ((INT_FIELDS[el.t] || []).some((f) => el[f] === tok)) return 'word';
    return 'bit';
  }

  // returns the extra user tags needed so that `program` compiles (names -> M bits / MW words)
  function autoTags(program, level, given) {
    let tags = SC.mergeTags(SC.levelTags(level), given || []);
    const made = [];
    for (let pass = 0; pass < 4; pass++) {
      const c = SC.compile(program, { tags, palette: null });
      const unk = c.errors.filter((e) => e.code === 'unknown_tag' && e.tok);
      if (!unk.length) break;
      let progress = false;
      for (const e of unk) {
        const rg = program.rungs[e.rung];
        const el = rg && rg.els.find((x) => x.r === e.r && x.c === e.c);
        if (!el || tags.some((t) => t.name === e.tok)) continue;
        const kind = kindOf(el, e.tok);
        const addr = A.nextFreeAddr(tags, kind);
        if (!addr) continue;
        const t = { name: e.tok, addr, type: kind === 'bit' ? 'Bool' : 'Int', user: true, src: 'mem' };
        tags = tags.concat([t]); made.push(t); progress = true;
      }
      if (!progress) break;
    }
    return made;
  }

  function prepare(level, fx) {
    const program = SC.dsl.programFrom(fx);
    const userTags = (fx.userTags || []).slice();
    return { program, userTags: userTags.concat(autoTags(program, level, userTags)) };
  }

  // run a level's scenarios against a fixture; returns {pass, run, program, userTags}
  function evaluate(level, fx, opts) {
    opts = opts || {};
    const p = prepare(level, fx);
    const lv = Object.assign({}, level, { tags: (level.tags || []).concat(p.userTags) });
    const run = SC.scenario.runLevel(lv, p.program, { skipHidden: opts.skipHidden, stopAtFirst: opts.stopAtFirst !== false, userTags: p.userTags });
    return { pass: run.pass, run, program: p.program, userTags: p.userTags, level: lv };
  }

  SC.fixtures = { prepare, evaluate, autoTags };
})();
