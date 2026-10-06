/* Built-in demo program for the sandbox (a working fill cycle). */
(function () {
  'use strict';
  const SC = globalThis.SC;
  SC.demo = {
    lines: [
      { t: '[Start_PB | Run] Stop_PB EStop_OK (Run)', note: 'Line run latch (seal-in). Stop is wired NC, so it is an NO contact.' },
      { t: 'Run PE_Fill /Done (Busy)', note: 'A bottle is at the filler and not filled yet.' },
      { t: 'Busy TON(DB_Fill,T#3s) (S:Done)', note: 'Fill for exactly 3.0 s, then remember "filled".' },
      { t: '/PE_Fill (R:Done)', note: 'Forget it when the bottle has left the beam.' },
      { t: 'Run /Busy (Conveyor_Motor)', note: 'The conveyor runs unless a bottle is being filled.' },
      { t: 'Busy (Fill_Valve)', note: 'Open the valve while filling.' },
    ],
    // lines may be strings or {t, note}
    tags: ['Start_PB', 'Stop_PB', 'EStop_OK', 'PE_Fill', 'Conveyor_Motor', 'Fill_Valve'].concat([
      { name: 'Run', addr: 'M0.0', type: 'Bool', user: true }, { name: 'Done', addr: 'M0.1', type: 'Bool', user: true }, { name: 'Busy', addr: 'M0.2', type: 'Bool', user: true },
    ]),
  };
})();
