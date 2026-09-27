import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {contentAbi, contractSha256} from './disc-device.mjs';

test('native factory receives only verified asset URLs, including pthread startup', async () => {
  let options;
  const factory = value => {options = value; throw Error('observed factory');};
  const context = vm.createContext({URL});
  const native = new vm.SyntheticModule(['default'], function () {this.setExport('default', factory);}, {context});
  const module = new vm.SourceTextModule(await readFile(new URL('./play-retrom.mjs', import.meta.url), 'utf8'), {
    context, initializeImportMeta: meta => {meta.url = 'https://core.test/play-retrom.mjs';},
    importModuleDynamically: async url => {
      assert.equal(url, 'blob:https://core.test/module');
      await native.link(() => {}); await native.evaluate(); return native;
    },
  });
  await module.link(specifier => {
    if (specifier === './Play.js') return native;
    const exports = specifier.includes('disc') ? {contentAbi, contractSha256, discDevice() {}} :
      specifier.includes('input') ? {bindInput() {}} : {MAX_CHECKPOINT_BYTES: 268435456,
        captureFiles() {}, restoreFiles() {}, encodeCheckpoint() {}, decodeCheckpoint() {}};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, {context});
  });
  await module.evaluate();
  const assets = {'Play.js': 'blob:https://core.test/module', 'Play.wasm': 'blob:https://core.test/wasm'};
  const target = {append() {}, ownerDocument: {defaultView: {}, createElement: () => ({style: {}, setAttribute() {}, remove() {}})}};
  await assert.rejects(module.namespace.createRetromPlay({target, assets,
    disc: {sha256: 'a'.repeat(64), sizeBytes: 3}, content: {abi: contentAbi, contractSha256,
      disc: {abi: contentAbi, sizeBytes: 3}}}), /observed factory/);
  assert.equal(options.locateFile('Play.wasm'), assets['Play.wasm']);
  assert.equal(options.mainScriptUrlOrBlob, assets['Play.js']);
  assert.throws(() => options.locateFile('unknown'), /ASSET/);
});
