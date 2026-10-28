/**
 * ChronosOS - Window Surface & Canvas Framebuffer
 * High-performance offscreen 2D canvas backing store with dirty-rect optimization
 */

import { Rect2D } from '../core/types.js';

export class WindowSurface {
  constructor(width = 640, height = 480) {
    this.width = width;
    this.height = height;
    this.dpr = window.devicePixelRatio || 1;

    // Allocate Backing Canvas
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width * this.dpr, height * this.dpr);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width * this.dpr;
      this.canvas.height = height * this.dpr;
    }

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.ctx.scale(this.dpr, this.dpr);

    this.isDirty = true;
    this.dirtyRect = new Rect2D(0, 0, width, height);
  }

  resize(newWidth, newHeight) {
    if (newWidth === this.width && newHeight === this.height) return;
    this.width = Math.max(1, newWidth);
    this.height = Math.max(1, newHeight);

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.markDirty(new Rect2D(0, 0, this.width, this.height));
  }

  markDirty(rect = null) {
    this.isDirty = true;
    if (!rect) {
      this.dirtyRect = new Rect2D(0, 0, this.width, this.height);
    } else {
      this.dirtyRect = rect;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.markDirty();
  }

  getContext() {
    return this.ctx;
  }
}
