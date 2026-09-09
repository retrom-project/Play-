import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gamepadValues} from './input.mjs';

test('maps analog axes and standard confirm/cancel/directions to PS2 controls', () => {
  const pad = {axes: [-1, 0.1, 1, 0], buttons: Array.from({length: 17}, () => ({pressed: false}))};
  for (const i of [0, 1, 12, 7]) {pad.buttons[i].pressed = true;}
  const values = gamepadValues(pad);
  assert.deepEqual(values.slice(0, 4), [1, 128, 255, 128]);
  for (const i of [4, 12, 13, 18]) {assert.equal(values[i], 1);}
  assert.equal(values[5], 0);
});

test('pause remains neutral across focus and exit removes handlers and polling', async () => {
  const {bindInput} = await import('./input.mjs');
  const values = new Map();
  const module = {retromPad: (port, button, value) => values.set(`${port}/${button}`, value), retromPadEnabled() {}};
  const win = new EventTarget(); let poll; let cancelled = false;
  win.navigator = {getGamepads: () => [{connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({length: 17}, (_, index) => ({pressed: index === 0}))}]};
  win.requestAnimationFrame = callback => {poll = callback; return 1;};
  win.cancelAnimationFrame = () => {cancelled = true;};
  const canvas = new EventTarget(); canvas.focus = () => {};
  const input = bindInput(module, canvas, win);
  assert.equal(values.get('0/13'), 1);
  input.pause(); win.dispatchEvent(new Event('focus')); poll();
  assert.equal(values.get('0/13'), 0);
  input.resume(); poll(); assert.equal(values.get('0/13'), 1);
  input.stop(); assert.equal(values.get('0/13'), 0); assert.equal(cancelled, true);
  values.clear(); win.dispatchEvent(new Event('blur')); assert.equal(values.size, 0);
});
