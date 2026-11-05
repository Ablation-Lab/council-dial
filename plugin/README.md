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

1. **Dial in the type.** Say what to review and how, for example "run a specialised council with a judge and a debate round on this branch". If you don't say how, Claude suggests Standard (three specialised reviewers and a judge), Quick (three generalists, pooled) or Thorough (Standard plus debate and a baseline). Either way it tells you how many subagents the run uses and waits for your yes before it starts.
2. **Plan.** A local script turns your choices into the exact briefs for each reviewer, the debate round and the judge, and logs the run's type straight away.
3. **Run.** Claude starts the subagents step by step: reviewers in parallel (or one at a time, each seeing the earlier reports), then the debate round, then the judge, or Claude merges the reports itself for pooled and consensus. The baseline reviewer works alone and never sees the council's reports.
4. **Report.** You get the council's findings, most serious first, with fixes, and what the baseline found that the council didn't (and the reverse).
5. **Log.** Claude records the counts: findings per reviewer, after combining, confirmed, overstated and dismissed, by severity, the baseline's, and the time taken. After fixes are rechecked, it adds how many fixes failed the recheck and how many caused new problems.
6. **Compare.** Ask "how do the council types compare?" and Claude shows a table by type: findings per run, the share confirmed and dismissed, minutes per run, fixes that failed recheck, regressions, and council against baseline.

The types:

