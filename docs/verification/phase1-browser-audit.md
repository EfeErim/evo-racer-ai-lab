# Phase 1 Browser and Network Audit

Date: `2026-07-29`

Target:

- Frontend: `http://127.0.0.1:4173/`
- Python core: `http://127.0.0.1:8765`
- Desktop browser viewport plus a responsive check at `390 x 844`

## Interaction result

The complete shell flow passed in a real browser:

1. Welcome opened with `Training` and `Results` unavailable and no session
   started.
2. `Continue to settings` remained disabled until Easy Oval was selected.
3. Balanced training settings exposed plain-language help and kept advanced
   controls collapsed.
4. `Review experiment` sent the versioned setup to the local Python core.
5. `Start training` became enabled only after the core returned
   `valid: true`.
6. Training opened only after the explicit Start click.
7. Welcome, Track, Training Settings, and Review became disabled after Start,
   leaving the run configuration frozen.
8. The Training DOM contained zero controls whose accessible text described
   steering, throttle, brake, or vehicle driving.
9. The Results route opened from the Training workspace.

The browser console contained zero warnings or errors. The responsive Settings
layout was visually inspected at `390 x 844`; content remained readable and
controls stayed within the viewport.

## Runtime resource inventory

The browser observed these resource targets during the validated flow:

```text
http://127.0.0.1:4173/@vite/client
http://127.0.0.1:4173/src/main.ts
http://127.0.0.1:4173/node_modules/vite/dist/client/env.mjs
http://127.0.0.1:4173/src/foundation.ts
http://127.0.0.1:4173/src/app.ts
http://127.0.0.1:4173/src/styles.css
http://127.0.0.1:4173/src/onboarding.ts
http://127.0.0.1:4173/src/ipc.ts
http://127.0.0.1:8765/v1/setup/validate
```

Cache-busting query strings were omitted above because they do not change the
request target. Every observed hostname was `127.0.0.1`; the computed
non-loopback request list was empty.

## Supporting checks

```powershell
npm run check
npm run smoke:m0
git diff --check
rg -n "https?://" src python index.html package.json vite.config.ts scripts tests contracts
```

The static URL scan found only loopback runtime/test URLs and the intentional
`https://example.com` negative input in `tests/foundation.test.ts`.
