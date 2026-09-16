/**
 * qa/bugReporter.js — Dynamic Jira Issue Generator
 * ------------------------------------------------
 * Subscribes to `violation` events from the AssertionSuite and turns them into
 * Jira-style bug tickets. Tickets are keyed by rule so that repeated frames of
 * the same defect increment an `occurrences` counter instead of spamming the
 * board. When a later build passes the corresponding assertion, the open
 * ticket is transitioned to RESOLVED with a "verified in" note.
 */
(function (global) {
  'use strict';

  const TICKET_TEMPLATES = Object.freeze({
    pipe: {
      id: 'QA-BUG-104',
      severity: 'HIGH / BLOCKER',
      component: 'physics/collision',
      title: 'Collision detection failed - Bird bounding box intersected Pipe Object without entering GAME_OVER state.',
      steps: [
        'Select Build v1.1.0 in the Build Switcher.',
        'Start the game (Space / tap) and fly the bird into any pipe segment.',
        'Enable "Toggle Collision Hitboxes" to visually confirm AABB overlap.',
        'Observe Game State badge remains PLAYING.',
      ],
    },
    ground: {
      id: 'QA-BUG-105',
      severity: 'HIGH / BLOCKER',
      component: 'physics/collision',
      title: 'Ground collision not detected - Bird rests on ground plane while state remains PLAYING.',
      steps: [
        'Select Build v1.1.0 in the Build Switcher.',
        'Start the game and give no input; let the bird fall.',
        'Observe the bird clamps to the ground line but GAME_OVER is never entered.',
      ],
    },
    ceiling: {
      id: 'QA-BUG-106',
      severity: 'MEDIUM',
      component: 'physics/bounds',
      title: 'Ceiling boundary not enforced - Bird hitbox top <= 0 without GAME_OVER.',
      steps: ['Start the game and hold flap until the bird reaches the top edge.'],
    },
    score: {
      id: 'QA-BUG-107',
      severity: 'MEDIUM',
      component: 'gameplay/scoring',
      title: 'Score counter diverged from number of pipes passed.',
      steps: ['Play through several pipes and compare the HUD score to pipes cleared.'],
    },
  });

  class BugReporter {
    constructor() {
      this.tickets = new Map(); // id -> ticket
      this.listeners = {};
    }

    /** Wire up to an AssertionSuite instance. */
    attach(suite) {
      suite.on('violation', v => this.fileFromViolation(v));
      suite.on('suite', report => this.reconcile(report));
    }

    fileFromViolation(v) {
      const tpl = TICKET_TEMPLATES[v.rule];
      if (!tpl) return;
      const build = v.snapshot.build;
      const key = `${tpl.id}`;
      let t = this.tickets.get(key);
      const now = new Date();

      if (!t) {
        t = {
          ...tpl,
          key,
          status: 'OPEN',
          build,
          affectedBuilds: [build],
          expected: v.expected,
          actual: v.actual,
          occurrences: 0,
          firstSeen: now.toISOString(),
          lastSeen: null,
          evidence: null,
          history: [],
          resolvedIn: null,
        };
        this.tickets.set(key, t);
        this.emit('created', t);
      } else if (t.status === 'RESOLVED' && t.resolvedIn !== build) {
        // Regression re-opened in a build that was supposedly fine.
        t.status = 'REOPENED';
      }

      if (!t.affectedBuilds.includes(build)) t.affectedBuilds.push(build);
      t.occurrences++;
      t.lastSeen = now.toISOString();
      t.evidence = {
        type: v.type || v.rule.toUpperCase(),
        objectId: v.objectId ?? null,
        frame: v.snapshot.frame,
        bird: v.snapshot.bird,
        score: v.snapshot.score,
        state: v.snapshot.state,
      };
      t.history.unshift({ at: t.lastSeen, build, frame: v.snapshot.frame, type: t.evidence.type, objectId: t.evidence.objectId });
      if (t.history.length > 25) t.history.length = 25;
      this.emit('updated', t);
    }

    /** After a headless suite run, resolve tickets whose rule now passes. */
    reconcile(report) {
      for (const r of report.results) {
        const tpl = TICKET_TEMPLATES[r.id];
        const t = tpl && this.tickets.get(tpl.id);
        if (!t) continue;
        if (r.status === 'PASS' && !t.affectedBuilds.includes(report.build) && t.status !== 'RESOLVED') {
          t.status = 'RESOLVED';
          t.resolvedIn = report.build;
          this.emit('updated', t);
        }
      }
    }

    clear() { this.tickets.clear(); this.emit('cleared', {}); }

    list() {
      return [...this.tickets.values()].sort((a, b) => (a.status === 'OPEN' ? -1 : 1) - (b.status === 'OPEN' ? -1 : 1));
    }

    openCount() { return this.list().filter(t => t.status !== 'RESOLVED').length; }

    /** Export as Jira-importable-ish JSON. */
    exportJSON() { return JSON.stringify(this.list(), null, 2); }

    on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
    off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter(f => f !== fn); }
    emit(evt, payload) { (this.listeners[evt] || []).forEach(fn => fn(payload)); }
  }

  const api = { BugReporter, TICKET_TEMPLATES };
  global.FlappyBugReporterModule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
