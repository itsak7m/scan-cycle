# Scan Cycle — case study

## The idea in one paragraph

Learn PLC ladder logic by *testing* it. Scan Cycle simulates a small oral-syrup bottling line with a deterministic 10 ms scan cycle and grades the player's program with FAT-style scenarios:
nominal, edge cases, fault injection, E-stop in the middle of a cycle, timing tolerances and hidden randomized variants. A failure never says only "wrong": it shows the first failing
assertion, an I/O timeline and the rungs that were active at that scan.

## Design decisions (and why)

| Decision | Why |
|---|---|
| **Deterministic engine** (`scan()` and the plant step are pure functions of state + a seeded PRNG) | A failing test can be replayed to the millisecond, and the same code is the game, the grader and the test suite. |
| **Hidden randomized variants** | A program that only fits the visible tests fails the hidden ones — it forces general logic, like a real FAT. |
| **Hardwired E-stop** in the plant | Real safety is not in the PLC program. The game grades the *PLC's* response: stop its outputs within one scan, never restart by itself. |
| **Diagnostics for classic mistakes** | "NC contact on an NC-wired stop", "double coil", "timer fed by its own output" are explained in one line with the cause. |
| **Static, authored hints and no AI inside the game** | A passing badge must mean *the player's* logic passed. |
| **Single file, vanilla JS, works offline** | Opens from `file://` and GitHub Pages; nothing to install. |
| **Bilingual by design** | Every technical term is tappable with an Arabic gloss; a Leitner schedule re-tests terms. No streaks, no daily rewards, nothing decays. |

## Architecture

```
src/core   engine: addresses, ladder text DSL, compiler, blocks, scan, lint, plant, sim, scenario runner, diagnostics (no DOM)
src/ui     editor, plant view (canvas), report, glossary, share links, app shell
levels/    one JSON per level (+ hidden solutions/ and wrong/ fixtures used only by the self-test)
tools/     build.py (inlines everything into index.html), selftest.py (headless Chrome), gen_docs.py
```

The self-test (`python tools/selftest.py`) runs: instruction timing diagrams, plant model, editor model, share links, and for every level: reference solution vs all visible + hidden
scenarios, and every documented wrong solution must fail *and* be diagnosed correctly.

## Six-post LinkedIn series (plan)

1. **Text + image:** why a game (no PLC hardware, I wanted my logic tested, not demoed). Screenshot of the line.
2. **PDF carousel:** the I/O list of the line (tags, addresses, NC/NO wiring) — one slide per station.
3. **45 s video:** the first full cycle — start, fill, stopper, reject, count.
4. **The bug and the fix:** the first failing test, the I/O timeline, the one-line diagnosis.
5. **Test scenarios:** the test table, including fault injection and **E-stop mid-fill**.
6. **Lessons + AI note + next steps:** what I learned, how AI helped (honestly), what I will build next (CODESYS soft-PLC).

## First post — draft (A2 English, no link in the post; the link lives in the Featured section)

> Edit this after you finish level 2 so every sentence is true.

```
I am a 2nd-year mechatronics student. I could not get real PLC hardware.
So I am building a small game: a bottle-filling line that runs on MY ladder logic.
The game checks my program with test scenarios — like a FAT.
Level 2 taught me why a Stop button is wired normally closed.
Next: timers and a pneumatic stopper.
What was the first PLC mistake you made?
بلّشت أتعلم PLC بطريقتي — لعبة بتفحص منطقي بدل ما أتفرج على فيديوهات.
```

## Screenshots and GIF

* `docs/screenshots/map.png`, `level.png`, `report.png`, `l02.png`, `l03.png` are generated with headless Chrome (see `tools/` history) — re-take them after UI changes.
* For the GIF in the README: record the browser (Windows: *Xbox Game Bar* `Win+G`, or ScreenToGif), open `?level=L02&fat=1`, trim to 10–15 s, save as `docs/screenshots/play.gif`.

## What I would do next

* Re-implement levels 2, 3 and 5 in CODESYS and compare the behaviour with a soft-PLC.
* Add levels L15+ authored by the student (the level format is documented in `docs/level-format.md`).
* A teacher mode: share a level + hidden tests as a link.
