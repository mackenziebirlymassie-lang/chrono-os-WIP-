/**
 * ChronosOS - Virtual File System (VFS)
 * Hierarchical POSIX file tree with standard directories (/bin, /dev, /etc, /proc, /home)
 */

import { Inode, FileNodeType, FileDescriptor, OpenFlags } from './file-node.js';

export class VirtualFileSystem {
  constructor() {
    this._nextInode = 1;
    this.root = this._createDirectory('', null);
    this._initStandardHierarchy();
  }

  _createDirectory(name, parent = null) {
    const inode = new Inode(this._nextInode++, name, FileNodeType.DIRECTORY, 0o755);
    inode.children.set('.', inode);
    inode.children.set('..', parent || inode);
    return inode;
  }

  _createFile(name, parent, content = '', mode = 0o644) {
    const inode = new Inode(this._nextInode++, name, FileNodeType.FILE, mode);
    inode.setData(content);
    parent.children.set(name, inode);
    return inode;
  }

  _initStandardHierarchy() {
    const bin = this.mkdir('/bin');
    const dev = this.mkdir('/dev');
    const etc = this.mkdir('/etc');
    const proc = this.mkdir('/proc');
    const home = this.mkdir('/home');
    const user = this.mkdir('/home/user');
    const tmp = this.mkdir('/tmp');

    // Populate /etc
    this.writeFile('/etc/os-release', 'NAME="ChronosOS"\nVERSION="2.4.0-quantum"\nID=chronos\nPRETTY_NAME="ChronosOS Vanilla ES6+ Edition"\n');
    this.writeFile('/etc/motd', 'Welcome to ChronosOS!\nZero runtime frameworks. Sub-16ms smooth frame render loop.\nCooperative microtask scheduler online.\n');

    // Populate /home/user
    this.writeFile('/home/user/welcome.txt', 'Welcome to your ChronosOS desktop!\nFeel free to explore the Terminal, Process Tree, Memory Inspector, and Code Editor.\n');
    this.writeFile('/home/user/benchmarks.js', '// Microtask Quantum Benchmark Script\nlet sum = 0;\nfor (let i = 0; i < 100000; i++) {\n  sum += Math.sqrt(i);\n}\nconsole.log("Benchmark computed:", sum);\n');

    // Populate /proc dynamic virtual files
    this.writeFile('/proc/cpuinfo', 'model name: Virtual Quantum Microtask Core\ncpu MHz: 60.000\ncache size: 4096 KB\n');
    this.writeFile('/proc/version', 'ChronosOS Kernel v2.4 (ES6+ HTML5 DOM-Bus Engine)\n');
  }

  /**
   * Resolve an absolute or relative path string into an Inode
   */
  resolve(path, currentWorkingDir = '/') {
    if (!path) return null;
    let normalized = path.startsWith('/') ? path : `${currentWorkingDir}/${path}`;
    const segments = normalized.split('/').filter(s => s.length > 0 && s !== '.');

    let current = this.root;
    for (const seg of segments) {
      if (seg === '..') {
        current = current.children.get('..') || this.root;
      } else {
        if (!current.children || !current.children.has(seg)) {
          return null;
        }
        current = current.children.get(seg);
      }
    }
    return current;
  }

  mkdir(path) {
    const existing = this.resolve(path);
    if (existing) return existing;

    const parts = path.split('/').filter(p => p.length > 0);
    let current = this.root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children.has(part)) {
        const newDir = this._createDirectory(part, current);
        current.children.set(part, newDir);
        current = newDir;
      } else {
        current = current.children.get(part);
      }
    }
    return current;
  }

  writeFile(path, content) {
    const lastSlash = path.lastIndexOf('/');
    const dirPath = lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
    const fileName = path.substring(lastSlash + 1);

    const dir = this.resolve(dirPath);
    if (!dir || dir.type !== FileNodeType.DIRECTORY) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    if (dir.children.has(fileName)) {
      const file = dir.children.get(fileName);
      file.setData(content);
      return file;
    }

    return this._createFile(fileName, dir, content);
  }

  readFile(path) {
    const inode = this.resolve(path);
    if (!inode || inode.type !== FileNodeType.FILE) {
      return null;
    }
    return inode.getStringData();
  }

  readdir(path) {
    const inode = this.resolve(path);
    if (!inode || inode.type !== FileNodeType.DIRECTORY) {
      return [];
    }
    return Array.from(inode.children.keys()).filter(k => k !== '.' && k !== '..');
  }

  unlink(path) {
    const lastSlash = path.lastIndexOf('/');
    const dirPath = lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
    const fileName = path.substring(lastSlash + 1);

    const dir = this.resolve(dirPath);
    if (!dir || !dir.children.has(fileName)) return false;

    dir.children.delete(fileName);
    return true;
  }
}

export const KernelVFS = new VirtualFileSystem();
