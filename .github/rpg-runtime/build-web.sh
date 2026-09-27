#!/usr/bin/env bash
set -euo pipefail
emcmake cmake -S /source -B /source/.retrom-build/web -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF -DBUILD_PLAY=ON -DBUILD_PSFPLAYER=OFF -DUSE_QT=OFF
cmake --build /source/.retrom-build/web --target Play --parallel 6

cp /emsdk/upstream/emscripten/LICENSE /source/.retrom-build/emscripten-LICENSE

mkdir -p /source/.retrom-build/bundler
if ! cmp -s /source/.github/rpg-runtime/bundler/package-lock.json /source/.retrom-build/bundler/package-lock.json || [[ ! -x /source/.retrom-build/bundler/node_modules/.bin/esbuild ]]; then
  cp /source/.github/rpg-runtime/bundler/package*.json /source/.retrom-build/bundler/
  npm ci --prefix /source/.retrom-build/bundler --cache /source/.retrom-build/npm-cache --no-audit --no-fund
fi
/source/.retrom-build/bundler/node_modules/.bin/esbuild /source/js/retrom/play-retrom.mjs \
  --bundle --format=esm --platform=browser --target=es2022 --outfile=/source/.retrom-build/web/play-retrom.mjs
