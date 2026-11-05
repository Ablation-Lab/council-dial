# Council Dial

Council Dial runs a review council of Claude subagents the way you choose, and keeps a log of which way it ran and what it found. You set the dials: specialised or generalist reviewers; a judge, a pooled list or a consensus to combine their reports; an optional debate round; reviewers in parallel or one after another; and an optional single reviewer working alone as a baseline. Over time the log shows which kinds of council find more real problems, and which fixes held up, for the time and agents they take.

It was made for research on review councils, where the question isn't only "what did the review find?" but "which kind of review finds the most for the effort?". It adds one skill, `council-dial` (in Claude Code: `/council-dial:council-dial`). It's an independent project, not made or endorsed by Anthropic.

## Install

In Claude Code 2.1.275 or later:

```
/plugin install council-dial --marketplace Ablation-Lab/council-dial
```

On older versions, add the marketplace first with `/plugin marketplace add Ablation-Lab/council-dial`, then `/plugin install council-dial@council-dial`. To use the skill without the plugin, copy the `skills/council-dial` folder into `~/.claude/skills/`. It needs Node.js 18 or later.

## How it works

1. **Dial in the type.** Say what to review and how, for example "run a specialised council with a judge and a debate round on this branch". If you don't say how, Claude suggests Standard (three specialised reviewers and a judge), Quick (three generalists, pooled) or Thorough (Standard plus debate and a baseline), and says how many subagents each uses.
2. **Plan.** A local script turns your choices into the exact briefs for each reviewer, the debate round and the judge, and logs the run's type straight away.
3. **Run.** Claude starts the subagents step by step: reviewers in parallel (or one at a time, each seeing the earlier reports), then the debate round, then the judge, or Claude merges the reports itself for pooled and consensus. The baseline reviewer works alone and never sees the council's reports.
4. **Report.** You get the council's findings, most serious first, with fixes, and what the baseline found that the council didn't (and the reverse).
5. **Log.** Claude records the counts: findings per reviewer, after combining, confirmed, overstated and dismissed, by severity, the baseline's, and the time taken. After fixes are rechecked, it adds how many fixes failed the recheck and how many caused new problems.
6. **Compare.** Ask "how do the council types compare?" and Claude shows a table by type: findings per run, the share confirmed and dismissed, minutes per run, fixes that failed recheck, regressions, and council against baseline.

The types:

