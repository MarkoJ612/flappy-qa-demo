/**
 * ui.js — DOM bindings for the QA dashboard
 * -----------------------------------------
 * All document access lives here so the engine / QA modules stay testable in
 * isolation. main.js wires events → these render functions.
 */
(function (global) {
  'use strict';

  const { BUILDS } = global.FlappyConfig;
  const $ = id => document.getElementById(id);

  const els = {
    stateBadge: $('stateBadge'), activeBuild: $('activeBuild'),
    birdX: $('birdX'), birdY: $('birdY'), birdVy: $('birdVy'), distNext: $('distNext'),
    score: $('score'), frame: $('frame'), fps: $('fps'), collisionType: $('collisionType'),
    oracleOverlap: $('oracleOverlap'), botStatus: $('botStatus'), hitboxStatus: $('hitboxStatus'), seed: $('seed'),
    eventLog: $('eventLog'), suiteSummary: $('suiteSummary'), assertCount: $('assertCount'),
    bugList: $('bugList'), bugEmpty: $('bugEmpty'), bugCount: $('bugCount'),
    buildChangelog: $('buildChangelog'), buildAlgo: $('buildAlgo'),
    btnStart: $('btnStart'), btnHitbox: $('btnHitbox'), btnBot: $('btnBot'), btnRunSuite: $('btnRunSuite'),
    btnClearBugs: $('btnClearBugs'), btnExportBugs: $('btnExportBugs'),
    liveDot: $('liveDot'),
  };

  const MAX_LOG = 40;

  const UI = {
    els,

    setState(state) {
      els.stateBadge.textContent = state;
      els.stateBadge.dataset.state = state;
      els.btnStart.textContent = state === 'PLAYING' ? '⟲ Restart' : state === 'GAME_OVER' ? '⟲ Play Again' : '▶ Start';
    },

    setBuild(buildId) {
      const b = BUILDS[buildId];
      els.activeBuild.textContent = buildId;
      els.activeBuild.dataset.tone = b.tone;
      els.buildChangelog.textContent = b.changelog;
      els.buildAlgo.textContent = b.collisionAlgorithm;
      document.querySelectorAll('.build-btn').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.build === buildId));
      });
    },

    renderTelemetry(snap, oracle, fps) {
      els.birdX.textContent = snap.bird.x.toFixed(1);
      els.birdY.textContent = snap.bird.y.toFixed(1);
      els.birdVy.textContent = (snap.bird.vy >= 0 ? '+' : '') + snap.bird.vy.toFixed(2);
      els.distNext.textContent = snap.distanceToNextPipe === null ? '—' : snap.distanceToNextPipe.toFixed(0) + 'px';
      els.score.textContent = snap.score;
      els.frame.textContent = snap.frame;
      els.fps.textContent = fps;
      els.collisionType.textContent = snap.lastCollision;
      els.collisionType.dataset.hit = String(snap.lastCollision !== 'NONE');
      els.seed.textContent = snap.seed ?? els.seed.textContent;

      let overlapTxt = 'none', bad = false;
      if (oracle) {
        const parts = [];
        if (oracle.ceiling) parts.push('CEILING');
        if (oracle.ground) parts.push('GROUND');
        if (oracle.pipe) parts.push(`${oracle.pipe.type}#${oracle.pipe.id}`);
        if (parts.length) { overlapTxt = parts.join(' + '); bad = snap.state === 'PLAYING'; }
      }
      els.oracleOverlap.textContent = overlapTxt;
      els.oracleOverlap.dataset.bad = String(bad);
    },

    setToggles({ bot, hitboxes }) {
      els.btnBot.setAttribute('aria-pressed', String(bot));
      els.btnHitbox.setAttribute('aria-pressed', String(hitboxes));
      els.botStatus.textContent = bot ? 'ON' : 'OFF'; els.botStatus.dataset.on = String(bot);
      els.hitboxStatus.textContent = hitboxes ? 'ON' : 'OFF'; els.hitboxStatus.dataset.on = String(hitboxes);
    },

    log(kind, msg) {
      const li = document.createElement('li');
      li.className = `ev-${kind}`;
      const t = new Date();
      const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
      li.innerHTML = `<span class="t">${ts}</span><span>${escapeHtml(msg)}</span>`;
      els.eventLog.prepend(li);
      while (els.eventLog.children.length > MAX_LOG) els.eventLog.lastChild.remove();
    },

    renderAssertions(results) {
      let pass = 0;
      for (const r of results) {
        const item = document.querySelector(`.assert-item[data-assert="${r.id}"]`);
        const badge = document.getElementById(`assert-${r.id}`);
        const detail = document.querySelector(`[data-detail="${r.id}"]`);
        if (!item) continue;
        item.dataset.status = r.status;
        badge.dataset.status = r.status;
        badge.textContent = `[${r.status}]`;
        detail.textContent = r.detail + (r.source ? `  · ${r.source}` : '');
        if (r.status === 'PASS') pass++;
      }
      els.assertCount.textContent = `${pass}/${results.length}`;
      const fails = results.filter(r => r.status === 'FAIL').length;
      els.assertCount.style.background = fails ? 'var(--red)' : pass === results.length ? 'var(--green)' : '';
    },

    renderSuiteSummary(report) {
      els.suiteSummary.textContent = `${report.build} · ${report.passed} pass / ${report.failed} fail · ${report.finishedAt - report.startedAt}ms`;
      els.suiteSummary.style.color = report.failed ? 'var(--red)' : 'var(--green)';
    },

    renderBugs(tickets) {
      const open = tickets.filter(t => t.status !== 'RESOLVED').length;
      els.bugCount.textContent = String(open);
      els.bugCount.dataset.nonzero = String(open > 0);
      els.bugList.querySelectorAll('.bug-card').forEach(n => n.remove());
      els.bugEmpty.style.display = tickets.length ? 'none' : '';
      for (const t of tickets) els.bugList.appendChild(bugCard(t));
    },

    setLive(stale) { els.liveDot.dataset.stale = String(stale); },

    activateTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on));
      });
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === tab));
    },
  };

  function bugCard(t) {
    const el = document.createElement('article');
    el.className = 'bug-card';
    el.dataset.ticketId = t.id;
    el.dataset.status = t.status;
    el.dataset.rule = t.component;
    const ev = t.evidence || {};
    el.innerHTML = `
      <div class="bug-head">
        <span class="bug-id">${t.id}</span>
        <span class="bug-sev" data-level="${t.severity.split(' ')[0]}">${escapeHtml(t.severity)}</span>
        <span class="bug-status" data-status="${t.status}">${t.status}${t.resolvedIn ? ' · verified in ' + t.resolvedIn : ''}</span>
        <span class="bug-occ">×${t.occurrences} occurrence${t.occurrences === 1 ? '' : 's'}</span>
      </div>
      <h3 class="bug-title">${escapeHtml(t.title)}</h3>
      <div class="bug-grid">
        <div><span class="label">Affected build</span><span class="mono">${t.affectedBuilds.join(', ')}</span></div>
        <div><span class="label">Component</span><span class="mono">${t.component}</span></div>
        <div><span class="label">Evidence</span><span class="mono">${ev.type || '—'}${ev.objectId ? ' · pipe#' + ev.objectId : ''} · frame ${ev.frame ?? '—'}</span></div>
        <div><span class="label">Bird telemetry</span><span class="mono">${ev.bird ? `x=${ev.bird.x} y=${ev.bird.y} vy=${ev.bird.vy}` : '—'}</span></div>
        <div><span class="label">First seen</span><span class="mono">${fmt(t.firstSeen)}</span></div>
        <div><span class="label">Last seen</span><span class="mono">${fmt(t.lastSeen)}</span></div>
      </div>
      <div class="bug-ea">
        <div class="exp"><b>EXPECTED</b>${escapeHtml(t.expected)}</div>
        <div class="act"><b>ACTUAL</b>${escapeHtml(t.actual)}</div>
      </div>
      <details class="bug-steps">
        <summary>Steps to reproduce</summary>
        <ol>${t.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      </details>`;
    return el;
  }

  function fmt(iso) { return iso ? new Date(iso).toLocaleTimeString() : '—'; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  global.FlappyUI = UI;
})(window);
