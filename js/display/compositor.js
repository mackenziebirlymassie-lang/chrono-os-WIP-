/**
 * ChronosOS - Canvas Desktop Compositor
 * High-performance 2D canvas compositor running at 60+ FPS with sub-16ms render budget
 */

import { SystemConstants, WindowSnapState } from '../core/types.js';

export class CanvasCompositor {
  constructor(canvasElement, windowManager) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });
    this.wm = windowManager;
    this.dpr = window.devicePixelRatio || 1;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Animated Quantum Particle Wallpaper state
    this._particles = [];
    this._initWallpaperParticles(48);

    this.metrics = {
      renderTimeMs: 0,
      framesComposited: 0,
      drawCalls: 0,
    };

    this.handleResize();
  }

  _initWallpaperParticles(count) {
    this._particles = [];
    for (let i = 0; i < count; i++) {
      this._particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }
  }

  handleResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Main Compositor Render Pass: called once per animation frame
   * @param {number} timestamp - Performance now timestamp
   * @param {number} deltaMs - Elapsed milliseconds since last frame
   */
  render(timestamp, deltaMs) {
    const startTime = performance.now();
    this.metrics.drawCalls = 0;

    // 1. Clear & Render Hardware Wallpaper (Gradient + Cyber Mesh)
    this._renderWallpaper(timestamp);

    // 2. Render Window Drop Shadows & Composited Canvas Surfaces
    this._compositeWindows();

    // 3. Render Snap Preview Ghost if active
    this._renderSnapGhost();

    const renderDuration = performance.now() - startTime;
    this.metrics.renderTimeMs = (this.metrics.renderTimeMs * 0.9) + (renderDuration * 0.1);
    this.metrics.framesComposited++;
  }

  _renderWallpaper(timestamp) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Dark Elevated Cyber Radial Gradient
    const gradient = ctx.createRadialGradient(w * 0.5, h * 0.4, 80, w * 0.5, h * 0.5, Math.max(w, h));
    gradient.addColorStop(0, '#0c1626');
    gradient.addColorStop(0.6, '#060a12');
    gradient.addColorStop(1, '#020408');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    this.metrics.drawCalls++;

    // Ambient floating quantum particles
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;

    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Connect adjacent nodes
      for (let j = i + 1; j < this._particles.length; j++) {
        const p2 = this._particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  _compositeWindows() {
    const windows = this.wm.getWindowsInZOrder();
    const ctx = this.ctx;

    for (const win of windows) {
      if (win.isMinimized) continue;

      const { x, y, width, height } = win.bounds;

      // Draw multi-layered subtle ambient drop shadow on the master canvas
      ctx.save();
      ctx.shadowColor = win.isFocused ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = win.isFocused ? 28 : 14;
      ctx.shadowOffsetY = win.isFocused ? 12 : 6;
      ctx.fillStyle = 'rgba(18, 26, 39, 0.95)';
      
      // Rounded window shape
      this._roundRect(ctx, x, y, width, height, 8);
      ctx.fill();
      ctx.restore();
      this.metrics.drawCalls++;

      // If window has an active offscreen canvas surface, blit it directly
      if (win.surface && win.surface.canvas) {
        ctx.drawImage(win.surface.canvas, x, y + 32, width, height - 32);
        this.metrics.drawCalls++;
      }
    }
  }

  _renderSnapGhost() {
    const snapState = this.wm.snapPreviewState;
    if (!snapState || snapState === WindowSnapState.NONE) return;

    const ctx = this.ctx;
    const screenW = this.width;
    const screenH = this.height - 48; // Taskbar height

    let gx = 0, gy = 0, gw = screenW, gh = screenH;

    if (snapState === WindowSnapState.LEFT_HALF) {
      gw = Math.floor(screenW / 2);
    } else if (snapState === WindowSnapState.RIGHT_HALF) {
      gx = Math.floor(screenW / 2);
      gw = Math.ceil(screenW / 2);
    }

    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    this._roundRect(ctx, gx + 8, gy + 8, gw - 16, gh - 16, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.metrics.drawCalls++;
  }

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
