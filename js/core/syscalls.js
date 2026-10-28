/**
 * ChronosOS - System Call (Syscall) Interface
 * POSIX-compatible system call gateway mediating user-space and kernel privileges
 */

import { Syscall, Signal } from './types.js';

export class SyscallHandler {
  constructor(kernel) {
    this.kernel = kernel;
    this._dispatchTable = new Map();
    this._registerCoreSyscalls();
    this.syscallCounter = 0;
  }

  _registerCoreSyscalls() {
    this._dispatchTable.set(Syscall.SYS_YIELD, (pcb) => {
      this.kernel.scheduler.yield();
      return 0;
    });

    this._dispatchTable.set(Syscall.SYS_GETPID, (pcb) => pcb.pid);
    this._dispatchTable.set(Syscall.SYS_GETPPID, (pcb) => pcb.ppid);

    this._dispatchTable.set(Syscall.SYS_SLEEP, (pcb, durationMs) => {
      this.kernel.scheduler.sleep(pcb, durationMs);
      return 0;
    });

    this._dispatchTable.set(Syscall.SYS_EXIT, (pcb, exitCode = 0) => {
      this.kernel.processManager.terminateProcess(pcb.pid, exitCode);
      return 0;
    });

    this._dispatchTable.set(Syscall.SYS_KILL, (pcb, targetPid, signal = Signal.SIGTERM) => {
      return this.kernel.processManager.sendSignal(targetPid, signal);
    });

    this._dispatchTable.set(Syscall.SYS_MALLOC, (pcb, sizeBytes) => {
      return this.kernel.memoryManager.allocateProcessMemory(pcb.pid, sizeBytes);
    });

    this._dispatchTable.set(Syscall.SYS_FREE, (pcb, virtualAddress) => {
      return this.kernel.memoryManager.freeProcessMemory(pcb.pid, virtualAddress);
    });

    this._dispatchTable.set(Syscall.SYS_WRITE, (pcb, fd, buffer) => {
      return this.kernel.vfs.write(pcb, fd, buffer);
    });

    this._dispatchTable.set(Syscall.SYS_READ, (pcb, fd, count) => {
      return this.kernel.vfs.read(pcb, fd, count);
    });

    this._dispatchTable.set(Syscall.SYS_OPEN, (pcb, path, flags) => {
      return this.kernel.vfs.open(pcb, path, flags);
    });

    this._dispatchTable.set(Syscall.SYS_CLOSE, (pcb, fd) => {
      return this.kernel.vfs.close(pcb, fd);
    });

    this._dispatchTable.set(Syscall.SYS_GETTICKS, () => {
      return performance.now();
    });
  }

  /**
   * Trap an incoming system call from a user process
   * @param {Object} pcb - Calling process PCB
   * @param {number} syscallNumber - Syscall code from Syscall enum
   * @param  {...any} args - Syscall arguments
   * @returns {any} Result of the syscall
   */
  trap(pcb, syscallNumber, ...args) {
    this.syscallCounter++;
    const handler = this._dispatchTable.get(syscallNumber);
    if (!handler) {
      console.warn(`[Syscall] Unknown syscall ${syscallNumber} requested by PID ${pcb.pid}`);
      return -1;
    }
    return handler(pcb, ...args);
  }
}
