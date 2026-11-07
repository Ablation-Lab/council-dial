# Council Dial

When you want code, docs or a plan reviewed, Council Dial has Claude run a review council of subagents set up the way you choose: specialised or generalist reviewers, a judge (with an appeal of the findings it throws out), a pooled list or a majority consensus to combine their findings, and optional debate, sequential and single-reviewer baseline runs. Claude tells you how many subagents a run will use and waits for your yes. Each run's type and results go into a log in your project, so you can compare council types over time.

It was made for research on review councils, where the question isn't only "what did the review find?" but "which kind of review finds the most for the effort?". It adds one skill, `council-dial` (in Claude Code: `/council-dial:council-dial`). It's an independent project, not made or endorsed by Anthropic.

## Install

In Claude Code 2.1.275 or later, run this in a session:

```
/plugin install council-dial --marketplace Ablation-Lab/council-dial
```

It opens the plugin's page in `/plugin`, where you choose a scope and install it. From a shell, `claude plugin install council-dial --marketplace Ablation-Lab/council-dial` does the same in Claude Code 2.1.292 or later. On older versions, add the marketplace first with `/plugin marketplace add Ablation-Lab/council-dial`, then `/plugin install council-dial@council-dial`. To use the skill without the plugin, copy the `skills/council-dial` folder into `~/.claude/skills/`. It needs Node.js 18 or later.

## How it works

