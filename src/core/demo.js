/* Built-in demo program for the sandbox (a working fill cycle). */
(function () {
  'use strict';
  const SC = globalThis.SC;
  SC.demo = {
    lines: [
      '[Start_PB | Run] Stop_PB EStop_OK (Run)',
      'Run PE_Fill /Done (Busy)',
      'Busy TON(DB_Fill,T#3s) (S:Done)',
      '/PE_Fill (R:Done)',
      'Run /Busy (Conveyor_Motor)',
      'Busy (Fill_Valve)',
    ],
    tags: ['Start_PB', 'Stop_PB', 'EStop_OK', 'PE_Fill', 'Conveyor_Motor', 'Fill_Valve'].concat([
      { name: 'Run', addr: 'M0.0', type: 'Bool', user: true }, { name: 'Done', addr: 'M0.1', type: 'Bool', user: true }, { name: 'Busy', addr: 'M0.2', type: 'Bool', user: true },
    ]),
  };
})();
