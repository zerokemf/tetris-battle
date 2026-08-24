# Vendored dependency

## Trystero Nostr client

- Package: `trystero@0.25.3`
- Upstream: https://github.com/dmotz/trystero
- npm tarball: https://registry.npmjs.org/trystero/-/trystero-0.25.3.tgz
- Entry: `trystero` (default Nostr signaling strategy)
- Bundle: `trystero-nostr-0.25.3.min.js`
- Format: browser ESM, ES2020, bundled with esbuild 0.28.2
- License: MIT; exact upstream license is preserved in `TRYSTERO-LICENSE.txt`
- SHA-256: `24a3d2d8658e19598e6789ad406f2d13420f08ae27cd240802f373ffa1d4e5e0`

The bundle is committed locally so production does not execute an unpinned CDN dependency. Public Nostr relays are used only for WebRTC signaling. Game snapshots, attacks, and match results travel peer-to-peer over encrypted WebRTC DataChannels after peers connect.
