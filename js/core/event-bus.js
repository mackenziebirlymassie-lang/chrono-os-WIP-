/**
 * ChronosOS - HTML5 DOM Bus & Kernel Event Broker
 * Zero runtime framework event dispatcher bridging native browser DOM with OS subsystems
 */

import { KernelEvent } from './types.js';

export class KernelEventBus {
  constructor() {
    this._listeners = new Map();
    this._domBound = false;
    this._history = [];
    this._maxHistory = 100;
    this._metrics = {
      totalDispatched: 0,
      totalErrors: 0,
      avgDispatchDurationMs: 0,
      lastDispatchedAt: 0,
    };
  }

  /**
   * Subscribe a listener callback to a specific event topic or wildcard pattern
   * @param {string} eventName - Topic name or wildcard (e.g. 'process:*', 'dom:pointer:down')
   * @param {Function} callback - Execution callback (eventData, meta) => void
   * @param {Object} options - { priority: number, once: boolean }
   * @returns {Function} Unsubscribe handle
   */
  subscribe(eventName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new TypeError(`EventBus: callback must be a function, received ${typeof callback}`);
    }

    const priority = options.priority ?? 10;
    const once = options.once ?? false;

    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }

    const entry = { callback, priority, once };
    const list = this._listeners.get(eventName);
    list.push(entry);
    
    // Sort descending by priority (higher priority executes first)
    list.sort((a, b) => b.priority - a.priority);

    return () => {
      this.unsubscribe(eventName, callback);
    };
  }

  /**
   * Unsubscribe a previously registered callback
   */
  unsubscribe(eventName, callback) {
    if (!this._listeners.has(eventName)) return;
    const list = this._listeners.get(eventName);
    const index = list.findIndex(e => e.callback === callback);
    if (index !== -1) {
      list.splice(index, 1);
    }
    if (list.length === 0) {
      this._listeners.delete(eventName);
    }
  }

  /**
   * Emit an event immediately across all matching subscriptions
   * @param {string} eventName - Topic
   * @param {any} payload - Event payload
   * @returns {boolean} True if event was not cancelled
   */
  publish(eventName, payload = {}) {
    const startTime = performance.now();
    const eventObject = {
      type: eventName,
      payload,
      timestamp: startTime,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
    };

    const matchedEntries = [];

    // Exact matches
    if (this._listeners.has(eventName)) {
      matchedEntries.push(...this._listeners.get(eventName));
    }

    // Pattern matches (wildcard support e.g. "dom:pointer:*")
    for (const [pattern, entries] of this._listeners.entries()) {
      if (pattern.includes('*')) {
        const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regexPattern.test(eventName)) {
          matchedEntries.push(...entries);
        }
      }
    }

    // Sort aggregated matches by priority
    matchedEntries.sort((a, b) => b.priority - a.priority);

    for (const entry of matchedEntries) {
      if (eventObject.propagationStopped) break;

      try {
        entry.callback(eventObject);
      } catch (err) {
        this._metrics.totalErrors++;
        console.error(`[EventBus] Unhandled exception in listener for "${eventName}":`, err);
      }

      if (entry.once) {
        this.unsubscribe(eventName, entry.callback);
      }
    }

    const duration = performance.now() - startTime;
    this._metrics.totalDispatched++;
    this._metrics.avgDispatchDurationMs = (this._metrics.avgDispatchDurationMs * 0.95) + (duration * 0.05);
    this._metrics.lastDispatchedAt = startTime;

    // Track circular history buffer
    if (this._history.length >= this._maxHistory) {
      this._history.shift();
    }
    this._history.push({ event: eventName, duration, timestamp: startTime });

    return !eventObject.defaultPrevented;
  }

  /**
   * Bind the native HTML5 DOM input events to the kernel bus
   */
  bindDOM(rootElement = window) {
    if (this._domBound) return;
    this._domBound = true;

    // Pointer events (Unified mouse, pen, touch)
    rootElement.addEventListener('pointerdown', (ev) => {
      this.publish(KernelEvent.DOM_POINTER_DOWN, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        button: ev.button,
        buttons: ev.buttons,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType,
        target: ev.target,
        shiftKey: ev.shiftKey,
        ctrlKey: ev.ctrlKey,
        altKey: ev.altKey,
        metaKey: ev.metaKey,
        originalEvent: ev,
      });
    }, { passive: false });

    rootElement.addEventListener('pointermove', (ev) => {
      this.publish(KernelEvent.DOM_POINTER_MOVE, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        buttons: ev.buttons,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType,
        movementX: ev.movementX,
        movementY: ev.movementY,
        originalEvent: ev,
      });
    }, { passive: true });

    rootElement.addEventListener('pointerup', (ev) => {
      this.publish(KernelEvent.DOM_POINTER_UP, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        button: ev.button,
        pointerId: ev.pointerId,
        pointerType: ev.pointerType,
        originalEvent: ev,
      });
    }, { passive: true });

    rootElement.addEventListener('wheel', (ev) => {
      this.publish(KernelEvent.DOM_POINTER_WHEEL, {
        deltaX: ev.deltaX,
        deltaY: ev.deltaY,
        clientX: ev.clientX,
        clientY: ev.clientY,
        originalEvent: ev,
      });
    }, { passive: true });

    // Keyboard events
    rootElement.addEventListener('keydown', (ev) => {
      const allowed = this.publish(KernelEvent.DOM_KEY_DOWN, {
        key: ev.key,
        code: ev.code,
        keyCode: ev.keyCode,
        repeat: ev.repeat,
        ctrlKey: ev.ctrlKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        metaKey: ev.metaKey,
        originalEvent: ev,
      });
      // Prevent browser default on OS hotkeys (e.g. F5, Ctrl+W, Ctrl+S) if cancelled
      if (!allowed) {
        ev.preventDefault();
      }
    }, { passive: false });

    rootElement.addEventListener('keyup', (ev) => {
      this.publish(KernelEvent.DOM_KEY_UP, {
        key: ev.key,
        code: ev.code,
        keyCode: ev.keyCode,
        ctrlKey: ev.ctrlKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        metaKey: ev.metaKey,
        originalEvent: ev,
      });
    }, { passive: true });

    // Window lifecycle
    window.addEventListener('resize', () => {
      this.publish(KernelEvent.DOM_RESIZE, {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
    });

    window.addEventListener('focus', () => {
      this.publish(KernelEvent.DOM_FOCUS, {});
    });

    window.addEventListener('blur', () => {
      this.publish(KernelEvent.DOM_BLUR, {});
    });

    // Prevent default context menu on desktop
    rootElement.addEventListener('contextmenu', (ev) => {
      // Allow context menu only if explicitly permitted by window client
      const isInput = ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA';
      if (!isInput) {
        ev.preventDefault();
      }
    });
  }

  getMetrics() {
    return { ...this._metrics, activeSubscriptions: this._listeners.size };
  }
}

// Global Singleton for the operating system
export const DOMBus = new KernelEventBus();
