/**
 * renderer.js — Canvas renderer (presentation only)
 * -------------------------------------------------
 * Draws the engine state. Knows nothing about game rules. The debug overlay
 * (red hitboxes, gap guides, distance ruler) is layered on top when enabled.
 */
(function (global) {
  'use strict';

  const { PHYSICS: P, STATES } = global.FlappyConfig;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.showHitboxes = false;
      this.groundOffset = 0;
      this.resize();
    }

    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = P.WIDTH * dpr;
      this.canvas.height = P.HEIGHT * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    draw(engine, extras = {}) {
      const ctx = this.ctx;
      const g = engine.groundY;
      ctx.clearRect(0, 0, P.WIDTH, P.HEIGHT);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, g);
      sky.addColorStop(0, '#0b1a3a'); sky.addColorStop(1, '#10305e');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, P.WIDTH, g);

      // Grid (cyberpunk vibe)
      ctx.strokeStyle = 'rgba(6,182,212,0.08)'; ctx.lineWidth = 1;
      for (let x = 0; x < P.WIDTH; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, g); ctx.stroke(); }
      for (let y = 0; y < g; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(P.WIDTH, y); ctx.stroke(); }

      // Pipes
      for (const pipe of engine.pipes) {
        const { top, bottom } = engine.pipeBoxes(pipe);
        this.drawPipe(top, true); this.drawPipe(bottom, false);
      }

      // Ground
      if (engine.state === STATES.PLAYING) this.groundOffset = (this.groundOffset + P.PIPE_SPEED) % 24;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, g, P.WIDTH, P.GROUND_HEIGHT);
      ctx.fillStyle = '#06b6d4'; ctx.fillRect(0, g, P.WIDTH, 3);
      ctx.fillStyle = 'rgba(6,182,212,0.25)';
      for (let x = -24 + this.groundOffset; x < P.WIDTH; x += 24) ctx.fillRect(x, g + 10, 12, 4);

      // Bird
      this.drawBird(engine.bird);

      // Score HUD
      ctx.font = '700 34px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(6,182,212,0.8)'; ctx.shadowBlur = 12;
      ctx.fillText(String(engine.score), P.WIDTH / 2, 56);
      ctx.shadowBlur = 0;

      // Overlays
      if (this.showHitboxes) this.drawDebug(engine, extras);
      this.drawStateOverlay(engine, extras);
    }

    drawPipe(box, isTop) {
      const ctx = this.ctx;
      const grad = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
      grad.addColorStop(0, '#0e7490'); grad.addColorStop(0.5, '#22d3ee'); grad.addColorStop(1, '#0e7490');
      ctx.fillStyle = grad; ctx.fillRect(box.x, box.y, box.w, box.h);
      // Cap
      const capH = 18, capY = isTop ? box.y + box.h - capH : box.y;
      ctx.fillStyle = '#67e8f9'; ctx.fillRect(box.x - 4, capY, box.w + 8, capH);
      ctx.strokeStyle = 'rgba(15,23,42,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(box.x - 4, capY, box.w + 8, capH);
    }

    drawBird(bird) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate(bird.rotation);
      // body
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2); ctx.fill();
      // wing
      ctx.fillStyle = '#eab308';
      ctx.beginPath(); ctx.ellipse(-4, 3, 8, 5, -0.4, 0, Math.PI * 2); ctx.fill();
      // eye
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(7.5, -4, 2, 0, Math.PI * 2); ctx.fill();
      // beak
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.moveTo(12, 1); ctx.lineTo(21, 4); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawDebug(engine, extras) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([]);
      // pipe hitboxes
      for (const pipe of engine.pipes) {
        const { top, bottom } = engine.pipeBoxes(pipe);
        ctx.strokeRect(top.x, top.y, top.w, top.h);
        ctx.strokeRect(bottom.x, bottom.y, bottom.w, bottom.h);
        // gap guide
        ctx.strokeStyle = 'rgba(34,197,94,0.7)'; ctx.setLineDash([4, 4]);
        ctx.strokeRect(top.x, top.h, top.w, P.PIPE_GAP);
        ctx.strokeStyle = '#ef4444'; ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'left';
        ctx.fillText(`pipe#${pipe.id} x=${pipe.x.toFixed(0)}`, top.x + 2, top.h - 6);
      }
      // bird hitbox
      const b = engine.birdBox();
      const hit = extras.overlap;
      ctx.strokeStyle = hit ? '#ef4444' : '#f87171';
      ctx.lineWidth = hit ? 3 : 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (hit) { ctx.fillStyle = 'rgba(239,68,68,0.25)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
      // ground & ceiling lines
      ctx.strokeStyle = '#ef4444'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, engine.groundY); ctx.lineTo(P.WIDTH, engine.groundY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(P.WIDTH, 1); ctx.stroke();
      // distance ruler to next pipe
      const next = engine.nextPipe();
      if (next) {
        const x1 = b.x + b.w, x2 = next.x, y = engine.bird.y;
        ctx.strokeStyle = '#06b6d4'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.fillStyle = '#06b6d4'; ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(`${Math.max(0, x2 - x1).toFixed(0)}px`, (x1 + x2) / 2, y - 6);
      }
      // label
      ctx.setLineDash([]); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = '700 11px ui-monospace, monospace';
      ctx.fillText(`DEBUG · bird(${b.x.toFixed(0)},${b.y.toFixed(0)}) ${b.w}x${b.h}`, 8, P.HEIGHT - 12);
      ctx.restore();
    }

    drawStateOverlay(engine, extras) {
      const ctx = this.ctx;
      if (engine.state === STATES.PLAYING) return;
      ctx.save();
      ctx.fillStyle = 'rgba(15,23,42,0.55)'; ctx.fillRect(0, 0, P.WIDTH, P.HEIGHT);
      ctx.textAlign = 'center';
      if (engine.state === STATES.READY) {
        ctx.fillStyle = '#e2e8f0'; ctx.font = '700 26px "Space Grotesk", system-ui, sans-serif';
        ctx.fillText('FLAPPY QA BENCH', P.WIDTH / 2, P.HEIGHT / 2 - 40);
        ctx.fillStyle = '#06b6d4'; ctx.font = '500 14px ui-monospace, monospace';
        ctx.fillText(`build ${engine.buildId} · seed ${engine.seed}`, P.WIDTH / 2, P.HEIGHT / 2 - 14);
        ctx.fillStyle = '#94a3b8'; ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(extras.touch ? 'TAP to flap · TAP to start' : 'SPACE / CLICK to flap', P.WIDTH / 2, P.HEIGHT / 2 + 20);
      } else {
        ctx.fillStyle = '#ef4444'; ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif';
        ctx.fillText('GAME OVER', P.WIDTH / 2, P.HEIGHT / 2 - 30);
        ctx.fillStyle = '#e2e8f0'; ctx.font = '500 14px ui-monospace, monospace';
        ctx.fillText(`collision: ${engine.lastCollision}`, P.WIDTH / 2, P.HEIGHT / 2);
        ctx.fillText(`score: ${engine.score}`, P.WIDTH / 2, P.HEIGHT / 2 + 22);
        ctx.fillStyle = '#94a3b8'; ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(extras.touch ? 'TAP to restart' : 'SPACE / CLICK to restart', P.WIDTH / 2, P.HEIGHT / 2 + 54);
      }
      ctx.restore();
    }
  }

  global.FlappyRenderer = { Renderer };
})(window);
