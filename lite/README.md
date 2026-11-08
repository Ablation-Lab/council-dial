# Council Dial Lite

## What it is

Council Dial Lite is the lighter, script-free edition of [Council Dial](https://github.com/Ablation-Lab/council-dial). It has a small panel of Claude reviewers check your code, docs or plan. In its standard setup, three reviewers each check the work on their own, a judge checks every finding they report and throws out the ones that don't hold up, and an appeal agent rechecks anything the judge threw out. You make the final call on what to keep.

Each agent saves its own report. Claude copies the findings word for word into a summary, and a fresh check agent compares that summary with the reports and flags anything missing or changed. Every run's setup and results go into a log in your project, so over time you can compare setups on your own material.

It's a research tool. It doesn't claim that any setup, including the judge and the appeal, works better than another.

## Two editions

| | Council Dial | Council Dial Lite |
|---|---|---|
| For | research runs | everyday councils, and the plugin directory |
| Needs | Claude Code, Node.js 18 or later, subagents | subagents and file tools; no Node.js |
| Briefs | the same templates, filled in by a script that refuses changed templates | the same templates, filled in by Claude |
| Reports | saved by Claude through the script | saved by each agent itself, and checked by Claude against the agent's reply |
| Log | `reviews/review-log.jsonl`, checked by the script | one `run.json` per run in `reviews/lite/`, written by Claude |
| Comparison table | worked out by the script | worked out by Claude |
| Final check of the summary | no | yes, by a fresh agent |
| Installed from | this repository's marketplace | this repository's marketplace, and the plugin directory once it's listed there |

The trade-off: Lite has no script, so nothing checks its log mechanically. The full edition's script refuses counts that don't add up, works out the comparison table and the critical path itself, refuses log folders that are links, removes invisible characters from saved reports, and records the session's effort level. In Lite, Claude follows the same rules by hand, so its figures can contain mistakes, and it can't read the effort level. Use the full edition for runs you'll report as research; use Lite where you can't run a script.

Lite runs are kept apart from research runs: they go in their own folder, each `run.json` says `"edition": "council-dial-lite"`, labels start with `lite:`, and run ids start with `lite-`, which the full edition's script never reads as one of its runs.

## Install

From the plugin directory, once it's listed there. Or from this repository's marketplace, in Claude Code 2.1.275 or later:

```
/plugin install council-dial-lite --marketplace Ablation-Lab/council-dial
```

It opens the plugin's page in `/plugin`, where you choose a scope and install it. From a shell, `claude plugin install council-dial-lite --marketplace Ablation-Lab/council-dial` does the same in Claude Code 2.1.292 or later. On older versions, add the marketplace first with `/plugin marketplace add Ablation-Lab/council-dial`, then `/plugin install council-dial-lite@council-dial`. If you install both editions, say which one you want: when Claude picks Lite and you haven't said, Lite asks, but the full edition doesn't.

## Quick start

1. Install it (above).
2. In your project, say `Run a standard review council on the diff of this branch`. Claude says how many subagents it will start, with a rough token estimate once you have logged runs of that type, and waits for your yes.
3. Read the findings, most serious first, and the check's counts. If the appeal thinks the judge wrongly threw something out, Claude shows you both views and you decide.
4. After a few runs, ask `How do the council types compare in my Lite log?`

## How it works

1. **Choose.** Specialised or generalist reviewers; judged (with an appeal), pooled or consensus combining; optional debate, sequential and baseline runs. Presets: Standard (6 agents), Quick (4) and Thorough (10), each counting the final check.
2. **Plan.** Claude builds each agent's brief from the templates in the skill's `briefs/` folder, word for word, saves the briefs, and starts the run's `run.json`.
3. **Run.** Claude starts the agents as subagents. Each one saves its own report to the run's `reports/` folder and is told to open nothing else in the Lite folder. Claude compares each saved report with the agent's reply, and checks again that no saved report has changed before passing reports on. Judges, appeals and checks are never told which model or effort level produced a finding, or given the run's record.
4. **Summarise.** Claude copies the findings, word for word, into `summary.txt`.
5. **Check.** A fresh agent compares the summary with the reports and lists each finding that's missing, changed or has no source. Claude shows you the list and fixes the summary.
6. **Log.** Claude records the counts, each agent's tokens, tool uses and time as Claude Code reported them, and the check's counts in `run.json`. Later rechecks of fixes go in the same file.

## Avoiding the permission prompts

In Claude Code's default (Manual) mode, every file write asks for your approval: each agent's report (up to 22 for the largest council), and Claude's own writes of `run.json`, the briefs and the summary, so a large run can mean about twice that. Background agents' prompts appear in your main session. If you answer one with a choice that lasts beyond that write, such as allowing it for the rest of the session, Claude Code applies it to the whole session, every later agent included. To avoid the prompts, either:

- **Allow writes to the Lite folder only (recommended):** add this rule to your project's `.claude/settings.json` (shared with your collaborators) or `.claude/settings.local.json` (only you):

  ```json
  {
    "permissions": {
      "allow": ["Edit(/reviews/lite/**)"]
    }
  }
  ```

  `Edit` rules cover every built-in tool that writes files, Write included. In these two files, a path that starts with `/` is read from the folder you started Claude Code in, so start it in the project root (or change the path). Change it too if you chose another Lite folder.

  Claude Code applies a project's allow rules only after you've accepted the trust dialog for the folder, which it shows in interactive sessions; Anthropic's permissions docs describe the exceptions for `.claude/settings.local.json`. `claude -p` and SDK sessions never apply allow rules from `.claude/settings.json`. In our test, with this rule given to Claude Code, a subagent's write to `reviews/lite/` went through without a prompt, and its write to another folder wasn't allowed.

  The rule lets any agent in the session write anywhere under `reviews/lite/`, earlier runs included. That's why Claude compares each saved report with the agent's reply and stops if one changes, but an agent misled by the material could still edit an earlier run's files.
- **Accept edits:** press `Shift+Tab` from Manual mode to switch to accept-edits mode before the run (or start Claude Code with `--permission-mode acceptEdits`). Claude Code then accepts file edits, and common file commands such as `mkdir`, `mv` and `rm`, inside your working directory without asking, for the whole session and not only the reviews; subagents run in the same mode. Since the agents read material that may contain instructions, this lets a misled agent change other files in your project without asking, so prefer the rule above.

Lite doesn't change your settings; add the rule yourself if you want it. If you deny a prompt, Claude saves that agent's report itself and marks it in `run.json` as saved by the main session.

## What it reads and writes

- **Reads:** the material you ask it to review, its own brief templates, and the Lite folder (earlier runs' `run.json` files, for estimates and comparisons).
- **Writes:** only inside `reviews/lite/` in your project, or another folder you choose inside the project (not inside `.git` or `.claude`, and not the full edition's log folder), plus any scratch files the subagents write in temporary folders of their own. Each run gets a folder, `reviews/lite/<run id>/`, with `run.json`, the briefs in `briefs/`, each agent's report (the check's included) in `reports/`, and `summary.txt`. Before the first write, Claude checks the Lite folder and the folders above it aren't links, and stops if they are. Reports, briefs and the summary are plain text files, so links, images and HTML copied from the material never render or load when opened on GitHub or in a Markdown viewer.
- **Runs:** no scripts or programs of its own. The subagents are ordinary Claude Code subagents with the tools your session allows, under your permission settings.

## Where it works

- **Claude Code:** with subagents (the Agent tool) and file tools. This is where it was written to run.
- **Cowork and claude.ai chat:** not tested. A council needs a tool that starts subagents and tools that read and write files in your project. Anthropic's docs don't say which chat or Cowork sessions have those, so whether a council runs there is untested.

## Privacy

Lite has no server, account or telemetry, and sends nothing anywhere itself. Each run's `run.json` holds: the date it was planned; the type (including any custom role names) and brief version; the one-line description of what was reviewed; the counts (findings per reviewer, combined, confirmed, overstated, dismissed, by severity, the baseline's, fixes and regressions after rechecks); for each finding the appeal flagged, a short title, the appeal's view and your call; the main session's model id and the subagents' model; each subagent's label, tokens, tool uses and time; the check's counts; and short notes.

The run folder also holds the full briefs, reports, summary and check report. Reports quote the material they reviewed, including code, file paths and anything sensitive in it, so for a private project keep `reviews/lite/` out of git by adding it to `.gitignore`. Keep the reports of security reviews out of git on public projects too, because they describe each problem in full. What the subagents review reaches Anthropic the way anything in your conversation does.

## Limits

- Nothing checks the log mechanically: Claude checks that counts add up, and works out estimates and the comparison table, by hand, so they can contain mistakes. The full edition's script does this for research runs.
- The check covers the summary against the reports. It doesn't check what Claude gave the judge, the appeal or the debate agents, which Claude copies from the agents' replies.
- The blind and independent agents are told not to open other files in the Lite folder, but Claude Code doesn't enforce that: an agent that ignores it could read other reports or the run's record.
- Each agent saves its own report, so a report can hold invisible characters from the material; the full edition removes them.
- Lite can't read the session's effort level, or `CLAUDE_CODE_SUBAGENT_MODEL`; tell Claude if you set that.
- The check adds one agent to every run, so a Lite run uses more tokens than the same council in the full edition.
- Kept shares aren't comparable across combine methods: compare types within one method, or score runs against an answer key where one exists.

## Support

Report problems at https://github.com/Ablation-Lab/council-dial/issues.

## Licence

MIT. See the `LICENSE` file.

Research by Ablation Lab.
