/**
 * qa/testHooks.js — window.QA automation API
 * ------------------------------------------
 * A stable, documented surface for Playwright / Cypress / etc. Tests should
 * prefer these hooks over reaching into internals, so UI refactors do not
 * break the automation suite (same idea as Page Object Model, but on the
 * app side).
 *
 *   await page.evaluate(() => window.QA.setBuild('v1.1.0'))
 *   await page.evaluate(() => window.QA.forceCollision('pipe'))
 *   const s = await page.evaluate(() => window.QA.getState())
 */
(function (global) {
  'use strict';

  const app = global.FlappyApp;
  const { PHYSICS: P } = global.FlappyConfig;

  const QA = Object.freeze({
    version: '1.0',

    /* ----- read ----- */
    getState: () => ({ ...app.engine.snapshot(), seed: app.engine.seed, bot: app.bot.enabled, hitboxes: app.renderer.showHitboxes }),
    getAssertions: () => app.suite.snapshot(),
    getBugs: () => app.bugs.list(),
    getLastSuiteReport: () => app.suite.lastReport || null,
    getBuilds: () => [...global.FlappyBuildOrder],

    /* ----- control ----- */
    setBuild: id => { app.setBuild(id); return app.engine.buildId; },
    setSeed: seed => { app.engine.reset(Number(seed)); return app.engine.seed; },
    start: () => app.start(),
    restart: () => app.restart(),
    flap: () => app.flap(),
    toggleBot: force => app.toggleBot(force),
    toggleHitboxes: force => app.toggleHitboxes(force),
    runSuite: () => app.runSuite(),
    clearBugs: () => app.clearBugs(),
    pause: () => app.setPaused(true),
    resume: () => app.setPaused(false),

    /** Advance the simulation N frames synchronously (deterministic tests). */
    stepFrames: n => { app.stepFrames(n); return app.engine.snapshot(); },

    /**
     * Arrange a collision scenario on the LIVE engine, then step once.
     * 'pipe'    → teleport bird into the next pipe's top segment
     * 'ground'  → drop bird onto the ground line
     * 'ceiling' → push bird against the ceiling
     * Returns the post-step snapshot so tests can assert on state/collision.
     */
    forceCollision: kind => {
      const e = app.engine;
      if (e.state !== 'PLAYING') e.start();
      if (kind === 'pipe') {
        while (e.pipes.length === 0 && e.frame < 400) e.step();
        const pipe = e.pipes[0];
        pipe.x = e.bird.x - P.PIPE_WIDTH / 2;
        e.bird.y = pipe.gapY - P.BIRD_HITBOX_H;
        e.bird.vy = 0;
      } else if (kind === 'ground') {
        e.bird.y = e.groundY - P.BIRD_HITBOX_H / 2 + 1;
        e.bird.vy = 2;
      } else if (kind === 'ceiling') {
        e.bird.y = P.BIRD_HITBOX_H / 2 - 1;
        e.bird.vy = -6;
      } else {
        throw new Error(`Unknown collision kind: ${kind}`);
      }
      app.stepFrames(1);
      return app.engine.snapshot();
    },
  });

  global.QA = QA;
})(window);
