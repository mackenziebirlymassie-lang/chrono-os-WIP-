/**
 * ChronosOS - Inter-Process Communication (IPC)
 * Pipes, Message Queues, and Shared Memory Buffers
 */

export class VirtualPipe {
  constructor(capacity = 65536) {
    this.capacity = capacity;
    this.buffer = new Uint8Array(capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
    this.isClosed = false;
    this._waitingReaders = [];
  }

  write(data) {
    if (this.isClosed) return -1;
    let bytesWritten = 0;
    const encoder = typeof data === 'string' ? new TextEncoder() : null;
    const srcBytes = encoder ? encoder.encode(data) : data;

    for (let i = 0; i < srcBytes.length; i++) {
      if (this.count >= this.capacity) break;
      this.buffer[this.writePos] = srcBytes[i];
      this.writePos = (this.writePos + 1) % this.capacity;
      this.count++;
      bytesWritten++;
    }

    // Wake any blocked readers
    if (this._waitingReaders.length > 0 && this.count > 0) {
      const reader = this._waitingReaders.shift();
      reader();
    }

    return bytesWritten;
  }

  read(maxBytes = 4096) {
    if (this.count === 0) {
      return this.isClosed ? null : new Uint8Array(0);
    }

    const bytesToRead = Math.min(maxBytes, this.count);
    const result = new Uint8Array(bytesToRead);

    for (let i = 0; i < bytesToRead; i++) {
      result[i] = this.buffer[this.readPos];
      this.readPos = (this.readPos + 1) % this.capacity;
      this.count--;
    }

    return result;
  }

  readString() {
    const bytes = this.read();
    if (!bytes || bytes.length === 0) return '';
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  close() {
    this.isClosed = true;
    while (this._waitingReaders.length > 0) {
      this._waitingReaders.shift()();
    }
  }
}

export class IPCMessageQueue {
  constructor() {
    this._queues = new Map(); // channelName -> Array<{ senderPid, payload, timestamp }>
  }

  send(channel, senderPid, payload) {
    if (!this._queues.has(channel)) {
      this._queues.set(channel, []);
    }
    const queue = this._queues.get(channel);
    queue.push({
      senderPid,
      payload,
      timestamp: performance.now(),
    });
    return true;
  }

  receive(channel) {
    const queue = this._queues.get(channel);
    if (!queue || queue.length === 0) return null;
    return queue.shift();
  }
}

export const GlobalIPC = new IPCMessageQueue();
