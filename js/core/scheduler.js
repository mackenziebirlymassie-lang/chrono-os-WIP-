/**
 * ChronosOS - Microtask Event Loop Scheduler Engine
 * Zero-dependency, cooperative preemptive scheduler with multi-level priority queues
 * Runs inside the browser's microtask queue (queueMicrotask) with strict time-slice budgets
 */

import { ProcessPriority, ProcessState, SystemConstants, KernelEvent } from './types.js';
import { DOMBus } from './event-bus.js';

export class MicrotaskScheduler {
  constructor(quantumMs = SystemConstants.DEFAULT_QUANTUM_MS) {
    this.quantumMs = quantumMs; // Maximum continuous execution slice per process (e.g. 8ms)
    
    // Multi-level priority run-queues
    this._queues = {
      [ProcessPriority.KERNEL]: [],
      [ProcessPriority.REALTIME]: [],
      [ProcessPriority.INTERACTIVE]: [],
      [ProcessPriority.BATCH]: [],
      [ProcessPriority.IDLE]: [],
    };

    // Sleeping / Blocked process table
    this._sleepingTasks = [];
    this._blockedTasks = new Map(); // reason -> Array<task>

    this._activeProcess = null;
    this._isRunning = false;
    this._isTickScheduled = false;

    // Yielding & Macrotask Channel (prevents microtask queue starvation of browser render loop)
    this._consecutiveMicrotaskTicks = 0;
    this._maxConsecutiveMicrotasks = 4;
    this._channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
    if (this._channel) {
      this._channel.port1.onmessage = () => {
        this._isTickScheduled = false;
        this._executeTick();
      };
    }

    // Scheduler Performance & Telemetry Registry
    this.telemetry = {
      ticksTotal: 0,
      contextSwitches: 0,
      preemptions: 0,
      yields: 0,
      microtasksExecuted: 0,
      cpuUtilization: 0, // Exponential moving average (0.0 to 100.0%)
      lastTickDurationMs: 0,
      activeQueueLengths: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    };

    this._lastCpuMeasureTime = performance.now();
    this._busyTimeInSlice = 0;
  }

  /**
   * Start the microtask scheduler loop
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._requestTick();
  }

  /**
   * Pause the scheduler engine
   */
  stop() {
    this._isRunning = false;
  }

  /**
   * Enqueue a Process Control Block (PCB) into the appropriate priority queue
   * @param {Object} pcb - Process Control Block
   */
  enqueue(pcb) {
    if (!pcb || typeof pcb.step !== 'function') {
      throw new Error(`[Scheduler] Enqueued entity must implement step() function`);
    }

    pcb.state = ProcessState.READY;
    const prio = Math.min(Math.max(pcb.priority ?? ProcessPriority.INTERACTIVE, 0), 4);
    this._queues[prio].push(pcb);
    this._updateQueueMetrics();

    // Trigger tick via microtask immediately
    this._requestTick();
  }

  /**
   * Put current executing process to sleep for a duration in milliseconds
   */
  sleep(pcb, durationMs) {
    const wakeTime = performance.now() + durationMs;
    pcb.state = ProcessState.SLEEPING;
    this._sleepingTasks.push({ pcb, wakeTime });
  }

  /**
   * Block a process on an external event or resource
   */
  block(pcb, reason = 'IO') {
    pcb.state = ProcessState.BLOCKED;
    if (!this._blockedTasks.has(reason)) {
      this._blockedTasks.set(reason, []);
    }
    this._blockedTasks.get(reason).push(pcb);
  }

  /**
   * Unblock processes waiting on a specific reason
   */
  unblock(reason) {
    if (!this._blockedTasks.has(reason)) return;
    const tasks = this._blockedTasks.get(reason);
    this._blockedTasks.delete(reason);
    for (const pcb of tasks) {
      this.enqueue(pcb);
    }
  }

  /**
   * Voluntarily yield the remaining quantum of the currently active process
   */
  yield() {
    this.telemetry.yields++;
    if (this._activeProcess) {
      this._activeProcess.yieldRequested = true;
    }
  }

  /**
   * Request next execution pass via native microtask (queueMicrotask)
   * Yields to macrotask (MessageChannel) after consecutive slices to ensure 60 FPS compositor and smooth UI input
   */
  _requestTick(preferMicrotask = true) {
    if (this._isTickScheduled || !this._isRunning) return;
    this._isTickScheduled = true;

    if (preferMicrotask && this._consecutiveMicrotaskTicks < this._maxConsecutiveMicrotasks) {
      this._consecutiveMicrotaskTicks++;
      queueMicrotask(() => {
        this._isTickScheduled = false;
        this._executeTick();
      });
    } else {
      this._consecutiveMicrotaskTicks = 0;
      if (this._channel) {
        this._channel.port2.postMessage(null);
      } else {
        setTimeout(() => {
          this._isTickScheduled = false;
          this._executeTick();
        }, 0);
      }
    }
  }

