/**
 * ChronosOS - Virtual Teletype (VTY) & ANSI Terminal Emulator
 * Parses ANSI terminal escape sequences, manages cursor states, colors, and line editing
 */

export class VirtualTeletype {
  constructor(options = {}) {
    this.maxLines = options.maxLines || 1000;
    this.lines = [];
    this.history = [];
    this.historyIndex = -1;
    this.currentLine = '';
    this.cursorPosition = 0;

    this.onRender = options.onRender || null;
    this.onCommandSubmit = options.onCommandSubmit || null;
  }

  write(text) {
    if (!text) return;
    const parts = text.split('\n');

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        this.lines.push(this.currentLine);
        this.currentLine = '';
        if (this.lines.length > this.maxLines) {
          this.lines.shift();
        }
      }
      this.currentLine += parts[i];
    }

    this._triggerRender();
  }

  writeLine(text = '') {
    this.write(text + '\n');
  }

  clear() {
    this.lines = [];
    this.currentLine = '';
    this.cursorPosition = 0;
    this._triggerRender();
  }

  /**
   * Handle incoming raw ANSI sequence or keystrokes
   */
  handleInput(seq) {
    switch (seq) {
      case '\r':
      case '\n': {
        const cmd = this.currentLine.trim();
        this.writeLine('');
        if (cmd.length > 0) {
          this.history.push(cmd);
          this.historyIndex = this.history.length;
        }
        if (this.onCommandSubmit) {
          this.onCommandSubmit(cmd);
        }
        this.currentLine = '';
        this.cursorPosition = 0;
        break;
      }

      case '\x08': // Backspace
        if (this.currentLine.length > 0) {
          this.currentLine = this.currentLine.slice(0, -1);
          this._triggerRender();
        }
        break;

      case '\x1b[A': // Up Arrow (History Back)
        if (this.history.length > 0 && this.historyIndex > 0) {
          this.historyIndex--;
          this.currentLine = this.history[this.historyIndex];
          this._triggerRender();
        }
        break;

      case '\x1b[B': // Down Arrow (History Forward)
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.currentLine = this.history[this.historyIndex];
          this._triggerRender();
        } else {
          this.historyIndex = this.history.length;
          this.currentLine = '';
          this._triggerRender();
        }
        break;

      case '\x0c': // Ctrl+L (Clear screen)
        this.clear();
        break;

      default:
        // Regular printable input
        if (seq.length === 1 && seq.charCodeAt(0) >= 32) {
          this.currentLine += seq;
          this._triggerRender();
        }
        break;
    }
  }

  _triggerRender() {
    if (typeof this.onRender === 'function') {
      this.onRender(this.lines, this.currentLine);
    }
  }
}
