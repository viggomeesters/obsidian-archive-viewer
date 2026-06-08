import fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-qa-fixtures.mjs",
  platform: "node",
  target: "node20",
});

const { buildArchiveTree, filterArchiveEntries, parseZipArchive } = await import(
  new URL("../.tmp-qa-fixtures.mjs", import.meta.url)
);

function fixture(name) {
  const data = fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function assertCase(label, condition) {
  if (!condition) {
    throw new Error(`QA failed: ${label}`);
  }
  console.log(`PASS ${label}`);
}

const simple = parseZipArchive(fixture("simple.zip"));
assertCase("simple summary", simple.summary.fileCount === 2 && simple.summary.suspiciousEntryCount === 0);

const nested = parseZipArchive(fixture("nested.zip"));
const nestedTree = buildArchiveTree(nested.entries);
assertCase("nested tree", Boolean(nestedTree.children.get("folder")?.children.get("deeper")?.children.get("report.json")));
assertCase("path search", filterArchiveEntries(nested.entries, "table").length === 1);
assertCase("extension search", filterArchiveEntries(nested.entries, ".json").length === 1);

const traversal = parseZipArchive(fixture("path-traversal.zip"));
assertCase("path warnings", traversal.summary.suspiciousEntryCount === 4);

const many = parseZipArchive(fixture("many-files.zip"));
assertCase("many-file warning", many.warnings.some((warning) => warning.includes("large listings")));

const large = parseZipArchive(fixture("large-metadata.zip"));
assertCase("archive bomb warning", large.warnings.some((warning) => warning.includes("zip bomb")));

let malformedFailed = false;
try {
  parseZipArchive(fixture("malformed.zip"));
} catch {
  malformedFailed = true;
}
assertCase("malformed zip state", malformedFailed);

fs.rmSync(new URL("../.tmp-qa-fixtures.mjs", import.meta.url));
