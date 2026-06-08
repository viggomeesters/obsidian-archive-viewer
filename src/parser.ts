const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const MAX_EOCD_SEARCH = 0xffff + 22;
const LARGE_ENTRY_BYTES = 100 * 1024 * 1024;
const LARGE_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MANY_FILE_THRESHOLD = 1000;
const BOMB_RATIO_THRESHOLD = 100;
const ZIP64_SENTINEL = 0xffffffff;

export const ENTRY_RENDER_LIMIT = 2000;

export interface ArchiveEntry {
  path: string;
  type: "file" | "directory";
  extension: string;
  size: number;
  compressedSize: number;
  compressionMethod: number;
  compressionLabel: string;
  modifiedAt: string;
  encrypted: boolean;
  localHeaderOffset: number;
  warnings: string[];
}

export interface ArchiveSummary {
  itemCount: number;
  fileCount: number;
  directoryCount: number;
  totalUncompressedSize: number;
  totalCompressedSize: number;
  compressionRatio: number;
  suspiciousEntryCount: number;
  renderedEntryLimit: number;
}

export interface ParsedArchive {
  format: "zip";
  entries: ArchiveEntry[];
  summary: ArchiveSummary;
  warnings: string[];
}

interface EndOfCentralDirectory {
  directoryOffset: number;
  directorySize: number;
  totalRecords: number;
}

export function parseZipArchive(data: ArrayBuffer): ParsedArchive {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  const eocd = findEndOfCentralDirectory(view);
  const entries = parseCentralDirectory(bytes, view, eocd);
  const warnings = archiveWarnings(entries, eocd.totalRecords);
  const summary = summarize(entries);

  return {
    format: "zip",
    entries,
    summary,
    warnings,
  };
}

export function filterArchiveEntries(entries: ArchiveEntry[], query: string): ArchiveEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  const extensionQuery = normalized.startsWith(".") ? normalized.slice(1) : "";

  return entries.filter((entry) => {
    const extension = entry.extension.toLowerCase();
    const path = entry.path.toLowerCase();
    return path.includes(normalized) || Boolean(extensionQuery && extension === extensionQuery);
  });
}

export function buildArchiveTree(entries: ArchiveEntry[]): ArchiveTreeNode {
  const root: ArchiveTreeNode = {
    children: new Map(),
    entry: null,
    name: "",
    path: "",
    type: "directory",
  };

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let child = current.children.get(part);
      if (!child) {
        child = {
          children: new Map(),
          entry: null,
          name: part,
          path: currentPath,
          type: isLeaf ? entry.type : "directory",
        };
        current.children.set(part, child);
      }
      if (isLeaf) {
        child.entry = entry;
        child.type = entry.type;
      }
      current = child;
    });
  }

  return root;
}

export interface ArchiveTreeNode {
  children: Map<string, ArchiveTreeNode>;
  entry: ArchiveEntry | null;
  name: string;
  path: string;
  type: "file" | "directory";
}

function findEndOfCentralDirectory(view: DataView): EndOfCentralDirectory {
  if (view.byteLength < 22) {
    throw new Error("File is too small to be a ZIP archive.");
  }

  const minOffset = Math.max(0, view.byteLength - MAX_EOCD_SEARCH);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) !== EOCD_SIGNATURE) continue;

    const diskNumber = readUint16(view, offset + 4);
    const directoryDisk = readUint16(view, offset + 6);
    const recordsOnDisk = readUint16(view, offset + 8);
    const totalRecords = readUint16(view, offset + 10);
    const directorySize = readUint32(view, offset + 12);
    const directoryOffset = readUint32(view, offset + 16);
    const commentLength = readUint16(view, offset + 20);

    if (offset + 22 + commentLength > view.byteLength) {
      continue;
    }
    if (diskNumber !== 0 || directoryDisk !== 0 || recordsOnDisk !== totalRecords) {
      throw new Error("Multi-disk ZIP archives are not supported.");
    }
    if (totalRecords === 0xffff || directorySize === ZIP64_SENTINEL || directoryOffset === ZIP64_SENTINEL) {
      throw new Error("ZIP64 archives are not supported in v0.1 metadata inspection.");
    }
    if (directoryOffset + directorySize > view.byteLength) {
      throw new Error("ZIP central directory points outside the file.");
    }

    return { directoryOffset, directorySize, totalRecords };
  }

  throw new Error("Could not find a ZIP central directory.");
}

