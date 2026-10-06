/* Boot. ?selftest (or selftest.html) runs the in-browser test suites. */
(function () {
  'use strict';
  const SC = globalThis.SC;

  function boot() {
    const q = new URLSearchParams(location.search);
    const auto = document.body.getAttribute('data-autotest') === '1';
    if (q.has('selftest') || auto) {
      const only = q.get('only') || '';
      const res = SC.test.runAll(only);
      let summary = '';
      if (SC.test.summary) summary = SC.test.summary();
      SC.test.render(res, summary);
      return;
    }
    if (SC.ui && SC.ui.start) { SC.ui.start(); return; }
    document.getElementById('app').innerHTML = '<main class="stub"><h1>Scan Cycle</h1><p>Engine loaded. Game UI coming soon — open <code>?selftest</code> to run the tests.</p></main>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
