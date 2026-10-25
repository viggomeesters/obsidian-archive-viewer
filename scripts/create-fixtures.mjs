import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = new URL("../fixtures/", import.meta.url);
fs.mkdirSync(fixtureDir, { recursive: true });

createZip("simple.zip", [
  entry("README.md", "Archive Viewer fixture\n"),
  entry("notes/todo.txt", "todo\n"),
]);

createZip("nested.zip", [
  entry("folder/", "", { directory: true }),
  entry("folder/deeper/", "", { directory: true }),
  entry("folder/deeper/report.json", "{\"ok\":true}\n"),
  entry("folder/deeper/table.csv", "a,b\n1,2\n"),
]);

createZip("path-traversal.zip", [
  entry("../escape.txt", "bad\n"),
  entry("/absolute/path.txt", "bad\n"),
  entry(".hidden/config", "hidden\n"),
  entry("__MACOSX/._file", "system\n"),
]);

createZip(
  "many-files.zip",
  Array.from({ length: 1205 }, (_, index) => entry(`items/file-${String(index + 1).padStart(4, "0")}.txt`, String(index))),
);

createZip("large-metadata.zip", [
  entry("huge.bin", "", { compressedSize: 1024, uncompressedSize: 250 * 1024 * 1024 }),
]);

fs.writeFileSync(path.join(fileURLToPath(fixtureDir), "malformed.zip"), Buffer.from("not a zip archive"));

function createZip(filename, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const item of entries) {
    const name = Buffer.from(item.name);
    const data = Buffer.from(item.content);
    const compressedSize = item.compressedSize ?? data.length;
    const uncompressedSize = item.uncompressedSize ?? data.length;
    const method = item.method ?? 0;
    const localHeaderOffset = offset;
    const local = Buffer.alloc(30 + name.length + data.length);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x5b68, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(Math.min(compressedSize, 0xffffffff), 18);
    local.writeUInt32LE(Math.min(uncompressedSize, 0xffffffff), 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    localParts.push(local);
    offset += local.length;

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5b68, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(Math.min(compressedSize, 0xffffffff), 20);
    central.writeUInt32LE(Math.min(uncompressedSize, 0xffffffff), 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(item.directory ? 0x10 : 0, 38);
    central.writeUInt32LE(localHeaderOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(path.join(fileURLToPath(fixtureDir), filename), Buffer.concat([...localParts, centralDirectory, eocd]));
}

function entry(name, content, options = {}) {
  return { content, name, ...options };
}