| Dial | Choices |
|---|---|
| Reviewers | **specialised** (each covers one area: by default correctness, security and privacy, docs and policy accuracy; or areas you name) or **generalist** (all review everything; 1 to 9 of them) |
| Combine | **judged** (a fresh judge merges duplicates and checks each finding), **pooled** (every finding, duplicates merged, nothing verified) or **consensus** (only findings a majority of the reviewers raised, such as 2 of 3 or 3 of 4; the rest listed as minority findings) |
| Extras | **debate** (one round where each reviewer answers the others' findings), **sequential** (reviewers go one at a time and look for what the earlier ones missed), **baseline** (one extra reviewer alone, for comparison) |

## Example prompts

```
Run a standard review council on the diff of this branch
Review src/parser.mjs with three generalist reviewers, pooled, plus a single-reviewer baseline
Run a thorough council on target/slugify.mjs
Log that the recheck for my last council run found 2 of the 7 fixes didn't hold
How do the council types compare in my review log?
```

## Try it with the sample (for reviewers)

There's no account to set up: Council Dial runs in Claude Code and keeps its log in your project. The repository's [samples/](https://github.com/Ablation-Lab/council-dial/tree/main/samples) folder has:

- `target/slugify.mjs` and its `README.md`, a small made-up module with nine problems planted on purpose, listed in [samples/expected-findings.md](https://github.com/Ablation-Lab/council-dial/blob/main/samples/expected-findings.md);
- `reviews/review-log.jsonl`, a made-up log of six earlier runs of three types (its numbers are invented to show the format).

To try it:

1. Copy `samples/target/` and `samples/reviews/` (not `expected-findings.md`, which would give the answers away) into an empty folder and open that folder in Claude Code.
2. Say: `How do the council types compare in my review log?` You should see a table with three types: `specialised-3/judged` (3 runs), `generalist-3/pooled` (2 runs) and `specialised-3/judged+debate` (1 run), with the judged councils confirming a larger share of their findings than the pooled ones (in this made-up data; it isn't a real result).
3. Say: `Run a quick review council on target/slugify.mjs`. Claude says it will start three generalist reviewers (three subagents) and asks first; then it pools their reports and gives the findings. Compare them with `expected-findings.md` in the repository. The run is added to `reviews/review-log.md`.

**Developer note.** Seaready, our plugin submission checker, was built first. Council Dial was then checked with it before submission: its local checks found no failures after one false alarm was recorded (a pattern for Windows short names that looked like a home-folder path; it is listed with its reason in .plugin-check-allow.json and shown as allowed in the report), and one warning because the repository had no GitHub remote yet. Its online name and overlap search found no plugin with the same name and several review-council plugins and skills, now described under How it compares. Council Dial also went through a review council (three reviewers and a judge) and two rounds of fixes, each rechecked by a fresh reviewer; the minor issues left after that are listed under Limits. It's our own pre-check, not an Anthropic one; the directory's validation and Anthropic's reviewers make the actual decision.

## What it runs, reads and writes

- **What it runs:** `node <skill folder>/scripts/council.mjs <command>`, with the target description or results passed on standard input. Claude Code asks before each run unless your permission settings already allow it. The script starts no other programs.
- **Subagents:** Claude starts the reviewer, debate, baseline and judge subagents with Claude Code's Agent tool, as the plan says. They are ordinary subagents: they can use the tools this session allows, under your permission settings, so Claude Code still asks before anything that needs your OK. Their briefs tell them to review only, to write scratch files only in a temporary folder, and not to run the material's code unless you allowed it. Each one uses tokens from your plan like any other Claude work: a run takes from 3 agents (Quick) to 8 (Thorough) and up to 20 for the largest custom council; every reviewer reads the material, and debate agents and the judge also read every report, so a council costs several times one review.
- **What the script reads:** only the review log.
- **What the script writes:** only the review log, in `reviews/` in your project (or a folder inside the project you choose): `review-log.jsonl`, an append-only record of each run's type, target description, counts and recheck results, and `review-log.md`, a readable summary rebuilt from it after every write. It won't write through a link or outside the project.
- **Network:** the script makes none. The subagents are Claude, so the material they review reaches Anthropic the way anything in your conversation does.

## Where it works

- **Claude Code**, with Node.js 18 or later and subagents. Tested on Windows 11; the script uses only Node's standard library, so macOS and Linux should work but weren't tested.
- **Claude chat (claude.ai):** not supported (it needs subagents and Node).
- **Cowork:** not tested.

## Privacy

Council Dial has no server, account or telemetry and sends nothing anywhere itself. The review log in your project holds, for each run: the date and time it was planned, logged and rechecked; the type (including any custom role names) and brief version; a description of what was reviewed (up to 600 characters); the counts (findings per reviewer, combined, confirmed, overstated, dismissed, by severity, the baseline's, fixes and regressions after rechecks); the time taken; and short notes. It doesn't hold the reviewers' reports or the material reviewed. You can read, edit or delete it. If your project is public, the log is committed with it unless you add `reviews/` to `.gitignore`; do that for security reviews, because counts of HIGH findings and failed fixes per target hint at where problems were. What the subagents review reaches Anthropic the way anything in your conversation does.

## How it's built

- **Markdown with YAML front matter.** The skill is `SKILL.md`: instructions for Claude in Markdown, with a short YAML block at the top (name, description, licence). They say how to choose a type, run each step with subagents, and fill in the results.
- **JavaScript (Node.js ES module).** `scripts/council.mjs` is a plain JavaScript file Node runs directly, with no packages. It builds the plan and its briefs, checks and records results, and builds the comparison.
- **The briefs live in the script.** Every run of a type gets the same wording, with a version number in the log, so differences between runs come from the type, not from how the briefs were phrased that day.
- **JSON Lines for the log.** `review-log.jsonl` has one record per line (JSON, a small text format of names and values) and is only ever appended to, so no earlier result is overwritten; the Markdown summary is rebuilt from it.

## Design decisions

- **The type is logged before the run.** A run that fails halfway still shows up (the comparison counts planned runs that were never logged), so the log doesn't quietly favour the types that finished.
- **Same briefs every time.** Comparisons mean something only if the reviewers were asked the same way.
- **A baseline is optional but cheap.** One extra reviewer working alone is the simplest test of whether a council is worth its cost.
- **Confirmed means checked.** Without a judge, Claude checks each finding before counting it as confirmed, or records the run as unverified, and unverified runs are left out of the confirmed and dismissed shares, so pooled and consensus runs are neither flattered nor dragged down.
- **Fixes are followed up.** Fixes that fail their recheck, and new problems they cause, are part of a council's cost, so the log keeps them.

## How it compares

- **Anthropic's code-review plugin and `/code-review`** (including ultra) review a pull request with several agents in a fixed setup. Council Dial is for comparing council setups: you choose the type, and every run's type and results go in a log you can compare.
- **Fixed review councils** such as claude-code-review-council (yeameen), agent-review-panel (wan-huiyan), review-council (deployhq), pantheon (the-cybersapien) and council-review skills run one council design, some with other vendors' models. Council Dial runs only Claude subagents, lets you choose among specialised or generalist reviewers, judged, pooled or consensus combining, debate, sequential and baseline, and keeps the briefs fixed so runs compare fairly.
- **reviewteam** (jcr211) keeps a findings ledger and calibrates each critic. Council Dial compares whole council types, including whether their fixes held up on recheck.
- **Debate and decision councils** such as claude-council (amgadelgamal), council (tsenart), debate (strml), claude-consensus, configurable-council (shinytoyrobots), war-room and advisory councils weigh opinions or decisions. Council Dial is for reviews, with findings checked and counted.

## Limits

- The counts come from Claude's reading of the reports, and "confirmed" is only as good as the judge or Claude's own check.
- Comparisons need many runs on similar material; a handful of runs says little, and Claude says so.
- The time recorded is wall time in the session, which depends on load as well as the type.
- Debate is one round, and sequential runs take longer by design.
- Subagents can fail or stop early; the run is logged with what came back.
- If two runs write the log at the same moment, `review-log.md` can miss the other's row until the next write (the `.jsonl` log keeps both).
- A run with a baseline is grouped with runs of the same council type without one; the baseline doesn't change the council. Brief versions aren't separated in the comparison yet (there is only version 1).
- Recheck results add up per run and can't be corrected, only added to; `newFindings` is recorded but not compared.
- A review log that came with a project you cloned is read like your own; lines that don't pass the script's checks are skipped and counted. Rows written by hand or by an older version are read with their values checked but not whether they add up, so impossible counts in such a row can skew the shares.
- A run logged with `verified` left out, whose confirmed, overstated and dismissed counts are filled in but don't add up to the combined findings, still counts as verified.
- Custom roles are compared without regard to their order or capitals, including for sequential councils, where the order of reviewers does change the run; role names appear in lower case in the type.
- Email addresses and some bare web addresses in a target may still show as links in `review-log.md` on GitHub.

## Troubleshooting

- **"no planned run":** the run id is wrong, or the log is in another folder; run `list`, or pass the same `--log-dir` as when it was planned.
- **"findingsPerReviewer has N numbers":** give one number per reviewer in the plan's order.
- **"node" isn't found:** install Node.js 18 or later.

## Support

Report problems at https://github.com/Ablation-Lab/council-dial/issues.

## Licence

MIT. See the LICENSE file in the repository.

Research by Ablation Lab.
