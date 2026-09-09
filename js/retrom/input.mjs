const buttons = [12, 13, 14, 15, 8, 9, 2, 3, 1, 0, 4, 6, 10, 5, 7, 11];

export function gamepadValues(pad) {
  const axes = Array.from({length: 4}, (_, i) => {
    const value = Math.max(-1, Math.min(1, pad.axes[i] ?? 0));
    return Math.round((Math.abs(value) < 0.15 ? 0 : value) * 127 + 128);
  });
  return [...axes, ...buttons.map(index => pad.buttons[index]?.pressed ? 1 : 0)];
}

export function bindInput(module, canvas, win) {
  let stopped = false;
  let paused = false;
  let focused = true;
  let frame = 0;
  const neutral = [128, 128, 128, 128, ...new Array(16).fill(0)];
  function release() {
    for (let port = 0; port < 2; port++) {
      neutral.forEach((value, index) => module.retromPad(port, index, value));
      module.retromPadEnabled(port, true);
    }
  }
  function tick() {
    if (stopped) {return;}
    const active = !paused && focused;
    const pads = [...(win.navigator.getGamepads?.() ?? [])].filter(pad => pad?.connected && pad.mapping === 'standard').slice(0, 2);
    for (let port = 0; port < 2; port++) {
      const pad = active ? pads[port] : null;
      (pad ? gamepadValues(pad) : neutral).forEach((value, index) => module.retromPad(port, index, value));
      module.retromPadEnabled(port, !!pad || !active || port > 0);
    }
    frame = win.requestAnimationFrame(tick);
  }
  const focus = () => {canvas.focus();};
  const blur = () => {focused = false; release();};
  const activate = () => {focused = true;};
  canvas.addEventListener('pointerdown', focus);
  win.addEventListener('blur', blur);
  win.addEventListener('focus', activate);
  tick();
  return {
    pause() {paused = true; release();},
    resume() {paused = false;},
    stop() {
      stopped = true; win.cancelAnimationFrame(frame); release();
      canvas.removeEventListener('pointerdown', focus);
      win.removeEventListener('blur', blur); win.removeEventListener('focus', activate);
    },
  };
}
