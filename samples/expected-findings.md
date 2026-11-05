# Expected findings for samples/target

Problems planted on purpose in `target/slugify.mjs`, so you can see what each council type finds and misses. A good council should report most of them; a single reviewer usually misses some.

| # | Where | Problem | Kind |
|---|---|---|---|
| 1 | `slugify`, line 8 | Every non-ASCII letter is dropped ("Café" becomes "caf"), but the README promises letters in any language. | correctness, docs |
| 2 | `slugify`, line 9 | `/^-\|-$/` without the `g` flag trims only one end, so "-hello-" keeps a hyphen. | correctness |
| 3 | `slugify`, line 10 | Truncating can leave a trailing hyphen. | correctness |
| 4 | `uniqueSlug`, line 17 | The first duplicate gets `-1`, but the README says `-2`. | correctness, docs |
| 5 | `uniqueSlug` | An empty or all-symbol title gives an empty slug, which is used as is. | correctness |
| 6 | `saveUsed`, line 24 | Not atomic: a crash mid-write leaves a partial list. | correctness |
| 7 | `saveUsed`, line 24 | The path `file + '.slugs'` isn't checked, so a caller passing user input can write anywhere. | security |
| 8 | `loadUsed`, line 29 | Throws when the file is missing, but the README says a missing file gives an empty list. | correctness, docs |
| 9 | `loadUsed` | An empty file gives `['']`, so the empty slug counts as used. | correctness |

The sample review log, `reviews/review-log.jsonl`, holds six made-up runs on this target of three types, for trying `compare`. Its numbers are invented to show the format, not results of real runs.
