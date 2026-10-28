/**
 * ChronosOS - Process Lifecycle Manager
 * Handles process creation, forking, execution, termination, and signal dispatch
 */

import { PCB } from './pcb.js';
import { ProcessState, ProcessPriority, Signal, KernelEvent } from '../core/types.js';
import { KernelProcessTree } from './process-tree.js';
import { KernelScheduler } from '../core/scheduler.js';
import { KernelMemoryRegistry } from '../memory/registry.js';
import { DOMBus } from '../core/event-bus.js';

export class ProcessManager {
  constructor(scheduler = KernelScheduler, processTree = KernelProcessTree, memoryRegistry = KernelMemoryRegistry) {
    this.scheduler = scheduler;
    this.processTree = processTree;
    this.memoryRegistry = memoryRegistry;

    this.processTable = new Map(); // pid -> PCB
    this._nextPid = 1;
  }

  /**
   * Spawn a new process with virtual memory and registration
   */
  spawn(name, routine, priority = ProcessPriority.INTERACTIVE, ppid = 1) {
    const pid = this._nextPid++;
    const pcb = new PCB(pid, name, ppid, priority);

    if (routine) {
      pcb.setWorkRoutine(routine);
    }

    // 1. Initialize process virtual memory segments
    this.memoryRegistry.initProcessSegments(pid);

    // 2. Register with Process Table and Tree
    this.processTable.set(pid, pcb);
    this.processTree.addProcess(pcb);

    // 3. Enqueue to scheduler
    this.scheduler.enqueue(pcb);

    DOMBus.publish(KernelEvent.PROCESS_SPAWNED, { pcb });
    return pcb;
  }

  /**
   * Send a signal to a process or process group
   */
  sendSignal(pid, signal = Signal.SIGTERM) {
    const pcb = this.processTable.get(pid);
    if (!pcb) return false;

    pcb.pendingSignals.push(signal);
    DOMBus.publish(KernelEvent.PROCESS_SIGNAL_SENT, { pid, signal });

    // If process was sleeping or blocked, wake it to handle signal
    if (pcb.state === ProcessState.SLEEPING || pcb.state === ProcessState.BLOCKED) {
      pcb.state = ProcessState.READY;
      this.scheduler.enqueue(pcb);
    }

    return true;
  }

  /**
   * Terminate a process and clean up its kernel resources
   */
  terminateProcess(pid, exitCode = 0) {
    const pcb = this.processTable.get(pid);
    if (!pcb) return false;

    // Cannot terminate init or idle task directly
    if (pid <= 1) {
      console.warn(`[ProcessManager] Refusing to terminate critical system process ${pid}`);
      return false;
    }

    pcb.state = ProcessState.TERMINATED;
    pcb.exitCode = exitCode;

    // 1. Clean up virtual memory segments and page tables
    this.memoryRegistry.destroyProcessSegments(pid);

    // 2. Close open file descriptors
    for (const [fd, desc] of pcb.fdTable.entries()) {
      if (desc && typeof desc.close === 'function') {
        desc.close();
      }
    }
    pcb.fdTable.clear();

    // 3. Update Process Tree (reparents any children to init)
    this.processTree.removeProcess(pid);
    this.processTable.delete(pid);

    DOMBus.publish(KernelEvent.PROCESS_TERMINATED, { pid, exitCode });
    return true;
  }

  getProcess(pid) {
    return this.processTable.get(pid);
  }

  getProcessList() {
    return Array.from(this.processTable.values());
  }
}

export const KernelProcessManager = new ProcessManager();
