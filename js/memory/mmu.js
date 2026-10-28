/**
 * ChronosOS - Memory Management Unit (MMU) & Physical RAM Simulator
 * Hardware-level virtual address translation, page tables, and physical frame allocation
 */

import { PageFlag, SystemConstants, KernelEvent } from '../core/types.js';
import { DOMBus } from '../core/event-bus.js';

export class MMU {
  constructor(totalMemoryBytes = SystemConstants.TOTAL_MEMORY_BYTES, pageSize = SystemConstants.PAGE_SIZE_BYTES) {
    this.pageSize = pageSize;
    this.totalMemoryBytes = totalMemoryBytes;
    this.totalFrames = Math.floor(totalMemoryBytes / pageSize); // 16,384 frames for 64MB

    // Physical RAM Buffer (Typed Array backing store)
    this.ramBuffer = new ArrayBuffer(totalMemoryBytes);
    this.ramView = new Uint8Array(this.ramBuffer);
    this.dataView = new DataView(this.ramBuffer);

    // Frame allocation bitmap (1 bit per frame, 0 = Free, 1 = Allocated)
    this.frameBitmap = new Uint8Array(Math.ceil(this.totalFrames / 8));
    this.allocatedFramesCount = 0;

    // Per-Process Page Tables: Map<pid, Map<virtualPageNum, PageTableEntry>>
    this.processPageTables = new Map();

    // MMU Telemetry & Statistics
    this.stats = {
      pageFaults: 0,
      translationsCount: 0,
      tlbHits: 0,
      tlbMisses: 0,
      writesCount: 0,
      readsCount: 0,
    };

    // Reserve first 256 frames (1MB) strictly for Kernel text and data structures
    this._reserveKernelFrames(256);
  }

