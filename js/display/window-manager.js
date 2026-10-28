/**
 * ChronosOS - Window Manager & Chrome Orchestrator
 * Controls multi-window lifecycle, z-ordering, 8pt geometry, and taskbar synchronization
 */

import { Rect2D, WindowSnapState, KernelEvent } from '../core/types.js';
import { DOMBus } from '../core/event-bus.js';
import { WindowSurface } from './surface.js';
import { KernelCoordinates } from '../input/coordinate-space.js';

export class WindowManager {
  constructor(desktopShellElement) {
    this.shell = desktopShellElement;
    this.windows = new Map(); // id -> WindowInstance
    this.zOrder = [];         // Array of window IDs from bottom to top
    this.activeWindowId = null;
    this.snapPreviewState = WindowSnapState.NONE;

    this._windowIdCounter = 1;
    this._taskbarContainer = null;
    this._snapGhostEl = null;

    this._initSnapGhost();
  }

  setTaskbarContainer(el) {
    this._taskbarContainer = el;
  }

  _initSnapGhost() {
    this._snapGhostEl = document.createElement('div');
    this._snapGhostEl.className = 'window-snap-ghost';
    this.shell.appendChild(this._snapGhostEl);
  }

  /**
   * Create and open a new system window
   */
  createWindow(options = {}) {
    const id = `win_${this._windowIdCounter++}`;
    const title = options.title || 'Untitled Window';
    const icon = options.icon || '🪟';
    const width = KernelCoordinates.snap(options.width || 640);
    const height = KernelCoordinates.snap(options.height || 420);

    // Cascade initial window positions
    const offset = (this.windows.size % 8) * 24;
    const x = KernelCoordinates.snap(options.x ?? (80 + offset));
    const y = KernelCoordinates.snap(options.y ?? (60 + offset));

    const bounds = new Rect2D(x, y, width, height);
    const surface = options.useCanvasSurface ? new WindowSurface(width, height - 32) : null;

    // Create DOM Window Element
    const el = document.createElement('div');
    el.className = 'os-window';
    el.dataset.windowId = id;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Render Window Chrome (Titlebar + Controls + Resize Handles)
    el.innerHTML = `
      <div class="window-titlebar">
        <div class="window-titlebar-left">
          <span class="window-app-icon">${icon}</span>
          <span class="window-title-text">${title}</span>
        </div>
        <div class="window-titlebar-controls">
          <button class="win-btn win-btn-min" title="Minimize" aria-label="Minimize">─</button>
          <button class="win-btn win-btn-max" title="Maximize" aria-label="Maximize">□</button>
          <button class="win-btn win-btn-close" title="Close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="window-client-area"></div>
      <div class="resize-handle resize-n" data-edge="n"></div>
      <div class="resize-handle resize-s" data-edge="s"></div>
      <div class="resize-handle resize-e" data-edge="e"></div>
      <div class="resize-handle resize-w" data-edge="w"></div>
      <div class="resize-handle resize-nw" data-edge="nw"></div>
      <div class="resize-handle resize-ne" data-edge="ne"></div>
      <div class="resize-handle resize-sw" data-edge="sw"></div>
      <div class="resize-handle resize-se" data-edge="se"></div>
    `;

    const clientArea = el.querySelector('.window-client-area');
    if (surface && surface.canvas) {
      surface.canvas.className = 'window-surface-canvas';
      clientArea.appendChild(surface.canvas);
    }

    this.shell.appendChild(el);

    const win = {
      id,
      title,
      icon,
      appId: options.appId || 'generic',
      bounds,
      normalBounds: bounds.clone(),
      surface,
      domElement: el,
      clientArea,
      isMinimized: false,
      isMaximized: false,
      isFocused: false,
      attachedPid: options.attachedPid || null,
      appInstance: null,
      vty: null,
    };

    // Bind window control buttons
    el.querySelector('.win-btn-min').addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeWindow(id);
    });

    el.querySelector('.win-btn-max').addEventListener('click', (e) => {
      e.stopPropagation();
      if (win.isMaximized) {
        this.restoreWindow(id);
      } else {
        this.maximizeWindow(id);
      }
    });

    el.querySelector('.win-btn-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(id);
    });

    this.windows.set(id, win);
    this.zOrder.push(id);
    this.focusWindow(id);
    this._syncTaskbar();

    DOMBus.publish(KernelEvent.WINDOW_CREATED, { win });
    return win;
  }

  focusWindow(id) {
    if (!this.windows.has(id)) return;
    const win = this.windows.get(id);

    // Unfocus previously focused window
    if (this.activeWindowId && this.windows.has(this.activeWindowId)) {
      const prev = this.windows.get(this.activeWindowId);
      prev.isFocused = false;
      prev.domElement.classList.remove('is-focused');
    }

    // Elevate to top of Z-Order
    const zIndex = this.zOrder.indexOf(id);
    if (zIndex !== -1) {
      this.zOrder.splice(zIndex, 1);
    }
    this.zOrder.push(id);

    win.isFocused = true;
    win.isMinimized = false;
    win.domElement.classList.remove('is-minimized');
    win.domElement.classList.add('is-focused');
    this.activeWindowId = id;

    this._applyZIndices();
    this._syncTaskbar();

    DOMBus.publish(KernelEvent.WINDOW_FOCUS_CHANGED, { win });
  }

  minimizeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.isMinimized = true;
    win.isFocused = false;
    win.domElement.classList.remove('is-focused');
    win.domElement.classList.add('is-minimized');

    // Switch focus to next top window
    const remaining = this.zOrder.filter(wId => wId !== id && !this.windows.get(wId).isMinimized);
    if (remaining.length > 0) {
      this.focusWindow(remaining[remaining.length - 1]);
    } else {
      this.activeWindowId = null;
    }

    this._syncTaskbar();
  }

  maximizeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (!win.isMaximized) {
      win.normalBounds = win.bounds.clone();
      win.isMaximized = true;
      win.domElement.classList.add('is-maximized');
      win.domElement.style.transform = 'translate3d(0, 0, 0)';
      win.domElement.querySelector('.win-btn-max').textContent = '❐';
    }
  }

  restoreWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (win.isMaximized) {
      win.isMaximized = false;
      win.domElement.classList.remove('is-maximized');
      win.bounds = win.normalBounds.clone();
      this.applyWindowBounds(win);
      win.domElement.querySelector('.win-btn-max').textContent = '□';
    }
  }

  snapWindow(id, snapState) {
    const win = this.windows.get(id);
    if (!win) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight - 48; // Taskbar height

    if (snapState === WindowSnapState.MAXIMIZED) {
      this.maximizeWindow(id);
      return;
    }

    win.isMaximized = false;
    win.domElement.classList.remove('is-maximized');
    win.domElement.querySelector('.win-btn-max').textContent = '□';

    if (snapState === WindowSnapState.LEFT_HALF) {
      win.bounds = new Rect2D(0, 0, Math.floor(screenW / 2), screenH);
    } else if (snapState === WindowSnapState.RIGHT_HALF) {
      win.bounds = new Rect2D(Math.floor(screenW / 2), 0, Math.ceil(screenW / 2), screenH);
    }

    this.applyWindowBounds(win);
  }

  closeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    // Terminate attached process if any
    if (win.attachedPid && window.ChronosKernel) {
      window.ChronosKernel.processManager.terminateProcess(win.attachedPid);
    }

    if (win.appInstance && typeof win.appInstance.onDestroy === 'function') {
      win.appInstance.onDestroy();
    }

    win.domElement.remove();
    this.windows.delete(id);

    const zIndex = this.zOrder.indexOf(id);
    if (zIndex !== -1) {
      this.zOrder.splice(zIndex, 1);
    }

    if (this.activeWindowId === id) {
      this.activeWindowId = this.zOrder.length > 0 ? this.zOrder[this.zOrder.length - 1] : null;
      if (this.activeWindowId) {
        this.focusWindow(this.activeWindowId);
      }
    }

    this._syncTaskbar();
    DOMBus.publish(KernelEvent.WINDOW_DESTROYED, { id });
  }

  applyWindowBounds(win) {
    const el = win.domElement;
    el.style.width = `${win.bounds.width}px`;
    el.style.height = `${win.bounds.height}px`;
    el.style.transform = `translate3d(${win.bounds.x}px, ${win.bounds.y}px, 0)`;

    if (win.surface) {
      win.surface.resize(win.bounds.width, win.bounds.height - 32);
    }
  }

  updateSnapPreview(snapState) {
    this.snapPreviewState = snapState;
    if (!this._snapGhostEl) return;

    if (snapState === WindowSnapState.NONE) {
      this._snapGhostEl.style.display = 'none';
      return;
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight - 48;
    this._snapGhostEl.style.display = 'block';

    if (snapState === WindowSnapState.MAXIMIZED) {
      this._snapGhostEl.style.top = '0px';
      this._snapGhostEl.style.left = '0px';
      this._snapGhostEl.style.width = `${screenW}px`;
      this._snapGhostEl.style.height = `${screenH}px`;
    } else if (snapState === WindowSnapState.LEFT_HALF) {
      this._snapGhostEl.style.top = '0px';
      this._snapGhostEl.style.left = '0px';
      this._snapGhostEl.style.width = `${Math.floor(screenW / 2)}px`;
      this._snapGhostEl.style.height = `${screenH}px`;
    } else if (snapState === WindowSnapState.RIGHT_HALF) {
      this._snapGhostEl.style.top = '0px';
      this._snapGhostEl.style.left = `${Math.floor(screenW / 2)}px`;
      this._snapGhostEl.style.width = `${Math.ceil(screenW / 2)}px`;
      this._snapGhostEl.style.height = `${screenH}px`;
    }
  }

  hideSnapPreview() {
    this.snapPreviewState = WindowSnapState.NONE;
    if (this._snapGhostEl) {
      this._snapGhostEl.style.display = 'none';
    }
  }

  cycleFocus() {
    if (this.zOrder.length <= 1) return;
    const bottomId = this.zOrder[0];
    this.focusWindow(bottomId);
  }

  _applyZIndices() {
    for (let i = 0; i < this.zOrder.length; i++) {
      const id = this.zOrder[i];
      const win = this.windows.get(id);
      if (win) {
        win.domElement.style.zIndex = 10 + i;
      }
    }
  }

  _syncTaskbar() {
    if (!this._taskbarContainer) return;
    this._taskbarContainer.innerHTML = '';

    for (const id of this.zOrder) {
      const win = this.windows.get(id);
      if (!win) continue;

      const pill = document.createElement('div');
      pill.className = `taskbar-app-item ${win.isFocused ? 'is-focused' : ''} ${win.isMinimized ? 'is-minimized' : ''}`;
      pill.innerHTML = `<span>${win.icon}</span><span>${win.title}</span>`;

      pill.addEventListener('click', () => {
        if (win.isFocused) {
          this.minimizeWindow(id);
        } else {
          this.focusWindow(id);
        }
      });

      this._taskbarContainer.appendChild(pill);
    }
  }

  getWindow(id) { return this.windows.get(id); }
  getActiveWindow() { return this.windows.get(this.activeWindowId); }
  getWindowsInZOrder() { return this.zOrder.map(id => this.windows.get(id)).filter(Boolean); }
}
