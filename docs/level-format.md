# Level format

A level is one JSON file, `levels/Lxx.json`. The engine knows no level IDs: everything a level needs is in this file.
`python tools/build.py` embeds all levels in `index.html`; reference and wrong solutions go **only** into `selftest.html`.
Run the checks with `python tools/selftest.py` (add `--only L05` to test one level). It builds into a temp folder, so parallel runs never collide.

## Files per level

| File | What |
|---|---|
| `levels/Lxx.json` | the level |
| `levels/solutions/Lxx.json` | reference solution (hidden test fixture) |
| `levels/wrong/Lxx-<slug>.json` | documented wrong solutions (≥ 3 per level) |
| `src/core/diag/Lxx.js` | diagnostics for the classic mistakes of this level (optional if generic ones are enough) |

## Level JSON

```jsonc
{
  "id": "L05", "order": 5,
  "title": {"en": "Fill Timer", "ar": "مؤقّت التعبئة"},
  "concept": "TON on-delay timer",
  "workOrder": {"en": "≤ 60 words, simple English", "ar": "Arabic; English terms as {{PLC}}"},
  "datasheets": [ {"id":"ton", "title":{"en":"…","ar":"…"}, "rows":[["PT","Preset time, e.g. T#3s"]], "note":{"en":"…","ar":"…"},
                   "timing": {"step":500, "unit":"ms", "signals":[{"name":"IN","wave":"0011110000"},{"name":"Q","wave":"0000111100"}]} } ],
  "palette": ["NO","NC","OUT","TON","BRANCH"],         // instruction ids unlocked; BRANCH = parallel branches
  "tags": ["Start_PB","Stop_PB","PE_Fill","Fill_Valve"],  // master I/O names (src/core/iolist.js); objects add/override tags
  "init": {"MW20": 3000},                              // initial memory values (address -> value)
  "plant": {"stations":["infeed","filler"], "bottlesPerMin":20, "fillSeconds":3.0, "startLevelPct":60},
  "starter": {"lines": ["…"]} | null,                  // program the editor starts with (completion exercises)
  "example": {"mode":"full|completion|none", "lines":["…"], "explain":[{"rung":1,"en":"…","ar":"…"}]},
  "scenarios": [ … see below … ],                      // 3–6 visible FAT scenarios
  "hidden": {"count":5, "seedBase":5000, "base":["S1","S2"], "vary":{ … }},
  "diagnostics": ["nc_on_start","timer_fed_by_own_output"],   // ids registered with SC.diag.add, checked in this order
  "hints": [{"en":"…","ar":"…"},{"en":"…","ar":"…"},{"en":"…","ar":"…","lines":["partial worked rung"]}],
  "glossary": ["timer","on_delay", … 6–14 ids],        // terms shown in this level
  "glossaryDefs": [ {"id":"timer","en":"timer","ar":"مؤقّت","ex":{"en":"The timer counts to 3 seconds.","ar":"…"}} ],  // terms this level INTRODUCES
  "explain": {"frames": [ {"en":"When {input} is ON, {output} turns ON.","ar":"…"} ]},
  "badges": [ {"id":"lean","maxRungs":4}, {"id":"clean","noLint":true} ]
}
```

Rules:
* Work order ≤ 60 English words, simple words, 95 % words already taught or high frequency. Arabic is a real translation.
* Every visible scenario has a `title` `{en,ar}` (shown in the FAT list), 3–6 scenarios per level.
* `glossaryDefs` define each term once for the whole game (first level that defines an id wins). A level lists in `glossary` the terms
  it shows; ids defined by an earlier level need no definition here. Use real IDE / FAT vocabulary.
* Arabic strings: write English terms as `{{term}}`; the UI wraps them in `<bdi lang="en">`.
* Hints: 1 = which test failed / what it checks, 2 = which rung or element to look at, 3 = partial worked rung (`lines`).
  Never give the full solution in a hint.

## Programs as ladder text

Programs in `starter`, `example`, solutions and wrong fixtures can be written as `{"lines": [...]}` — one string per rung:

```
[Start_PB | Run] Stop_PB EStop_OK (Run)      // seal-in: [ branch | branch ], NO contact = tag, NC contact = /tag
Run PE_Fill /Done TON(DB_Fill,T#3s) (S:Done) // blocks: NAME(args). Coils: (tag) (S:tag) (R:tag)
```

