/**
 * ChronosOS - Memory Registry & MMU Inspector Application
 * Real-time physical page visualizer, hex dump viewer, and slab allocator stress tester
 */

export class MemoryInspectorApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;

    this.container = document.createElement('div');
    this.container.className = 'memory-inspector-container';

    this.testPointers = [];
    this._buildUI();
    this._startPolling();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="memory-stats-header">
        <div>
          <span style="color: var(--color-neutral-950); font-weight: bold;">MMU Physical RAM</span>
          <span id="mem-usage-label" style="margin-left: 8px; color: var(--color-primary-300);"></span>
        </div>
        <div style="display: flex; gap: 8px;">
          <span class="os-badge" style="background: #818cf8; color: #fff;">Kernel (1MB)</span>
          <span class="os-badge" style="background: #38bdf8; color: #fff;">Process Page</span>
          <span class="os-badge" style="background: #10b981; color: #fff;">Slab Object</span>
          <span class="os-badge" style="background: #1e293b; color: #94a3b8;">Free Frame</span>
        </div>
      </div>

      <div class="os-toolbar">
        <button class="os-btn os-btn-sm" id="mem-btn-slab">+ 64B Slab</button>
        <button class="os-btn os-btn-sm" id="mem-btn-page">+ 4KB Page</button>
        <button class="os-btn os-btn-sm" id="mem-btn-large">+ 64KB Chunk</button>
        <button class="os-btn os-btn-sm os-btn-danger" id="mem-btn-free">Free Allocation</button>
        <button class="os-btn os-btn-sm" id="mem-btn-hexdump">Dump Frame 0</button>
      </div>

      <div class="memory-page-grid-container">
        <div>
          <div class="os-subtitle" style="font-size: 13px; margin-bottom: 4px;">Physical 4KB Frame Allocation Matrix (First 1,024 Frames)</div>
          <div class="memory-page-grid" id="mem-grid"></div>
        </div>

        <div style="flex: 1; display: flex; flex-direction: column;">
          <div class="os-subtitle" style="font-size: 13px; margin-bottom: 4px;">Real-Time Frame Hex Dump Inspector</div>
          <pre class="memory-hex-viewer" id="mem-hex-viewer"></pre>
        </div>
      </div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _bindEvents() {
    const alloc = this.kernel.memoryManager.allocator;

    this.container.querySelector('#mem-btn-slab').addEventListener('click', () => {
      const ptr = alloc.malloc(1, 64, 'test_slab_64');
      if (ptr) this.testPointers.push(ptr);
      this.updateView();
    });

    this.container.querySelector('#mem-btn-page').addEventListener('click', () => {
      const ptr = alloc.malloc(1, 4096, 'test_page_4k');
      if (ptr) this.testPointers.push(ptr);
      this.updateView();
    });

    this.container.querySelector('#mem-btn-large').addEventListener('click', () => {
      const ptr = alloc.malloc(1, 65536, 'test_chunk_64k');
      if (ptr) this.testPointers.push(ptr);
      this.updateView();
    });

    this.container.querySelector('#mem-btn-free').addEventListener('click', () => {
      if (this.testPointers.length > 0) {
        const ptr = this.testPointers.pop();
        alloc.free(1, ptr);
        this.updateView();
      }
    });

    this.container.querySelector('#mem-btn-hexdump').addEventListener('click', () => {
      const dump = this.kernel.memoryManager.mmu.getHexDump(0, 256);
      const hexEl = this.container.querySelector('#mem-hex-viewer');
      if (hexEl) hexEl.textContent = dump;
    });
  }

  _startPolling() {
    this.pollInterval = setInterval(() => {
      this.updateView();
    }, 1000);
    this.updateView();
  }

  updateView() {
    const snapshot = this.kernel.memoryManager.registry.getSystemMemorySnapshot();
    const m = snapshot.mmu;

    const label = this.container.querySelector('#mem-usage-label');
    if (label) {
      label.textContent = `${(m.usedBytes / 1024).toFixed(0)} KB / ${(m.totalBytes / 1024).toFixed(0)} KB (${m.utilizationPct}%) - ${m.pageFaults} Page Faults`;
    }

    const grid = this.container.querySelector('#mem-grid');
    if (grid && grid.children.length === 0) {
      // Build initial grid cells using DocumentFragment for instant rendering
      const frag = document.createDocumentFragment();
      for (let i = 0; i < snapshot.frames.length; i++) {
        const cell = document.createElement('div');
        cell.className = `memory-frame-cell ${snapshot.frames[i].state}`;
        cell.title = `Frame #${i} (Addr 0x${(i * 4096).toString(16).toUpperCase()})`;
        cell.addEventListener('click', () => {
          const dump = this.kernel.memoryManager.mmu.getHexDump(i * 4096, 256);
          const hexEl = this.container.querySelector('#mem-hex-viewer');
          if (hexEl) hexEl.textContent = dump;
        });
        frag.appendChild(cell);
      }
      grid.appendChild(frag);
    } else if (grid) {
      // Update existing classes
      for (let i = 0; i < snapshot.frames.length; i++) {
        const cell = grid.children[i];
        if (cell) {
          cell.className = `memory-frame-cell ${snapshot.frames[i].state}`;
        }
      }
    }

    // Default hex dump if empty
    const hexEl = this.container.querySelector('#mem-hex-viewer');
    if (hexEl && !hexEl.textContent) {
      hexEl.textContent = this.kernel.memoryManager.mmu.getHexDump(0, 256);
    }
  }

  onDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}
