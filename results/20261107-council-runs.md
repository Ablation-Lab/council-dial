# Council runs on the sample, 7 November 2026

This file records the first two real Council Dial runs on its own sample (`samples/target/`), scored against [`sample-answers/expected-findings.md`](../sample-answers/expected-findings.md). Both runs used real Claude Code subagents.

**How findings are cited.** Finding numbers restart in every run: each reviewer numbers its own findings from 1, and each judge numbers its merged findings from M1. This file therefore cites every finding with its run id, such as `20261107-2f23/M12` for run 2's judge finding M12, or "run 2's security reviewer, finding 6" for a reviewer's own number. Two different findings were each called "M12" in the two runs, and that is how they got mixed up (see section 7). Council Dial now cites findings this way in what it writes; the reviewer and judge briefs are unchanged, so brief version 2 stays comparable.

Where the rest is kept:
- **Review log:** `reviews/review-log.jsonl` and `review-log.md` in the overnight-skills project (outside this repo), with every other real run.
- **Saved reports:** each agent's full report, in `reviews/20261107-f675/` and `reviews/20261107-2f23/` next to that log. Both folders are complete: run 1 has 4 of 4 reports and run 2 has 5 of 5, 9 reports across the 2 runs (checked against the agents each run's type starts).
- **How the reports were saved:** after the runs, from the reports as they came back in the session. The `report` command didn't exist yet when either run happened.
  - **What was changed:** the harness's two-space indent was removed; nothing else.
  - **Re-saved at 20:48 UTC:** the reports were first saved at 20:29 UTC, then re-saved with `report --replace --saved-later`. Each header now says "Saved from the session text after the run, not captured as the agent finished", and gives the re-save time. Every report body was checked to be byte-identical to the first save.

Figures that couldn't be captured are marked **missing**, never estimated.

## 1. Setup