  /**
   * Main scheduler execution tick: processes sleeping timers, selects highest-priority
   * ready process, and executes steps up to the quantum budget.
   */
  _executeTick() {
    if (!this._isRunning) return;

    const tickStartTime = performance.now();
    this.telemetry.ticksTotal++;

    // 1. Wake up sleeping tasks
    this._wakeSleepingTasks(tickStartTime);

    // 2. Priority Aging: Prevent starvation by bumping older batch tasks
    this._applyPriorityAging();

    // 3. Find highest-priority ready process
    const pcb = this._pickNextTask();

    if (!pcb) {
      // System is idle
      this._activeProcess = null;
      this._consecutiveMicrotaskTicks = 0;
      this._measureCpu(0, tickStartTime);
      // If there are sleeping tasks, schedule wake-up check based on earliest deadline
      if (this._sleepingTasks.length > 0) {
        let earliestWake = Infinity;
        for (const item of this._sleepingTasks) {
          if (item.wakeTime < earliestWake) earliestWake = item.wakeTime;
        }
        const delay = Math.max(1, Math.min(earliestWake - tickStartTime, 250));
        setTimeout(() => this._requestTick(true), delay);
      }
      return;
    }

    // Context switch
    if (this._activeProcess !== pcb) {
      this.telemetry.contextSwitches++;
      this._activeProcess = pcb;
      pcb.state = ProcessState.RUNNING;
    }

    // 4. Execute Process Micro-steps within quantum budget
    let quantumConsumed = 0;
    let stepCount = 0;
    pcb.yieldRequested = false;

    while (quantumConsumed < this.quantumMs && !pcb.yieldRequested && pcb.state === ProcessState.RUNNING) {
      const stepStart = performance.now();
      let hasMoreWork = false;

      try {
        // Execute one atomic unit of work inside the process
        hasMoreWork = pcb.step(this);
      } catch (err) {
        console.error(`[Scheduler] Process PID ${pcb.pid} crashed:`, err);
        pcb.exitCode = 1;
        pcb.state = ProcessState.TERMINATED;
        DOMBus.publish(KernelEvent.PROCESS_TERMINATED, { pcb, error: err.message });
        break;
      }

      const stepDuration = performance.now() - stepStart;
      quantumConsumed += stepDuration;
      pcb.cpuTimeMs += stepDuration;
      pcb.ticks++;
      stepCount++;
      this.telemetry.microtasksExecuted++;

      // If the process has no more work, transition to TERMINATED
      if (hasMoreWork === false) {
        pcb.state = ProcessState.TERMINATED;
        DOMBus.publish(KernelEvent.PROCESS_TERMINATED, { pcb, exitCode: 0 });
        break;
      }
    }

    const tickDuration = performance.now() - tickStartTime;
    this.telemetry.lastTickDurationMs = tickDuration;
    this._measureCpu(tickDuration, tickStartTime);

    // 5. Post-execution status handling
    if (pcb.state === ProcessState.RUNNING) {
      // Involuntary preemption due to quantum exhaustion or voluntary yield
      if (quantumConsumed >= this.quantumMs) {
        this.telemetry.preemptions++;
        DOMBus.publish(KernelEvent.SCHEDULER_QUANTUM_EXPIRED, { pid: pcb.pid });
      }
      pcb.state = ProcessState.READY;
      this.enqueue(pcb);
    }

    this._activeProcess = null;
    this._updateQueueMetrics();

    // Re-queue next tick if more tasks remain in run-queues
    if (this._hasPendingTasks()) {
      // If full quantum was consumed, yield to event loop so browser paints smoothly
      this._requestTick(quantumConsumed < this.quantumMs);
    }
  }

  _pickNextTask() {
    for (let prio = 0; prio <= 4; prio++) {
      const q = this._queues[prio];
      if (q.length > 0) {
        return q.shift();
      }
    }
    return null;
  }

  _wakeSleepingTasks(now) {
    if (this._sleepingTasks.length === 0) return;
    const remaining = [];
    for (const item of this._sleepingTasks) {
      if (now >= item.wakeTime) {
        item.pcb.state = ProcessState.READY;
        this.enqueue(item.pcb);
      } else {
        remaining.push(item);
      }
    }
    this._sleepingTasks = remaining;
  }

  _applyPriorityAging() {
    // Periodically bump batch/idle tasks if starvation occurs
    if (this.telemetry.ticksTotal % 64 === 0) {
      const batchQueue = this._queues[ProcessPriority.BATCH];
      if (batchQueue.length > 8) {
        const agedPcb = batchQueue.shift();
        this._queues[ProcessPriority.INTERACTIVE].push(agedPcb);
      }
    }
  }

  _hasPendingTasks() {
    return (
      this._queues[0].length > 0 ||
      this._queues[1].length > 0 ||
      this._queues[2].length > 0 ||
      this._queues[3].length > 0 ||
      this._queues[4].length > 0
    );
  }

  _measureCpu(busyMs, now) {
    this._busyTimeInSlice += busyMs;
    const elapsed = now - this._lastCpuMeasureTime;
    if (elapsed >= 500) {
      const instantaneousUsage = Math.min(100, Math.round((this._busyTimeInSlice / elapsed) * 100));
      // Exponential moving average filter
      this.telemetry.cpuUtilization = Math.round((this.telemetry.cpuUtilization * 0.7) + (instantaneousUsage * 0.3));
      this._busyTimeInSlice = 0;
      this._lastCpuMeasureTime = now;
    }
  }

  _updateQueueMetrics() {
    this.telemetry.activeQueueLengths[0] = this._queues[0].length;
    this.telemetry.activeQueueLengths[1] = this._queues[1].length;
    this.telemetry.activeQueueLengths[2] = this._queues[2].length;
    this.telemetry.activeQueueLengths[3] = this._queues[3].length;
    this.telemetry.activeQueueLengths[4] = this._queues[4].length;
  }
}

export const KernelScheduler = new MicrotaskScheduler();
