/**
 * bot.js — Auto-Play Bot
 * ----------------------
 * A simple predictive controller: it looks at the next pipe gap, predicts the
 * bird's Y a few frames ahead and flaps when the projection dips below the
 * target line. Used both for demo mode and to exercise the game under test in
 * automated runs (soak testing without human input).
 */
(function (global) {
  'use strict';

  const CFG = global.FlappyConfig || require('./config.js');
  const { PHYSICS: P } = CFG;

  class AutoPlayBot {
    constructor(engine, opts = {}) {
      this.engine = engine;
      this.enabled = false;
      this.lookaheadFrames = opts.lookaheadFrames ?? 4;
      this.offset = opts.offset ?? 30;
      this.clearMargin = opts.clearMargin ?? 12;
      this.flaps = 0;
    }

    toggle(force) {
      this.enabled = force === undefined ? !this.enabled : !!force;
      return this.enabled;
    }

    /** Call once per engine frame, BEFORE engine.step(). */
    update() {
      if (!this.enabled) return;
      const e = this.engine;
      if (e.state !== 'PLAYING') return;

      // Target the first pipe whose trailing edge has not yet cleared the
      // bird's LEFT hitbox edge (plus a safety margin), so we do not start
      // steering toward the next gap while still inside the current one.
      const birdLeft = e.bird.x - P.BIRD_HITBOX_W / 2 - this.clearMargin;
      const pipe = e.pipes.find(p => p.x + P.PIPE_WIDTH > birdLeft) || null;

      const gapTop = pipe ? pipe.gapY : 0;
      const targetY = pipe
        ? pipe.gapY + P.PIPE_GAP / 2 + this.offset
        : e.groundY / 2;

      // Project bird Y a few frames ahead under gravity.
      let y = e.bird.y, vy = e.bird.vy;
      for (let i = 0; i < this.lookaheadFrames; i++) { vy += P.GRAVITY; y += vy; }

      // Height gained by one flap (v^2 / 2g).
      const rise = (P.JUMP_VELOCITY * P.JUMP_VELOCITY) / (2 * P.GRAVITY);
      const wouldClipTop = pipe && (e.bird.y - rise) < gapTop + P.BIRD_HITBOX_H / 2 + 6;

      if (y > targetY && e.bird.vy > -2 && !wouldClipTop) {
        e.flap();
        this.flaps++;
      }
    }
  }

  const api = { AutoPlayBot };
  global.FlappyBotModule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
