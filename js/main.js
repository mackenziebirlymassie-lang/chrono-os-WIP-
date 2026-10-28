/**
 * ChronosOS - Application Entry Point
 * Boots the Zero-Dependency Kernel & Desktop Environment
 */

import { ChronosKernel } from './core/kernel.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('desktop-canvas');
  const shellEl = document.getElementById('desktop-shell');
  const taskbarEl = document.getElementById('taskbar-root');
  const startMenuEl = document.getElementById('start-menu-root');
  const trayTelemetryEl = document.getElementById('tray-telemetry');
  const clockEl = document.getElementById('tray-clock');
  const startBtn = document.getElementById('start-btn');

  const kernel = new ChronosKernel();

  // Boot OS
  kernel.boot({
    canvasEl,
    shellEl,
    taskbarEl,
    startMenuEl,
    trayTelemetryEl,
    clockEl,
  });

  // Start Button Click Toggle
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    kernel.desktop.toggleStartMenu();
  });

  // Open Initial Default System Windows Cascaded on Desktop (Instant zero-delay mount)
  requestAnimationFrame(() => {
    kernel.launchApp('terminal', { x: 72, y: 56 });
    kernel.launchApp('taskmanager', { x: 440, y: 120 });
  });
});
