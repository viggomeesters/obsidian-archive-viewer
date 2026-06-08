# Contributing

Thanks for helping improve Archive Viewer.

## Local setup

```bash
npm install
npm run build
npx tsc --noEmit
npm test
npm run qa
```

For manual testing, copy the built runtime files into `.obsidian/plugins/archive-viewer/` in a test vault, reload the app, and open `.zip` files.

## Pull requests

- Keep the plugin read-only.
- Do not add archive extraction, decompression, restore, backup, export, delete, rename, or write-back behavior.
- Do not add runtime network APIs, subprocess APIs, dynamic code evaluation, or clipboard access.
- Preserve parser coverage for simple ZIPs, nested folders, path traversal entries, many-file archives, large-size metadata, and malformed input.
- Run build, typecheck, tests, and fixture QA before opening a PR.

## Release assets

Community releases must include:

- `main.js`
- `manifest.json`
- `styles.css`
