/* Tiny in-browser test framework. Results are rendered as a table and exposed as JSON for tools/selftest.py. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const suites = [];
  const T = {
    suites,
    suite(name, fn) { suites.push({ name, fn }); },
  };

  function mkCtx(rows, suite) {
    let cur = '';
    const row = (ok, name, detail) => rows.push({ suite, name: name || cur, ok: !!ok, detail: ok ? '' : String(detail || '') });
    const show = (x) => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } };
    return {
      test(name, fn) {
        cur = name;
        try { fn(); } catch (e) { row(false, name, 'threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
      },
      ok(cond, name, detail) { row(cond, name, detail); },
      eq(actual, expected, name) {
        const a = show(actual), b = show(expected);
        row(a === b, name, `expected ${b}, got ${a}`);
      },
    };
  }

  T.runAll = function (only) {
    const t0 = Date.now();
    const rows = [];
    for (const s of suites) {
      if (only && !s.name.includes(only)) continue;
      const ctx = mkCtx(rows, s.name);
      try { s.fn(ctx); } catch (e) { rows.push({ suite: s.name, name: '(suite crashed)', ok: false, detail: String(e && e.stack || e) }); }
    }
    return { rows, ms: Date.now() - t0 };
  };

  T.render = function (res, summary) {
    const bad = res.rows.filter((r) => !r.ok);
    const root = document.getElementById('app');
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let h = `<main class="selftest"><h1>Scan Cycle — self-test</h1>`;
    h += `<p class="${bad.length ? 'st-bad' : 'st-good'}"><b>${res.rows.length - bad.length}/${res.rows.length} passed</b> — ${bad.length} failed — ${res.ms} ms</p>`;
    if (summary) h += `<pre>${esc(summary)}</pre>`;
    h += '<table><thead><tr><th>Result</th><th>Suite</th><th>Test</th><th>Detail</th></tr></thead><tbody>';
    for (const r of res.rows) h += `<tr class="${r.ok ? 'ok' : 'bad'}"><td>${r.ok ? '✔ PASS' : '✖ FAIL'}</td><td>${esc(r.suite)}</td><td>${esc(r.name)}</td><td>${esc(r.detail || '')}</td></tr>`;
    h += '</tbody></table>';
    const json = JSON.stringify({ rows: res.rows, ms: res.ms, summary: summary || '' });
    h += `<pre id="sc-selftest-json" hidden>${esc(json)}</pre></main>`;
    root.innerHTML = h;
  };

  SC.test = T;
})();