function parseCentralDirectory(bytes: Uint8Array, view: DataView, eocd: EndOfCentralDirectory): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = eocd.directoryOffset;
  const directoryEnd = eocd.directoryOffset + eocd.directorySize;

  for (let record = 0; record < eocd.totalRecords; record += 1) {
    if (offset + 46 > directoryEnd || readUint32(view, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid ZIP central directory entry at record ${record + 1}.`);
    }

    const flags = readUint16(view, offset + 8);
    const compressionMethod = readUint16(view, offset + 10);
    const modifiedTime = readUint16(view, offset + 12);
    const modifiedDate = readUint16(view, offset + 14);
    const compressedSize = readUint32(view, offset + 20);
    const size = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const nextOffset = nameEnd + extraLength + commentLength;

    if (nextOffset > directoryEnd) {
      throw new Error(`ZIP central directory entry ${record + 1} is truncated.`);
    }

    const path = decodeFileName(bytes.subarray(nameStart, nameEnd), Boolean(flags & 0x0800));
    const type = path.endsWith("/") ? "directory" : "file";
    const warnings = entryWarnings(path, size, compressedSize, Boolean(flags & 0x0001));

    entries.push({
      path,
      type,
      extension: extensionForPath(path, type),
      size,
      compressedSize,
      compressionMethod,
      compressionLabel: compressionLabel(compressionMethod),
      modifiedAt: dosDateTimeToIso(modifiedDate, modifiedTime),
      encrypted: Boolean(flags & 0x0001),
      localHeaderOffset,
      warnings,
    });

    offset = nextOffset;
  }

  if (entries.length !== eocd.totalRecords) {
    throw new Error("ZIP central directory record count mismatch.");
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function summarize(entries: ArchiveEntry[]): ArchiveSummary {
  const fileEntries = entries.filter((entry) => entry.type === "file");
  const totalUncompressedSize = fileEntries.reduce((sum, entry) => sum + entry.size, 0);
  const totalCompressedSize = fileEntries.reduce((sum, entry) => sum + entry.compressedSize, 0);
  const compressionRatio = totalCompressedSize === 0 ? 0 : totalUncompressedSize / totalCompressedSize;
  const suspiciousEntryCount = entries.filter((entry) => entry.warnings.length > 0).length;

  return {
    itemCount: entries.length,
    fileCount: fileEntries.length,
    directoryCount: entries.length - fileEntries.length,
    totalUncompressedSize,
    totalCompressedSize,
    compressionRatio,
    suspiciousEntryCount,
    renderedEntryLimit: ENTRY_RENDER_LIMIT,
  };
}

function archiveWarnings(entries: ArchiveEntry[], totalRecords: number): string[] {
  const warnings: string[] = [];
  const totalUncompressedSize = entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0);
  const totalCompressedSize = entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.compressedSize : 0), 0);
  const ratio = totalCompressedSize === 0 ? 0 : totalUncompressedSize / totalCompressedSize;
  const suspiciousEntries = entries.filter((entry) => entry.warnings.length > 0);

  if (totalRecords > MANY_FILE_THRESHOLD) {
    warnings.push(`${totalRecords} entries found; large listings are capped in the rendered tree.`);
  }
  if (totalUncompressedSize > LARGE_ARCHIVE_BYTES) {
    warnings.push(`Total uncompressed size is ${formatBytes(totalUncompressedSize)}, which may be unsafe to extract elsewhere.`);
  }
  if (ratio >= BOMB_RATIO_THRESHOLD && totalUncompressedSize > LARGE_ENTRY_BYTES) {
    warnings.push(`Compression ratio is ${ratio.toFixed(1)}:1; this archive may be a zip bomb.`);
  }
  if (suspiciousEntries.length > 0) {
    warnings.push(`${suspiciousEntries.length} entries have safety warnings.`);
  }

  return warnings;
}

function entryWarnings(path: string, size: number, compressedSize: number, encrypted: boolean): string[] {
  const warnings: string[] = [];
  const normalizedPath = path.replaceAll("\\", "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  const ratio = compressedSize === 0 ? 0 : size / compressedSize;

  if (segments.includes("..")) {
    warnings.push("Path traversal segment detected.");
  }
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")) {
    warnings.push("Absolute path detected.");
  }
  if (segments.some(isHiddenOrSystemSegment)) {
    warnings.push("Hidden or system-looking path detected.");
  }
  if (size > LARGE_ENTRY_BYTES) {
    warnings.push(`Large uncompressed entry: ${formatBytes(size)}.`);
  }
  if (ratio >= BOMB_RATIO_THRESHOLD && size > LARGE_ENTRY_BYTES) {
    warnings.push(`Suspicious compression ratio: ${ratio.toFixed(1)}:1.`);
  }
  if (encrypted) {
    warnings.push("Encrypted entry metadata detected; decryption is not supported.");
  }

  return warnings;
}

function isHiddenOrSystemSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return segment.startsWith(".") || lower === "__macosx" || lower === "thumbs.db" || lower === "desktop.ini";
}

function extensionForPath(path: string, type: "file" | "directory"): string {
  if (type === "directory") return "";
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1);
}

function compressionLabel(method: number): string {
  if (method === 0) return "stored";
  if (method === 8) return "deflated";
  if (method === 12) return "bzip2";
  if (method === 14) return "lzma";
  if (method === 93) return "zstd";
  return `method ${method}`;
}

function decodeFileName(bytes: Uint8Array, isUtf8: boolean): string {
  const decoder = new TextDecoder(isUtf8 ? "utf-8" : "utf-8", { fatal: false });
  return decoder.decode(bytes);
}

function dosDateTimeToIso(date: number, time: number): string {
  const day = date & 0x1f;
  const month = (date >> 5) & 0x0f;
  const year = ((date >> 9) & 0x7f) + 1980;
  const second = (time & 0x1f) * 2;
  const minute = (time >> 5) & 0x3f;
  const hour = (time >> 11) & 0x1f;

  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
