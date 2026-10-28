/**
 * ChronosOS - Process Hierarchy Tree (pstree)
 * Manages parent-child process relationships, orphan reparenting, and tree traversal
 */

export class ProcessTreeNode {
  constructor(pcb) {
    this.pcb = pcb;
    this.pid = pcb.pid;
    this.ppid = pcb.ppid;
    this.children = new Set();
  }
}

export class ProcessTree {
  constructor() {
    this.nodes = new Map(); // pid -> ProcessTreeNode
    this.rootPid = 1;       // init process
  }

  addProcess(pcb) {
    const node = new ProcessTreeNode(pcb);
    this.nodes.set(pcb.pid, node);

    // Link with parent if exists
    if (this.nodes.has(pcb.ppid)) {
      const parentNode = this.nodes.get(pcb.ppid);
      parentNode.children.add(pcb.pid);
    }
    return node;
  }

  removeProcess(pid) {
    if (!this.nodes.has(pid)) return;
    const node = this.nodes.get(pid);

    // 1. Unlink from parent
    if (this.nodes.has(node.ppid)) {
      this.nodes.get(node.ppid).children.delete(pid);
    }

    // 2. Reparent orphan children to init (PID 1)
    if (pid !== this.rootPid && this.nodes.has(this.rootPid)) {
      const initNode = this.nodes.get(this.rootPid);
      for (const childPid of node.children) {
        initNode.children.add(childPid);
        if (this.nodes.has(childPid)) {
          this.nodes.get(childPid).ppid = this.rootPid;
          this.nodes.get(childPid).pcb.ppid = this.rootPid;
        }
      }
    }

    this.nodes.delete(pid);
  }

  getNode(pid) {
    return this.nodes.get(pid);
  }

  /**
   * Produce formatted ASCII process hierarchy (like Unix pstree)
   */
  generateAsciiTree(startPid = 1, prefix = '', isLast = true) {
    if (!this.nodes.has(startPid)) return 'No process tree';
    const node = this.nodes.get(startPid);
    let output = '';

    const connector = isLast ? '└── ' : '├── ';
    output += `${prefix}${connector}${node.pcb.name} (${node.pid}) [${node.pcb.state}]\n`;

    const nextPrefix = prefix + (isLast ? '    ' : '│   ');
    const childrenArray = Array.from(node.children);

    for (let i = 0; i < childrenArray.length; i++) {
      const childPid = childrenArray[i];
      const childIsLast = (i === childrenArray.length - 1);
      output += this.generateAsciiTree(childPid, nextPrefix, childIsLast);
    }

    return output;
  }

  /**
   * Export hierarchical JSON data for GUI Task Manager tree-view
   */
  toHierarchyJSON(startPid = 1) {
    if (!this.nodes.has(startPid)) return null;
    const node = this.nodes.get(startPid);

    return {
      pid: node.pid,
      name: node.pcb.name,
      state: node.pcb.state,
      priority: node.pcb.priority,
      cpuTimeMs: node.pcb.cpuTimeMs.toFixed(1),
      ticks: node.pcb.ticks,
      children: Array.from(node.children)
        .map(childPid => this.toHierarchyJSON(childPid))
        .filter(Boolean),
    };
  }

  getAllProcesses() {
    return Array.from(this.nodes.values()).map(n => n.pcb);
  }
}

export const KernelProcessTree = new ProcessTree();
