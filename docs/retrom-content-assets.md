# Provider-owned core assets

The browser host requires an `assets` map with verified Blob URLs for `Play.js` and `Play.wasm`.
The Provider validates their size and SHA-256 through Content I/O before starting the core.
The host imports the supplied module, resolves Emscripten assets from this map and uses the same
module URL for pthread startup. Missing entries fail instead of falling back to network URLs.
The Provider owns these URLs until the core has stopped, including failed startup cleanup.

The candidate build bundles `play-retrom.mjs` with its checkpoint, input and disc-device helpers.
This self-contained host can also execute from a verified Blob URL without relative imports.
The disc Reader and native filesystem semantics are unchanged.

Run `node --experimental-vm-modules --test js/retrom/*.test.mjs` and the candidate descriptor tests
before building with `.github/rpg-runtime/build-candidate.sh` and verifying the Retrom PS2 product case.
