/**
 * qa/oracle.js — Independent Test Oracle
 * --------------------------------------
 * A *reference implementation* of the collision & scoring rules that lives
 * OUTSIDE the game code. Every frame it inspects the engine's public geometry
 * and computes what SHOULD have happened. The assertion suite then compares
 * the oracle's verdict against the engine's actual state.
 *
 * This is the key QA design pattern demonstrated by the project: the system
 * under test is never trusted to grade itself.
 */
(function (global) {
  'use strict';

  const CFG = global.FlappyConfig || require('../config.js');
  const ENG = global.FlappyEngineModule || require('../engine.js');
  const { PHYSICS: P, COLLISION } = CFG;
  const { intersects } = ENG;

  class CollisionOracle {
    constructor() {
      this.passedPipeIds = new Set();
      this.expectedScore = 0;
    }

    reset() {
      this.passedPipeIds.clear();
      this.expectedScore = 0;
    }

    /**
     * Evaluate the engine's current geometry.
     * @returns {{ceiling:boolean, ground:boolean, pipe:null|{id:number,type:string}, expectedScore:number}}
     */
    evaluate(engine) {
      const box = engine.birdBox();
      const result = { ceiling: false, ground: false, pipe: null, expectedScore: 0 };

      result.ceiling = box.y <= 0;
      result.ground = box.y + box.h >= engine.groundY;

      for (const pipe of engine.pipes) {
        const top = { x: pipe.x, y: 0, w: P.PIPE_WIDTH, h: pipe.gapY };
        const bottom = {
          x: pipe.x, y: pipe.gapY + P.PIPE_GAP, w: P.PIPE_WIDTH,
          h: engine.groundY - (pipe.gapY + P.PIPE_GAP),
        };
        if (!result.pipe && intersects(box, top)) result.pipe = { id: pipe.id, type: COLLISION.PIPE_TOP };
        if (!result.pipe && intersects(box, bottom)) result.pipe = { id: pipe.id, type: COLLISION.PIPE_BOTTOM };

        // Independent score bookkeeping: a pipe counts once its trailing edge
        // clears the bird's leading (left) hitbox edge.
        if (pipe.x + P.PIPE_WIDTH < box.x && !this.passedPipeIds.has(pipe.id)) {
          this.passedPipeIds.add(pipe.id);
          this.expectedScore++;
        }
      }
      result.expectedScore = this.expectedScore;
      return result;
    }
  }

  const api = { CollisionOracle };
  global.FlappyOracleModule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
