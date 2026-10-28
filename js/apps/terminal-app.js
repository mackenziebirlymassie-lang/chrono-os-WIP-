/**
 * ChronosOS - Terminal Emulator Application
 * Integrates Virtual Teletype (VTY) with Shell Engine in a draggable, resizable window
 */

import { VirtualTeletype } from '../shell/vty.js';
import { ShellSession } from '../shell/shell-engine.js';

export class TerminalApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;

    this.container = document.createElement('div');
    this.container.className = 'terminal-container';

    this.scrollback = document.createElement('div');
    this.scrollback.className = 'terminal-scrollback';

    this.inputRow = document.createElement('div');
    this.inputRow.className = 'terminal-prompt-row';

    this.inputField = document.createElement('input');
    this.inputField.type = 'text';
    this.inputField.className = 'terminal-input-field';
    this.inputField.spellcheck = false;
    this.inputField.autocomplete = 'off';

    this.inputRow.appendChild(this.inputField);
    this.container.appendChild(this.scrollback);
    this.container.appendChild(this.inputRow);
    this.win.clientArea.appendChild(this.container);

    this.vty = new VirtualTeletype({
      onRender: (lines, currentInput) => this._renderVTY(lines, currentInput),
    });
    this.win.vty = this.vty;

    this.session = new ShellSession(this.kernel, this.vty);

    this._bindEvents();
  }

  _bindEvents() {
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.inputField.value;
        this.inputField.value = '';
        this.vty.handleInput(val + '\r');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.vty.handleInput('\x1b[A');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.vty.handleInput('\x1b[B');
      }
    });

    // Auto-focus input when terminal client area is clicked
    this.container.addEventListener('click', () => {
      this.inputField.focus();
    });

    // Ensure immediate focus
    setTimeout(() => this.inputField.focus(), 50);
  }

  _renderVTY(lines, currentLine) {
    this.scrollback.innerHTML = '';
    for (const line of lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'terminal-line';
      lineEl.textContent = line || ' ';
      this.scrollback.appendChild(lineEl);
    }
    this.scrollback.scrollTop = this.scrollback.scrollHeight;
  }

  onDestroy() {
    this.vty = null;
    this.session = null;
  }
}
