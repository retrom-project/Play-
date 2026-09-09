import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RangeReader} from './range-device.mjs';

test('reads bounded blocks and reuses persistent bytes across instances', async () => {
  const bytes = Uint8Array.from({length: 32}, (_, i) => i);
  const cache = new Map();
  let requests = 0;
  const options = {url: 'https://example.test/disc', sizeBytes: 32, sha256: 'a'.repeat(64), blockSize: 8,
    cache: {get: async key => cache.get(key), put: async (key, value) => cache.set(key, value)},
    fetch: async (_, init) => {
      requests++;
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
      return new Response(bytes.slice(+a, +b + 1), {status: 206,
        headers: {'Content-Range': `bytes ${a}-${b}/32`}});
    }};
  assert.deepEqual(await new RangeReader(options).read(6, 6), bytes.slice(6, 12));
  assert.equal(requests, 2);
  assert.deepEqual(await new RangeReader(options).read(6, 6), bytes.slice(6, 12));
  assert.equal(requests, 2);
});

test('rejects whole-file fallback, wrong ranges and short responses', async () => {
  for (const [status, range, length] of [[200, 'bytes 0-7/16', 8], [206, 'bytes 1-8/16', 8], [206, 'bytes 0-7/16', 7]]) {
    const reader = new RangeReader({url: 'https://example.test/disc', sizeBytes: 16, sha256: 'b'.repeat(64), blockSize: 8,
      fetch: async () => new Response(new Uint8Array(length), {status, headers: {'Content-Range': range}})});
    await assert.rejects(reader.read(0, 4), /PLAY_DISC_RANGE_INVALID/);
  }
});

test('cache failure falls back to network and out of bounds reads fail', async () => {
  const reader = new RangeReader({url: 'https://example.test/disc', sizeBytes: 8, sha256: 'c'.repeat(64), blockSize: 8,
    cache: {get: async () => {throw Error('unavailable');}, put: async () => {throw Error('full');}},
    fetch: async () => new Response(new Uint8Array(8), {status: 206, headers: {'Content-Range': 'bytes 0-7/8'}})});
  assert.equal((await reader.read(0, 4)).length, 4);
  await assert.rejects(reader.read(7, 2), /PLAY_DISC_BOUNDS/);
});

test('persistent cache uses the supplied runtime origin in about:blank frames', async () => {
  const {persistentCache} = await import('./range-device.mjs');
  const previous = globalThis.location;
  globalThis.location = {origin: 'null'};
  const responses = new Map();
  const storage = {open: async () => ({
    match: async url => responses.get(url.href)?.clone(),
    put: async (url, response) => {responses.set(url.href, response);},
  })};
  try {
    const first = persistentCache(storage, 'https://runtime.example');
    await first.put('digest-8-8-0', new Uint8Array([1, 2]));
    const second = persistentCache(storage, 'https://runtime.example');
    assert.deepEqual(await second.get('digest-8-8-0'), new Uint8Array([1, 2]));
    assert.ok(responses.has('https://runtime.example/__retrom_play_cache__/digest-8-8-0'));
  } finally {if (previous === undefined) {delete globalThis.location;} else {globalThis.location = previous;}}
});
