"""Preserve notices for the fixed Web build's linked dependencies."""
import sys
from pathlib import Path
root, output = map(Path, sys.argv[1:])
paths = ["License.txt", "deps/CodeGen/License.txt", "deps/Framework/License.txt", "deps/Nuanceur/License.txt",
         "deps/libchdr/LICENSE.txt", "deps/libchdr/deps/lzma-24.05/LICENSE",
         "deps/Dependencies/bzip2-1.0.6/LICENSE", "deps/Dependencies/xxHash/LICENSE",
         "deps/Dependencies/zstd/LICENSE", "deps/Dependencies/nlohmann_json/LICENSE.MIT",
         "deps/Dependencies/ghc_filesystem/LICENSE", ".retrom-build/emscripten-LICENSE"]
sections = [f"{path}\n{'=' * len(path)}\n{(root / path).read_text()}" for path in paths]
for path in ["deps/Dependencies/zlib/zlib.h", "deps/Dependencies/sqlite-3.20.1/sqlite3.h"]:
    text = (root / path).read_text()
    end = text.index("*/") + 2 if "zlib" in path else text.index("** This header")
    sections.append(f"{path}\n{'=' * len(path)}\n{text[:end]}")
output.write_text("\n\n".join(sections) + "\n")
