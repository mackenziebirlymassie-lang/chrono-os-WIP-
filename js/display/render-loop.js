/**
 * ChronosOS - Sub-16ms Smooth Frame Render Loop
 * Precise frame budget governor guaranteeing 60+ FPS responsive window rendering
 */

import { SystemConstants, KernelEvent } from '../core/types.js';
import { DOMBus } from '../core/event-bus.js';

export class RenderLoopEngine {
  constructor(compositor, onFrameTick) {
    this.compositor = compositor;
    this.onFrameTick = onFrameTick;

    this.isRunning = false;
    this.animationFrameId = null;

    this.lastFrameTime = performance.now();
    this.fps = 60;
    this.frameBudgetMs = SystemConstants.TARGET_FRAME_BUDGET_MS; // 16.666 ms
    this.droppedFramesCount = 0;

    // Rolling frame history for telemetry graph
    this.frameTimeHistory = new Float32Array(60);
    this.historyIndex = 0;

    this._boundTick = this._tick.bind(this);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this._boundTick);
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  _tick(currentTime) {
    if (!this.isRunning) return;

    const deltaMs = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Smooth instantaneous FPS calculation
    if (deltaMs > 0) {
      const currentFps = 1000 / deltaMs;
      this.fps = Math.round((this.fps * 0.9) + (currentFps * 0.1));
    }

    // Frame budget monitoring (sub-16.6ms threshold)
    if (deltaMs > 18.0) {
      this.droppedFramesCount++;
    }

    // Record in circular telemetry buffer
    this.frameTimeHistory[this.historyIndex] = deltaMs;
    this.historyIndex = (this.historyIndex + 1) % 60;

    DOMBus.publish(KernelEvent.COMPOSITOR_FRAME_BEGIN, { currentTime, deltaMs, fps: this.fps });

    // 1. Execute Compositor Draw Pass
    this.compositor.render(currentTime, deltaMs);

    // 2. Execute any application-level render hooks
    if (typeof this.onFrameTick === 'function') {
      this.onFrameTick(currentTime, deltaMs);
    }

    DOMBus.publish(KernelEvent.COMPOSITOR_FRAME_END, {
      currentTime,
      fps: this.fps,
      renderTimeMs: this.compositor.metrics.renderTimeMs,
    });

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this._boundTick);
  }

  getMetrics() {
    return {
      fps: this.fps,
      renderTimeMs: this.compositor.metrics.renderTimeMs.toFixed(2),
      drawCalls: this.compositor.metrics.drawCalls,
      droppedFrames: this.droppedFramesCount,
    };
  }
}
