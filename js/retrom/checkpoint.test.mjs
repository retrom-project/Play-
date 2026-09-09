import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeCheckpoint, decodeCheckpoint} from './checkpoint.mjs';

test('restores execution state and both memory cards as one content-bound snapshot', () => {
  const files = new Map([['state.zip', new Uint8Array([1, 2, 3])], ['mc0/game/save', new Uint8Array([4])],
    ['mc1/game/save', new Uint8Array([5])]]);
  const bytes = encodeCheckpoint(files, 'a'.repeat(64));
  assert.deepEqual(decodeCheckpoint(bytes, 'a'.repeat(64)), files);
  assert.throws(() => decodeCheckpoint(bytes, 'b'.repeat(64)), /PLAY_CHECKPOINT_INVALID/);
  assert.throws(() => decodeCheckpoint(bytes.slice(0, -1), 'a'.repeat(64)), /PLAY_CHECKPOINT_INVALID/);
});

test('rejects path traversal, empty execution state and unexpected files', () => {
  for (const path of ['mc0/../escape', '/state.zip', 'mc0/a\\b', 'settings']) {
    assert.throws(() => encodeCheckpoint(new Map([['state.zip', new Uint8Array([1])], [path, new Uint8Array([2])]]), 'a'),
      /PLAY_CHECKPOINT_INVALID/);
  }
  assert.throws(() => encodeCheckpoint(new Map([['state.zip', new Uint8Array()]]), 'a'), /PLAY_CHECKPOINT_INVALID/);
});

test('accepts a Uint8Array snapshot received from the host realm', () => {
  const bytes = encodeCheckpoint(new Map([['state.zip', new Uint8Array([1, 2])]]), 'digest');
  const foreign = runInNewContext('new Uint8Array(bytes)', {bytes: [...bytes]});
  assert.equal(foreign instanceof Uint8Array, false);
  assert.equal(decodeCheckpoint(foreign, 'digest').get('state.zip').length, 2);
});
