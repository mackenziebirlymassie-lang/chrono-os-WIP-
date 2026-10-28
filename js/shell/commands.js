/**
 * ChronosOS - Shell Built-in Commands Suite
 * Rich set of POSIX-compliant shell commands for kernel process, memory, and filesystem management
 */

import { Signal } from '../core/types.js';

export class ShellCommandRegistry {
  constructor(kernel) {
    this.kernel = kernel;
    this.commands = new Map();
    this._registerCommands();
  }

  _registerCommands() {
    // 1. HELP
    this.commands.set('help', {
      desc: 'Show available system commands',
      execute: () => {
        return [
          'ChronosOS Shell - Available Commands:',
          '  help               - Display this help message',
          '  neofetch           - Display system info & architecture banner',
          '  ps                 - List active system processes',
          '  pstree             - Display hierarchical process tree',
          '  top                - Show real-time CPU & memory utilization',
          '  free               - Show virtual memory & slab allocation stats',
          '  kill <pid> [sig]   - Send signal to process (default: SIGTERM)',
          '  spawn <name>       - Spawn simulated background worker process',
          '  memdump [addr]     - Hex dump physical memory frames',
          '  ls [path]          - List directory contents',
          '  cat <file>         - Display file contents',
          '  cd <path>          - Change current working directory',
          '  mkdir <dir>        - Create a new directory',
          '  touch <file>       - Create an empty file',
          '  rm <file>          - Remove file from VFS',
          '  echo <text>        - Print text to stdout',
          '  clear              - Clear terminal display',
          '  uname [-a]         - Print kernel system information',
          '  matrix             - Launch digital rain animation',
          '  date               - Print current system date and time',
        ].join('\n');
      },
    });

    // 2. NEOFETCH
    this.commands.set('neofetch', {
      desc: 'Show system hardware and OS status banner',
      execute: () => {
        const mem = this.kernel.memoryManager.mmu.getMemoryUsageMetrics();
        const sched = this.kernel.scheduler.telemetry;
        return [
          '   ██████╗██╗  ██╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ███████╗  root@chronos-vm',
          '  ██╔════╝██║  ██║██╔══██╗██╔═══██╗████╗  ██║██╔═══██╗██╔════╝  ----------------',
          '  ██║     ███████║██████╔╝██║   ██║██╔██╗ ██║██║   ██║███████╗  OS: ChronosOS Quantum ES6+',
          '  ██║     ██╔══██║██╔══██╗██║   ██║██║╚██╗██║██║   ██║╚════██║  Kernel: 2.4.0-quantum-mmu',
          '  ╚██████╗██║  ██║██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝███████║  Uptime: ' + Math.floor(performance.now() / 1000) + 's',
          '   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝  Scheduler: Microtask Event Loop (8ms)',
          '                                                                 Display: Canvas Compositor (60 FPS)',
          '  Frameworks: None (Zero runtime dependencies)                   Memory: ' + (mem.usedBytes / 1024).toFixed(0) + 'KB / ' + (mem.totalBytes / 1024).toFixed(0) + 'KB (' + mem.utilizationPct + '%)',
          '  Active Processes: ' + this.kernel.processManager.processTable.size + '                       CPU Load: ' + sched.cpuUtilization + '%',
        ].join('\n');
      },
    });

    // 3. PS
    this.commands.set('ps', {
      desc: 'List active processes',
      execute: () => {
        const procs = this.kernel.processManager.getProcessList();
        const header = '  PID   PPID   PRIO   STATE       CPU(ms)   TICKS   NAME';
        const rows = procs.map(p => {
          const pid = String(p.pid).padStart(5, ' ');
          const ppid = String(p.ppid).padStart(6, ' ');
          const prio = String(p.priority).padStart(6, ' ');
          const state = p.state.padEnd(11, ' ');
          const cpu = p.cpuTimeMs.toFixed(1).padStart(9, ' ');
          const ticks = String(p.ticks).padStart(7, ' ');
          return `${pid} ${ppid} ${prio}   ${state} ${cpu} ${ticks}   ${p.name}`;
        });
        return [header, ...rows].join('\n');
      },
    });

    // 4. PSTREE
    this.commands.set('pstree', {
      desc: 'Display hierarchical process tree',
      execute: () => {
        return this.kernel.processTree.generateAsciiTree(1);
      },
    });

    // 5. FREE
    this.commands.set('free', {
      desc: 'Display virtual memory and slab allocator usage',
      execute: () => {
        const m = this.kernel.memoryManager.mmu.getMemoryUsageMetrics();
        const a = this.kernel.memoryManager.allocator.metrics;
        return [
          '              total (KB)    used (KB)    free (KB)    frames (4KB)',
          `Physical RAM: ${(m.totalBytes / 1024).toFixed(0).padStart(10, ' ')}   ${(m.usedBytes / 1024).toFixed(0).padStart(10, ' ')}   ${(m.freeBytes / 1024).toFixed(0).padStart(10, ' ')}   ${m.allocatedFrames} / ${m.totalFrames}`,
          `Slab Heap:    ${(a.activeAllocatedBytes / 1024).toFixed(1).padStart(10, ' ')}   Allocations: ${a.activeAllocationsCount} active, ${a.totalAllocations} total`,
          `Page Faults:  ${m.pageFaults}   Translations: ${m.translationsCount}`,
        ].join('\n');
      },
    });

    // 6. KILL
    this.commands.set('kill', {
      desc: 'Send signal to process',
      execute: (args) => {
        const pid = parseInt(args[0], 10);
        if (isNaN(pid)) return 'Usage: kill <pid> [signal]';
        const sig = args[1] ? parseInt(args[1], 10) : Signal.SIGTERM;
        const ok = this.kernel.processManager.sendSignal(pid, sig);
        return ok ? `Signal ${sig} sent to PID ${pid}` : `Process PID ${pid} not found`;
      },
    });

    // 7. SPAWN
    this.commands.set('spawn', {
      desc: 'Spawn simulated background process',
      execute: (args) => {
        const name = args[0] || 'worker_task';
        let count = 0;
        const pcb = this.kernel.processManager.spawn(name, (proc) => {
          count++;
          if (count > 500) return false; // Terminate after 500 ticks
          return true;
        });
        return `Spawned background task '${name}' with PID ${pcb.pid}`;
      },
    });

    // 8. MEMDUMP
    this.commands.set('memdump', {
      desc: 'Hex dump physical memory frames',
      execute: (args) => {
        const start = args[0] ? parseInt(args[0], 16) : 0;
        const len = args[1] ? parseInt(args[1], 10) : 128;
        return this.kernel.memoryManager.mmu.getHexDump(start, len);
      },
    });

    // 9. LS
    this.commands.set('ls', {
      desc: 'List directory contents',
      execute: (args, ctx) => {
        const targetPath = args[0] || ctx.cwd || '/';
        const items = this.kernel.vfs.readdir(targetPath);
        return items.length > 0 ? items.join('   ') : '(empty directory)';
      },
    });

    // 10. CAT
    this.commands.set('cat', {
      desc: 'Read file contents',
      execute: (args, ctx) => {
        if (!args[0]) return 'Usage: cat <filename>';
        const fullPath = args[0].startsWith('/') ? args[0] : `${ctx.cwd}/${args[0]}`;
        const content = this.kernel.vfs.readFile(fullPath);
        return content !== null ? content : `cat: ${args[0]}: No such file or directory`;
      },
    });

    // 11. CD
    this.commands.set('cd', {
      desc: 'Change directory',
      execute: (args, ctx) => {
        const target = args[0] || '/home/user';
        const resolved = this.kernel.vfs.resolve(target, ctx.cwd);
        if (resolved && resolved.type === 'DIRECTORY') {
          ctx.cwd = target.startsWith('/') ? target : `${ctx.cwd}/${target}`.replace('//', '/');
          return '';
        }
        return `cd: ${target}: No such directory`;
      },
    });

    // 12. MKDIR
    this.commands.set('mkdir', {
      desc: 'Create directory',
      execute: (args, ctx) => {
        if (!args[0]) return 'Usage: mkdir <path>';
        const fullPath = args[0].startsWith('/') ? args[0] : `${ctx.cwd}/${args[0]}`;
        this.kernel.vfs.mkdir(fullPath);
        return '';
      },
    });

    // 13. TOUCH
    this.commands.set('touch', {
      desc: 'Create empty file',
      execute: (args, ctx) => {
        if (!args[0]) return 'Usage: touch <path>';
        const fullPath = args[0].startsWith('/') ? args[0] : `${ctx.cwd}/${args[0]}`;
        this.kernel.vfs.writeFile(fullPath, '');
        return '';
      },
    });

    // 14. RM
    this.commands.set('rm', {
      desc: 'Remove file',
      execute: (args, ctx) => {
        if (!args[0]) return 'Usage: rm <path>';
        const fullPath = args[0].startsWith('/') ? args[0] : `${ctx.cwd}/${args[0]}`;
        const ok = this.kernel.vfs.unlink(fullPath);
        return ok ? '' : `rm: cannot remove '${args[0]}': No such file`;
      },
    });

    // 15. ECHO
    this.commands.set('echo', {
      desc: 'Print arguments to stdout',
      execute: (args) => args.join(' '),
    });

    // 16. UNAME
    this.commands.set('uname', {
      desc: 'Print operating system name',
      execute: (args) => {
        if (args.includes('-a')) {
          return 'ChronosOS 2.4.0 #1 SMP PREEMPT Wed Oct 28 2026 x86_64 Virtual Quantum Core';
        }
        return 'ChronosOS';
      },
    });

    // 17. DATE
    this.commands.set('date', {
      desc: 'Print system date',
      execute: () => new Date().toUTCString(),
    });

    // 18. CLEAR
    this.commands.set('clear', {
      desc: 'Clear terminal screen',
      execute: (_, ctx) => {
        if (ctx.vty) ctx.vty.clear();
        return '';
      },
    });
  }

  execute(commandLine, context = {}) {
    const trimmed = commandLine.trim();
    if (!trimmed) return '';

    // Parse tokens respecting quotes
    const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cleanTokens = tokens.map(t => t.replace(/^["']|["']$/g, ''));
    const cmdName = cleanTokens[0]?.toLowerCase();
    const args = cleanTokens.slice(1);

    const cmd = this.commands.get(cmdName);
    if (!cmd) {
      return `chronos-sh: command not found: ${cmdName}. Type 'help' for available commands.`;
    }

    try {
      return cmd.execute(args, context);
    } catch (err) {
      return `chronos-sh: error executing ${cmdName}: ${err.message}`;
    }
  }
}