  _reserveKernelFrames(count) {
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      this._setFrameAllocated(frameIndex, true);
    }
  }

  _isFrameAllocated(frameIndex) {
    const byteIndex = frameIndex >> 3;
    const bitIndex = frameIndex & 7;
    return (this.frameBitmap[byteIndex] & (1 << bitIndex)) !== 0;
  }

  _setFrameAllocated(frameIndex, isAllocated) {
    const byteIndex = frameIndex >> 3;
    const bitIndex = frameIndex & 7;
    const wasAllocated = this._isFrameAllocated(frameIndex);

    if (isAllocated && !wasAllocated) {
      this.frameBitmap[byteIndex] |= (1 << bitIndex);
      this.allocatedFramesCount++;
    } else if (!isAllocated && wasAllocated) {
      this.frameBitmap[byteIndex] &= ~(1 << bitIndex);
      this.allocatedFramesCount--;
    }
  }

  /**
   * Allocate an available physical frame from the free-frame pool
   * @returns {number} Frame Index, or -1 if Out Of Memory (OOM)
   */
  allocatePhysicalFrame() {
    for (let i = 0; i < this.totalFrames; i++) {
      if (!this._isFrameAllocated(i)) {
        this._setFrameAllocated(i, true);
        // Zero-fill new allocated frame
        const byteStart = i * this.pageSize;
        this.ramView.fill(0, byteStart, byteStart + this.pageSize);
        return i;
      }
    }
    DOMBus.publish(KernelEvent.MEMORY_PRESSURE, { allocated: this.allocatedFramesCount, total: this.totalFrames });
    return -1;
  }

  /**
   * Release a previously allocated physical frame
   */
  freePhysicalFrame(frameIndex) {
    if (frameIndex >= 0 && frameIndex < this.totalFrames) {
      this._setFrameAllocated(frameIndex, false);
    }
  }

  /**
   * Create a page directory/table for a new process
   */
  createProcessAddressSpace(pid) {
    if (!this.processPageTables.has(pid)) {
      this.processPageTables.set(pid, new Map());
    }
  }

  /**
   * Destroy an address space and release all associated physical frames
   */
  destroyProcessAddressSpace(pid) {
    const pageTable = this.processPageTables.get(pid);
    if (!pageTable) return;

    for (const [_, entry] of pageTable.entries()) {
      if (entry.flags & PageFlag.PRESENT) {
        this.freePhysicalFrame(entry.frameIndex);
      }
    }
    this.processPageTables.delete(pid);
  }

  /**
   * Map a virtual page to a physical frame
   */
  mapPage(pid, virtualPageNum, frameIndex, flags = (PageFlag.PRESENT | PageFlag.WRITABLE | PageFlag.USER)) {
    let pageTable = this.processPageTables.get(pid);
    if (!pageTable) {
      this.createProcessAddressSpace(pid);
      pageTable = this.processPageTables.get(pid);
    }

    pageTable.set(virtualPageNum, {
      virtualPageNum,
      frameIndex,
      flags,
      allocatedAt: performance.now(),
    });
  }

  /**
   * Translate a process virtual address into a physical byte offset
   * @param {number} pid - Process ID
   * @param {number} virtualAddress - Virtual memory address
   * @param {boolean} isWrite - True if operation is write
   * @returns {number} Physical byte offset in ramView
   */
  translate(pid, virtualAddress, isWrite = false) {
    this.stats.translationsCount++;
    const virtualPageNum = Math.floor(virtualAddress / this.pageSize);
    const offset = virtualAddress % this.pageSize;

    const pageTable = this.processPageTables.get(pid);
    if (!pageTable) {
      this._handlePageFault(pid, virtualAddress, 'NO_ADDRESS_SPACE');
      return -1;
    }

    const entry = pageTable.get(virtualPageNum);
    if (!entry || !(entry.flags & PageFlag.PRESENT)) {
      this._handlePageFault(pid, virtualAddress, 'PAGE_NOT_PRESENT');
      return -1;
    }

    if (isWrite && !(entry.flags & PageFlag.WRITABLE)) {
      this._handlePageFault(pid, virtualAddress, 'WRITE_PROTECTION_VIOLATION');
      return -1;
    }

    entry.flags |= PageFlag.ACCESSED;
    if (isWrite) {
      entry.flags |= PageFlag.DIRTY;
    }

    return (entry.frameIndex * this.pageSize) + offset;
  }

  _handlePageFault(pid, virtualAddress, reason) {
    this.stats.pageFaults++;
    DOMBus.publish(KernelEvent.MEMORY_PAGE_FAULT, { pid, virtualAddress, reason });
  }

  /**
   * Read raw byte at virtual address
   */
  readByte(pid, virtualAddress) {
    const physOffset = this.translate(pid, virtualAddress, false);
    if (physOffset === -1) return 0;
    this.stats.readsCount++;
    return this.ramView[physOffset];
  }

  /**
   * Write raw byte at virtual address
   */
  writeByte(pid, virtualAddress, byteVal) {
    const physOffset = this.translate(pid, virtualAddress, true);
    if (physOffset === -1) return false;
    this.ramView[physOffset] = byteVal & 0xFF;
    this.stats.writesCount++;
    return true;
  }

  /**
   * Write string to virtual address
   */
  writeString(pid, virtualAddress, str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      this.writeByte(pid, virtualAddress + i, bytes[i]);
    }
    this.writeByte(pid, virtualAddress + bytes.length, 0); // null-terminator
    return bytes.length;
  }

  /**
   * Read null-terminated string from virtual address
   */
  readString(pid, virtualAddress, maxLen = 256) {
    const bytes = [];
    for (let i = 0; i < maxLen; i++) {
      const b = this.readByte(pid, virtualAddress + i);
      if (b === 0) break;
      bytes.push(b);
    }
    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(bytes));
  }

  /**
   * Generate formatted Hex Dump representation of physical or virtual memory
   */
  getHexDump(startByte = 0, length = 128) {
    const safeStart = Math.max(0, Math.min(startByte, this.totalMemoryBytes - length));
    const lines = [];

    for (let i = 0; i < length; i += 16) {
      const offset = safeStart + i;
      const hexOffset = offset.toString(16).padStart(8, '0').toUpperCase();
      let hexBytes = '';
      let ascii = '';

      for (let j = 0; j < 16; j++) {
        const cur = offset + j;
        if (cur < this.totalMemoryBytes) {
          const val = this.ramView[cur];
          hexBytes += val.toString(16).padStart(2, '0').toUpperCase() + ' ';
          ascii += (val >= 32 && val <= 126) ? String.fromCharCode(val) : '.';
        } else {
          hexBytes += '   ';
        }
      }

      lines.push(`${hexOffset}  ${hexBytes.padEnd(48, ' ')} |${ascii}|`);
    }

    return lines.join('\n');
  }

  getMemoryUsageMetrics() {
    const usedBytes = this.allocatedFramesCount * this.pageSize;
    const freeBytes = this.totalMemoryBytes - usedBytes;
    const utilizationPct = ((usedBytes / this.totalMemoryBytes) * 100).toFixed(1);

    return {
      totalBytes: this.totalMemoryBytes,
      usedBytes,
      freeBytes,
      totalFrames: this.totalFrames,
      allocatedFrames: this.allocatedFramesCount,
      utilizationPct: parseFloat(utilizationPct),
      ...this.stats,
    };
  }
}

export const KernelMMU = new MMU();
