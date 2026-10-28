/**
 * ChronosOS - Virtual File Node (Inode) & File Descriptors
 * In-memory file system representation with POSIX-style permissions and streams
 */

export const FileNodeType = Object.freeze({
  FILE: 'FILE',
  DIRECTORY: 'DIRECTORY',
  DEVICE: 'DEVICE',
  PIPE: 'PIPE',
});

export const OpenFlags = Object.freeze({
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 4,
  O_TRUNC: 8,
  O_APPEND: 16,
});

export class Inode {
  constructor(inodeNum, name, type = FileNodeType.FILE, mode = 0o644) {
    this.inodeNum = inodeNum;
    this.name = name;
    this.type = type;
    this.mode = mode; // Octal permissions e.g. 0755 or 0644
    this.size = 0;
    this.content = new Uint8Array(0);
    this.children = type === FileNodeType.DIRECTORY ? new Map() : null; // name -> Inode
    this.atime = Date.now();
    this.mtime = Date.now();
    this.ctime = Date.now();
  }

  setData(data) {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      this.content = encoder.encode(data);
    } else if (data instanceof Uint8Array) {
      this.content = data;
    } else {
      this.content = new Uint8Array(0);
    }
    this.size = this.content.length;
    this.mtime = Date.now();
  }

  getStringData() {
    const decoder = new TextDecoder();
    return decoder.decode(this.content);
  }
}

export class FileDescriptor {
  constructor(fdNum, inode, flags = OpenFlags.O_RDONLY) {
    this.fdNum = fdNum;
    this.inode = inode;
    this.flags = flags;
    this.offset = 0;
    this.isOpen = true;
  }

  read(count = 4096) {
    if (!this.isOpen || this.flags === OpenFlags.O_WRONLY) return null;
    const available = this.inode.size - this.offset;
    if (available <= 0) return new Uint8Array(0);

    const bytesToRead = Math.min(count, available);
    const chunk = this.inode.content.subarray(this.offset, this.offset + bytesToRead);
    this.offset += bytesToRead;
    return chunk;
  }

  write(data) {
    if (!this.isOpen || this.flags === OpenFlags.O_RDONLY) return -1;
    const encoder = typeof data === 'string' ? new TextEncoder() : null;
    const bytes = encoder ? encoder.encode(data) : data;

    const newSize = Math.max(this.inode.size, this.offset + bytes.length);
    const newBuf = new Uint8Array(newSize);
    newBuf.set(this.inode.content);
    newBuf.set(bytes, this.offset);

    this.inode.content = newBuf;
    this.inode.size = newSize;
    this.inode.mtime = Date.now();
    this.offset += bytes.length;
    return bytes.length;
  }

  close() {
    this.isOpen = false;
  }
}
