export class RangeReader {
  constructor(options) {
    this.options = options;
    this.blockSize = options.blockSize ?? 262144;
    this.memory = new Map();
    this.pending = new Map();
    this.abort = new AbortController();
  }

  async read(offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
        offset + size > this.options.sizeBytes || size > 16 * 1024 * 1024) {throw Error('PLAY_DISC_BOUNDS');}
    const output = new Uint8Array(size);
    let done = 0;
    while (done < size) {
      const position = offset + done;
      const block = Math.floor(position / this.blockSize);
      const bytes = await this.block(block);
      const start = position % this.blockSize;
      const count = Math.min(bytes.length - start, size - done);
      output.set(bytes.subarray(start, start + count), done);
      done += count;
    }
    return output;
  }

  async block(index) {
    if (this.abort.signal.aborted) {throw Error('PLAY_DISC_CLOSED');}
    if (this.memory.has(index)) {
      const value = this.memory.get(index);
      this.memory.delete(index);
      this.memory.set(index, value);
      return value;
    }
    if (this.pending.has(index)) {return this.pending.get(index);}
    const promise = this.loadBlock(index);
    this.pending.set(index, promise);
    try {
      const bytes = await promise;
      this.memory.set(index, bytes);
      if (this.memory.size > 32) {this.memory.delete(this.memory.keys().next().value);}
      return bytes;
    } finally {this.pending.delete(index);}
  }

  async loadBlock(index) {
    const start = index * this.blockSize;
    const end = Math.min(start + this.blockSize, this.options.sizeBytes) - 1;
    const size = end - start + 1;
    const key = `${this.options.sha256}-${this.options.sizeBytes}-${this.blockSize}-${index}`;
    try {
      const stored = await this.options.cache?.get(key);
      if (stored?.length === size) {return stored;}
    } catch { /* Persistent storage is optional. */ }
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      credentials: 'same-origin', headers: {Range: `bytes=${start}-${end}`}, signal: this.abort.signal,
    });
    if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${end}/${this.options.sizeBytes}`) {
      await response.body?.cancel();
      throw Error('PLAY_DISC_RANGE_INVALID');
    }
    const bytes = await boundedResponse(response, size);
    try {await this.options.cache?.put(key, bytes);} catch { /* Network data remains usable. */ }
    return bytes;
  }

  close() {
    this.abort.abort();
    this.memory.clear();
  }
}

async function boundedResponse(response, size) {
  const reader = response.body?.getReader();
  if (!reader) {throw Error('PLAY_DISC_RANGE_INVALID');}
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) {break;}
      if (offset + value.length > size) {throw Error('PLAY_DISC_RANGE_INVALID');}
      bytes.set(value, offset);
      offset += value.length;
    }
    if (offset !== size) {throw Error('PLAY_DISC_RANGE_INVALID');}
    return bytes;
  } finally {await reader.cancel(); reader.releaseLock();}
}

export function persistentCache(storage = globalThis.caches, origin = new URL(import.meta.url).origin) {
  return {
    async get(key) {
      const cache = await storage.open('retrom-play-disc-v1');
      const response = await cache.match(new URL(`/__retrom_play_cache__/${key}`, origin));
      return response ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async put(key, bytes) {
      const cache = await storage.open('retrom-play-disc-v1');
      await cache.put(new URL(`/__retrom_play_cache__/${key}`, origin), new Response(bytes));
    },
  };
}

export function discDevice(module, reader, reportFailure) {
  let done = true;
  let failed = false;
  return {
    read(pointer, offset, size) {
      done = false;
      reader.read(offset, size).then(bytes => {module.HEAPU8.set(bytes, pointer >>> 0);})
        .catch(error => {failed = true; reportFailure(error);}).finally(() => {done = true;});
    },
    getFileSize: () => reader.options.sizeBytes,
    isDone: () => done,
    hasError: () => failed,
  };
}