| Text | Element |
|---|---|
| `tag` / `/tag` | NO / NC contact |
| `(tag)` `(S:tag)` `(R:tag)` | coil, set, reset |
| `POS(Mx.y)` `NEG(Mx.y)` | edge contact with its own M bit |
| `TON(inst,T#3s)` `TOF` `TP`; `TONR(inst,PT,reset)` | timers |
| `CTU(inst,PV,reset)` `CTD(inst,PV,load)` `CTUD(inst,PV,cd,reset,load)` | counters (power = CU) |
| `CMP(>=,MW10,5)` `MOVE(5,MW10)` `ADD(a,b,out)` `SUB(a,b,out)` `SHL(word,bit)` `SHR(word,bit)` | compare / math / shift |

Groups `[ a b | c ]` are parallel branches (not nested). Names that are not in the level's tag list are auto-declared as
memory bits `M0.0…` (words `MW10…` where an Int is needed) in fixtures — so write `Run`, `Done`, `Filled` freely.
Edge memory bits can be any name too (`POS(Edge1)`).

## Scenario (FAT test)

```jsonc
{ "id":"L05-two-close", "title":{"en":"Two bottles close together","ar":"قنينتين قريبين"}, "seed":1234, "durationMs":60000,
  "plant": {"bottlesPerMin": 40, "preload":[{"x":500}], "badIdx":[2]},     // overrides of the level plant config
  "events": [ {"t":0, "press":"Start_PB", "ms":300},                      // press = set button, release after ms (NC buttons handled)
              {"t":5000, "set":{"Reset_PB":true}},                        // set any panel/process input by tag name or address
              {"t":9000, "estop":true}, {"t":12000, "estop":false}, {"t":3000,"door":"open"},
              {"t":15000, "fault":"peStuckOn", "arg":"PE_Fill"}, {"t":20000, "clear":"peStuckOn", "arg":"PE_Fill"},
              {"t":8000, "plantSet":{"tankPct":4, "speedPct":85, "outfeedBlocked":true, "genOn":false, "spawnBottle":{"x":0}}} ],
  "asserts": [
    {"t":2000, "expect":{"Conveyor_Motor":true}, "tol":20, "msg":{"en":"…","ar":"…"}},   // true at some sample in [t-tol, t+tol]
    {"window":[0,60000], "never":{"overflow":true}},                                      // never / always inside a time window
    {"window":[1000,5000], "always":{"Fill_Valve":false}},
    {"when":{"Stopper_Ext":true}, "within":500, "expect":{"Fill_Valve":true}, "tol":20}, // after every rising edge of `when`
    {"t":60000, "expect":{"filledCount":{"gte":8}}}
  ] }
```

* **Timing.** The sample at time `t` is the scan that reads its inputs at `t`; its outputs are that scan's result.
  Events at time `t` are applied before that scan. Default `tol` is 20 ms (2 scans). Timer outputs: a TON with PT = 3 s whose IN
  becomes true at the scan at `t0` turns Q on at `t0 + 2990 ms`; a TP of PT is high for exactly PT.
* **Keys** in `expect/never/always/when`: tag names, addresses (`Q0.0`), instance fields (`DB_T.ET`, `DB_C.CV`) and plant metrics:
  `out good rejected spills wastedCaps wastedLabels goodLost melted badShipped filledCount spawned overflow
  bottlesPerMin availability performance quality oee`. Values: `true/false/number` or `{gte,gt,lte,lt,eq,ne}`.
  Tags not exposed in the level's `tags` can still be asserted (all master tags are known).
* Always write the `msg` for assertions players will see; if omitted a generic message is generated.
* **Hidden variants** are made from `hidden.base` scenarios (default: all visible ones), cycling, with seed `seedBase+k` and:
  `vary.jitterMs:[lo,hi]` (arrival jitter), `vary.genDelayMs:[lo,hi]`, `vary.bottlesPerMinPct:[lo,hi]`,
  `vary.shiftMs:[lo,hi]` (shifts every event, assert and window by the same amount → different phase against bottle arrival),
  `vary.plant:{key:[loPct,hiPct]}` (multiplies a numeric plant key). Keep variations inside what a correct program tolerates.
