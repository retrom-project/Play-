#!/usr/bin/env bash
set -euo pipefail
emcmake cmake -S /source -B /source/.retrom-build/web -G "Unix Makefiles" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF -DBUILD_PLAY=ON -DBUILD_PSFPLAYER=OFF -DUSE_QT=OFF
cmake --build /source/.retrom-build/web --target Play --parallel 6

cp /emsdk/upstream/emscripten/LICENSE /source/.retrom-build/emscripten-LICENSE
