# Community Submission Checklist

Current release target: `0.1.0`

This checklist tracks the repository state needed before submitting the plugin through the Obsidian Community plugin review flow.

## Repository

- [x] Public GitHub repository exists.
- [x] `README.md` describes what the plugin does and how to use it.
- [x] `LICENSE` exists.
- [x] `manifest.json` exists at repository root.
- [x] `manifest.json.id` is unique and does not contain `obsidian`.
- [x] `manifest.json.id` contains only lowercase letters and hyphens and does not end with `plugin`.
- [x] `manifest.json.name` is short, English, Basic Latin, and does not include `Obsidian`.
- [x] `manifest.json.description` does not include the redundant product name.
- [x] `manifest.json.version` uses `x.y.z`.
- [x] `versions.json` maps plugin version to minimum app version.
- [x] Runtime plugin code avoids Node.js/Electron-only APIs, so `isDesktopOnly` remains `false`.

## Release

- [x] `npm run build` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm test` passes.
- [x] `npm run qa` passes.
- [x] GitHub release tag equals `manifest.json.version`.
- [x] Release assets include `main.js`.
- [x] Release assets include `manifest.json`.
- [x] Release assets include `styles.css`.

## Artifact attestations

The repository includes a release workflow that attests `main.js`, `manifest.json`, and `styles.css` with `actions/attest-build-provenance`.

## Directory Submission

- [ ] Open a PR against `obsidianmd/obsidian-releases`.
- [ ] Add the entry from `docs/community-directory.md` to `community-plugins.json`.
- [ ] Title the PR `Add plugin: Archive Viewer`.
- [ ] Fill the Community Plugin PR template and mark completed checkboxes.
- [ ] Address automated review feedback.

Official references:

- https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- https://docs.obsidian.md/Reference/Manifest
- https://docs.obsidian.md/Reference/Versions
- https://github.com/obsidianmd/obsidian-releases
