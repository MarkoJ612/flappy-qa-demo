/**
 * config.js — Build matrix & physics constants
 * -------------------------------------------------
 * Each "build" represents a different software version of the game under test.
 * The QA layer (js/qa/*) is build-agnostic: it observes the engine from the
 * outside and reports discrepancies between EXPECTED and ACTUAL behaviour.
 */
(function (global) {
  'use strict';

  const PHYSICS = Object.freeze({
    WIDTH: 360,
    HEIGHT: 540,
    GROUND_HEIGHT: 56,
    GRAVITY: 0.38,
    JUMP_VELOCITY: -6.6,
    MAX_FALL_SPEED: 10,
    PIPE_SPEED: 2.4,
    PIPE_WIDTH: 62,
    PIPE_GAP: 138,
    PIPE_SPACING_FRAMES: 92,
    PIPE_MIN_TOP: 60,
    BIRD_X: 84,
    BIRD_START_Y: 240,
    BIRD_HITBOX_W: 30,
    BIRD_HITBOX_H: 24,
    FPS: 60,
  });

  /**
   * Build definitions. `collision` flags model which collision checks the
   * production code of that build actually performs. The QA oracle ALWAYS
   * evaluates all of them independently, which is how regressions are caught.
   */
  const BUILDS = Object.freeze({
    'v1.0.0': {
      id: 'v1.0.0',
      label: 'Build v1.0.0',
      subtitle: 'Legacy Stable',
      tone: 'stable',
      changelog: 'Initial release. AABB collision for pipes, ground and ceiling.',
      collision: { ceiling: true, ground: true, pipes: true },
      collisionAlgorithm: 'aabb',
    },
    'v1.1.0': {
      id: 'v1.1.0',
      label: 'Build v1.1.0',
      subtitle: 'Regression Bug — Broken Collision',
      tone: 'regression',
      changelog:
        'Refactored collision module to "optimised" fast path. ' +
        'REGRESSION: pipe & ground collision short-circuits and never fires.',
      collision: { ceiling: true, ground: false, pipes: false },
      collisionAlgorithm: 'aabb-fastpath-broken',
    },
    'v1.2.0': {
      id: 'v1.2.0',
      label: 'Build v1.2.0',
      subtitle: 'Hotfix — Production Ready',
      tone: 'hotfix',
      changelog:
        'Hotfix for QA-BUG-104/105. Collision fast path fixed; broad-phase culling ' +
        'added so only pipes overlapping the bird on the X axis are tested.',
      collision: { ceiling: true, ground: true, pipes: true },
      collisionAlgorithm: 'aabb-broadphase',
    },
  });

  const BUILD_ORDER = Object.freeze(['v1.0.0', 'v1.1.0', 'v1.2.0']);

  const STATES = Object.freeze({
    READY: 'READY',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER',
  });

  const COLLISION = Object.freeze({
    NONE: 'NONE',
    CEILING: 'CEILING',
    GROUND: 'GROUND',
    PIPE_TOP: 'PIPE_TOP',
    PIPE_BOTTOM: 'PIPE_BOTTOM',
  });

  const api = { PHYSICS, BUILDS, BUILD_ORDER, STATES, COLLISION };
  global.FlappyConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
