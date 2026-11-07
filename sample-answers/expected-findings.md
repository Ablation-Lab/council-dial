# Expected findings for samples/target

Problems planted on purpose in `samples/target/slugify.mjs`, so you can see what each council type finds and misses. Compare what each council type reports with this list. This file is kept outside `samples/` so it isn't copied along with the sample. That alone doesn't hide it: a council's reviewers can read any file the session's tools and permission settings allow. What keeps it from them is running the council on a copy of `samples/` in a folder that doesn't contain this file, as the README's "Try it" says. The sample's own README and comments don't say it has planted problems.

| # | Where | Problem | Kind |
|---|---|---|---|
| 1 | `slugify`, line 8 | Every non-ASCII letter is dropped ("Café" becomes "caf"), but the README promises letters in any language. | correctness, docs |
| 2 | `slugify`, line 9 | `/^-\|-$/` without the `g` flag trims only one end, so "-hello-" keeps a hyphen. | correctness |
| 3 | `slugify`, line 10 | Truncating can leave a trailing hyphen. | correctness |
| 4 | `uniqueSlug`, line 17 | The first duplicate gets `-1`, but the README says `-2`. | correctness, docs |
| 5 | `uniqueSlug` | An empty or all-symbol title gives an empty slug, which is used as is. | correctness |
| 6 | `saveUsed`, line 24 | Not atomic: a crash mid-write leaves a partial list. | correctness |
| 7 | `saveUsed`, line 24 | The path `file + '.slugs'` isn't checked, and the README says `file` is the blog name a user typed in, so a name like `../../x` writes outside the folder. | security |
| 8 | `loadUsed`, line 29 | Throws when the file is missing, but the README says a missing file gives an empty list. | correctness, docs |
| 9 | `loadUsed` | An empty file gives `['']`, so the empty slug counts as used. | correctness |

Real findings that aren't planted, such as unchecked arguments or `uniqueSlug` changing the list it's given, aren't false positives; count them separately.

The sample review log, `samples/reviews/review-log.jsonl`, holds six made-up runs on this target of three types, for trying `compare`. Its numbers are invented to show the format, not results of real runs.
