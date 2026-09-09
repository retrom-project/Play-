import Play from './Play.js';
import {RangeReader, persistentCache, discDevice} from './range-device.mjs';
import {MAX_CHECKPOINT_BYTES, captureFiles, restoreFiles, encodeCheckpoint, decodeCheckpoint} from './checkpoint.mjs';
import {bindInput} from './input.mjs';

export const RETROM_PLAY_ABI = 'play-host-v1';
export const RETROM_PLAY_CHECKPOINT_MAX_BYTES = MAX_CHECKPOINT_BYTES;

export async function createRetromPlay(options) {
  const win = options.target.ownerDocument.defaultView;
  const canvas = options.target.ownerDocument.createElement('canvas');
  canvas.id = 'outputCanvas'; canvas.setAttribute('aria-label', 'Play! PS2 game'); canvas.width = 640; canvas.height = 480; canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
  options.target.append(canvas);
  let stopped = false;
  let failure = null;
  let module;
  let input;
  const reader = new RangeReader({...options.disc, cache: persistentCache(win.caches, new URL(import.meta.url).origin)});
  const reportFailure = error => {
    if (stopped || failure) {return;}
    failure = error instanceof Error ? error : Error('PLAY_RUNTIME_FAILED');
    options.onFailure?.(failure);
  };
  async function stop() {
    if (stopped) {return;}
    stopped = true;
    input?.stop(); reader.close();
    module?.PThread.terminateAllThreads();
    for (const context of Object.values(module?.AL?.contexts ?? {})) {
      await context?.audioCtx?.close().catch(() => {});
    }
    canvas.remove();
  }
  async function request(operation, path = '') {
    if (stopped || failure) {throw failure ?? Error('PLAY_RUNTIME_EXITED');}
    module.retromRequest(operation, path);
    await waitFor(() => module.retromPoll(), 30000, () => failure || stopped && Error('PLAY_RUNTIME_EXITED'));
  }
  try {
    module = await Play({canvas,
      locateFile: name => new URL(name, import.meta.url).href,
      mainScriptUrlOrBlob: new URL('Play.js', import.meta.url).href,
      onAbort: () => reportFailure(Error('PLAY_CORE_ABORTED')),
    });
    if (options.signal?.aborted) {throw Error('PLAY_RUNTIME_EXITED');}
    module.discImageDevice = discDevice(module, reader, reportFailure);
    module.FS.mkdirTree('/retrom/mc0'); module.FS.mkdirTree('/retrom/mc1');
    module.ccall('initVm', '', [], []);
    module.retromConfigure();
    const restored = options.restorePayload ? decodeCheckpoint(options.restorePayload, options.disc.sha256) : null;
    if (restored) {restoreFiles(module.FS, restored);}
    const header = await reader.read(0, Math.min(8, options.disc.sizeBytes));
    const extension = new TextDecoder().decode(header) === 'MComprHD' ? 'chd' : 'iso';
    await request(0, `game.${extension}`);
    if (restored) {await request(4);}
    await request(2);
    await waitFor(() => module.getFrames() > 0 ? 1 : 0, 60000, () => failure || stopped && Error('PLAY_RUNTIME_EXITED'));
    input = bindInput(module, canvas, win);
    canvas.focus();
  } catch (error) {await stop(); throw error;}
  let paused = false;
  return {
    canvas,
    frameCount: () => module.getFrames(),
    async pause() {input.pause(); await request(1); paused = true;},
    async resume() {await request(2); paused = false; input.resume();},
    async checkpoint() {
      const wasPaused = paused;
      input.pause();
      await request(1);
      try {
        await request(3);
        return encodeCheckpoint(captureFiles(module.FS), options.disc.sha256);
      } finally {
        try {module.FS.unlink('/retrom/state.zip');} catch { /* No completed state on failed save. */ }
        if (!wasPaused) {await request(2); input.resume();}
      }
    },
    screenshot: () => new Promise((resolve, reject) => canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(Error('PLAY_SCREENSHOT_FAILED')), 'image/png')),
    stop,
  };
}

async function waitFor(poll, timeout, failure) {
  const until = performance.now() + timeout;
  while (performance.now() < until) {
    const error = failure();
    if (error) {throw error;}
    const result = poll();
    if (result === 1) {return;}
    if (result < 0) {throw Error('PLAY_CORE_OPERATION_FAILED');}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('PLAY_CORE_TIMEOUT');
}

if (typeof window !== 'undefined') {
  window.__RETROM_PLAY_CORE_MODULE_V1__ = {RETROM_PLAY_ABI, RETROM_PLAY_CHECKPOINT_MAX_BYTES, createRetromPlay};
}
