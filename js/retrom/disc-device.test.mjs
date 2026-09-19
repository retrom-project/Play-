import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discDevice} from './disc-device.mjs';
const B = 262144;
const idle = async device => {for (let n = 0; !device.isDone() && n < 100; n++) await new Promise(resolve => setImmediate(resolve)); assert.equal(device.isDone(), true);};
function fixture(sizeBytes = 5368709243) {
  const calls = [], failures = [], module = {HEAPU8: new Uint8Array(2 * B + 32)};
  const reader = {sizeBytes, readInto: async (offset, output) => {calls.push({offset, length: output.length}); for (let i = 0; i < output.length; i++) output[i] = (offset + i) % 251; return output.length;}};
  return {module, reader, calls, failures, device: discDevice(module, reader, error => failures.push(error))};
}
test('[BR-04] UNIT/play-device reads beyond 4GiB with bounded segments and accurate polling', async () => {
  const f = fixture(); f.device.read(8, 4294967299, B + 13); assert.equal(f.device.isDone(), false); await idle(f.device);
  assert.deepEqual(f.calls, [{offset: 4294967299, length: B}, {offset: 4295229443, length: 13}]);
  assert.equal(f.device.hasError(), false); assert.equal(f.device.getFileSize(), 5368709243);
  for (let i = 0; i < B + 13; i++) assert.equal(f.module.HEAPU8[8 + i], (4294967299 + i) % 251);
});
test('[BR-04] UNIT/play-device takes the current heap after await instead of writing detached storage', async () => {
  const f = fixture(), before = f.module.HEAPU8;
  f.reader.readInto = async (_offset, output) => {f.module.HEAPU8 = new Uint8Array(before.length); output.fill(7); return output.length;};
  f.device.read(10, 0, 9); await idle(f.device); assert.deepEqual([...f.module.HEAPU8.slice(10, 19)], Array(9).fill(7));
  assert.equal(before.some(Boolean), false);
});
test('[BR-04] UNIT/play-device failure is permanent and reported once', async () => {
  const f = fixture(); f.reader.readInto = async () => {throw Error('CONTENT_IO_IDENTITY_CHANGED');};
  f.device.read(0, 0, 1); await idle(f.device); assert.equal(f.device.hasError(), true);
  f.device.read(0, 0, 1); await idle(f.device); assert.equal(f.failures.length, 1); assert.equal(f.module.HEAPU8.some(Boolean), false);
});
test('[IO-10] UNIT/play-device rejects overlapping native operations and discards a late result', async () => {
  const f = fixture(); let release;
  f.reader.readInto = async (_offset, output) => {await new Promise(resolve => {release = resolve;}); output.fill(9); return output.length;};
  f.device.read(0, 0, 1); f.device.read(1, 1, 1); release(); await idle(f.device);
  assert.equal(f.device.hasError(), true); assert.equal(f.failures.length, 1); assert.equal(f.module.HEAPU8.some(Boolean), false);
});
test('[BR-08] UNIT/play-device close cancels the current read and prevents late heap writes', async () => {
  const f = fixture(); let release, signal;
  f.reader.readInto = async (_offset, output, active) => {signal = active; await new Promise(resolve => {release = resolve;}); output.fill(9); return output.length;};
  f.device.read(0, 0, 1); f.device.close(); assert.equal(signal.aborted, true); release(); await idle(f.device);
  assert.equal(f.module.HEAPU8.some(Boolean), false); assert.equal(f.failures.length, 0);
});
test('[X-30] UNIT/play-device accepts native reads beyond 16MiB without extending the logical timeout', async () => {
  const f = fixture(); f.module.HEAPU8 = new Uint8Array(17 * 1024 * 1024 + 9);
  f.device.read(0, 0, f.module.HEAPU8.length); await idle(f.device);
  assert.equal(f.device.hasError(), false); assert.equal(f.calls.length, Math.ceil(f.module.HEAPU8.length / B));
  assert.equal(f.module.HEAPU8.at(-1), (f.module.HEAPU8.length - 1) % 251);
});