* A scenario run is deterministic: same seed → identical result, byte for byte.

## Plant config (`level.plant` / `scenario.plant`)

Defaults live in `src/core/plant.js` (`DEFAULTS`). Units: mm, ms. Main keys:

| key | meaning (default) |
|---|---|
| `stations` | which parts of the line exist: `infeed filler stopper capper sealer labeler reject exit pump tank backup` |
| `bottlesPerMin` `jitterMs` `genDelayMs` `genOn` | bottle generator (24/min, ±200 ms) |
| `speedPct` `v` `convLen` | conveyor speed (150 mm/s), length 1850 mm |
| `x` / `layout` | station positions: `infeed 150, nozzle 500, stopper 530, fillPE 530, level 500, cap 760, capCheck 860, foil 900, seal 1000, label 1180, reject 1320, exit 1700, backup 1760, blockX 1800` |
| `fillSeconds` `target` `okLevel` `capacity` `fillMode` | 3 s of valve = 90 % level; Level_OK ≥ 88 %; overflow at 100 %; `fillMode:"piston"` fills only through the pump |
| `stopperTravelMs` `pusherTravelMs` `pumpTravelMs` | cylinder / pump travel times (400 / 150 / 1500 ms) |
| `encPitch` | encoder pitch in mm (50) |
| `tankPct` `startLevelPct` `tankPerFillPct` | tank level % (80) and drain per filled bottle (0.5) |
| `badIdx` `badFlow` | bottle slots that fill at `badFlow` × normal flow (0.6) |
| `missingCapIdx` `noFoilIdx` `challengeIdx` `missingBottleIdx` `doubleIdx` `fallenIdx` | bottle slot numbers (0,1,2… in generation order) with a defect / a gap / a double |
| `preload` | bottles on the line at t = 0: `[{x:500, level:0, capped:true}]` |

Faults (`fault` / `clear` events): `peStuckOn`, `peStuckOff`, `peMisaligned` (misses 30 % of bottles), `peChatter` (all take `arg` = sensor tag name),
`valveWornSeal` (flow −25 %), `airLow` (cylinders 3× slower), `airLost` (cylinders freeze, `Air_OK` = 0), `capFeederEmpty`, `encoderSlip` (1 pulse in 50 lost).

Hardwired safety: `estop` / `door` events cut motor, valve and solenoid power inside the plant regardless of the ladder;
`EStop_OK` (E-stop chain) or `Door_Closed` (guard door) go to 0 — two separate bits, both open the safety relay. The relay re-closes by itself when the cause is gone — the PLC program must prevent the restart.

## Diagnostics

```js
// src/core/diag/L05.js
(function () {
  const D = globalThis.SC.diag;
  D.add('timer_fed_by_own_output', {
    msg: { en: '…one line…', ar: '…' },            // or (ctx) => ({en, ar})
    test: (ctx) => ctx.ofType('TON').some((x) => ctx.rungEls(x.ri).some((y) => y.e.t === 'NO' && y.e.a === 'Fill_Valve')),
  });
})();
```

`ctx`: `program`, `tags`, `failure` (first failing assertion), `els` (`[{ri,r,c,e}]`), `ofType(...types)`, `writers(tag)`, `readers(tag)`, `usesTag(tag)`,
`rungEls(ri)`, `tag(name)`, `roleOf(name)`, `compiled`, `probe(scenario)` (run an extra scenario against the player's program).
Generic ids always available: `nc_on_start nc_on_nc_stop double_coil edge_bit_reused shared_instance pt_not_time_literal add_without_edge`.
List the ids a level wants checked in `level.diagnostics` (generic ones are checked anyway).

## Fixtures

`levels/solutions/L05.json`: `{"lines":[…]}` (optional `userTags`). `levels/wrong/L05-<slug>.json`:
`{"level":"L05", "diag":"timer_fed_by_own_output", "note":"what is wrong", "lines":[…]}`.
The self-test requires: the reference passes **every** visible and hidden scenario, compiles inside the level palette, has no lint warnings,
and each wrong solution **fails the FAT and is diagnosed with its `diag` id**.
