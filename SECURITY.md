# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction requires archive content, reduce it to a minimal synthetic example first.

## Security posture

Archive Viewer is inspect-only. It reads `.zip` files through the vault API and parses central-directory metadata. It does not extract archive contents, does not open contained files, does not write archive files back, does not use runtime network APIs, does not read or write the system clipboard, and does not start subprocesses.

The v0.1 parser intentionally has no archive parser dependency. It does not implement decompression and cannot restore, export, rename, delete, or extract archive entries.
