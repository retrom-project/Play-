export const MAX_CHECKPOINT_BYTES = 256 * 1024 * 1024;
const magic = new TextEncoder().encode('PLAYST01');

export function encodeCheckpoint(files, digest) {
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b));
  const header = new TextEncoder().encode(JSON.stringify({digest, files: entries.map(([path, bytes]) => ({path, size: bytes.length}))}));
  const total = 12 + header.length + entries.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  if (header.length > 1024 * 1024 || total > MAX_CHECKPOINT_BYTES) {throw Error('PLAY_CHECKPOINT_TOO_LARGE');}
  const output = new Uint8Array(total);
  output.set(magic);
  new DataView(output.buffer).setUint32(8, header.length, true);
  output.set(header, 12);
  let offset = 12 + header.length;
  for (const [, bytes] of entries) {output.set(bytes, offset); offset += bytes.length;}
  decodeCheckpoint(output, digest);
  return output;
}

export function decodeCheckpoint(bytes, digest) {
  if ((!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]') || bytes.length < 13 || bytes.length > MAX_CHECKPOINT_BYTES ||
      magic.some((value, i) => bytes[i] !== value)) {throw Error('PLAY_CHECKPOINT_INVALID');}
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (size < 1 || size > 1024 * 1024 || size + 12 > bytes.length) {throw Error('PLAY_CHECKPOINT_INVALID');}
  let header;
  try {header = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(12, 12 + size)));}
  catch {throw Error('PLAY_CHECKPOINT_INVALID');}
  if (header?.digest !== digest || !Array.isArray(header.files) || header.files.length > 4096) {
    throw Error('PLAY_CHECKPOINT_INVALID');
  }
  const files = new Map();
  let offset = 12 + size;
  for (const entry of header.files) {
    if (!safePath(entry?.path) || files.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 ||
        offset + entry.size > bytes.length) {throw Error('PLAY_CHECKPOINT_INVALID');}
    files.set(entry.path, bytes.slice(offset, offset + entry.size));
    offset += entry.size;
  }
  if (offset !== bytes.length || !files.get('state.zip')?.length) {throw Error('PLAY_CHECKPOINT_INVALID');}
  return files;
}

function safePath(path) {
  return typeof path === 'string' && path.length < 1024 && !/[\\\x00-\x1f\x7f]/u.test(path) &&
    (path === 'state.zip' || /^(mc0|mc1)\//u.test(path)) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

export function captureFiles(fs) {
  const files = new Map();
  let total = 0;
  function visit(path) {
    for (const name of fs.readdir(`/retrom/${path}`)) {
      if (name === '.' || name === '..') {continue;}
      const relative = path ? `${path}/${name}` : name;
      const stat = fs.lstat(`/retrom/${relative}`);
      if (fs.isDir(stat.mode)) {visit(relative); continue;}
      if (!fs.isFile(stat.mode) || !safePath(relative)) {throw Error('PLAY_CHECKPOINT_INVALID');}
      total += stat.size;
      if (total > MAX_CHECKPOINT_BYTES || files.size >= 4096) {throw Error('PLAY_CHECKPOINT_TOO_LARGE');}
      files.set(relative, fs.readFile(`/retrom/${relative}`));
    }
  }
  visit('');
  return files;
}

export function restoreFiles(fs, files) {
  for (const [path, bytes] of files) {
    const absolute = `/retrom/${path}`;
    fs.mkdirTree(absolute.slice(0, absolute.lastIndexOf('/')));
    fs.writeFile(absolute, bytes);
  }
}
