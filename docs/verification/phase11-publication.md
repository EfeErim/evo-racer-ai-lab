# Phase 11 Public Binary Publication Verification

## Scope

Phase 11 publishes the Phase 10-accepted Windows bundle without changing the
application's runtime behavior. Its gate covers coherent `v1.0.0` metadata,
checked-in release notes, an annotated source tag, a full GitHub Release, public
ZIP and checksum assets, and a fresh-download integrity check.

## Publication procedure

The release is prepared in this order:

1. Run the complete Phase 10 gate on the release source.
2. Record the generated ZIP SHA-256 and size.
3. Commit and push the release source.
4. Create and push annotated tag `v1.0.0` for that commit.
5. Create the GitHub Release as a draft, attach the ZIP and checksum, then
   publish it as the latest full release.
6. Run `npm run test:phase11` against the public tag and assets.

This file records final command output and public identifiers only after those
steps pass.
