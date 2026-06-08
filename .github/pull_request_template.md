## Summary

-

## Checks

- [ ] `npm run build`
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run qa`
- [ ] Tested `.zip`

## Security

- [ ] Plugin remains read-only
- [ ] No extraction, decompression, restore, backup, export, delete, rename, or write-back behavior added
- [ ] No runtime network, clipboard, subprocess, or dynamic evaluation APIs added
- [ ] `manifest.json.description` avoids redundant product naming
