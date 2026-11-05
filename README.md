# Council Dial

Council Dial is a Claude Code plugin. When you want code, docs or a plan reviewed, Council Dial has Claude run a review council of subagents set up the way you choose: specialised or generalist reviewers, a judge, a pooled list or a majority consensus to combine their findings, and optional debate, sequential and single-reviewer baseline runs. Claude tells you how many subagents a run will use and waits for your yes. Each run's type and results go into a log in your project, so you can compare council types over time. The plugin lives in [plugin/](plugin/); its README, [plugin/README.md](plugin/README.md), describes what it does, what it reads and writes, and how to try it.

## Install

```
/plugin install council-dial --marketplace Ablation-Lab/council-dial
```

Or copy `plugin/skills/council-dial` into `~/.claude/skills/` to use it as a personal skill.

## Repository layout

| Path | What it is |
|---|---|
| `plugin/` | the plugin folder (Plugin path `plugin` in the directory portal) |
| `plugin/skills/council-dial/` | the skill: `SKILL.md` and `scripts/council.mjs` |
| `samples/` | a made-up target with planted problems, its expected findings, and a sample review log |
| `.claude-plugin/marketplace.json` | lets Claude Code install the plugin from this repo |
| `test/` | tests, run with `node --test` (not part of the plugin) |
| `scripts/privacy-check.sh`, `.githooks/` | the maintainer's pre-commit privacy check; the plugin never runs it |

Keep `plugin/README.md` and `SKILL.md` in step, and the versions in `plugin.json` and `marketplace.json` equal.

MIT licence. An independent project, not made or endorsed by Anthropic.
