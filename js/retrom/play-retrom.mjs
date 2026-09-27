import {contentAbi, contractSha256, discDevice} from './disc-device.mjs';
import {MAX_CHECKPOINT_BYTES, captureFiles, restoreFiles, encodeCheckpoint, decodeCheckpoint} from './checkpoint.mjs';
import {bindInput} from './input.mjs';

export const RETROM_PLAY_ABI = 'play-host-v2';
export {contentAbi, contractSha256};
export const RETROM_PLAY_CHECKPOINT_MAX_BYTES = MAX_CHECKPOINT_BYTES;

export async function createRetromPlay(options) {
  if (options.content?.abi !== contentAbi || options.content.contractSha256 !== contractSha256 ||
      options.content.disc?.abi !== contentAbi || options.content.disc.sizeBytes !== options.disc.sizeBytes ||
      Object.keys(options.disc).sort().join(',') !== 'sha256,sizeBytes' || !/^[a-f0-9]{64}$/.test(options.disc.sha256)) {
    throw Error('CONTENT_IO_ABI_MISMATCH');
  }
  const win = options.target.ownerDocument.defaultView;
  const canvas = options.target.ownerDocument.createElement('canvas');
  canvas.id = 'outputCanvas'; canvas.setAttribute('aria-label', 'Play! PS2 game'); canvas.width = 640; canvas.height = 480; canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
  options.target.append(canvas);
  let stopped = false;
  let failure = null;
  let module;
  let input;
  const reader = options.content.disc;
  const reportFailure = error => {
    if (stopped || failure) {return;}
    failure = error instanceof Error ? error : Error('PLAY_RUNTIME_FAILED');
    options.onFailure?.(failure);
  };
  async function stop() {
    if (stopped) {return;}
    stopped = true;
    input?.stop();
    module?.PThread.terminateAllThreads();
    module?.discImageDevice?.close();
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
    const {default: Play} = await import(assetURL(options.assets, 'Play.js'));
    module = await Play({canvas,
      locateFile: name => assetURL(options.assets, name),
      mainScriptUrlOrBlob: assetURL(options.assets, 'Play.js'),
      onAbort: () => reportFailure(Error('PLAY_CORE_ABORTED')),
    });
    if (options.signal?.aborted) {throw Error('PLAY_RUNTIME_EXITED');}
    module.discImageDevice = discDevice(module, reader, reportFailure);
    module.FS.mkdirTree('/retrom/mc0'); module.FS.mkdirTree('/retrom/mc1');
    module.ccall('initVm', '', [], []);
    module.retromConfigure();
    const restored = options.restorePayload ? decodeCheckpoint(options.restorePayload, options.disc.sha256) : null;
    if (restored) {restoreFiles(module.FS, restored);}
    const header = new Uint8Array(Math.min(8, options.disc.sizeBytes));
    await reader.readInto(0, header, options.signal);
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

function assetURL(assets, name) {
  const url = assets?.[name];
  if (typeof url !== 'string' || !url.startsWith('blob:')) throw Error('PLAY_ASSET_INVALID');
  return url;
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
  window.__RETROM_PLAY_CORE_MODULE_V1__ = {RETROM_PLAY_ABI, RETROM_PLAY_CHECKPOINT_MAX_BYTES, contentAbi, contractSha256, createRetromPlay};
}
