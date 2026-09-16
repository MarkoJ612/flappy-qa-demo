/**
 * qa/assertions.js — Automated Assertion Suite
 * --------------------------------------------
 * Four core assertions, each evaluated in two complementary ways:
 *
 *  1. HEADLESS RUN  (`runSuite(buildId)`) — spins up throw-away engine
 *     instances, arranges deterministic scenarios (bird into ceiling / ground /
 *     pipe, bot-driven scoring run) and grades the outcome. Instant PASS/FAIL
 *     per build, like a unit-test run.
 *
 *  2. LIVE MONITOR  (`observe(engine)`) — runs every frame while a human or
 *     the bot plays. The oracle says what should happen; if the engine
 *     disagrees, a `violation` event fires (consumed by the bug reporter).
 */
(function (global) {
  'use strict';

  const CFG = global.FlappyConfig || require('../config.js');
  const ENG = global.FlappyEngineModule || require('../engine.js');
  const ORC = global.FlappyOracleModule || require('./oracle.js');
  const BOT = global.FlappyBotModule || require('../bot.js');
  const { STATES, COLLISION, PHYSICS: P } = CFG;
  const { FlappyEngine } = ENG;
  const { CollisionOracle } = ORC;
  const { AutoPlayBot } = BOT;

  const STATUS = Object.freeze({ PENDING: 'PENDING', PASS: 'PASS', FAIL: 'FAIL', RUNNING: 'RUNNING' });

  const ASSERTIONS = Object.freeze([
    { id: 'ceiling', name: 'Assert Ceiling Boundary',
      expect: 'Bird hitbox top <= 0 → state GAME_OVER, collision CEILING' },
    { id: 'ground',  name: 'Assert Ground Collision',
      expect: 'Bird hitbox bottom >= ground line → state GAME_OVER, collision GROUND' },
    { id: 'pipe',    name: 'Assert Pipe Obstacle Collision',
      expect: 'Bird AABB ∩ pipe AABB ≠ ∅ → state GAME_OVER, collision PIPE_TOP|PIPE_BOTTOM' },
    { id: 'score',   name: 'Assert Score Increment Logic',
      expect: 'Score === number of pipes whose trailing edge cleared the bird' },
  ]);

  class AssertionSuite {
    constructor() {
      this.listeners = {};
      this.oracle = new CollisionOracle();
      this.results = {};
      this.resetResults();
      this._liveFlags = { ceiling: false, ground: false, pipe: false };
      this._lastPipeViolationId = null;
    }

    resetResults() {
      for (const a of ASSERTIONS) {
        this.results[a.id] = { ...a, status: STATUS.PENDING, detail: 'Not yet exercised', source: null, at: null };
      }
      this.oracle.reset();
      this._lastPipeViolationId = null;
      this.emit('update', this.snapshot());
    }

    snapshot() { return ASSERTIONS.map(a => ({ ...this.results[a.id] })); }

    setResult(id, status, detail, source) {
      const r = this.results[id];
      // A live FAIL must not be masked by a later PASS from another scenario.
      if (r.status === STATUS.FAIL && status === STATUS.PASS && source === 'live') return;
      r.status = status; r.detail = detail; r.source = source; r.at = Date.now();
      this.emit('update', this.snapshot());
    }

    /* ------------------------------------------------------------------ */
    /* 1) Headless deterministic run                                       */
    /* ------------------------------------------------------------------ */

    runSuite(buildId, seed = 2024) {
      this.resetResults();
      const report = { build: buildId, seed, startedAt: Date.now(), results: [] };

      // -- Ceiling: hold flap until the bird reaches the top.
      {
        const e = new FlappyEngine({ buildId, seed }); e.start();
        for (let i = 0; i < 240 && e.state === STATES.PLAYING; i++) { e.flap(); e.step(); }
        const ok = e.state === STATES.GAME_OVER && e.lastCollision === COLLISION.CEILING;
        this.setResult('ceiling', ok ? STATUS.PASS : STATUS.FAIL,
          ok ? `GAME_OVER via CEILING after ${e.frame} frames`
             : `Bird pinned at y=${e.bird.y.toFixed(0)} for ${e.frame} frames, state=${e.state}`, 'suite');
      }

      // -- Ground: no input, let gravity do the work.
      {
        const e = new FlappyEngine({ buildId, seed }); e.start();
        for (let i = 0; i < 240 && e.state === STATES.PLAYING; i++) e.step();
        const ok = e.state === STATES.GAME_OVER && e.lastCollision === COLLISION.GROUND;
        this.setResult('ground', ok ? STATUS.PASS : STATUS.FAIL,
          ok ? `GAME_OVER via GROUND after ${e.frame} frames`
             : `Bird resting on ground (y=${e.bird.y.toFixed(0)}) for ${e.frame} frames, state=${e.state}`, 'suite');
      }

      // -- Pipe: arrange the bird directly inside the first pipe's top segment.
      {
        const e = new FlappyEngine({ buildId, seed }); e.start();
        while (e.pipes.length === 0 && e.frame < 200) e.step();
        const pipe = e.pipes[0];
        pipe.x = e.bird.x - P.PIPE_WIDTH / 2;       // pipe centred on bird
        e.bird.y = pipe.gapY - P.BIRD_HITBOX_H;     // inside the top pipe
        e.bird.vy = 0;
        e.step();
        const overlap = new CollisionOracle().evaluate(e).pipe;
        const ok = e.state === STATES.GAME_OVER && /^PIPE_/.test(e.lastCollision);
        this.setResult('pipe', ok ? STATUS.PASS : STATUS.FAIL,
          ok ? `GAME_OVER via ${e.lastCollision} on first overlapping frame`
             : `Oracle: overlap=${overlap ? overlap.type : 'none'} · Engine: state=${e.state}, collision=${e.lastCollision}`, 'suite');
      }

      // -- Score: bot-driven soak run, compare against oracle bookkeeping.
      {
        const e = new FlappyEngine({ buildId, seed });
        const bot = new AutoPlayBot(e); bot.toggle(true); e.start();
        const oracle = new CollisionOracle();
        let mismatch = null;
        for (let i = 0; i < 1500 && e.state === STATES.PLAYING; i++) {
          bot.update(); e.step();
          const o = oracle.evaluate(e);
          if (o.expectedScore !== e.score) { mismatch = { frame: e.frame, expected: o.expectedScore, actual: e.score }; break; }
        }
        const ok = !mismatch && e.score >= 3;
        this.setResult('score', ok ? STATUS.PASS : STATUS.FAIL,
          ok ? `Score ${e.score} === oracle ${oracle.expectedScore} over ${e.frame} frames`
             : mismatch ? `Frame ${mismatch.frame}: expected ${mismatch.expected}, got ${mismatch.actual}`
                        : `Insufficient pipes passed (${e.score}) in ${e.frame} frames`, 'suite');
      }

      report.results = this.snapshot();
      report.finishedAt = Date.now();
      report.passed = report.results.filter(r => r.status === STATUS.PASS).length;
      report.failed = report.results.filter(r => r.status === STATUS.FAIL).length;
      this.lastReport = report;
      this.emit('suite', report);
      return report;
    }

    /* ------------------------------------------------------------------ */
    /* 2) Live monitor — call once per frame AFTER engine.step()           */
    /* ------------------------------------------------------------------ */

    attach(engine) {
      this.detach();
      this._engine = engine;
      this._unsubs = [
        engine.on('reset', () => {
          this.oracle.reset();
          this._lastPipeViolationId = null;
          this._liveFlags = { ceiling: false, ground: false, pipe: false };
        }),
        engine.on('collision', ({ type }) => {
          const id = type === COLLISION.CEILING ? 'ceiling' : type === COLLISION.GROUND ? 'ground' : 'pipe';
          this.setResult(id, STATUS.PASS, `GAME_OVER correctly entered on ${type} (live)`, 'live');
        }),
      ];
    }

    detach() { (this._unsubs || []).forEach(u => u()); this._unsubs = []; }

    observe(engine) {
      if (engine.state !== STATES.PLAYING) return null;
      const o = this.oracle.evaluate(engine);
      const snap = engine.snapshot();

      // Score consistency (checked every frame).
      if (o.expectedScore !== engine.score) {
        this.setResult('score', STATUS.FAIL, `Expected ${o.expectedScore}, engine has ${engine.score}`, 'live');
        this.emit('violation', { rule: 'score', expected: `score=${o.expectedScore}`, actual: `score=${engine.score}`, snapshot: snap });
      } else if (engine.score > 0 && this.results.score.status !== STATUS.FAIL) {
        this.setResult('score', STATUS.PASS, `Score ${engine.score} matches oracle (live)`, 'live');
      }

      // Overlaps that did NOT end the game → violations.
      // (engine.step() already ran; if it detected the hit, state is GAME_OVER
      //  and we returned early above.)
      // Ceiling/ground: one occurrence per contact episode, not per frame.
      if (o.ceiling && !this._liveFlags.ceiling) this._violate('ceiling', 'CEILING', snap);
      if (o.ground && !this._liveFlags.ground)   this._violate('ground', 'GROUND', snap);
      this._liveFlags.ceiling = o.ceiling;
      this._liveFlags.ground = o.ground;
      if (o.pipe) {
        // One ticket occurrence per pipe object, not per frame.
        if (this._lastPipeViolationId !== o.pipe.id) {
          this._lastPipeViolationId = o.pipe.id;
          this._violate('pipe', o.pipe.type, snap, o.pipe.id);
        }
      }
      return o;
    }

    _violate(rule, type, snap, objectId) {
      const detail = `Oracle detected ${type} overlap at frame ${snap.frame} but state stayed PLAYING`;
      this.setResult(rule, STATUS.FAIL, detail, 'live');
      this.emit('violation', { rule, type, objectId, expected: 'GAME_OVER', actual: snap.state, snapshot: snap });
    }

    on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
    off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter(f => f !== fn); }
    emit(evt, payload) { (this.listeners[evt] || []).forEach(fn => fn(payload)); }
  }

  const api = { AssertionSuite, ASSERTIONS, STATUS };
  global.FlappyAssertionsModule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