| Dial | Choices |
|---|---|
| Reviewers | **specialised** (each covers one area: by default correctness, security and privacy, docs and policy accuracy; or areas you name) or **generalist** (all review everything; 1 to 9 of them) |
| Combine | **judged** (a fresh judge checks each finding and merges duplicates), **pooled** (every finding, duplicates merged, nothing verified) or **consensus** (only findings most reviewers raised; the rest listed as minority findings) |
| Extras | **debate** (one round where each reviewer answers the others' findings), **sequential** (reviewers go one at a time and look for what the earlier ones missed), **baseline** (one extra reviewer alone, for comparison) |

## Example prompts

```
Run a standard review council on the diff of this branch
Review src/parser.mjs with three generalist reviewers, pooled, plus a single-reviewer baseline
Run a thorough council on samples/target/slugify.mjs
Log that the recheck for run 20261105-3fa9 found 2 of the 7 fixes didn't hold
How do the council types compare in my review log?
```

## Try it with the sample (for reviewers)

There's no account to set up: Council Dial runs in Claude Code and keeps its log in your project. The repository's [samples/](https://github.com/Ablation-Lab/council-dial/tree/main/samples) folder has:

- `target/slugify.mjs` and its `README.md`, a small made-up module with nine problems planted on purpose, listed in [samples/expected-findings.md](https://github.com/Ablation-Lab/council-dial/blob/main/samples/expected-findings.md);
- `reviews/review-log.jsonl`, a made-up log of six earlier runs of three types (its numbers are invented to show the format).

To try it:

1. Copy the contents of `samples/` into an empty folder and open that folder in Claude Code.
2. Say: `How do the council types compare in my review log?` You should see a table with three types: `specialised-3/judged` (3 runs), `generalist-3/pooled` (2 runs) and `specialised-3/judged+debate` (1 run), with the judged councils confirming a larger share of their findings than the pooled ones.
3. Say: `Run a quick review council on target/slugify.mjs`. Claude starts three generalist reviewers (three subagents), pools their reports, and reports the findings; compare them with `expected-findings.md`. The run is added to `reviews/review-log.md`.

**Developer note.** Council Dial has not been checked with Seaready yet. (This note is updated once it has.)

## What it runs, reads and writes

- **What it runs:** `node <skill folder>/scripts/council.mjs <command>`, with the target description or results passed on standard input. Claude Code asks before each run unless your permission settings already allow it. The script starts no other programs.
- **Subagents:** Claude starts the reviewer, debate and judge subagents with Claude Code's Agent tool, as the plan says. They read the material you asked to have reviewed. Each one uses tokens from your plan like any other Claude work; a Thorough run uses eight.
- **What the script reads:** only the review log.
- **What the script writes:** only the review log, in `reviews/` in your project (or a folder inside the project you choose): `review-log.jsonl`, an append-only record of each run's type, target description, counts and recheck results, and `review-log.md`, a readable summary rebuilt from it after every write. It won't write through a link or outside the project.
- **Network:** the script makes none. The subagents are Claude, so the material they review reaches Anthropic the way anything in your conversation does.

## Where it works

- **Claude Code**, with Node.js 18 or later. Tested on Windows 11; the script uses only Node's standard library, so macOS and Linux should work but weren't tested.
- **Cowork and Claude chat (claude.ai):** not tested.

## Privacy

Council Dial has no server, account or telemetry and sends nothing anywhere itself. The review log in your project holds, for each run: the date, the type, a one-line description of what was reviewed, the counts, and a one-line note. It doesn't hold the reviewers' reports or the material reviewed. You can read, edit or delete it; if your project is public, the log is committed with it unless you add `reviews/` to `.gitignore`. What the subagents review reaches Anthropic the way anything in your conversation does.

## How it's built

- **Markdown with YAML front matter.** The skill is `SKILL.md`: instructions for Claude in Markdown, with a short YAML block at the top (name, description, licence). They say how to choose a type, run each step with subagents, and fill in the results.
- **JavaScript (Node.js ES module).** `scripts/council.mjs` is a plain JavaScript file Node runs directly, with no packages. It builds the plan and its briefs, checks and records results, and builds the comparison.
- **The briefs live in the script.** Every run of a type gets the same wording, with a version number in the log, so differences between runs come from the type, not from how the briefs were phrased that day.
- **JSON Lines for the log.** `review-log.jsonl` has one record per line (JSON, a small text format of names and values) and is only ever appended to, so no earlier result is overwritten; the Markdown summary is rebuilt from it.

## Design decisions

- **The type is logged before the run.** A run that fails halfway still shows up, so the log doesn't quietly favour the types that finished.
- **Same briefs every time.** Comparisons mean something only if the reviewers were asked the same way.
- **A baseline is optional but cheap.** One extra reviewer working alone is the simplest test of whether a council is worth its cost.
- **Confirmed means checked.** Without a judge, Claude checks each finding before counting it as confirmed, or records the run as unverified, so pooled and consensus runs aren't flattered.
- **Fixes are followed up.** Fixes that fail their recheck, and new problems they cause, are part of a council's cost, so the log keeps them.

## How it compares

(Filled in after the name and overlap search.)

## Limits

- The counts come from Claude's reading of the reports, and "confirmed" is only as good as the judge or Claude's own check.
- Comparisons need many runs on similar material; a handful of runs says little, and Claude says so.
- The time recorded is wall time in the session, which depends on load as well as the type.
- Debate is one round, and sequential runs take longer by design.
- Subagents can fail or stop early; the run is logged with what came back.

## Troubleshooting

- **"no planned run":** the run id is wrong, or the log is in another folder; run `list`, or pass the same `--log-dir` as when it was planned.
- **"findingsPerReviewer has N numbers":** give one number per reviewer in the plan's order.
- **"node" isn't found:** install Node.js 18 or later.

## Support

Report problems at https://github.com/Ablation-Lab/council-dial/issues.

## Licence

MIT. See the LICENSE file in the repository.

Research by Ablation Lab.
