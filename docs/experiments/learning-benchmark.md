# Learning benchmark

`npm run test:learning` reruns `30` cases through `RunSession` and fails if any value
differs from [`data/learning-benchmark-v2.json`](data/learning-benchmark-v2.json):
`3` presets × `2` algorithms × seeds `42`, `19`, `73`, `211`, `1009`.

- **Evolved:** `16` cars × `10` generations × `30 s`.
- **Same-budget control:** `160` cars × `1` generation × `30 s`, no selection, crossover
  or mutation.
- **Pure Pursuit reference:** the best of five drives on the champion's own car and time
  limit (the fixed-speed controller and `SetupAwarePurePursuit` at caution `1.5`, `1.0`,
  `0.6`, `0.35`). Five tries against the champion's one favours the reference.

These seeds informed the [physics v2](physics-v2.md) work, so this is development
evidence; the held-out results are on that page.

## Physics v2 (current)

Each count is out of `5` seeds.

| Track             | Algorithm | Improved on gen 1 | Beat control | Beat Pure Pursuit | Laps: evolved | Laps: control | Laps: Pure Pursuit | Median fitness: evolved | Control | Pure Pursuit |
| ----------------- | --------- | ----------------: | -----------: | ----------------: | ------------: | ------------: | -----------------: | ----------------------: | ------: | -----------: |
| Easy Oval         | Fixed GA  |                 5 |            4 |                 0 |             2 |             0 |                  3 |                     923 |     617 |         2277 |
| Easy Oval         | NEAT      |                 5 |            5 |                 4 |             4 |             1 |                  5 |                    2278 |     424 |         2266 |
| Technical Circuit | Fixed GA  |                 5 |            4 |                 1 |             3 |             0 |                  2 |                    2231 |     570 |          746 |
| Technical Circuit | NEAT      |                 5 |            4 |                 5 |             5 |             1 |                  3 |                    2271 |     634 |         2220 |
| Chicane Challenge | Fixed GA  |                 5 |            4 |                 0 |             0 |             0 |                  0 |                     319 |     210 |          490 |
| Chicane Challenge | NEAT      |                 5 |            4 |                 2 |             0 |             0 |                  0 |                     397 |     220 |          472 |

Evolution beat the control in `25 / 30` cases (Fixed GA `12 / 15`, NEAT `13 / 15`).
Evolved champions finished `14 / 30` laps, the control `2 / 30`. Pure Pursuit never
crashed. Nothing finished Chicane Challenge in this budget.

## Physics v1 (historical)

[`data/learning-benchmark.json`](data/learning-benchmark.json), recorded on
`2026-11-05`. The current code no longer runs physics v1 (removed in `34ee670`); check
out `3410234` and run `npm run test:learning` to reproduce it.

| Track             | Algorithm | Beat control | Beat Pure Pursuit | Laps: evolved | Laps: control | Laps: Pure Pursuit | Median fitness: evolved | Control | Pure Pursuit |
| ----------------- | --------- | -----------: | ----------------: | ------------: | ------------: | -----------------: | ----------------------: | ------: | -----------: |
| Easy Oval         | Fixed GA  |            4 |                 0 |             0 |             0 |                  4 |                     656 |     504 |         2256 |
| Easy Oval         | NEAT      |            5 |                 2 |             4 |             0 |                  5 |                    2259 |     442 |         2252 |
| Technical Circuit | Fixed GA  |            4 |                 2 |             0 |             0 |                  0 |                     881 |     471 |         1161 |
| Technical Circuit | NEAT      |            4 |                 5 |             5 |             1 |                  2 |                    2220 |     821 |          703 |
| Chicane Challenge | Fixed GA  |            3 |                 0 |             0 |             0 |                  0 |                     252 |     229 |          464 |
| Chicane Challenge | NEAT      |            4 |                 2 |             0 |             0 |                  0 |                     385 |     195 |          453 |

The five-try reference was added in this round: with a single fixed-speed Pure Pursuit,
the reference crashed on `6 / 12` real NEAT champion setups at `30 s`, so beating it
said little.

## Limits

- Five seeds per cell, no significance test; the counts do not rank the algorithms.
- One budget. The `16 × 10 × 30 s` budget was chosen on Easy Oval with seeds including
  `42`, `19`, `73` and `211`, so Easy Oval is not a held-out result.
