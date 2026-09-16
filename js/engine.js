/**
 * engine.js — Flappy Bird game engine (System Under Test)
 * -------------------------------------------------------
 * Pure, DOM-free, deterministic. Can run in the browser (rendered by
 * renderer.js) or headlessly (assertion suite / Node). Determinism comes from
 * a seeded PRNG so that automated tests get reproducible pipe layouts.
 *
 * NOTE FOR REVIEWERS: the collision code below intentionally models three
 * different software builds. Build v1.1.0 contains a deliberate regression
 * used to demonstrate how the QA layer detects it.
 */
(function (global) {
  'use strict';

  const CFG = global.FlappyConfig || require('./config.js');
  const { PHYSICS: P, BUILDS, STATES, COLLISION } = CFG;

  /** Small mulberry32 PRNG — reproducible pipe gaps for tests. */
  function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Axis-aligned bounding-box intersection helper. */
  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class FlappyEngine {
    constructor(options = {}) {
      this.buildId = options.buildId || 'v1.0.0';
      this.seed = options.seed ?? 1337;
      this.listeners = {};
      this.reset();
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    get build() { return BUILDS[this.buildId]; }

    setBuild(buildId) {
      if (!BUILDS[buildId]) throw new Error(`Unknown build: ${buildId}`);
      this.buildId = buildId;
      this.reset();
      this.emit('build', { buildId });
    }

    reset(seed) {
      if (seed !== undefined) this.seed = seed;
      this.rng = createRng(this.seed);
      this.state = STATES.READY;
      this.frame = 0;
      this.score = 0;
      this.pipesPassed = 0;
      this.lastCollision = COLLISION.NONE;
      this.bird = { x: P.BIRD_X, y: P.BIRD_START_Y, vy: 0, rotation: 0 };
      this.pipes = [];
      this.pipeSeq = 0;
      this.spawnTimer = 30; // first pipe appears quickly
      this.emit('reset', {});
      this.emit('state', { state: this.state });
    }

    start() {
      if (this.state === STATES.GAME_OVER) this.reset();
      if (this.state === STATES.READY) this.setState(STATES.PLAYING);
    }

    flap() {
      if (this.state === STATES.GAME_OVER) { this.reset(); this.start(); }
      else if (this.state === STATES.READY) this.start();
      if (this.state !== STATES.PLAYING) return;
      this.bird.vy = P.JUMP_VELOCITY;
      this.emit('flap', {});
    }

    setState(next) {
      if (this.state === next) return;
      const prev = this.state;
      this.state = next;
      this.emit('state', { state: next, prev });
    }

    /* ------------------------------------------------------------------ */
    /* Geometry                                                            */
    /* ------------------------------------------------------------------ */

    get groundY() { return P.HEIGHT - P.GROUND_HEIGHT; }

    birdBox() {
      return {
        x: this.bird.x - P.BIRD_HITBOX_W / 2,
        y: this.bird.y - P.BIRD_HITBOX_H / 2,
        w: P.BIRD_HITBOX_W,
        h: P.BIRD_HITBOX_H,
      };
    }

    pipeBoxes(pipe) {
      return {
        top: { x: pipe.x, y: 0, w: P.PIPE_WIDTH, h: pipe.gapY },
        bottom: {
          x: pipe.x,
          y: pipe.gapY + P.PIPE_GAP,
          w: P.PIPE_WIDTH,
          h: this.groundY - (pipe.gapY + P.PIPE_GAP),
        },
      };
    }

    /** Next pipe whose trailing edge is still ahead of the bird. */
    nextPipe() {
      return this.pipes.find(p => p.x + P.PIPE_WIDTH > this.bird.x) || null;
    }

    distanceToNextPipe() {
      const p = this.nextPipe();
      return p ? Math.max(0, p.x - (this.bird.x + P.BIRD_HITBOX_W / 2)) : null;
    }

    /* ------------------------------------------------------------------ */
    /* Simulation step (fixed timestep, 1 frame = 1/60 s)                  */
    /* ------------------------------------------------------------------ */

    step() {
      if (this.state !== STATES.PLAYING) return;
      this.frame++;

      // Bird physics
      const b = this.bird;
      b.vy = Math.min(b.vy + P.GRAVITY, P.MAX_FALL_SPEED);
      b.y += b.vy;
      b.rotation = Math.max(-0.5, Math.min(1.2, b.vy / 10));

      // Pipes
      if (--this.spawnTimer <= 0) {
        this.spawnPipe();
        this.spawnTimer = P.PIPE_SPACING_FRAMES;
      }
      for (const pipe of this.pipes) {
        pipe.x -= P.PIPE_SPEED;
        if (!pipe.passed && pipe.x + P.PIPE_WIDTH < b.x - P.BIRD_HITBOX_W / 2) {
          pipe.passed = true;
          this.pipesPassed++;
          this.score++;
          this.emit('score', { score: this.score, pipeId: pipe.id });
        }
      }
      this.pipes = this.pipes.filter(p => p.x + P.PIPE_WIDTH > -10);

      // Collision (build-dependent — see below)
      const hit = this.detectCollision();
      if (hit !== COLLISION.NONE) {
        this.lastCollision = hit;
        this.setState(STATES.GAME_OVER);
        this.emit('collision', { type: hit });
      } else {
        // Keep the bird on screen even when a build fails to detect ground/ceiling.
        if (b.y + P.BIRD_HITBOX_H / 2 > this.groundY) { b.y = this.groundY - P.BIRD_HITBOX_H / 2; b.vy = 0; }
        if (b.y - P.BIRD_HITBOX_H / 2 < 0) { b.y = P.BIRD_HITBOX_H / 2; b.vy = 0; }
      }

      this.emit('tick', { frame: this.frame });
    }

    spawnPipe() {
      const range = this.groundY - P.PIPE_GAP - P.PIPE_MIN_TOP * 2;
      const gapY = P.PIPE_MIN_TOP + Math.floor(this.rng() * range);
      this.pipes.push({ id: ++this.pipeSeq, x: P.WIDTH + 10, gapY, passed: false });
    }

    /* ------------------------------------------------------------------ */
    /* Collision detection — THIS is what differs between builds           */
    /* ------------------------------------------------------------------ */

    detectCollision() {
      switch (this.build.collisionAlgorithm) {
        case 'aabb':                  return this.collisionLegacy();
        case 'aabb-fastpath-broken':  return this.collisionRegressed();
        case 'aabb-broadphase':       return this.collisionHotfix();
        default:                      return COLLISION.NONE;
      }
    }

    /** v1.0.0 — straightforward, correct, checks every pipe every frame. */
    collisionLegacy() {
      const box = this.birdBox();
      if (box.y <= 0) return COLLISION.CEILING;
      if (box.y + box.h >= this.groundY) return COLLISION.GROUND;
      for (const pipe of this.pipes) {
        const { top, bottom } = this.pipeBoxes(pipe);
        if (intersects(box, top)) return COLLISION.PIPE_TOP;
        if (intersects(box, bottom)) return COLLISION.PIPE_BOTTOM;
      }
      return COLLISION.NONE;
    }

    /**
     * v1.1.0 — "optimised" refactor. The developer extracted the ground and
     * pipe checks into a helper that returns the collision TYPE (a string),
     * but the call site still compares the result to the boolean `true` from
     * the pre-refactor API. `'PIPE_TOP' === true` is never true, so pipe and
     * ground collisions are silently swallowed. Only the ceiling check, which
     * was left inline, still works. Classic contract-drift regression that a
     * type checker or a single integration test would have caught.
     */
    collisionRegressed() {
      const box = this.birdBox();
      if (box.y <= 0) return COLLISION.CEILING;
      // BUG: helper returns a string, caller expects boolean — always false.
      if (this._narrowPhase(box) === true) return this._narrowPhase(box);
      return COLLISION.NONE;
    }

    _narrowPhase(box) {
      if (box.y + box.h >= this.groundY) return COLLISION.GROUND;
      for (const pipe of this.pipes) {
        const { top, bottom } = this.pipeBoxes(pipe);
        if (intersects(box, top)) return COLLISION.PIPE_TOP;
        if (intersects(box, bottom)) return COLLISION.PIPE_BOTTOM;
      }
      return COLLISION.NONE;
    }

    /** v1.2.0 — hotfix: ground check restored, broad-phase culling done correctly. */
    collisionHotfix() {
      const box = this.birdBox();
      if (box.y <= 0) return COLLISION.CEILING;
      if (box.y + box.h >= this.groundY) return COLLISION.GROUND;
      for (const pipe of this.pipes) {
        // Broad phase: skip pipes that do not overlap the bird on the X axis.
        if (pipe.x > box.x + box.w || pipe.x + P.PIPE_WIDTH < box.x) continue;
        const { top, bottom } = this.pipeBoxes(pipe);
        if (intersects(box, top)) return COLLISION.PIPE_TOP;
        if (intersects(box, bottom)) return COLLISION.PIPE_BOTTOM;
      }
      return COLLISION.NONE;
    }

    /* ------------------------------------------------------------------ */
    /* Snapshot for telemetry / tests                                      */
    /* ------------------------------------------------------------------ */

    snapshot() {
      const next = this.nextPipe();
      return {
        build: this.buildId,
        state: this.state,
        frame: this.frame,
        score: this.score,
        pipesPassed: this.pipesPassed,
        lastCollision: this.lastCollision,
        bird: { x: +this.bird.x.toFixed(1), y: +this.bird.y.toFixed(1), vy: +this.bird.vy.toFixed(2) },
        distanceToNextPipe: next ? +this.distanceToNextPipe().toFixed(1) : null,
        nextGap: next ? { top: next.gapY, bottom: next.gapY + P.PIPE_GAP } : null,
        pipeCount: this.pipes.length,
      };
    }

    /* ------------------------------------------------------------------ */
    /* Tiny event emitter                                                  */
    /* ------------------------------------------------------------------ */

    on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
    off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter(f => f !== fn); }
    emit(evt, payload) { (this.listeners[evt] || []).forEach(fn => fn(payload)); }
  }

  const api = { FlappyEngine, intersects, createRng };
  global.FlappyEngineModule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
