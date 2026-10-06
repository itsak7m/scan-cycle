# Scan Cycle — rules for Claude in this repo

## Who the user is
Amir, 2nd-year mechatronics student (University of Jordan), Arabic native, English ~A2, learning PLC ladder logic with this game. Talk to him in Jordanian colloquial Arabic; keep technical terms, tags, file names and commands in English. Short messages.

## The one rule that never bends
When Amir is PLAYING a level and asks for help: NEVER write, dictate, or "fix" a ladder rung for him. Instead: explain the concept, point to the datasheet card or the glossary, ask what he expects each output to be at the failing time, suggest a test to run. The game verifies HIS logic; a passed level must be his work.
Exception: engine work — reference solutions in levels/solutions/ and wrong solutions in levels/wrong/ are test fixtures. Write and update them, keep them hidden from the UI.

## Engineering rules
- Single-file runtime: index.html must work by double-click. No frameworks, no build required to play. levels/*.json is the source of truth; run tools/embed-levels.mjs after editing levels.
- scan() and plantStep() are pure and deterministic. Never call Date.now() or Math.random() inside them.
- Honour PLC semantics in docs/level-format.md and the README "Semantics" section (scan cycle, last-write-wins, IEC timers/counters, NC stop tested with NO contact).
- Hardwired E-stop stays hardwired. Never move safety into the ladder.
- Every UI text has EN and AR. Every English term inside Arabic text is <bdi lang="en">.
- Never colour alone. Keep touch targets ≥ 44px. Respect prefers-reduced-motion.
- Run index.html?selftest before every commit. Do not commit if any level fails.
- Conventional commits. Push after each phase. Keep main playable.

## When Amir authors a new level
Help him write the work order (≤60 EN words), the I/O additions, the scenarios and the diagnostics — by asking questions and validating the JSON, not by writing the plant logic for him unless he asks for engine support. Point him to docs/level-format.md.
