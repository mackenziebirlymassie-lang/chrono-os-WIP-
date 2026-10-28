/**
 * ChronosOS - Canvas Paint & Graphics Studio Application
 * Interactive multi-layered canvas drawing testing high-frequency pointer input and sub-16ms compositor
 */

export class CanvasPaintApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;

    this.container = document.createElement('div');
    this.container.className = 'canvas-paint-container';

    this.currentColor = '#38bdf8';
    this.brushSize = 4;
    this.currentTool = 'brush'; // 'brush', 'eraser', 'rect', 'circle'
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this._buildUI();
    this._initCanvas();
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="paint-toolbar">
        <button class="os-btn os-btn-sm is-active" id="paint-tool-brush">Brush</button>
        <button class="os-btn os-btn-sm" id="paint-tool-eraser">Eraser</button>
        <button class="os-btn os-btn-sm" id="paint-tool-rect">Rectangle</button>
        <button class="os-btn os-btn-sm" id="paint-tool-circle">Circle</button>
        <div style="width: 1px; height: 16px; background: var(--state-default-border);"></div>
        <input type="color" id="paint-color-picker" value="#38bdf8" style="width: 24px; height: 24px; border: none; background: transparent; cursor: pointer;">
        <input type="range" id="paint-size-slider" min="1" max="32" value="4" style="width: 80px;">
        <div style="flex: 1;"></div>
        <button class="os-btn os-btn-sm os-btn-danger" id="paint-clear-btn">Clear Canvas</button>
      </div>

      <div class="paint-viewport-wrapper">
        <canvas class="paint-drawing-canvas" id="paint-canvas" width="600" height="400"></canvas>
      </div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _initCanvas() {
    this.canvas = this.container.querySelector('#paint-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _bindEvents() {
    const colorPicker = this.container.querySelector('#paint-color-picker');
    const sizeSlider = this.container.querySelector('#paint-size-slider');
    const clearBtn = this.container.querySelector('#paint-clear-btn');

    colorPicker.addEventListener('change', (e) => {
      this.currentColor = e.target.value;
    });

    sizeSlider.addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value, 10);
    });

    clearBtn.addEventListener('click', () => {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    });

    // Tool switches
    const toolBtns = ['brush', 'eraser', 'rect', 'circle'];
    toolBtns.forEach(tool => {
      const btn = this.container.querySelector(`#paint-tool-${tool}`);
      btn.addEventListener('click', () => {
        toolBtns.forEach(t => this.container.querySelector(`#paint-tool-${t}`).classList.remove('is-active'));
        btn.classList.add('is-active');
        this.currentTool = tool;
      });
    });

    // Pointer drawing listeners
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDrawing = true;
      const rect = this.canvas.getBoundingClientRect();
      this.lastX = e.clientX - rect.left;
      this.lastY = e.clientY - rect.top;
      this._draw(this.lastX, this.lastY, false);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDrawing) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this._draw(x, y, true);
      this.lastX = x;
      this.lastY = y;
    });

    window.addEventListener('pointerup', () => {
      this.isDrawing = false;
    });
  }

  _draw(x, y, isMove) {
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.currentTool === 'eraser') {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.fillStyle = '#ffffff';
    } else {
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.fillStyle = this.currentColor;
    }

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      if (isMove) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  onDestroy() {
    this.canvas = null;
    this.ctx = null;
  }
}
