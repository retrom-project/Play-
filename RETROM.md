# Retrom browser integration

The upstream mirror is `master`. The pinned maintenance branch and source commit are recorded in
`retrom-fork.json`; feature work branches from that baseline. Retrom changes are not merged into the
upstream mirror. Candidate builds are explicit through `.github/rpg-runtime/build-candidate.sh`.
No stable release is implied by a candidate build.

`play-retrom.mjs` exports the host-independent `play-host-v1` interface. A fresh document owns one
runtime instance, a 640×480 WebGL2 canvas, two standard gamepad ports and the Wasm worker pool.
Optical images use a bounded 256 KiB HTTP Range reader with a 32-block memory LRU and persistent
content-keyed block storage. Non-206, inexact ranges and short/oversized data fail the session.

Checkpoints use `play-state-v1`: a content-bound envelope containing the complete native compressed
state and both memory-card file trees. The maximum is 256 MiB. Capture pauses at a VM mailbox barrier;
save/load completion is explicitly acknowledged. A new runtime imports cards before boot, loads the
execution state while paused, then resumes. The host owns durable checkpoint storage.

Run `node --test js/retrom/*.test.mjs` for Range/cache, checkpoint and standard input regressions.
Actual compatibility must be checked through Retrom import, review preview, launch, input, capture
and restore into another launch. Private games are never included in the repository or build output.

## Release maintenance

PRs to `retrom/g83700b2c31e5` run `retrom-quality.yml`, which tests the host interface and
builds the pinned WebAssembly core. Upstream platform workflows remain scoped to `master`.
Annotated `retrom-core-g83700b2c31e5-rN` tags on the maintenance branch run
`retrom-release.yml`; a clean source build supplies the closed asset list and per-file hashes.
Provider consumers pin the published tag, commit, ABI and metadata through their normal release inputs.

## Known game compatibility

Ridge Racer V reaches interactive menus, supports host snapshots and resumes input after restore.
Vertical image bobbing and missing 3D scenery remain observed limitations. Upstream reports:
https://github.com/jpd002/Play-Compatibility/issues/349 and
https://github.com/jpd002/Play-/pull/752. Those reports are historical evidence, not a full
compatibility result for this build. Do not describe host lifecycle tests as complete game compatibility.
