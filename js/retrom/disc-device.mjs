export const contentAbi = 'content-io-v1';
export const contractSha256 = '9601f63ba9d1bad095b42b32a3d6167166535be246a87f0efac7c5b125ed27bf';
/** One native polling operation; all acquisition and caching belong to the Provider Reader. */
export function discDevice(module, reader, reportFailure) {
  let done = true, failed = false, closed = false, active;
  const failure = error => {
    if (failed || closed) return;
    failed = true; active?.abort(error); reportFailure(error);
  };
  const check = signal => {if (closed || failed || signal.aborted) throw signal.reason ?? Error('CONTENT_IO_ABORTED');};
  const run = async (pointer, offset, size, controller) => {
    const deadline = performance.now() + 15000;
    const timer = setTimeout(() => controller.abort(Error('CONTENT_IO_TIMEOUT')), 15000);
    try {
      for (let copied = 0; copied < size;) {
        check(controller.signal);
        if (performance.now() >= deadline) throw Error('CONTENT_IO_TIMEOUT');
        const count = Math.min(262144, size - copied), bytes = new Uint8Array(count);
        const read = await cancellable(reader.readInto(offset + copied, bytes, controller.signal), controller.signal);
        check(controller.signal);
        if (read !== count) throw Error('CONTENT_IO_LENGTH_MISMATCH');
        const heap = module.HEAPU8;
        if (pointer > heap.length || size > heap.length - pointer) throw Error('CONTENT_IO_BOUNDS');
        heap.set(bytes, pointer + copied); copied += count;
      }
      check(controller.signal);
      if (!size) await cancellable(reader.readInto(offset, new Uint8Array(), controller.signal), controller.signal);
    } catch (error) {failure(error);} finally {clearTimeout(timer); active = undefined; done = true;}
  };
  return {
    read(pointer, offset, size) {
      if (closed || failed) return;
      if (!done) {failure(Error('CONTENT_IO_CAPACITY_EXCEEDED')); return;}
      // Emscripten wasm32 pointers can arrive signed; file offsets never use 32-bit coercion.
      if (!Number.isInteger(pointer) || pointer < -2147483648 || pointer > 4294967295 ||
          !Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
          offset > reader.sizeBytes || size > reader.sizeBytes - offset) {failure(Error('CONTENT_IO_BOUNDS')); return;}
      pointer = pointer >>> 0;
      if (pointer > module.HEAPU8.length || size > module.HEAPU8.length - pointer) {failure(Error('CONTENT_IO_BOUNDS')); return;}
      done = false; active = new AbortController(); void run(pointer, offset, size, active);
    },
    getFileSize: () => reader.sizeBytes,
    isDone: () => done,
    hasError: () => failed,
    close() {closed = true; active?.abort(Error('CONTENT_IO_ABORTED'));},
  };
}
function cancellable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(promise).then(value => {signal.removeEventListener('abort', abort); resolve(value);},
      error => {signal.removeEventListener('abort', abort); reject(error);});
  });
}
