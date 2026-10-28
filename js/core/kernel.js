/**
 * ChronosOS - Central Kernel Coordinator & Bootloader
 * Zero-dependency ES6+ Master System orchestrating memory, scheduler, processes, and UI
 */

import { ProcessPriority, KernelEvent } from './types.js';
import { DOMBus } from './event-bus.js';
import { KernelScheduler } from './scheduler.js';
import { KernelMMU } from '../memory/mmu.js';
import { KernelAllocator } from '../memory/allocator.js';
import { KernelMemoryRegistry } from '../memory/registry.js';
import { KernelProcessTree } from '../process/process-tree.js';
import { KernelProcessManager } from '../process/process-manager.js';
import { KernelVFS } from '../fs/vfs.js';
import { SyscallHandler } from './syscalls.js';
import { KeyboardIO } from '../input/keyboard-io.js';
import { PointerManager } from '../input/pointer-manager.js';
import { WindowManager } from '../display/window-manager.js';
import { CanvasCompositor } from '../display/compositor.js';
import { RenderLoopEngine } from '../display/render-loop.js';

// Application Registry
import { TerminalApp } from '../apps/terminal-app.js';
import { TaskManagerApp } from '../apps/task-manager-app.js';
import { MemoryInspectorApp } from '../apps/memory-inspector.js';
import { CanvasPaintApp } from '../apps/canvas-paint-app.js';
import { FileExplorerApp } from '../apps/file-explorer-app.js';
import { CodeEditorApp } from '../apps/code-editor-app.js';
import { SystemSettingsApp } from '../apps/system-settings.js';

export class ChronosKernel {
  constructor() {
    this.bus = DOMBus;
    this.scheduler = KernelScheduler;
    this.memoryManager = {
      mmu: KernelMMU,
      allocator: KernelAllocator,
      registry: KernelMemoryRegistry,
    };
    this.processTree = KernelProcessTree;
    this.processManager = KernelProcessManager;
    this.vfs = KernelVFS;
    this.syscalls = new SyscallHandler(this);

    this.windowManager = null;
    this.compositor = null;
    this.renderLoop = null;
    this.keyboard = null;
    this.pointer = null;
    this.desktop = null;

    this.appRegistry = new Map();
    this.isBooted = false;
  }

  /**
   * Boot the operating system kernel and initialize all subsystems
   */
  boot(domElements) {
    if (this.isBooted) return;
    console.log('[Kernel] Initiating ChronosOS boot sequence...');

    const { canvasEl, shellEl, taskbarEl, startMenuEl, trayTelemetryEl, clockEl } = domElements;

    // 1. Initialize Window & Display Subsystems
    this.windowManager = new WindowManager(shellEl);
    this.windowManager.setTaskbarContainer(taskbarEl.querySelector('.taskbar-center-tasks'));

    this.compositor = new CanvasCompositor(canvasEl, this.windowManager);
    this.renderLoop = new RenderLoopEngine(this.compositor, (t, d) => this._onRenderFrame(t, d));

    // 2. Initialize Input & DOM Bus
    this.bus.bindDOM(window);
    this.pointer = new PointerManager(this.windowManager);
    this.keyboard = new KeyboardIO(this);

    // 3. Register Desktop System Applications
    this._registerSystemApps();

    // 4. Initialize Desktop UI Glue
    this._initDesktopUI(domElements);

    // 5. Spawn Core Kernel Processes
    this._spawnKernelProcesses();

    // 6. Start Engines
    this.scheduler.start();
    this.renderLoop.start();

    this.isBooted = true;
    window.ChronosKernel = this;
    this.bus.publish(KernelEvent.KERNEL_BOOT, { timestamp: performance.now() });

    console.log('[Kernel] Boot complete. Microtask scheduler & sub-16ms render loop active.');
  }

  _registerSystemApps() {
    this.appRegistry.set('terminal', {
      title: 'Quantum Terminal',
      icon: '💻',
      width: 680,
      height: 440,
      factory: (win, options) => new TerminalApp(win, this, options),
    });

    this.appRegistry.set('taskmanager', {
      title: 'Task Manager & Process Tree',
      icon: '📊',
      width: 720,
      height: 480,
      factory: (win, options) => new TaskManagerApp(win, this, options),
    });

    this.appRegistry.set('memoryinspector', {
      title: 'Memory Registry & MMU',
      icon: '🧠',
      width: 760,
      height: 520,
      factory: (win, options) => new MemoryInspectorApp(win, this, options),
    });

    this.appRegistry.set('paint', {
      title: 'Paint & Graphics Studio',
      icon: '🎨',
      width: 680,
      height: 480,
      factory: (win, options) => new CanvasPaintApp(win, this, options),
    });

    this.appRegistry.set('files', {
      title: 'File Explorer',
      icon: '📁',
      width: 640,
      height: 420,
      factory: (win, options) => new FileExplorerApp(win, this, options),
    });

    this.appRegistry.set('editor', {
      title: 'Code Editor',
      icon: '📝',
      width: 720,
      height: 480,
      factory: (win, options) => new CodeEditorApp(win, this, options),
    });

    this.appRegistry.set('settings', {
      title: 'System Settings',
      icon: '⚙️',
      width: 580,
      height: 420,
      factory: (win, options) => new SystemSettingsApp(win, this, options),
    });
  }

