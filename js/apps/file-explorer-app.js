/**
 * ChronosOS - Graphical File Explorer Application
 * Directory tree navigation, file viewing, and VFS file management
 */

export class FileExplorerApp {
  constructor(windowInstance, kernel) {
    this.win = windowInstance;
    this.kernel = kernel;
    this.currentPath = '/home/user';

    this.container = document.createElement('div');
    this.container.className = 'file-explorer-container';

    this._buildUI();
    this.navigateTo(this.currentPath);
  }

  _buildUI() {
    this.container.innerHTML = `
      <div class="file-tree-sidebar">
        <div class="os-subtitle" style="font-size: 12px; margin-bottom: 8px; color: var(--color-neutral-700);">PLACES</div>
        <div class="settings-nav-btn" data-path="/home/user">📁 Home</div>
        <div class="settings-nav-btn" data-path="/bin">📁 /bin</div>
        <div class="settings-nav-btn" data-path="/etc">📁 /etc</div>
        <div class="settings-nav-btn" data-path="/proc">📁 /proc</div>
        <div class="settings-nav-btn" data-path="/tmp">📁 /tmp</div>
      </div>

      <div class="file-explorer-main">
        <div class="file-address-bar">
          <button class="os-btn os-btn-sm" id="fe-btn-up">⬆ Up</button>
          <input type="text" class="os-input os-input-mono" id="fe-path-input" value="/home/user" style="flex: 1; height: 28px;">
          <button class="os-btn os-btn-sm" id="fe-btn-newfile">+ New File</button>
        </div>

        <div class="file-items-grid" id="fe-grid"></div>
      </div>
    `;

    this.win.clientArea.appendChild(this.container);
    this._bindEvents();
  }

  _bindEvents() {
    this.container.querySelectorAll('.file-tree-sidebar .settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.navigateTo(btn.dataset.path);
      });
    });

    const upBtn = this.container.querySelector('#fe-btn-up');
    upBtn.addEventListener('click', () => {
      if (this.currentPath === '/' || this.currentPath === '') return;
      const lastSlash = this.currentPath.lastIndexOf('/');
      const parent = lastSlash <= 0 ? '/' : this.currentPath.substring(0, lastSlash);
      this.navigateTo(parent);
    });

    const pathInput = this.container.querySelector('#fe-path-input');
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigateTo(pathInput.value);
      }
    });

    const newFileBtn = this.container.querySelector('#fe-btn-newfile');
    newFileBtn.addEventListener('click', () => {
      const name = prompt('Enter file name:', 'new_document.txt');
      if (name) {
        const fullPath = this.currentPath === '/' ? `/${name}` : `${this.currentPath}/${name}`;
        this.kernel.vfs.writeFile(fullPath, 'Hello from ChronosOS!\n');
        this.navigateTo(this.currentPath);
      }
    });
  }

  navigateTo(path) {
    const items = this.kernel.vfs.readdir(path);
    this.currentPath = path;

    const pathInput = this.container.querySelector('#fe-path-input');
    if (pathInput) pathInput.value = path;

    const grid = this.container.querySelector('#fe-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const item of items) {
      const fullItemPath = path === '/' ? `/${item}` : `${path}/${item}`;
      const resolved = this.kernel.vfs.resolve(fullItemPath);
      const isDir = resolved && resolved.type === 'DIRECTORY';

      const card = document.createElement('div');
      card.className = 'file-grid-item';
      card.innerHTML = `
        <div class="file-icon">${isDir ? '📁' : '📄'}</div>
        <div class="file-name" title="${item}">${item}</div>
      `;

      card.addEventListener('dblclick', () => {
        if (isDir) {
          this.navigateTo(fullItemPath);
        } else {
          // Open in Code Editor
          this.kernel.launchApp('editor', { filePath: fullItemPath });
        }
      });

      grid.appendChild(card);
    }
  }

  onDestroy() {}
}
