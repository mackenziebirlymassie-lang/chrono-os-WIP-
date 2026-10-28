/**
 * ChronosOS - Memory Registry & Segment Manager
 * Manages virtual memory segments (TEXT, DATA, BSS, HEAP, STACK) and segment protection
 */

import { MemorySegmentType, PageFlag } from '../core/types.js';
import { KernelMMU } from './mmu.js';
import { KernelAllocator } from './allocator.js';

export class MemoryRegistry {
  constructor(mmu = KernelMMU, allocator = KernelAllocator) {
    this.mmu = mmu;
    this.allocator = allocator;

    // Map<pid, Array<MemorySegment>>
    this.segments = new Map();
  }

  /**
   * Initialize standard Unix virtual memory segments for an executable process
   */
  initProcessSegments(pid, textSizeBytes = 16384, dataSizeBytes = 8192, stackSizeBytes = 32768) {
    const processSegments = [
      {
        type: MemorySegmentType.TEXT,
        startAddress: 0x00400000,
        sizeBytes: textSizeBytes,
        flags: PageFlag.PRESENT | PageFlag.USER, // Read-Only executable
        name: '.text (Instructions)',
      },
      {
        type: MemorySegmentType.DATA,
        startAddress: 0x00600000,
        sizeBytes: dataSizeBytes,
        flags: PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER,
        name: '.data (Globals)',
      },
      {
        type: MemorySegmentType.BSS,
        startAddress: 0x00800000,
        sizeBytes: 4096,
        flags: PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER,
        name: '.bss (Zero-init)',
      },
      {
        type: MemorySegmentType.HEAP,
        startAddress: 0x10000000,
        sizeBytes: 65536,
        flags: PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER,
        name: '.heap (Dynamic)',
      },
      {
        type: MemorySegmentType.STACK,
        startAddress: 0x7FFF0000,
        sizeBytes: stackSizeBytes,
        flags: PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER,
        name: '.stack (Call Frames)',
      },
    ];

    this.segments.set(pid, processSegments);

    // Map initial pages into MMU
    for (const seg of processSegments) {
      const pageCount = Math.ceil(seg.sizeBytes / this.mmu.pageSize);
      for (let i = 0; i < pageCount; i++) {
        const frame = this.mmu.allocatePhysicalFrame();
        if (frame !== -1) {
          const vPage = Math.floor((seg.startAddress + (i * this.mmu.pageSize)) / this.mmu.pageSize);
          this.mmu.mapPage(pid, vPage, frame, seg.flags);
        }
      }
    }

    return processSegments;
  }

  getProcessSegments(pid) {
    return this.segments.get(pid) || [];
  }

  destroyProcessSegments(pid) {
    this.segments.delete(pid);
    this.allocator.cleanupProcess(pid);
    this.mmu.destroyProcessAddressSpace(pid);
  }

  /**
   * Generate an aggregate snapshot of physical RAM frames and allocations
   * Used directly by the Memory Inspector GUI
   */
  getSystemMemorySnapshot() {
    const frameStates = [];
    const totalFrames = Math.min(this.mmu.totalFrames, 1024); // Sample first 1024 frames for UI performance

    for (let i = 0; i < totalFrames; i++) {
      let state = 'is-free';
      if (i < 256) {
        state = 'is-kernel';
      } else if (this.mmu._isFrameAllocated(i)) {
        state = (i % 7 === 0) ? 'is-slab' : 'is-process';
      }
      frameStates.push({ frameIndex: i, state });
    }

    const mmuMetrics = this.mmu.getMemoryUsageMetrics();
    const allocatorMetrics = this.allocator.metrics;

    return {
      frames: frameStates,
      mmu: mmuMetrics,
      allocator: allocatorMetrics,
    };
  }
}

export const KernelMemoryRegistry = new MemoryRegistry();
