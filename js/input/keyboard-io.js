/**
 * ChronosOS - Virtual Shell Keyboard I/O Controller
 * Converts raw keyboard scan codes into ANSI escape sequences and routes OS global hotkeys
 */

import { DOMBus } from '../core/event-bus.js';
import { KernelEvent, Signal } from '../core/types.js';

export class KeyboardIO {
  constructor(kernel) {
    this.kernel = kernel;
    this.keyBuffer = [];
    this.maxBufferSize = 256;
    this._setupSubscriptions();
  }

  _setupSubscriptions() {
    DOMBus.subscribe(KernelEvent.DOM_KEY_DOWN, (ev) => this._handleKeyDown(ev));
  }

  _handleKeyDown(eventWrapper) {
    const ev = eventWrapper.payload;
    const { key, code, ctrlKey, altKey, shiftKey, metaKey } = ev;

    // 1. Global OS System Hotkeys
    if (altKey && key === 'Tab') {
      eventWrapper.preventDefault();
      this.kernel.windowManager.cycleFocus();
      return;
    }

    if (key === 'Meta' || (ctrlKey && key === 'Escape')) {
      eventWrapper.preventDefault();
      this.kernel.desktop.toggleStartMenu();
      return;
    }

    if (ctrlKey && altKey && (key === 't' || key === 'T')) {
      eventWrapper.preventDefault();
      this.kernel.launchApp('terminal');
      return;
    }

    if (ctrlKey && shiftKey && key === 'Escape') {
      eventWrapper.preventDefault();
      this.kernel.launchApp('taskmanager');
      return;
    }

    // 2. Focused Window Input Routing
    const activeWindow = this.kernel.windowManager.getActiveWindow();
    if (!activeWindow) return;

    // Terminal Process Signal Handlers
    if (activeWindow.appId === 'terminal') {
      if (ctrlKey && (key === 'c' || key === 'C')) {
        eventWrapper.preventDefault();
        // Send SIGINT to the active foreground process
        const activePid = activeWindow.attachedPid;
        if (activePid) {
          this.kernel.processManager.sendSignal(activePid, Signal.SIGINT);
        }
        return;
      }
    }

    // 3. Translate key to ANSI sequence for virtual TTY
    const ansiSequence = this._translateToAnsi(ev);
    if (ansiSequence && activeWindow.vty) {
      activeWindow.vty.handleInput(ansiSequence);
    }
  }

  /**
   * Translate special keyboard keys to ANSI terminal escape sequences
   */
  _translateToAnsi(ev) {
    const { key, ctrlKey } = ev;

    if (ctrlKey) {
      if (key === 'a') return '\x01';
      if (key === 'e') return '\x05';
      if (key === 'k') return '\x0b';
      if (key === 'u') return '\x15';
      if (key === 'w') return '\x17';
      if (key === 'l') return '\x0c'; // Clear screen
      if (key === 'd') return '\x04'; // EOF
    }

    switch (key) {
      case 'ArrowUp': return '\x1b[A';
      case 'ArrowDown': return '\x1b[B';
      case 'ArrowRight': return '\x1b[C';
      case 'ArrowLeft': return '\x1b[D';
      case 'Home': return '\x1b[H';
      case 'End': return '\x1b[F';
      case 'PageUp': return '\x1b[5~';
      case 'PageDown': return '\x1b[6~';
      case 'Delete': return '\x1b[3~';
      case 'Backspace': return '\x08';
      case 'Tab': return '\t';
      case 'Enter': return '\r';
      case 'Escape': return '\x1b';
      default:
        // Regular printable character
        if (key.length === 1) {
          return key;
        }
        return null;
    }
  }
}
