/**
 * ChronosOS - Unified Pointer Event Manager
 * Handles window drag, 8-directional resizing, edge snapping, and focus arbitration
 */

import { DOMBus } from '../core/event-bus.js';
import { KernelCoordinates } from './coordinate-space.js';
import { KernelEvent, WindowSnapState } from '../core/types.js';

export class PointerManager {
  constructor(windowManager) {
    this.wm = windowManager;
    this.coords = KernelCoordinates;

    this.dragState = null;   // { windowId, initialX, initialY, initialWinX, initialWinY }
    this.resizeState = null; // { windowId, edge, initialX, initialY, initialRect }
    this.snapPreviewState = WindowSnapState.NONE;

    this._setupSubscriptions();
  }

  _setupSubscriptions() {
    DOMBus.subscribe(KernelEvent.DOM_POINTER_DOWN, (ev) => this._onPointerDown(ev.payload));
    DOMBus.subscribe(KernelEvent.DOM_POINTER_MOVE, (ev) => this._onPointerMove(ev.payload));
    DOMBus.subscribe(KernelEvent.DOM_POINTER_UP, (ev) => this._onPointerUp(ev.payload));
  }

  _onPointerDown(payload) {
    const { clientX, clientY, target } = payload;

    // Check if target is inside a window
    const windowEl = target.closest?.('.os-window');
    if (!windowEl) return;

    const windowId = windowEl.dataset.windowId;
    const win = this.wm.getWindow(windowId);
    if (!win) return;

    // Bring window to top of stack
    this.wm.focusWindow(windowId);

    // 1. Check if clicking on resize handles
    const resizeHandle = target.closest?.('.resize-handle');
    if (resizeHandle) {
      const edge = resizeHandle.dataset.edge;
      this.resizeState = {
        windowId,
        edge,
        initialX: clientX,
        initialY: clientY,
        initialRect: win.bounds.clone(),
      };
      return;
    }

    // 2. Check if clicking on titlebar (initiate drag)
    const titlebar = target.closest?.('.window-titlebar');
    const isControlBtn = target.closest?.('.win-btn');

    if (titlebar && !isControlBtn && !win.isMaximized) {
      this.dragState = {
        windowId,
        initialX: clientX,
        initialY: clientY,
        initialWinX: win.bounds.x,
        initialWinY: win.bounds.y,
      };
    }
  }

  _onPointerMove(payload) {
    const { clientX, clientY } = payload;

    // 1. Handle Active Dragging
    if (this.dragState) {
      const win = this.wm.getWindow(this.dragState.windowId);
      if (!win) return;

      const deltaX = clientX - this.dragState.initialX;
      const deltaY = clientY - this.dragState.initialY;

      let newX = this.dragState.initialWinX + deltaX;
      let newY = this.dragState.initialWinY + deltaY;

      // Check edge snapping thresholds (within 16px of screen edges)
      const screenW = window.innerWidth;
      const screenH = window.innerHeight - 48; // Taskbar height

      let snapState = WindowSnapState.NONE;
      if (clientY <= 8) {
        snapState = WindowSnapState.MAXIMIZED;
      } else if (clientX <= 8) {
        snapState = WindowSnapState.LEFT_HALF;
      } else if (clientX >= screenW - 8) {
        snapState = WindowSnapState.RIGHT_HALF;
      }

      this.snapPreviewState = snapState;
      this.wm.updateSnapPreview(snapState);

      // Apply coordinates with 8pt grid snapping
      win.bounds.x = newX;
      win.bounds.y = newY;
      this.wm.applyWindowBounds(win);
      return;
    }

    // 2. Handle Active Resizing (8 directions)
    if (this.resizeState) {
      const win = this.wm.getWindow(this.resizeState.windowId);
      if (!win) return;

      const { edge, initialX, initialY, initialRect } = this.resizeState;
      const deltaX = clientX - initialX;
      const deltaY = clientY - initialY;

      const newRect = initialRect.clone();

      if (edge.includes('e')) newRect.width = Math.max(280, initialRect.width + deltaX);
      if (edge.includes('s')) newRect.height = Math.max(180, initialRect.height + deltaY);
      if (edge.includes('w')) {
        const potentialWidth = initialRect.width - deltaX;
        if (potentialWidth >= 280) {
          newRect.x = initialRect.x + deltaX;
          newRect.width = potentialWidth;
        }
      }
      if (edge.includes('n')) {
        const potentialHeight = initialRect.height - deltaY;
        if (potentialHeight >= 180) {
          newRect.y = initialRect.y + deltaY;
          newRect.height = potentialHeight;
        }
      }

      // Apply 8pt grid snapping on window resize
      const snappedRect = this.coords.snapRect(newRect);
      win.bounds = snappedRect;
      this.wm.applyWindowBounds(win);
    }
  }

  _onPointerUp() {
    if (this.dragState) {
      const win = this.wm.getWindow(this.dragState.windowId);
      if (win && this.snapPreviewState !== WindowSnapState.NONE) {
        this.wm.snapWindow(win.id, this.snapPreviewState);
      }
      this.wm.hideSnapPreview();
      this.dragState = null;
      this.snapPreviewState = WindowSnapState.NONE;
    }

    if (this.resizeState) {
      this.resizeState = null;
    }
  }
}