  _spawnKernelProcesses() {
    // PID 1: init daemon (sleeps between maintenance intervals)
    this.processManager.spawn('init', (pcb, sched) => {
      sched.sleep(pcb, 1000);
      return true;
    }, ProcessPriority.KERNEL, 0);

    // PID 2: kthreadd (kernel thread manager daemon)
    this.processManager.spawn('kthreadd', (pcb, sched) => {
      sched.sleep(pcb, 1000);
      return true;
    }, ProcessPriority.KERNEL, 1);

    // PID 3: udevd (device and bus listener daemon)
    this.processManager.spawn('udevd', (pcb, sched) => {
      sched.sleep(pcb, 1000);
      return true;
    }, ProcessPriority.KERNEL, 1);

    // PID 4: compositor_sync (compositor synchronization thread)
    this.processManager.spawn('compositor_sync', (pcb, sched) => {
      sched.sleep(pcb, 250);
      return true;
    }, ProcessPriority.REALTIME, 1);
  }

  _initDesktopUI(domElements) {
    const { startMenuEl, trayTelemetryEl, clockEl } = domElements;

    // Start Menu Controller
    this.desktop = {
      isStartMenuOpen: false,
      toggleStartMenu: () => {
        this.desktop.isStartMenuOpen = !this.desktop.isStartMenuOpen;
        if (this.desktop.isStartMenuOpen) {
          startMenuEl.classList.add('is-open');
        } else {
          startMenuEl.classList.remove('is-open');
        }
      },
      closeStartMenu: () => {
        this.desktop.isStartMenuOpen = false;
        startMenuEl.classList.remove('is-open');
      },
    };

    // Close start menu when clicking outside
    document.addEventListener('pointerdown', (e) => {
      if (this.desktop.isStartMenuOpen && !e.target.closest('.start-menu-flyout') && !e.target.closest('.taskbar-start-btn')) {
        this.desktop.closeStartMenu();
      }
    });

    // Populate Start Menu App Grid
    const startGrid = startMenuEl.querySelector('.start-menu-apps-grid');
    if (startGrid) {
      startGrid.innerHTML = '';
      for (const [appId, def] of this.appRegistry.entries()) {
        const card = document.createElement('div');
        card.className = 'start-menu-app-card';
        card.innerHTML = `
          <div class="app-icon-badge" style="background: rgba(14, 165, 233, 0.2);">${def.icon}</div>
          <div class="app-meta">
            <span class="app-title">${def.title}</span>
            <span class="app-description">${appId}.app</span>
          </div>
        `;
        card.addEventListener('click', () => {
          this.launchApp(appId);
          this.desktop.closeStartMenu();
        });
        startGrid.appendChild(card);
      }
    }

    // Populate Desktop Icons
    const desktopContainer = document.querySelector('.desktop-icons-container');
    if (desktopContainer) {
      desktopContainer.innerHTML = '';
      for (const [appId, def] of this.appRegistry.entries()) {
        const item = document.createElement('div');
        item.className = 'desktop-icon-item';
        item.innerHTML = `
          <div class="desktop-icon-graphic" style="background: rgba(27, 38, 55, 0.8);">${def.icon}</div>
          <div class="desktop-icon-label">${def.title}</div>
        `;
        item.addEventListener('dblclick', () => {
          this.launchApp(appId);
        });
        desktopContainer.appendChild(item);
      }
    }

    // Real-Time Clock
    const updateClock = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
      clockEl.innerHTML = `<span>${timeStr}</span><span style="font-size: 10px; color: var(--color-neutral-700);">${dateStr}</span>`;
    };
    setInterval(updateClock, 1000);
    updateClock();
  }

  /**
   * Launch an application in a managed window
   */
  launchApp(appId, options = {}) {
    const def = this.appRegistry.get(appId);
    if (!def) {
      console.warn(`[Kernel] App '${appId}' is not registered.`);
      return null;
    }

    // 1. Spawn a user space process for this app instance
    const pcb = this.processManager.spawn(`${appId}.app`, null, ProcessPriority.INTERACTIVE);

    // 2. Create the window
    const win = this.windowManager.createWindow({
      appId,
      title: def.title,
      icon: def.icon,
      width: def.width,
      height: def.height,
      attachedPid: pcb.pid,
      ...options,
    });

    // 3. Instantiate Application Logic
    const appInstance = def.factory(win, options);
    win.appInstance = appInstance;

    return win;
  }

  _onRenderFrame(currentTime, deltaMs) {
    // Update live system tray gauges throttled to 250ms for optimal DOM performance
    if (!this._lastTrayUpdate || (currentTime - this._lastTrayUpdate) >= 250) {
      this._lastTrayUpdate = currentTime;
      const trayEl = document.getElementById('tray-telemetry');
      if (trayEl && this.renderLoop) {
        const fps = this.renderLoop.fps;
        const cpu = this.scheduler.telemetry.cpuUtilization;

        trayEl.innerHTML = `
          <div class="metric-badge">
            <span class="metric-dot ${cpu > 80 ? 'danger' : cpu > 50 ? 'warn' : ''}"></span>
            <span>${cpu}% CPU</span>
          </div>
          <div style="width: 1px; height: 12px; background: var(--state-default-border);"></div>
          <div class="metric-badge">
            <span>${fps} FPS</span>
          </div>
        `;
      }
    }
  }
}
