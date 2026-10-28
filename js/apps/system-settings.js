/**
 * ChronosOS - System Settings Application
 * Controls scheduler quantum, theme palettes, memory thresholds, and hardware diagnostics
 */

export class SystemSettingsApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;

    this.container = document.createElement('div');
    this.container.className = 'settings-container';

    this._buildUI();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="settings-sidebar">
        <button class="settings-nav-btn is-active" data-section="system">⚙️ System</button>
        <button class="settings-nav-btn" data-section="scheduler">⚡ Scheduler</button>
        <button class="settings-nav-btn" data-section="display">🖥️ Display</button>
        <button class="settings-nav-btn" data-section="about">ℹ️ About</button>
      </div>

      <div class="settings-content-panel" id="settings-panel">
        <div class="settings-section-card">
          <div class="os-subtitle">Kernel & Engine Configuration</div>
          <div class="settings-row">
            <div>
              <div style="font-weight: bold;">Cooperative Scheduler Quantum</div>
              <div class="os-mono" style="color: var(--color-neutral-700); font-size: 11px;">Maximum microtask execution slice per process</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="range" id="settings-quantum-slider" min="2" max="32" value="${this.kernel.scheduler.quantumMs}" step="2" style="width: 100px;">
              <span class="os-mono" id="settings-quantum-val">${this.kernel.scheduler.quantumMs} ms</span>
            </div>
          </div>

          <div class="settings-row">
            <div>
              <div style="font-weight: bold;">Sub-16ms Frame Governor</div>
              <div class="os-mono" style="color: var(--color-neutral-700); font-size: 11px;">Target 60 FPS hardware-accelerated compositor budget</div>
            </div>
            <div>
              <span class="os-badge os-badge-success">ACTIVE (16.66ms)</span>
            </div>
          </div>
        </div>

        <div class="settings-section-card">
          <div class="os-subtitle">Virtual Memory Management Unit (MMU)</div>
          <div class="settings-row">
            <div>
              <div style="font-weight: bold;">Total Physical RAM</div>
              <div class="os-mono" style="color: var(--color-neutral-700); font-size: 11px;">Simulated 64MB backing store (16,384 4KB pages)</div>
            </div>
            <span class="os-mono" style="color: var(--color-primary-300);">65,536 KB</span>
          </div>

          <div class="settings-row">
            <div>
              <div style="font-weight: bold;">Page Size</div>
              <div class="os-mono" style="color: var(--color-neutral-700); font-size: 11px;">Hardware translation page unit</div>
            </div>
            <span class="os-mono">4,096 Bytes</span>
          </div>
        </div>

        <div class="settings-section-card">
          <div class="os-subtitle">Diagnostics & Testing</div>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="os-btn os-btn-sm" id="settings-btn-stress">Run Scheduler Stress Test</button>
            <button class="os-btn os-btn-sm os-btn-danger" id="settings-btn-log">Log Kernel Stats</button>
          </div>
        </div>
      </div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _bindEvents() {
    const slider = this.container.querySelector('#settings-quantum-slider');
    const valLabel = this.container.querySelector('#settings-quantum-val');

    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.kernel.scheduler.quantumMs = val;
      valLabel.textContent = `${val} ms`;
    });

    this.container.querySelector('#settings-btn-stress').addEventListener('click', () => {
      for (let i = 0; i < 15; i++) {
        let step = 0;
        this.kernel.processManager.spawn(`stress_worker_${i}`, () => {
          step++;
          return step < 300;
        });
      }
      alert('Spawned 15 stress test processes in microtask scheduler!');
    });

    this.container.querySelector('#settings-btn-log').addEventListener('click', () => {
      console.log('--- ChronosOS Kernel Diagnostics ---');
      console.log('Scheduler:', this.kernel.scheduler.telemetry);
      console.log('MMU:', this.kernel.memoryManager.mmu.getMemoryUsageMetrics());
      console.log('Processes:', this.kernel.processManager.getProcessList());
      alert('Diagnostic report logged to browser developer tools console.');
    });
  }

  onDestroy() {}
}
