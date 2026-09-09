#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
output=${1:?absolute empty output directory required}
python3 "$root/.github/rpg-runtime/candidate_descriptor.py" prepare "$output"
node --test "$root"/js/retrom/*.test.mjs
mkdir -p "$root/.retrom-build"
docker run --rm --user "$(id -u):$(id -g)" \
  --env HOME=/tmp --volume "$root:/source" --workdir /source \
  emscripten/emsdk@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7 \
  bash /source/.github/rpg-runtime/build-web.sh
cp "$root/.retrom-build/web/Source/ui_js/Play.js" "$root/.retrom-build/web/Source/ui_js/Play.wasm" "$output/"
cp "$root/js/retrom/play-retrom.mjs" "$root/js/retrom/range-device.mjs" \
  "$root/js/retrom/checkpoint.mjs" "$root/js/retrom/input.mjs" "$output/"
python3 "$root/.github/rpg-runtime/licenses.py" "$root" "$output/LICENSE"
python3 "$root/.github/rpg-runtime/candidate_descriptor.py" finalize "$output" --core-id play
