/**
 * main.js — Application orchestrator
 * ----------------------------------
 * Wires engine ⇄ QA layer ⇄ UI, runs the fixed-timestep game loop, and handles
 * input (keyboard / mouse / touch). Exposes the composed app as
 * `window.FlappyApp` for the test hooks.
 */
(function (global) {
  'use strict';

  const { PHYSICS: P, BUILDS, BUILD_ORDER } = global.FlappyConfig;
  const { FlappyEngine } = global.FlappyEngineModule;
  const { AutoPlayBot } = global.FlappyBotModule;
  const { Renderer } = global.FlappyRenderer;
  const { AssertionSuite } = global.FlappyAssertionsModule;
  const { BugReporter } = global.FlappyBugReporterModule;
  const UI = global.FlappyUI;

  const params = new URLSearchParams(location.search);
  const initialBuild = BUILDS[params.get('build')] ? params.get('build') : 'v1.0.0';
  const initialSeed = Number(params.get('seed')) || 1337;

  /* ---------------------------- Composition ---------------------------- */
  const engine = new FlappyEngine({ buildId: initialBuild, seed: initialSeed });
  const bot = new AutoPlayBot(engine);
  const canvas = document.getElementById('gameCanvas');
  const renderer = new Renderer(canvas);
  const suite = new AssertionSuite();
  const bugs = new BugReporter();
  suite.attach(engine);
  bugs.attach(suite);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  let lastOracle = null;
  let paused = false;

  /* ---------------------------- Event wiring ---------------------------- */
  engine.on('state', ({ state, prev }) => {
    UI.setState(state);
    if (prev) UI.log('state', `state ${prev} → ${state}`);
  });
  engine.on('collision', ({ type }) => UI.log('collision', `collision ${type} → GAME_OVER (frame ${engine.frame})`));
  engine.on('score', ({ score, pipeId }) => UI.log('score', `score ${score} (passed pipe#${pipeId})`));
  engine.on('build', ({ buildId }) => {
    UI.setBuild(buildId);
    UI.log('build', `switched to ${buildId} — ${BUILDS[buildId].subtitle}`);
  });

  suite.on('update', results => UI.renderAssertions(results));
  suite.on('suite', report => {
    UI.renderSuiteSummary(report);
    UI.log('suite', `suite ${report.build}: ${report.passed} pass / ${report.failed} fail`);
  });
  suite.on('violation', v => {
    UI.log('violation', `VIOLATION ${v.rule.toUpperCase()}: expected ${v.expected}, actual ${v.actual} (frame ${v.snapshot.frame})`);
  });

  const refreshBugs = () => UI.renderBugs(bugs.list());
  bugs.on('created', t => { refreshBugs(); UI.log('violation', `ticket ${t.id} filed (${t.severity})`); });
  bugs.on('updated', refreshBugs);
  bugs.on('cleared', refreshBugs);

  /* ---------------------------- Actions ---------------------------- */
  const app = {
    engine, bot, renderer, suite, bugs,

    setBuild(buildId) {
      if (!BUILDS[buildId] || buildId === engine.buildId) return;
      engine.setBuild(buildId);
      history.replaceState(null, '', `?build=${buildId}`);
      this.runSuite();
    },
    start() { engine.start(); },
    restart() { engine.reset(); engine.start(); },
    flap() { engine.flap(); },
    toggleBot(force) {
      const on = bot.toggle(force);
      if (on && engine.state !== 'PLAYING') engine.start();
      UI.setToggles({ bot: on, hitboxes: renderer.showHitboxes });
      UI.log('state', `auto-play bot ${on ? 'ENABLED' : 'DISABLED'}`);
      return on;
    },
    toggleHitboxes(force) {
      renderer.showHitboxes = force === undefined ? !renderer.showHitboxes : !!force;
      UI.setToggles({ bot: bot.enabled, hitboxes: renderer.showHitboxes });
      return renderer.showHitboxes;
    },
    runSuite() { return suite.runSuite(engine.buildId); },
    clearBugs() { bugs.clear(); },
    exportBugs() {
      const blob = new Blob([bugs.exportJSON()], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: `jira-export-${engine.buildId}-${Date.now()}.json`,
      });
      document.body.appendChild(a); a.click(); a.remove();
      UI.log('suite', `exported ${bugs.list().length} ticket(s) as JSON`);
    },
    setPaused(v) { paused = !!v; },
    /** Advance N fixed frames synchronously (used by tests for determinism). */
    stepFrames(n = 1) { for (let i = 0; i < n; i++) frame(); },
  };

  /* ---------------------------- Game loop ---------------------------- */
  const FRAME_MS = 1000 / P.FPS;
  let acc = 0, last = performance.now();
  let fpsCounter = 0, fpsStamp = last, fps = 0;

  function frame() {
    bot.update();
    engine.step();
    lastOracle = suite.observe(engine);
  }

  function loop(now) {
    const dt = Math.min(now - last, 100); last = now;
    if (!paused) {
      acc += dt;
      while (acc >= FRAME_MS) { frame(); acc -= FRAME_MS; }
    }
    fpsCounter++;
    if (now - fpsStamp >= 500) { fps = Math.round(fpsCounter * 1000 / (now - fpsStamp)); fpsCounter = 0; fpsStamp = now; }

    renderer.draw(engine, { overlap: lastOracle && (lastOracle.pipe || lastOracle.ground || lastOracle.ceiling), touch: isTouch });
    UI.renderTelemetry({ ...engine.snapshot(), seed: engine.seed }, lastOracle, fps);
    requestAnimationFrame(loop);
  }

  /* ---------------------------- Input ---------------------------- */
  const flapFromPointer = e => { e.preventDefault(); app.flap(); canvas.focus({ preventScroll: true }); };
  canvas.addEventListener('pointerdown', flapFromPointer);
  canvas.addEventListener('keydown', e => { if (e.code === 'Space') e.preventDefault(); });

  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.code === 'Space') { e.preventDefault(); app.flap(); }
    else if (e.key === 'h' || e.key === 'H') app.toggleHitboxes();
    else if (e.key === 'b' || e.key === 'B') app.toggleBot();
    else if (e.key === 'r' || e.key === 'R') app.runSuite();
  });

  UI.els.btnStart.addEventListener('click', () => engine.state === 'READY' ? app.start() : app.restart());
  UI.els.btnHitbox.addEventListener('click', () => app.toggleHitboxes());
  UI.els.btnBot.addEventListener('click', () => app.toggleBot());
  UI.els.btnRunSuite.addEventListener('click', () => app.runSuite());
  UI.els.btnClearBugs.addEventListener('click', () => app.clearBugs());
  UI.els.btnExportBugs.addEventListener('click', () => app.exportBugs());

  document.getElementById('buildSwitcher').addEventListener('click', e => {
    const btn = e.target.closest('.build-btn');
    if (btn) app.setBuild(btn.dataset.build);
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => UI.activateTab(b.dataset.tab)));

  document.addEventListener('visibilitychange', () => UI.setLive(document.hidden));
  window.addEventListener('resize', () => renderer.resize());

  /* ---------------------------- Boot ---------------------------- */
  UI.setBuild(engine.buildId);
  UI.setState(engine.state);
  UI.setToggles({ bot: false, hitboxes: false });
  UI.renderAssertions(suite.snapshot());
  refreshBugs();
  UI.log('build', `booted ${engine.buildId} (${BUILDS[engine.buildId].subtitle}) · seed ${engine.seed}`);
  app.runSuite();
  requestAnimationFrame(loop);

  global.FlappyApp = app;
  global.FlappyBuildOrder = BUILD_ORDER;
})(window);
