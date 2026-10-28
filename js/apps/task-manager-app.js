/**
 * ChronosOS - Task Manager & Process Tree Application
 * Real-time process hierarchy visualizer, live CPU sparkline, and thread governor
 */

import { ProcessPriority, Signal } from '../core/types.js';

export class TaskManagerApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;

    this.container = document.createElement('div');
    this.container.className = 'task-manager-container';

    this.selectedPid = null;
    this.cpuHistory = new Array(30).fill(0);

    this._buildUI();
    this._startPolling();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="task-manager-metrics-strip">
        <div class="metric-card-mini">
          <span class="metric-card-title">CPU Utilization</span>
          <span class="metric-card-value" id="tm-cpu-val">0%</span>
          <canvas class="metric-sparkline-canvas" id="tm-cpu-spark" width="120" height="28"></canvas>
        </div>
        <div class="metric-card-mini">
          <span class="metric-card-title">Physical Memory</span>
          <span class="metric-card-value" id="tm-ram-val">0 KB</span>
          <span class="os-mono" style="font-size: 10px; color: var(--color-neutral-700);" id="tm-ram-sub">0% allocated</span>
        </div>
        <div class="metric-card-mini">
          <span class="metric-card-title">Microtask Scheduler</span>
          <span class="metric-card-value" id="tm-tasks-val">0 ticks</span>
          <span class="os-mono" style="font-size: 10px; color: var(--color-neutral-700);" id="tm-tasks-sub">Quantum: 8ms</span>
        </div>
        <div class="metric-card-mini">
          <span class="metric-card-title">Compositor Engine</span>
          <span class="metric-card-value" id="tm-fps-val">60 FPS</span>
          <span class="os-mono" style="font-size: 10px; color: var(--color-success-text);" id="tm-fps-sub">Frame: <16ms</span>
        </div>
      </div>

      <div class="os-toolbar">
        <button class="os-btn os-btn-sm" id="tm-btn-spawn">+ Spawn Task</button>
        <button class="os-btn os-btn-sm os-btn-danger" id="tm-btn-kill" disabled>Kill Process</button>
        <button class="os-btn os-btn-sm" id="tm-btn-refresh">Refresh Tree</button>
        <div style="flex: 1;"></div>
        <span class="os-mono" style="color: var(--color-neutral-700);" id="tm-count-label">0 processes</span>
      </div>

      <div class="os-table-container" style="flex: 1;">
        <table class="os-table" id="tm-table">
          <thead>
            <tr>
              <th>PID</th>
              <th>PPID</th>
              <th>Name</th>
              <th>State</th>
              <th>Priority</th>
              <th>CPU (ms)</th>
              <th>Ticks</th>
            </tr>
          </thead>
          <tbody id="tm-table-body"></tbody>
        </table>
      </div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _bindEvents() {
    this.container.querySelector('#tm-btn-spawn').addEventListener('click', () => {
      let count = 0;
      this.kernel.processManager.spawn(`worker_${Math.floor(Math.random() * 1000)}`, () => {
        count++;
        return count < 400;
      }, ProcessPriority.INTERACTIVE);
      this.updateView();
    });

    this.container.querySelector('#tm-btn-kill').addEventListener('click', () => {
      if (this.selectedPid) {
        this.kernel.processManager.sendSignal(this.selectedPid, Signal.SIGKILL);
        this.selectedPid = null;
        this.updateView();
      }
    });

    this.container.querySelector('#tm-btn-refresh').addEventListener('click', () => {
      this.updateView();
    });
  }

  _startPolling() {
    this.pollInterval = setInterval(() => {
      this.updateView();
    }, 500);
    this.updateView();
  }

  updateView() {
    const procs = this.kernel.processManager.getProcessList();
    const sched = this.kernel.scheduler.telemetry;
    const mem = this.kernel.memoryManager.mmu.getMemoryUsageMetrics();
    const fps = this.kernel.renderLoop ? this.kernel.renderLoop.fps : 60;

    // Update telemetry headers
    const cpuEl = this.container.querySelector('#tm-cpu-val');
    const ramEl = this.container.querySelector('#tm-ram-val');
    const ramSub = this.container.querySelector('#tm-ram-sub');
    const tasksEl = this.container.querySelector('#tm-tasks-val');
    const fpsEl = this.container.querySelector('#tm-fps-val');
    const countLabel = this.container.querySelector('#tm-count-label');

    if (cpuEl) cpuEl.textContent = `${sched.cpuUtilization}%`;
    if (ramEl) ramEl.textContent = `${(mem.usedBytes / 1024).toFixed(0)} KB`;
    if (ramSub) ramSub.textContent = `${mem.utilizationPct}% allocated (${mem.allocatedFrames} frames)`;
    if (tasksEl) tasksEl.textContent = `${sched.ticksTotal} ticks`;
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    if (countLabel) countLabel.textContent = `${procs.length} processes`;

    // Render Sparkline
    this.cpuHistory.shift();
    this.cpuHistory.push(sched.cpuUtilization);
    this._drawSparkline();

    // Populate Process Table
    const tbody = this.container.querySelector('#tm-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();

    const killBtn = this.container.querySelector('#tm-btn-kill');

    for (const p of procs) {
      const tr = document.createElement('tr');
      if (p.pid === this.selectedPid) {
        tr.classList.add('is-selected');
      }

      let badgeClass = 'os-badge-info';
      if (p.state === 'RUNNING') badgeClass = 'os-badge-success';
      if (p.state === 'BLOCKED' || p.state === 'SLEEPING') badgeClass = 'os-badge-warning';
      if (p.state === 'TERMINATED') badgeClass = 'os-badge-danger';

      tr.innerHTML = `
        <td>${p.pid}</td>
        <td>${p.ppid}</td>
        <td style="font-weight: bold; color: var(--color-neutral-950);">${p.name}</td>
        <td><span class="os-badge ${badgeClass}">${p.state}</span></td>
        <td>${p.priority}</td>
        <td>${p.cpuTimeMs.toFixed(1)}</td>
        <td>${p.ticks}</td>
      `;

      tr.addEventListener('click', () => {
        this.selectedPid = p.pid;
        if (killBtn) {
          killBtn.disabled = (p.pid <= 1);
        }
        this.updateView();
      });

      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  _drawSparkline() {
    const canvas = this.container.querySelector('#tm-cpu-spark');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = w / (this.cpuHistory.length - 1);
    for (let i = 0; i < this.cpuHistory.length; i++) {
      const val = this.cpuHistory[i];
      const y = h - ((val / 100) * (h - 4)) - 2;
      const x = i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  onDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}
