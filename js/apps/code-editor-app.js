/**
 * ChronosOS - Code Editor & Script Execution Sandbox
 * Multi-tab code editor with line gutter and live microtask scheduler execution runner
 */

export class CodeEditorApp {
  constructor(windowInstance, kernel, options = {}) {
    this.win = windowInstance;
    this.kernel = kernel;
    this.currentFilePath = options.filePath || '/home/user/benchmarks.js';

    this.container = document.createElement('div');
    this.container.className = 'code-editor-container';

    this._buildUI();
    this._loadFile();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="code-editor-toolbar">
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="os-btn os-btn-sm" id="editor-btn-save">💾 Save</button>
          <span class="os-mono" id="editor-file-label" style="color: var(--color-primary-300);"></span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="os-btn os-btn-sm os-btn-primary" id="editor-btn-run">▶ Run Script</button>
          <button class="os-btn os-btn-sm" id="editor-btn-clear-out">Clear Log</button>
        </div>
      </div>

      <div class="code-editor-main">
        <div class="code-line-numbers" id="editor-lines">1</div>
        <textarea class="code-textarea" id="editor-text" spellcheck="false"></textarea>
      </div>

      <div class="code-output-console" id="editor-console">--- Script Console Output ---</div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _loadFile() {
    const content = this.kernel.vfs.readFile(this.currentFilePath) || '// New Script\n';
    const textEl = this.container.querySelector('#editor-text');
    const labelEl = this.container.querySelector('#editor-file-label');

    if (textEl) textEl.value = content;
    if (labelEl) labelEl.textContent = this.currentFilePath;
    this._updateLineNumbers();
  }

  _bindEvents() {
    const textEl = this.container.querySelector('#editor-text');
    const saveBtn = this.container.querySelector('#editor-btn-save');
    const runBtn = this.container.querySelector('#editor-btn-run');
    const clearBtn = this.container.querySelector('#editor-btn-clear-out');
    const consoleEl = this.container.querySelector('#editor-console');

    textEl.addEventListener('input', () => {
      this._updateLineNumbers();
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textEl.selectionStart;
        const end = textEl.selectionEnd;
        textEl.value = textEl.value.substring(0, start) + '  ' + textEl.value.substring(end);
        textEl.selectionStart = textEl.selectionEnd = start + 2;
      }
    });

    saveBtn.addEventListener('click', () => {
      this.kernel.vfs.writeFile(this.currentFilePath, textEl.value);
      this._logConsole(`Saved ${this.currentFilePath} (${textEl.value.length} bytes)`);
    });

    clearBtn.addEventListener('click', () => {
      consoleEl.textContent = '--- Script Console Output ---';
    });

    runBtn.addEventListener('click', () => {
      this._executeScript(textEl.value);
    });
  }

  _updateLineNumbers() {
    const textEl = this.container.querySelector('#editor-text');
    const linesEl = this.container.querySelector('#editor-lines');
    if (!textEl || !linesEl) return;

    const lineCount = textEl.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lineCount; i++) {
      numbers += `${i}\n`;
    }
    linesEl.textContent = numbers;
  }

  _logConsole(msg) {
    const consoleEl = this.container.querySelector('#editor-console');
    if (consoleEl) {
      consoleEl.textContent += `\n[${new Date().toLocaleTimeString()}] ${msg}`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }

  _executeScript(code) {
    this._logConsole(`[Kernel] Spawning user process for script...`);

    // Sandboxed execution within a simulated OS process
    const scriptPid = this.kernel.processManager.spawn('user_script.js', (pcb) => {
      try {
        const customConsole = {
          log: (...args) => this._logConsole(args.join(' ')),
          warn: (...args) => this._logConsole(`[WARN] ${args.join(' ')}`),
          error: (...args) => this._logConsole(`[ERROR] ${args.join(' ')}`),
        };

        const runner = new Function('console', 'kernel', 'pcb', code);
        runner(customConsole, this.kernel, pcb);
        this._logConsole(`[Kernel] Process PID ${pcb.pid} finished successfully.`);
      } catch (err) {
        this._logConsole(`[Kernel Error] Exception in PID ${pcb.pid}: ${err.message}`);
      }
      return false; // Done
    });

    this._logConsole(`[Kernel] Process PID ${scriptPid.pid} scheduled in microtask engine.`);
  }

  onDestroy() {}
}