1. **Dial in the type.** Say what to review and how, for example "run a specialised council with a judge and a debate round on this branch". If you don't say how, Claude suggests Standard (three specialised reviewers, a judge and an appeal), Quick (three generalists, pooled) or Thorough (Standard plus debate and a baseline). Either way it tells you how many subagents the run uses and waits for your yes before it starts.
2. **Plan.** A local script turns your choices into the exact briefs for each reviewer, the debate round, the judge and the appeal, and logs the run's type straight away.
3. **Run.** Claude starts the subagents step by step: reviewers in parallel (or one at a time, each seeing the earlier reports), then the debate round, then the judge, or Claude merges the reports itself for pooled and consensus. The baseline reviewer works alone and never sees the council's reports. If the judge throws any finding out, an appeal agent then checks those findings, seeing only them and the judge's reasons.
4. **Report.** You get the council's findings, most serious first, with fixes, and what the baseline found that the council didn't (and the reverse). Each finding the appeal thinks was wrongly thrown out is listed with the judge's view and the appeal's, and you make the call.
5. **Log.** Claude records the counts: findings per reviewer, after combining, confirmed, overstated and dismissed, by severity, the baseline's, each appealed finding and your call on it, and the time taken. It also records the main session's model, the model each subagent was asked to use, and the tokens, tool uses and time Claude Code reported for each subagent (see [Models, tokens and time](#models-tokens-and-time)), and saves every agent's full report in a folder named by the run id, so you can see exactly what each found and what the judge threw out and why. Ask for a run's setup and Claude gives its type, roles, brief version, models and Council Dial version, and the command that reruns it. After fixes are rechecked, it adds how many fixes failed the recheck and how many caused new problems.
6. **Compare.** Ask "how do the council types compare?" and Claude shows a table by type: findings per run, the share confirmed and dismissed, minutes and tokens per run (and the appeal agent's tokens), fixes that failed recheck, regressions, council against baseline, and how many dismissals the appeal flagged and you reinstated.

The types:

| Dial | Choices |
|---|---|
| Reviewers | **specialised** (each covers one area: by default correctness, security and privacy, docs and policy accuracy; or areas you name) or **generalist** (all review everything; 1 to 9 of them) |
| Combine | **judged** (a fresh judge merges duplicates and checks each finding), **pooled** (every finding, duplicates merged, nothing verified) or **consensus** (only findings a majority of the reviewers raised, such as 2 of 3 or 3 of 4; the rest listed as minority findings) |
| Appeal | on by default for **judged** councils: one fresh agent sees only the findings the judge marked NOT REAL, with the judge's reasons (not the reviewers' reports or how the target was described), and flags any it thinks were wrongly thrown out. It doesn't overrule the judge; you decide. Say "without the appeal" to turn it off. The type's name ends in `+appeal`, so runs with and without it are compared separately |
| Extras | **debate** (one round where each reviewer answers the others' findings), **sequential** (reviewers go one at a time and look for what the earlier ones missed), **baseline** (one extra reviewer alone, for comparison) |
| Model | by default the subagents use your session's model; or name one, Sonnet, Opus, Haiku or Fable, for all of them. The type's name ends in `@` and that model (such as `@sonnet` or `@claude-opus-5-5`), so models are compared separately |

## Example prompts

```
Run a standard review council on the diff of this branch
Review src/parser.mjs with three generalist reviewers, pooled, plus a single-reviewer baseline
Run a thorough council on target/slugify.mjs
Run a standard council on src/auth/ without the appeal step
Run a quick council on src/parser.mjs with every reviewer on Sonnet
Log that the recheck for my last council run found 2 of the 7 fixes didn't hold
How do the council types compare in my review log?
What setup did council run 20261107-2f23 use, and how do I rerun it?
```

## Try it with the sample (for reviewers)

There's no account to set up: Council Dial runs in Claude Code and keeps its log in your project. The repository's [samples/](https://github.com/Ablation-Lab/council-dial/tree/main/samples) folder has:

- `target/slugify.mjs` and its `README.md`, a small made-up module with nine problems planted on purpose. Neither file says so, so the council isn't told what to look for. The answers are in [sample-answers/expected-findings.md](https://github.com/Ablation-Lab/council-dial/blob/main/sample-answers/expected-findings.md), outside `samples/`, so a council pointed at the samples can't read them;
- `reviews/review-log.jsonl`, a made-up log of six earlier runs of three types (its numbers are invented to show the format).

To try it:

1. Copy what's in `samples/` (the `target/` and `reviews/` folders) into an empty folder and open that folder in Claude Code. Leave `sample-answers/` behind.
2. Say: `How do the council types compare in my review log?` You should see a table with three types: `specialised-3/judged` (3 runs), `generalist-3/pooled` (2 runs) and `specialised-3/judged+debate` (1 run), with the judged councils confirming a larger share of their findings than the pooled ones (in this made-up data; it isn't a real result). The same table is written to `reviews/review-log.md`.
3. Say: `Run a quick review council on target/slugify.mjs`. Claude says it will start three generalist reviewers (three subagents) and asks first; then it pools their reports and gives the findings. Compare them with `sample-answers/expected-findings.md` in the repository. The run is added to `reviews/review-log.md`.

Our first two real runs on the sample, scored against the expected findings with each agent's tokens and time, are written up in [results/20261107-council-runs.md](https://github.com/Ablation-Lab/council-dial/blob/main/results/20261107-council-runs.md).

**Developer note.** Seaready, our plugin submission checker, was built first. Council Dial was then checked with it before submission: its local checks found no failures and one warning, because the repository had no GitHub remote yet. (An earlier run raised a false alarm on a pattern for Windows short names, which it read as a home-folder path; that was fixed in Seaready.) Its online name and overlap search found no plugin with the same name and several review-council plugins and skills, now described under How it compares. Council Dial also went through a review council (three reviewers and a judge) and two rounds of fixes, each rechecked by a fresh reviewer; the minor issues left after that are listed under Limits. That review ran before the review log existed, so it isn't in a log; its findings and fixes are recorded in the commit messages of commits 2c85578 (round 1, from the council), 8cdc04e (round 2, from recheck 1) and fdcb61d (after recheck 2). It's our own pre-check, not an Anthropic one; the directory's validation and Anthropic's reviewers make the actual decision.

## What it runs, reads and writes

- **What it runs:** `node <skill folder>/scripts/council.mjs <command>`, with the target description or results passed on standard input. Claude Code asks before each run unless your permission settings already allow it. The script starts no other programs.
- **Subagents:** Claude starts the reviewer, debate, baseline, judge and appeal subagents with Claude Code's Agent tool, as the plan says. They are ordinary subagents: they can use the tools this session allows, under your permission settings, so Claude Code still asks before anything that needs your OK. Their briefs tell them to review only, to write scratch files only in a temporary folder, and not to run the material's code unless you allowed it. Each one uses tokens from your plan like any other Claude work: a run takes from 3 agents (Quick) to 9 (Thorough) and up to 21 for the largest custom council, counting the appeal agent, which runs only if the judge throws a finding out; every reviewer reads the material, and debate agents and the judge also read every report, so a council costs several times one review.
- **What the script reads:** only the review log, and two environment variables, `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, because they can change the model the subagents run on.
- **What the script writes:** only the review log, in `reviews/` in your project (or a folder inside the project you choose): `review-log.jsonl`, an append-only record of each run's type, target description, counts and recheck results, `review-log.md`, a readable summary rebuilt from it after every write, and each run's saved reports, one Markdown file per agent in a folder named by the run id (`reviews/20261107-2f23/judge.md`, for example). It won't write through a link or outside the project.
- **Network:** the script makes none. The subagents are Claude, so the material they review reaches Anthropic the way anything in your conversation does.

## Models, tokens and time

What the log records, and what Claude Code doesn't make available:

- **Main session's model:** recorded as the model id Claude gives the script (Claude reads it from its own instructions). Claude Code doesn't hand it to the script any other way.
- **Subagents' model:** recorded as asked for. Claude passes your choice as the Agent tool's `model` on every call (the tool takes only the aliases `sonnet`, `opus`, `haiku` and `fable`), or passes none, and the subagents inherit the session's model. The script also records `CLAUDE_CODE_SUBAGENT_MODEL` (a default below your choice) and warns when `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` overrides it. **Not available:** the model a subagent actually ran on. Claude Code reports it to hooks and shows it in `/tasks`, but not to the main session, so the log can't confirm it, and an alias isn't resolved to a version.
- **Tokens, tool uses and time per subagent:** recorded from what Claude Code reports when each background subagent finishes (its total tokens, tool uses and duration), including the appeal agent. **Not available:** the split into input, output and cached tokens, and cost. That completion notice isn't a documented format, it doesn't say whether cached tokens are included, and it can change; if a figure isn't reported, it's logged as missing, never estimated. For exact token and cost figures per subagent, use Claude Code's OpenTelemetry metrics, filtered to subagent requests.
- **Comparing:** tokens per run count only runs where every agent's tokens were reported. Minutes per run can mix two measures: wall time, from Claude's start time to the last agent's finish, and, where Claude didn't note that finish, the agents' critical path (the slowest reviewer plus each later step), which leaves out Claude's own time between steps. Each run's notes say which it is.

## Where it works

- **Claude Code**, with Node.js 18 or later and subagents. Tested on Windows 11; the script uses only Node's standard library, so macOS and Linux should work but weren't tested.
- **Claude chat (claude.ai):** not supported (it needs subagents and Node).
- **Cowork:** not tested.

## Privacy

Council Dial has no server, account or telemetry and sends nothing anywhere itself. The review log in your project holds, for each run: the date and time it was planned, logged and rechecked; the type (including any custom role names) and brief version; a description of what was reviewed (up to 600 characters); the counts (findings per reviewer, combined, confirmed, overstated, dismissed, by severity, the baseline's, fixes and regressions after rechecks); for each finding the appeal flagged, a short title (up to 120 characters, in `review-log.jsonl` only), the appeal's view and your call; the main session's model id and the subagents' model; each subagent's label, tokens, tool uses and time; the time taken; and short notes. The log itself doesn't hold the reports or the material reviewed. You can read, edit or delete it. If your project is public, the log is committed with it unless you add `reviews/` to `.gitignore`; do that for security reviews, because counts of HIGH findings and failed fixes per target, and the titles of appealed findings, hint at where problems were.

**Saved reports.** Next to the log, each run's folder (`reviews/<run id>/`) holds the full report of every reviewer, debate turn, judge, appeal and baseline agent, as they returned it apart from control and invisible characters, which are removed, so anyone can see exactly what was found and what was thrown out and why. Reports quote the material they reviewed, including code, file paths and anything sensitive in it, so for a private project keep them out of git: add `reviews/*/` to `.gitignore` (or all of `reviews/`). Keep the reports of security reviews out of git on public projects too, because they describe each problem in full, often with a way to exploit it. Ask Claude not to save them if you'd rather not keep them at all. What the subagents review reaches Anthropic the way anything in your conversation does.

## How it's built

- **Markdown with YAML front matter.** The skill is `SKILL.md`: instructions for Claude in Markdown, with a short YAML block at the top (name, description, licence). They say how to choose a type, run each step with subagents, and fill in the results.
- **JavaScript (Node.js ES module).** `scripts/council.mjs` is a plain JavaScript file Node runs directly, with no packages. It builds the plan and its briefs, checks and records results, and builds the comparison.
- **The briefs live in the script.** Every run of a type gets the same wording, with a version number in the log, so differences between runs come from the type, not from how the briefs were phrased that day.
- **JSON Lines for the log.** `review-log.jsonl` has one record per line (JSON, a small text format of names and values) and is only ever appended to, so no earlier result is overwritten; the Markdown summary is rebuilt from it.

## Design decisions

- **The type is logged before the run.** A run that fails halfway still shows up (the comparison counts planned runs that were never logged), so the log doesn't quietly favour the types that finished.
- **Same briefs every time.** Comparisons mean something only if the reviewers were asked the same way.
- **A baseline is optional but cheap.** One extra reviewer working alone is the simplest test of whether a council is worth its cost.
- **Reviewers aren't told what to expect.** The description of what's reviewed goes into every brief, so the script refuses one that says the material has planted, deliberate or known problems; a sample run would otherwise look better than it is.
- **An appeal, not a second judge.** A judge can throw out a real finding, as one did in our first real run on the sample (it dismissed the planted path problem as the caller's concern). The appeal agent sees only the dismissed findings and the judge's reasons, so it reads them without the framing the judge had, and it only flags; you make the call, and the log keeps each call, so you can see whether appeals are worth their agent.
- **Severity counts add up one way.** Every combined finding is counted once by severity, a NOT REAL one at the highest severity a reviewer gave it, so the severity counts always add up to the combined total.
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
- The time recorded is wall time in the session, which depends on load as well as the type, or, where the finish wasn't noted, the agents' critical path, so minutes per run can mix the two (see [Models, tokens and time](#models-tokens-and-time)).
- Finding numbers (a reviewer's 1, 2, 3, the judge's M1, M2) restart in every run, so Council Dial cites them with the run id, such as `20261107-2f23/M12`.
- Debate is one round, and sequential runs take longer by design.
- Subagents can fail or stop early; the run is logged with what came back.
- If two runs write the log at the same moment, `review-log.md` can miss the other's row until the next write (the `.jsonl` log keeps both).
- A run with a baseline is grouped with runs of the same council type without one; the baseline doesn't change the council. Brief versions aren't separated in the comparison: version 2 (Council Dial 1.1.0) added the appeal, which shows in the type's name, and changed how the judge counts the severity of NOT REAL findings and asked it for reasons, which doesn't.
- The appeal checks only findings the judge marked NOT REAL, not ones it marked OVERSTATED; there is one appeal agent, and its view is advice, so the judge's counts stay as they were and your calls are logged next to them.
- Runs logged before Council Dial 1.2.0 have no model recorded, so their type names don't end in a model and they're compared apart from later runs of the same type.
- The check for a primed description looks for words such as "planted", "on purpose" or "known issues"; a description that hints at problems in other words gets through.
- Recheck results add up per run and can't be corrected, only added to; `newFindings` is recorded but not compared.
- A review log that came with a project you cloned is read like your own; lines that don't pass the script's checks are skipped and counted. Rows written by hand or by an older version are read with their values checked but not whether they add up, so impossible counts in such a row can skew the shares.
- A run logged with `verified` left out, whose confirmed, overstated and dismissed counts are filled in but don't add up to the combined findings, still counts as verified.
- Custom roles are compared without regard to their order or capitals, including for sequential councils, where the order of reviewers does change the run; role names appear in lower case in the type.
- Email addresses and some bare web addresses in a target may still show as links in `review-log.md` on GitHub.

## Planned (not built yet)

None of this is in Council Dial yet, and whether it's built depends on what the research finds.

- **Task templates in plain words.** You'd describe the job, such as "review my creative app" or "legal review of these terms", and Council Dial would pick a ready-made council template for it: the type, the roles and which model each seat uses. It would then tell you which template it used. Templates would start as best guesses and be updated from logged results, as the review log shows which councils find the most for the effort on each kind of task. Council Dial would stay offline: templates would ship with the plugin, and any online lookup of newer templates would be a separate, optional add-on you choose to install; Council Dial itself would still make no network requests.
- **A fingerprint of the material.** Each plan would record which version of the material was reviewed (a git commit, or a content hash of the target files), and `compare` would warn when runs of the same type reviewed different versions, since today it can't tell.
- **An appeal on severity downgrades.** Today the appeal sees only findings the judge marked NOT REAL, so a real HIGH problem the judge marks OVERSTATED and cuts to LOW is never checked. An optional second kind of appeal would check those downgrades too.

## Troubleshooting

- **"no planned run":** the run id is wrong, or the log is in another folder; run `list`, or pass the same `--log-dir` as when it was planned.
- **"findingsPerReviewer has N numbers":** give one number per reviewer in the plan's order.
- **"node" isn't found:** install Node.js 18 or later.

## Support

Report problems at https://github.com/Ablation-Lab/council-dial/issues.

## Licence

MIT. See the LICENSE file in the repository.

Research by Ablation Lab.
