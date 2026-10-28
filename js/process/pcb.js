/**
 * ChronosOS - Process Control Block (PCB)
 * Defines the complete execution context, virtual registers, descriptors, and signals for a process
 */

import { ProcessState, ProcessPriority, Signal } from '../core/types.js';

export class PCB {
  constructor(pid, name, ppid = 0, priority = ProcessPriority.INTERACTIVE) {
    this.pid = pid;
    this.ppid = ppid;
    this.name = name;
    this.state = ProcessState.EMBRYO;
    this.priority = priority;
    this.nice = 0; // -20 to 19

    // Execution Context & Virtual Registers
    this.registers = {
      eax: 0,
      ebx: 0,
      ecx: 0,
      edx: 0,
      esi: 0,
      edi: 0,
      esp: 0x7FFFFFFF, // Stack pointer
      ebp: 0x7FFFFFFF, // Base pointer
      eip: 0x00400000, // Instruction pointer
      flags: 0,
    };

    // Performance Accounting
    this.cpuTimeMs = 0;
    this.ticks = 0;
    this.startedAt = performance.now();
    this.yieldRequested = false;
    this.exitCode = null;

    // Standard I/O File Descriptors Table (0 = stdin, 1 = stdout, 2 = stderr)
    this.fdTable = new Map();

    // Signal subsystem
    this.pendingSignals = [];
    this.signalMask = 0;
    this.signalHandlers = new Map(); // signalNum -> Function

    // Process Environment Table
    this.env = new Map([
      ['USER', 'root'],
      ['HOME', '/home/user'],
      ['PATH', '/bin:/usr/bin'],
      ['TERM', 'xterm-256color'],
      ['SHELL', '/bin/sh'],
    ]);

    // Work Routine: generator or function executed during scheduler steps
    this._routine = null;
    this._workGenerator = null;
  }

  /**
   * Set the executable work routine (generator or step function)
   */
  setWorkRoutine(routine) {
    this._routine = routine;
    if (typeof routine === 'function') {
      const result = routine(this);
      // Check if it's a generator object
      if (result && typeof result.next === 'function') {
        this._workGenerator = result;
      }
    }
  }

  /**
   * Execute a single micro-slice of work for this process
   * @param {Object} scheduler - KernelScheduler instance
   * @returns {boolean} True if process has more work remaining, False if finished
   */
  step(scheduler) {
    // 1. Process pending signals first
    if (this.pendingSignals.length > 0) {
      const sig = this.pendingSignals.shift();
      const handled = this._deliverSignal(sig);
      if (handled === false || this.state === ProcessState.TERMINATED) {
        return false;
      }
    }

    // 2. Execute active work generator or step callback
    if (this._workGenerator) {
      const { value, done } = this._workGenerator.next();
      if (done) {
        this.exitCode = value ?? 0;
        return false;
      }
      return true;
    }

    if (typeof this._routine === 'function') {
      return this._routine(this, scheduler);
    }

    return false;
  }

  _deliverSignal(sig) {
    if (sig === Signal.SIGKILL) {
      this.exitCode = 137;
      this.state = ProcessState.TERMINATED;
      return false;
    }

    if (sig === Signal.SIGTERM) {
      this.exitCode = 143;
      this.state = ProcessState.TERMINATED;
      return false;
    }

    if (sig === Signal.SIGINT) {
      const handler = this.signalHandlers.get(Signal.SIGINT);
      if (handler) {
        handler(this);
        return true;
      }
      this.exitCode = 130;
      this.state = ProcessState.TERMINATED;
      return false;
    }

    return true;
  }
}
