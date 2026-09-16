# Flappy QA Demo — Test Automation & Telemetry Lab

[![QA Automation](https://github.com/markoj612/flappy-qa-demo/actions/workflows/pytest.yml/badge.svg)](https://github.com/markoj612/flappy-qa-demo/actions/workflows/pytest.yml)

An interactive portfolio project that treats a Flappy Bird clone as a **system under test**. Three software builds of the same game ship side by side; one of them contains a deliberate collision regression. A build-agnostic QA layer — independent test oracle, live assertion monitor, headless assertion suite and a Jira-style bug generator — catches the regression in real time, and a Python + Playwright suite (Page Object Model) verifies the whole thing in CI.

> Live demo: `https://markoj612.github.io/flappy-qa-demo/` (deployed automatically from `main` after the test job passes)

---

## What it demonstrates

| QA principle | Where it lives |
| --- | --- |
| **Independent test oracle** — the SUT never grades itself | `js/qa/oracle.js` re-implements collision & scoring rules outside the engine |
| **Regression matrix across builds** | `js/config.js` build definitions · `tests/test_collision_builds.py` parametrised over all builds |
| **Deterministic, hermetic tests** | Seeded PRNG in the engine, `QA.stepFrames()` advances simulated time instantly, local static server fixture |
| **Live monitoring + headless unit-style runs** | `js/qa/assertions.js` does both from the same four assertions |
| **Actionable defect reports** | `js/qa/bugReporter.js` files `QA-BUG-104/105…` with severity, evidence, telemetry, expected/actual, repro steps, dedupe & lifecycle (OPEN → RESOLVED "verified in v1.2.0") |
| **Page Object Model** | `tests/pages/game_page.py` — all selectors in one place, tests read like specs |
| **App-side automation API** | `js/qa/testHooks.js` exposes `window.QA` so UI refactors don't break tests |
| **Fail-fast quality gates** | Autouse fixture fails any test that produces an uncaught JS error |
| **CI/CD** | `.github/workflows/pytest.yml` runs the suite on every push/PR, uploads HTML report + failure screenshots/videos, then deploys to GitHub Pages |

---

## The three builds

| Build | Behaviour | Assertion suite |
| --- | --- | --- |
| **v1.0.0 — Legacy Stable** | Straightforward AABB collision for pipes, ground, ceiling | 4 / 4 PASS |
| **v1.1.0 — Regression Bug** | "Optimised" refactor: the narrow-phase helper now returns a collision *type* (string) but the caller still compares to `=== true`. Pipe & ground hits are silently swallowed; only the inline ceiling check survives | Ceiling PASS · **Ground FAIL** · **Pipe FAIL** · Score PASS |
| **v1.2.0 — Hotfix** | Contract fixed, broad-phase X-axis culling added | 4 / 4 PASS |

Switching to **v1.1.0** and flying into a pipe files ticket **`QA-BUG-104 · HIGH / BLOCKER`** — *"Collision detection failed - Bird bounding box intersected Pipe Object without entering GAME_OVER state."* with `Expected: GAME_OVER | Actual: PLAYING`. Switching to v1.2.0 re-runs the suite and transitions the ticket to **RESOLVED — verified in v1.2.0**.

---

## Features

- **Canvas game engine** — fixed 60 Hz timestep with accumulator, gravity / jump velocity / terminal velocity, random gap heights from a seeded PRNG, Space / click / tap controls, keyboard shortcuts (`H` hitboxes, `B` bot, `R` run suite).
- **Build switcher** — segmented control in the header; also selectable via `?build=v1.1.0&seed=42`.
- **Real-time telemetry** — state badge (`READY | PLAYING | GAME_OVER`), bird X/Y, Y-velocity, distance to next pipe, score, frame, FPS, last collision, oracle overlap, event log.
- **Debug overlay** — red AABB hitboxes for bird & pipes, green dashed gap guide, ground/ceiling lines, distance ruler; bird box fills red on overlap.
- **Auto-play bot** — predictive controller (look-ahead under gravity, gap-top clearance check). Survives indefinitely in stable builds; used for soak tests.
- **Assertion suite** — Ceiling Boundary · Ground Collision · Pipe Obstacle Collision · Score Increment Logic, each PASS / FAIL / PENDING with detail text. Headless run auto-executes on boot and on every build switch.
- **Jira bug panel** — live cards, occurrence counter, tab badge, JSON export, clear.
- **Responsive** — desktop: canvas left, dashboard right. `< 768px`: canvas fixed at top, dashboard collapses into `📊 Telemetry | ✅ Assertions | 🐛 Jira Bugs` tabs. No horizontal scroll (asserted in the suite).
- **Theme** — `#0f172a` slate, glassmorphism panels, cyan `#06b6d4` accents, green `#22c55e` PASS, red `#ef4444` FAIL / BUG.

---

## Repository layout

```
flappy-qa-bench/
├── index.html                  # App shell (semantic, ARIA roles for tabs)
├── css/styles.css              # Theme, layout, mobile breakpoints
├── js/
│   ├── config.js               # Physics constants + build matrix
│   ├── engine.js               # Game engine (SUT) — pure, DOM-free, deterministic
│   ├── bot.js                  # Auto-play controller
│   ├── renderer.js             # Canvas drawing + debug overlay
│   ├── ui.js                   # DOM bindings for the dashboard
│   ├── main.js                 # Composition root, game loop, input
│   └── qa/
│       ├── oracle.js           # Independent collision & score oracle
│       ├── assertions.js       # Live monitor + headless suite
│       ├── bugReporter.js      # Jira-style ticket generator
│       └── testHooks.js        # window.QA automation API
├── tests/
│   ├── conftest.py             # Local server fixture, mobile context, JS-error guard
│   ├── pages/game_page.py      # Page Object Model
│   ├── test_smoke.py
│   ├── test_collision_builds.py
│   ├── test_bug_reporter.py
│   ├── test_telemetry_and_bot.py
│   └── test_mobile_layout.py
├── .github/workflows/pytest.yml
├── pytest.ini
└── requirements.txt
```

All game modules are plain scripts (no bundler) so the site runs straight from GitHub Pages **and** from `file://`; every module also exports via CommonJS so it can be unit-tested in Node.

---

## Running locally

```bash
# Serve the app (any static server works)
python -m http.server 8000
# → http://localhost:8000

# Run the automation suite (spins up its own server)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install --with-deps chromium
pytest                                  # 36 tests, ~40 s
pytest -m regression                    # just the cross-build matrix
pytest --headed --slowmo 200            # watch it drive the browser
BASE_URL=https://<user>.github.io/flappy-qa-bench/ pytest   # against production
```

Headless engine checks without a browser:

```bash
node -e "
const {FlappyEngine}=require('./js/engine.js');
const e=new FlappyEngine({buildId:'v1.1.0',seed:42}); e.start();
for(let i=0;i<300;i++) e.step();
console.log(e.state, e.lastCollision, e.bird.y);   // PLAYING NONE 472 ← the bug"
```

---

## `window.QA` automation API

```js
QA.getState()             // telemetry snapshot (state, bird, score, frame, lastCollision, …)
QA.getAssertions()        // [{id, name, status, detail, source}]
QA.getBugs()              // Jira tickets
QA.setBuild('v1.1.0')     // switch build (auto-runs the suite)
QA.setSeed(42)            // deterministic pipe layout
QA.start() / QA.flap() / QA.restart()
QA.toggleBot(true) / QA.toggleHitboxes(true)
QA.runSuite()             // headless assertion run → report
QA.pause() / QA.resume()  // freeze the rAF loop
QA.stepFrames(600)        // advance 10 s of simulated time synchronously
QA.forceCollision('pipe' | 'ground' | 'ceiling')   // arrange + step once, returns snapshot
```

---

## Test strategy notes

- **Real-time vs simulated time.** A few tests (ground fall, bot start) deliberately run in wall-clock time to prove the rAF loop works. Everything else pauses the loop and steps frames synchronously, which keeps the suite fast and flake-free.
- **Expected failures are explicit.** The v1.1.0 expectations are encoded in `EXPECTED_SUITE`; the CI job is green when the regression build behaves as documented, and red if a stable build regresses *or* the bug build gets silently fixed.
- **Mobile is tested with a real touch context** (`is_mobile`, `has_touch`, 390×844), including a tap-to-flap and a "no horizontal overflow" assertion.
