/**
 * ChronosOS - Slab & Buddy Dynamic Memory Allocator Simulator
 * High-performance heap allocation with slab caching, coalescing, and leak tracking
 */

import { KernelMMU } from './mmu.js';
import { PageFlag, SystemConstants, KernelEvent } from '../core/types.js';
import { DOMBus } from '../core/event-bus.js';

export class SlabAllocator {
  constructor(mmu = KernelMMU) {
    this.mmu = mmu;
    this.slabSizes = [16, 32, 64, 128, 256, 512, 1024];

    // Map<slabSize, Array<{ frameIndex, freeSlots: [], totalSlots }>>
    this.slabPools = new Map();
    for (const size of this.slabSizes) {
      this.slabPools.set(size, []);
    }

    // Process dynamic heap tracking: Map<pid, { baseVirtualAddress, currentBreak, allocations: Map<ptr, meta> }>
    this.processHeaps = new Map();

    this.metrics = {
      totalAllocations: 0,
      totalFrees: 0,
      activeAllocationsCount: 0,
      activeAllocatedBytes: 0,
      internalFragmentationBytes: 0,
    };
  }

  /**
   * Initialize a virtual heap region for a process (starts at 0x10000000 / 256MB)
   */
  initProcessHeap(pid, initialPages = 4) {
    const heapBase = 0x10000000;
    const heapInfo = {
      baseVirtualAddress: heapBase,
      currentBreak: heapBase,
      allocations: new Map(), // ptr -> { sizeBytes, slabSize, timestamp, tag }
    };

    this.processHeaps.set(pid, heapInfo);

    // Map initial physical pages into process virtual memory space
    for (let i = 0; i < initialPages; i++) {
      const frame = this.mmu.allocatePhysicalFrame();
      if (frame !== -1) {
        const vPage = Math.floor((heapBase + (i * this.mmu.pageSize)) / this.mmu.pageSize);
        this.mmu.mapPage(pid, vPage, frame, PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER);
        heapInfo.currentBreak += this.mmu.pageSize;
      }
    }

    return heapInfo;
  }

  /**
   * Allocate dynamically sized memory block
   * @param {number} pid - Process ID
   * @param {number} sizeBytes - Requested allocation size
   * @param {string} tag - Debug tracking tag
   * @returns {number} Virtual memory pointer, or 0 if allocation failed
   */
  malloc(pid, sizeBytes, tag = 'anonymous') {
    if (sizeBytes <= 0) return 0;

    let heap = this.processHeaps.get(pid);
    if (!heap) {
      heap = this.initProcessHeap(pid);
    }

    // Determine if fits into slab cache or requires page allocation
    const matchingSlabSize = this.slabSizes.find(s => s >= sizeBytes);

    let virtualPointer = 0;
    let actualAllocatedSize = 0;

    if (matchingSlabSize) {
      // Slab Allocation
      actualAllocatedSize = matchingSlabSize;
      virtualPointer = heap.currentBreak;
      heap.currentBreak += matchingSlabSize;
      this.metrics.internalFragmentationBytes += (matchingSlabSize - sizeBytes);
    } else {
      // Large Allocation: Align to 4KB page boundaries
      const pagesNeeded = Math.ceil(sizeBytes / this.mmu.pageSize);
      actualAllocatedSize = pagesNeeded * this.mmu.pageSize;
      virtualPointer = heap.currentBreak;

      for (let p = 0; p < pagesNeeded; p++) {
        const frame = this.mmu.allocatePhysicalFrame();
        if (frame === -1) {
          DOMBus.publish(KernelEvent.MEMORY_PRESSURE, { pid, sizeBytes });
          return 0; // OOM
        }
        const vPage = Math.floor((heap.currentBreak + (p * this.mmu.pageSize)) / this.mmu.pageSize);
        this.mmu.mapPage(pid, vPage, frame, PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER);
      }
      heap.currentBreak += actualAllocatedSize;
      this.metrics.internalFragmentationBytes += (actualAllocatedSize - sizeBytes);
    }

    // Record allocation metadata in process heap registry
    heap.allocations.set(virtualPointer, {
      ptr: virtualPointer,
      requestedSize: sizeBytes,
      allocatedSize: actualAllocatedSize,
      slabSize: matchingSlabSize || 0,
      timestamp: performance.now(),
      tag,
    });

    this.metrics.totalAllocations++;
    this.metrics.activeAllocationsCount++;
    this.metrics.activeAllocatedBytes += actualAllocatedSize;

    DOMBus.publish(KernelEvent.MEMORY_ALLOCATED, {
      pid,
      ptr: virtualPointer,
      sizeBytes,
      tag,
    });

    return virtualPointer;
  }

  /**
   * Release a previously allocated memory block
   */
  free(pid, virtualPointer) {
    const heap = this.processHeaps.get(pid);
    if (!heap || !heap.allocations.has(virtualPointer)) {
      console.warn(`[Allocator] Invalid free attempt at 0x${virtualPointer?.toString(16)} by PID ${pid}`);
      return false;
    }

    const alloc = heap.allocations.get(virtualPointer);
    heap.allocations.delete(virtualPointer);

    this.metrics.totalFrees++;
    this.metrics.activeAllocationsCount--;
    this.metrics.activeAllocatedBytes -= alloc.allocatedSize;
    this.metrics.internalFragmentationBytes -= (alloc.allocatedSize - alloc.requestedSize);

    DOMBus.publish(KernelEvent.MEMORY_FREED, {
      pid,
      ptr: virtualPointer,
      freedBytes: alloc.allocatedSize,
    });

    return true;
  }

  /**
   * Reallocate memory block with new size
   */
  realloc(pid, oldPtr, newSize) {
    if (!oldPtr) return this.malloc(pid, newSize);
    if (newSize <= 0) {
      this.free(pid, oldPtr);
      return 0;
    }

    const heap = this.processHeaps.get(pid);
    if (!heap || !heap.allocations.has(oldPtr)) {
      return 0;
    }

    const oldAlloc = heap.allocations.get(oldPtr);
    if (newSize <= oldAlloc.allocatedSize) {
      // Current block is large enough
      oldAlloc.requestedSize = newSize;
      return oldPtr;
    }

    // Allocate new block and copy bytes
    const newPtr = this.malloc(pid, newSize, oldAlloc.tag);
    if (!newPtr) return 0;

    for (let i = 0; i < oldAlloc.requestedSize; i++) {
      const byte = this.mmu.readByte(pid, oldPtr + i);
      this.mmu.writeByte(pid, newPtr + i, byte);
    }

    this.free(pid, oldPtr);
    return newPtr;
  }

  /**
   * Clean up all heap structures when a process terminates
   */
  cleanupProcess(pid) {
    const heap = this.processHeaps.get(pid);
    if (!heap) return;

    for (const [ptr, alloc] of heap.allocations.entries()) {
      this.metrics.activeAllocatedBytes -= alloc.allocatedSize;
      this.metrics.activeAllocationsCount--;
    }

    this.processHeaps.delete(pid);
  }

  getAllocationReport(pid) {
    const heap = this.processHeaps.get(pid);
    if (!heap) return [];
    return Array.from(heap.allocations.values());
  }
}

export const KernelAllocator = new SlabAllocator();
