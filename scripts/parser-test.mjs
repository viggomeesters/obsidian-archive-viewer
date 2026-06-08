import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const {
  ENTRY_RENDER_LIMIT,
  buildArchiveTree,
  filterArchiveEntries,
  parseZipArchive,
} = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));

function fixture(name) {
  const data = fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

const simple = parseZipArchive(fixture("simple.zip"));
assert.equal(simple.format, "zip");
assert.equal(simple.summary.itemCount, 2);
assert.equal(simple.summary.fileCount, 2);
assert.equal(simple.summary.suspiciousEntryCount, 0);
assert.deepEqual(simple.entries.map((entry) => entry.path).sort(), ["README.md", "notes/todo.txt"].sort());

const nested = parseZipArchive(fixture("nested.zip"));
const tree = buildArchiveTree(nested.entries);
assert.ok(tree.children.get("folder")?.children.get("deeper")?.children.get("report.json"));
assert.equal(filterArchiveEntries(nested.entries, ".json").length, 1);
assert.equal(filterArchiveEntries(nested.entries, "table").length, 1);

const traversal = parseZipArchive(fixture("path-traversal.zip"));
assert.equal(traversal.summary.suspiciousEntryCount, 4);
assert.ok(traversal.warnings.some((warning) => warning.includes("safety warnings")));
assert.ok(traversal.entries.some((entry) => entry.warnings.some((warning) => warning.includes("Path traversal"))));
assert.ok(traversal.entries.some((entry) => entry.warnings.some((warning) => warning.includes("Absolute path"))));
assert.ok(traversal.entries.some((entry) => entry.warnings.some((warning) => warning.includes("Hidden"))));

const many = parseZipArchive(fixture("many-files.zip"));
assert.equal(many.summary.itemCount, 1205);
assert.equal(many.summary.renderedEntryLimit, ENTRY_RENDER_LIMIT);
assert.ok(many.warnings.some((warning) => warning.includes("large listings")));

const large = parseZipArchive(fixture("large-metadata.zip"));
assert.equal(large.entries[0].path, "huge.bin");
assert.ok(large.entries[0].warnings.some((warning) => warning.includes("Large uncompressed")));
assert.ok(large.entries[0].warnings.some((warning) => warning.includes("compression ratio")));
assert.ok(large.warnings.some((warning) => warning.includes("zip bomb")));

assert.throws(() => parseZipArchive(fixture("malformed.zip")), /central directory|too small/i);

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("Archive parser fixture tests passed.");