| | Run 1: `20261107-f675` | Run 2: `20261107-2f23` |
|---|---|---|
| Planned (UTC) | 2026-11-07 19:02:56 | 2026-11-07 19:52:25 |
| Type | `specialised-3/judged` | `specialised-3/judged+appeal @claude-opus-5-5` |
| Roles | correctness; security and privacy; docs and policy accuracy (the defaults) | the same |
| Combine | judge (final say) | judge, then appeal |
| Brief version | 1 | 2 (judge counts NOT REAL severity one way and gives reasons; appeal brief added) |
| Council Dial | 1.0.0, the installed plugin (identical to the repo at commit 7a1e279). Not recorded in the log; `setup` infers it from brief version 1 | the working tree that became 1.2.0 (uncommitted, after commit f021427). Not recorded in its log row, because the version field was added after it was planned; `setup` infers 1.2.0 |
| Main session model | claude-opus-5-5 (not recorded in the log; 1.0.0 had no model field) | claude-opus-5-5 (recorded) |
| Subagent model | none requested, so inherited from the main session. **Missing:** the model each subagent actually ran on (Claude Code doesn't report it to the main session) | the same: none requested, inherited. **Missing:** the actual model. `CLAUDE_CODE_SUBAGENT_MODEL` and `_FORCE` were checked about 45 minutes after run 1 and weren't set; not checked at run 1's own time |
| Agent type | general-purpose subagents, in the background | the same |
| Material | a scratch copy of `samples/target/` (README.md and slugify.mjs), without the answer key | a fresh scratch copy of the neutral `samples/target/`, without the answer key |
| Running code | not allowed | not allowed |
| Description of the target given to every brief | "Council Dial sample target (slugify.mjs and its README, made-up module with planted problems), real end-to-end test run of the plugin" | "slugify.mjs and its README: a small Node module that makes URL slugs for a blog host and stores used slugs in a file" |

## 2. Agents: findings, tokens, tool uses and time

The tokens, tool uses and times are what Claude Code reported in each subagent's completion notice (`subagent_tokens`, `tool_uses`, `duration_ms`). That notice isn't a documented format, it doesn't itself say whether cached tokens count, and it has no input/output split or cost. **Missing for both runs:** input, output and cached tokens, and cost. **Read the token figures as context sizes:** Claude Code's monitoring docs describe a finished subagent's token figure as roughly its context size at completion (its final request, cached tokens included), not a sum across its requests, so these are logged context sizes, not billed totals (added with Council Dial 1.5.2).

### Run 1: `20261107-f675`

| Agent | Findings | Tokens | Tool uses | Time |
|---|---|---|---|---|
| reviewer: correctness | 10 | 45,209 | 3 | 43.1 s |
| reviewer: security and privacy | 5 | 44,565 | 3 | 41.0 s |
| reviewer: docs and policy accuracy | 8 | 44,763 | 2 | 37.8 s |
| judge | 13 merged | 57,350 | 3 | 92.0 s |
| **Total (4 agents)** | 23 before merging | **191,887** | 11 | |

- **Run time: 3.9 minutes of wall time.** That's from the plan (19:02:56) to a clock check right after the judge reported (19:06:47), so it includes orchestration and runs slightly past the judge's finish.
- **Usage recorded after the fact:** run 1 was first logged with Council Dial 1.0.0, which had no field for per-agent usage. These figures were later re-logged from the session's completion notices, and the run's log note says so and says its minutes are wall time.

### Run 2: `20261107-2f23`

| Agent | Findings | Tokens | Tool uses | Time |
|---|---|---|---|---|
| reviewer: correctness | 10 | 46,562 | 3 | 54.5 s |
| reviewer: security and privacy | 7 | 44,701 | 3 | 41.1 s |
| reviewer: docs and policy accuracy | 7 | 44,711 | 2 | 37.3 s |
| judge | 13 merged | 61,922 | 2 | 128.6 s |
| appeal | 1 dismissal checked | 41,995 | 3 | 8.2 s |
| **Total (5 agents)** | 24 before merging | **239,891** | 13 | |

- **Run time: 3.2 minutes, the agents' critical path, not wall time:** the slowest reviewer (54.5 s), then the judge (128.6 s), then the appeal (8.2 s).
- **Missing: run 2's wall time.** The time the appeal finished wasn't noted, and the gap before the next step included waiting for the user, so a clock reading would overstate it. The run's log note says its minutes are the critical path.

### What the log holds

| | Run 1 | Run 2 |
|---|---|---|
| Findings per reviewer | 10, 5, 8 | 10, 7, 7 |
| Combined | 13 | 13 |
| REAL / OVERSTATED / NOT REAL | 10 / 2 / 1 | 7 / 5 / 1 |
| Severity: HIGH / MED / LOW | 2 / 5 / 6 | 3 / 3 / 7 |
| Verified | yes (judge) | yes (judge) |
| Appeal | none (no appeal step in 1.0.0) | ran; checked 1 dismissal; flagged 0 |
| Per-agent usage | yes (recorded after the fact) | yes |
| `wallMinutes` | 3.9 (wall time, per the note) | 3.2 (critical path, per the note) |

**Run 1's severity counts:** the 1.0.0 judge brief didn't say how to count a NOT REAL finding's severity. The judge gave 2 HIGH, 4 MED and 6 LOW (12), leaving out the dismissed finding. The log counts that finding at the MED its reviewer gave it (2 / 5 / 6 = 13). That's the rule version 2 later made standard.

## 3. Against the answer key

### Run 1: `20261107-f675`

| # | Planted bug | Raised by (reviewer, finding) | Judge's finding | Judge decided |
|---|---|---|---|---|
| 1 | Non-ASCII letters dropped (line 8) | correctness 2, security 3, docs 2 | `20261107-f675/M2` | REAL, HIGH |
| 2 | Trim without `g` (line 9) | correctness 4, docs 4 | `20261107-f675/M4` | REAL, MED |
| 3 | Truncation leaves a hyphen (line 10) | correctness 5, docs 5 | `20261107-f675/M5` | REAL, MED |
| 4 | `-1` instead of `-2` (line 17) | correctness 3, docs 3 | `20261107-f675/M3` | REAL, MED |
| 5 | Empty slug used as is | correctness 6, security 3, docs 6 | `20261107-f675/M6` | REAL, MED |
| 6 | Save not atomic (line 24) | correctness 9, security 2 (the concurrency part) | `20261107-f675/M9` | OVERSTATED: MED corrected to LOW |
| 7 | Unchecked `.slugs` path (line 24) | security 1 only | `20261107-f675/M12` | **NOT REAL: dismissed** |
| 8 | `loadUsed` throws on a missing file (line 29) | correctness 1, security 5, docs 1 | `20261107-f675/M1` | REAL, HIGH |
| 9 | Empty file gives `['']` | correctness 7, docs 7, security 2 (the CRLF part) | `20261107-f675/M7` | OVERSTATED: MED corrected to LOW |

- **Raised by the reviewers:** 9 of 9.
- **Kept by the judge:** 8 of 9 (#7 dismissed).
- **Merged:** none. Each planted bug became its own merged finding.

### Run 2: `20261107-2f23`

| # | Planted bug | Raised by (reviewer, finding) | Judge's finding | Judge decided |
|---|---|---|---|---|
| 1 | Non-ASCII letters dropped | correctness 4, security 3, docs 1 | `20261107-2f23/M3` | REAL, HIGH |
| 2 | Trim without `g` | correctness 5, security 4, docs 5(a) | `20261107-2f23/M5` | REAL, MED |
| 3 | Truncation leaves a hyphen | correctness 6 (the truncation part), security 4, docs 5(b) | `20261107-2f23/M5` (**merged with #2**) | REAL, MED |
| 4 | `-1` instead of `-2` | correctness 3, docs 4 | `20261107-2f23/M6` | REAL, MED |
| 5 | Empty slug used as is | correctness 4, security 3, docs 1 | `20261107-2f23/M3` (**merged with #1**) | REAL, HIGH |
| 6 | Save not atomic | correctness 8, security 2 (the crash part) | `20261107-2f23/M9` | OVERSTATED: MED corrected to LOW |
| 7 | Unchecked `.slugs` path, from user input | correctness 9, security 1, docs 3 | `20261107-2f23/M1` | **REAL, HIGH** |
| 8 | `loadUsed` throws on a missing file | correctness 1, security 5, docs 2 | `20261107-2f23/M2` | REAL, HIGH |
| 9 | Empty file gives `['']` | correctness 7, security 5, docs 2 (the empty-file parts) | `20261107-2f23/M8` | OVERSTATED: MED corrected to LOW |

- **Raised by the reviewers:** 9 of 9.
- **Kept by the judge:** 9 of 9.
- **Merged:** two pairs of planted bugs (#1 with #5, #2 with #3), so 9 planted bugs appear as 7 merged findings. Counting merged findings against planted bugs undercounts this run.

## 4. Beyond the answer key

### Kept findings that aren't planted

"Kept" means the judge marked them REAL or OVERSTATED (a real problem, rated too high). Run 1: 4, all REAL. Run 2: 5, of which 2 REAL and 3 OVERSTATED.

**Run 1 (4):**
- `20261107-f675/M8`: the `-N` suffix can push a slug past `maxLength`. REAL, LOW.
- `20261107-f675/M10`: inputs aren't checked (`slugify(null)`, `maxLength` of -1, 0 or NaN). REAL, LOW.
- `20261107-f675/M11`: the duplicate search slows as many identical titles pile up. REAL, LOW.
- `20261107-f675/M13`: the README doesn't say `uniqueSlug` changes the `used` list. REAL, LOW.

**Run 2 (5):**
- `20261107-2f23/M4`: a read-modify-write race, and the scope of uniqueness. OVERSTATED: HIGH corrected to MED.
- `20261107-2f23/M7`: the suffix can exceed `maxLength`, and `maxLength` isn't checked. OVERSTATED: MED corrected to LOW.
- `20261107-2f23/M10`: inputs aren't checked, and the lookup is linear. REAL, LOW.
- `20261107-2f23/M11`: reserved or route-like slugs such as `admin` aren't blocked. OVERSTATED: MED corrected to LOW. The judge called it "hardening, not a proven flaw".
- `20261107-2f23/M13`: `uniqueSlug` changes `used` without saying so. REAL, LOW.

### False positives

- **Run 1:** none kept. The only finding the judge dismissed was a planted bug. One reviewer repro was wrong, and the judge corrected it: "Ünïcödé" gives `n-c-d-`, not `n-c-d` (correctness reviewer, finding 2, in `20261107-f675/M2`).
- **Run 2:** one, `20261107-2f23/M12`, from the security reviewer's finding 6 (LOW, at low confidence). The judge dismissed it and the appeal agreed. Its claim that the README doesn't say where the files are stored is contradicted by README line 7.

### Everything the judge dismissed

**`20261107-f675/M12`: "Unchecked path or symlink in saveUsed and loadUsed" (planted bug #7)**
- **Judge's reasons:** "The API's documented job (README.md:7) is to read and write `<file>.slugs` at the path the caller gives, just like `fs.writeFileSync`. The module has no trust boundary or base directory to escape from. The reviewer admits it is only exploitable if callers pass untrusted input, and that is the caller's bug. At most it is worth a line in the README."
- **Appeal's view:** none; run 1 had no appeal step.
- **Against the answer key:** a planted bug was dismissed. The sample README didn't yet say the path comes from user input, which is why the judge could call it out of scope; run 2's README fixes that.

**`20261107-2f23/M12`: "Storage location is not disclosed and may be publicly served" (not planted)**
- **Judge's reasons:** "The file holds only slugs, which are already the public URLs of the blogs or posts, so exposing it leaks nothing private. Nothing in the material places the working directory under a web root. The reviewer marked this low confidence and 'not proven'. The real problem with the location is that it comes from user input, and M1 already covers that." (That M1 is `20261107-2f23/M1`.)
- **Appeal's view: FAIRLY DISMISSED.** "The README does say where the file goes and what it holds (README.md:7 …). The file holds only slugs, one per line (slugify.mjs:24), and those are already the public URLs. Nothing in the material puts the working directory under a web root."
- **Count:** 1 checked: 0 wrongly dismissed, 1 fairly dismissed, 0 unsure.
- **Against the answer key:** the dismissal was correct, and the appeal was right to uphold it.

## 5. Side by side

| | Run 1: judge has the final say | Run 2: judge plus appeal |
|---|---|---|
| Reviewer findings | 23 (10, 5, 8) | 24 (10, 7, 7) |
| Merged: REAL / OVERSTATED / NOT REAL | 13: 10 / 2 / 1 | 13: 7 / 5 / 1 |
| Planted bugs raised by reviewers | 9 of 9 | 9 of 9 |
| Planted bugs kept after judging | **8 of 9**\* | **9 of 9** |
| Planted bugs merged together | none | 2 pairs |
| Dismissed | planted bug #7 (`20261107-f675/M12`) | one unplanted false positive (`20261107-2f23/M12`) |
| Kept findings beyond the answer key (REAL / OVERSTATED) | 4 (4 / 0) | 5 (2 / 3) |
| Judge | 57,350 tokens, 3 tool uses, 92.0 s | 61,922 tokens, 2 tool uses, 128.6 s |
| Total tokens | 191,887 (4 agents) | 239,891 (5 agents) |
| Time | 3.9 min wall time | 3.2 min critical path (wall time **missing**) |

\* Planted bug #7, as the answer key now words it, depends on README text that run 1's material didn't have: run 1's README didn't say the path comes from user input (section 6, change 1), and run 1's judge dismissed the finding for that reason. So counting it as a miss for run 1 is debatable. On the other 8 planted bugs, both runs kept 8 of 8.

The two times measure different things and can't be compared.

**The shares in the review log.** Council Dial 1.2.0's `review-log.md` showed a "confirmed" share that counted only REAL findings: 77% for run 1 (10 of 13) and 54% for run 2 (7 of 13). That left OVERSTATED findings out, so the run that kept 9 of 9 planted bugs looked worse. From 1.3.0 the log shows the kept share instead (REAL or OVERSTATED): 92% (12 of 13) for both runs, with the judge's severity cuts shown separately (2 of 12 kept findings for run 1, 5 of 12 for run 2).

### What the appeal agent cost, next to one reviewer

| Agent (run 2) | Tokens | Tool uses | Time |
|---|---|---|---|
| appeal (1 dismissed finding) | 41,995 | 3 | 8.2 s |
| reviewer: security and privacy (fewest tokens) | 44,701 | 3 | 41.1 s |
| reviewer: docs and policy accuracy (fastest) | 44,711 | 2 | 37.3 s |
| reviewer: correctness | 46,562 | 3 | 54.5 s |

- **Tokens:** the appeal used about 94% of the tokens of the reviewer that used the fewest (the security reviewer: 41,995 against 44,701), but about a fifth of its time (8.2 s against 41.1 s).
- **Run total:** it added 41,995 tokens to the four council agents' 197,896, a 21% increase, and 8.2 s to the critical path.
- **An inference, not a measurement:** the appeal's own task was tiny, so most of each agent's roughly 42–47k tokens looks like a fixed cost of starting a subagent and reading the material. What `subagent_tokens` counts isn't documented.

## 6. What changed between the runs, and why the appeal can't take the credit

Between run 1 and run 2:
1. **Sample README:** "It has problems planted on purpose." was removed. It now says the module serves a blog host where users pick a blog name, and that `file` is "the blog name the user typed in at sign-up". That puts planted bug #7 plainly in scope.
2. **Comment at slugify.mjs:27:** "The README says a missing file gives an empty list." became "Loads the list of used slugs saved next to the given file."
3. **Description of the target:** run 1's said "made-up module with planted problems", and it went into every brief. Run 2's describes the material only. Council Dial now refuses descriptions like run 1's.
4. **Judge brief version 2:** a NOT REAL finding is counted at the highest severity a reviewer gave it, and the judge gives reasons for each NOT REAL finding.
5. **Appeal step:** added in run 2.
6. **Answer key:** moved out of `samples/` to `sample-answers/`. This made no difference to these runs: both reviewed scratch copies without it.
7. **Council Dial:** 1.0.0 for run 1; the 1.2.0 working tree for run 2.

Unchanged: the reviewer briefs (apart from the description line), the roles, the model (inherited, main session claude-opus-5-5), no running code, and the agent type.

**The appeal can't take the credit for run 2's 9 of 9.** It changed nothing in run 2. The dismissal it checked (`20261107-2f23/M12`) wasn't a planted bug, and it agreed with the judge. Run 2 kept planted bug #7 (`20261107-2f23/M1`) most likely because of change 1: the README now says the path comes from user input, so the judge couldn't call it the caller's problem. Changes 2–4 may also have played a part. The case the appeal exists for, a judge dismissing a real bug as in `20261107-f675/M12`, hasn't been tested with an appeal. With one run of each type and four other changes in between, these runs show nothing about whether an appeal is worth its cost.

## 7. Voice-drafted claims checked and refuted

1. **Claim:** the README's Limits section says "The appeal checks only findings the judge marked OVERSTATED", contradicting NOT REAL everywhere else.
   - **Found:** README.md and plugin/README.md line 113 at commit f021427 (line 127 in the uncommitted 1.2.0 working tree) say "The appeal checks only findings the judge marked NOT REAL, not ones it marked OVERSTATED". The code gives the appeal agent only NOT REAL findings (the appeal brief and the appeal step's `how` in council.mjs). The README already matched the code; nothing was changed.
2. **Claim:** M12 (storage location) in run 2 is planted bug #7, so the judge dismissed a real bug and the appeal wrongly upheld it.
   - **Found:** in run 2, planted bug #7 is `20261107-2f23/M1`, which all three reviewers raised and the judge kept as REAL, HIGH. `20261107-2f23/M12` is a different, unplanted, low-confidence finding about where the files are stored, and README line 7 contradicts it. The dismissal and the appeal's view both match the answer key.
   - **The likely source of the mix-up:** in run 1, `20261107-f675/M12` *was* planted bug #7, and it was dismissed. Both judges numbered their merged findings from M1, so the bare label "M12" pointed at different findings in the two runs. That's why findings are now cited with their run id.

## 8. Missing figures

- The model each subagent actually ran on (both runs). Claude Code doesn't report it to the main session.
- Input, output and cached tokens, and cost per agent (both runs).
- Run 2's wall time. 3.2 minutes is the agents' critical path.
- The effort level (both runs): it wasn't recorded for these runs. The session's saved level was high and every seat inherited the session's model, so the seats probably ran at high (inferred, not recorded).
- Start and finish times for each agent (both runs). Only durations were reported.
- Run 1's environment variables at run time. They were checked about 45 minutes later, and none were set.
- Council Dial's version in each run's log row (both runs). `setup` infers it: 1.0.0 for run 1, 1.2.0 for run 2.
- Run 1's main and subagent models in its planned row. Council Dial 1.0.0 had no field for them. Its re-logged results give each agent's model as `inherit`, and this file records the main session's model.
- The time each report was first saved appears only in this file (20:29 UTC). The report headers show the re-save time (20:48 UTC).
