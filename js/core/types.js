/**
 * ChronosOS - System Types, Enums, and Core Constants
 * Zero-dependency ES6+ Kernel Specifications
 */

export const ProcessState = Object.freeze({
  EMBRYO: 'EMBRYO',
  READY: 'READY',
  RUNNING: 'RUNNING',
  SLEEPING: 'SLEEPING',
  BLOCKED: 'BLOCKED',
  ZOMBIE: 'ZOMBIE',
  TERMINATED: 'TERMINATED',
});

export const ProcessPriority = Object.freeze({
  KERNEL: 0,       // Highest priority: kernel threads, drivers, interrupts
  REALTIME: 1,     // High priority: display compositor, audio, immediate input
  INTERACTIVE: 2,  // Normal priority: focused window UI, active shell
  BATCH: 3,        // Low priority: background compilation, file indexing
  IDLE: 4,         // Lowest priority: garbage compaction, telemetry idle sweep
});

export const Syscall = Object.freeze({
  SYS_YIELD: 1,
  SYS_FORK: 2,
  SYS_EXEC: 3,
  SYS_EXIT: 4,
  SYS_WAITPID: 5,
  SYS_KILL: 6,
  SYS_GETPID: 7,
  SYS_GETPPID: 8,
  SYS_SLEEP: 9,
  SYS_MALLOC: 10,
  SYS_FREE: 11,
  SYS_SBRK: 12,
  SYS_OPEN: 13,
  SYS_CLOSE: 14,
  SYS_READ: 15,
  SYS_WRITE: 16,
  SYS_STAT: 17,
  SYS_IOCTL: 18,
  SYS_PIPE: 19,
  SYS_SEEK: 20,
  SYS_GETTICKS: 21,
  SYS_IPC_SEND: 22,
  SYS_IPC_RECV: 23,
});

export const Signal = Object.freeze({
  SIGHUP: 1,
  SIGINT: 2,     // Interrupt from keyboard (Ctrl+C)
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,    // Forceful kill (uninterceptable)
  SIGUSR1: 10,
  SIGSEGV: 11,   // Invalid memory reference
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,   // Graceful termination
  SIGCHLD: 17,   // Child process status update
  SIGCONT: 18,   // Continue executing
  SIGSTOP: 19,   // Stop executing
  SIGTSTP: 20,   // Terminal stop
});

export const PageFlag = Object.freeze({
  PRESENT: 1 << 0,
  WRITABLE: 1 << 1,
  USER: 1 << 2,
  ACCESSED: 1 << 3,
  DIRTY: 1 << 4,
  SWAPPED: 1 << 5,
});

export const MemorySegmentType = Object.freeze({
  TEXT: 'TEXT',     // Executable program code
  DATA: 'DATA',     // Initialized globals
  BSS: 'BSS',       // Zero-initialized data
  HEAP: 'HEAP',     // Dynamically allocated memory
  STACK: 'STACK',   // Call stack & frame variables
  SHARED: 'SHARED', // IPC memory buffers
});

export const MouseButton = Object.freeze({
  PRIMARY: 0,
  AUXILIARY: 1,
  SECONDARY: 2,
  BACK: 3,
  FORWARD: 4,
});

export const WindowSnapState = Object.freeze({
  NONE: 'NONE',
  MAXIMIZED: 'MAXIMIZED',
  LEFT_HALF: 'LEFT_HALF',
  RIGHT_HALF: 'RIGHT_HALF',
  TOP_LEFT: 'TOP_LEFT',
  TOP_RIGHT: 'TOP_RIGHT',
  BOTTOM_LEFT: 'BOTTOM_LEFT',
  BOTTOM_RIGHT: 'BOTTOM_RIGHT',
});

export const KernelEvent = Object.freeze({
  // DOM Bus Raw Events
  DOM_POINTER_DOWN: 'dom:pointer:down',
  DOM_POINTER_MOVE: 'dom:pointer:move',
  DOM_POINTER_UP: 'dom:pointer:up',
  DOM_POINTER_WHEEL: 'dom:pointer:wheel',
  DOM_KEY_DOWN: 'dom:key:down',
  DOM_KEY_UP: 'dom:key:up',
  DOM_RESIZE: 'dom:resize',
  DOM_BLUR: 'dom:blur',
  DOM_FOCUS: 'dom:focus',

  // OS Kernel Events
  KERNEL_BOOT: 'kernel:boot',
  KERNEL_PANIC: 'kernel:panic',
  SCHEDULER_TICK: 'scheduler:tick',
  SCHEDULER_QUANTUM_EXPIRED: 'scheduler:quantum:expired',
  
  // Process Lifecycle
  PROCESS_SPAWNED: 'process:spawned',
  PROCESS_STATE_CHANGED: 'process:state:changed',
  PROCESS_TERMINATED: 'process:terminated',
  PROCESS_SIGNAL_SENT: 'process:signal:sent',
  
  // Memory Events
  MEMORY_ALLOCATED: 'memory:allocated',
  MEMORY_FREED: 'memory:freed',
  MEMORY_PAGE_FAULT: 'memory:page:fault',
  MEMORY_PRESSURE: 'memory:pressure',

  // Window System
  WINDOW_CREATED: 'window:created',
  WINDOW_DESTROYED: 'window:destroyed',
  WINDOW_FOCUS_CHANGED: 'window:focus:changed',
  WINDOW_BOUNDS_CHANGED: 'window:bounds:changed',
  WINDOW_STATE_CHANGED: 'window:state:changed',

  // Compositor Events
  COMPOSITOR_FRAME_BEGIN: 'compositor:frame:begin',
  COMPOSITOR_FRAME_END: 'compositor:frame:end',
  COMPOSITOR_DIRTY_RECT: 'compositor:dirty:rect',
});

export const SystemConstants = Object.freeze({
  PAGE_SIZE_BYTES: 4096,          // 4 KB Page Frame Size
  TOTAL_MEMORY_PAGES: 16384,      // 64 MB Simulated RAM (16,384 * 4KB)
  TOTAL_MEMORY_BYTES: 67108864,   // 64 MB
  DEFAULT_QUANTUM_MS: 8,          // 8ms slice for sub-16ms guarantee
  MAX_PROCESSES: 256,             // Max concurrent PCBs
  TARGET_FRAME_BUDGET_MS: 16.666, // 60 FPS frame target
  GRID_SIZE_PX: 8,                // 8pt UI/UX ProMax grid unit
  KERNEL_PID: 0,
  INIT_PID: 1,
});

/**
 * 2D Point structure
 */
export class Point2D {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Point2D(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
}

/**
 * 2D Rectangle structure
 */
export class Rect2D {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get right() { return this.x + this.width; }
  get bottom() { return this.y + this.height; }

  contains(px, py) {
    return px >= this.x && px <= this.right && py >= this.y && py <= this.bottom;
  }

  intersects(rect) {
    return !(
      rect.x > this.right ||
      rect.right < this.x ||
      rect.y > this.bottom ||
      rect.bottom < this.y
    );
  }

  clone() {
    return new Rect2D(this.x, this.y, this.width, this.height);
  }
}
