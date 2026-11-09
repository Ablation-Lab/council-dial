// Council Dial helper: turns a choice of review-council type into the briefs Claude gives its
// subagents, and keeps a review log of each run's type and results so the types can be compared.
//
//   node council.mjs plan    --reviewers specialised|generalist --combine judged|pooled|consensus
//                            [--n 3] [--roles "a, b, c"] [--debate] [--sequential] [--baseline]
//                            [--no-appeal] [--model sonnet|opus|haiku|fable] [--main-model <model id>]
//                            [--log-dir reviews] [--project <dir>]          (what to review, on stdin)
//   node council.mjs estimate (the same type options as plan; writes nothing)
//   node council.mjs log     --run <id> [--log-dir reviews] [--project <dir>]  (results JSON on stdin)
//   node council.mjs update  --run <id> [--log-dir reviews] [--project <dir>]  (recheck JSON on stdin)
//   node council.mjs report  --run <id> --agent <label> [--replace] [--saved-later] [--notice-escaped]
//                            [--log-dir reviews] [--project <dir>]          (the report on stdin)
// plan, log, update and report also take --input <file>, which reads that file instead of stdin: the
// standard way, since Claude writes the text with its Write tool and no shell quoting is involved.
//   node council.mjs setup   --run <id> [--log-dir reviews] [--project <dir>]
//   node council.mjs list    [--limit 10] [--log-dir reviews] [--project <dir>]
//   node council.mjs compare [--log-dir reviews] [--project <dir>]
//
// It writes only the review log: <log dir>/review-log.jsonl (append-only) and review-log.md (a
// readable summary rebuilt from it after every write, and built by compare if it's missing), and
// each run's saved reports in <log dir>/<run id>/, inside the project. It reads only its own brief
// templates (the skill's briefs/ folder, when plan writes the briefs) and the log folder (the log, and
// the names of saved reports), checks the project and log paths exist and aren't links, and reads three
// environment variables by name (see readEnv): CLAUDE_CODE_SUBAGENT_MODEL and
// CLAUDE_CODE_SUBAGENT_MODEL_FORCE, which can change the model subagents run on, CLAUDE_EFFORT, the
// session's effort level, and CLAUDE_CODE_EFFORT_LEVEL, which overrides every other effort setting; plan
// records both effort variables. It starts no programs and makes no network requests.
// Output is one line of JSON.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Brief version 2: the judge counts NOT REAL findings' severity one way, and gives reasons for them;
// judged councils have an appeal step.
// Brief versions: plan writes VERSION unless --brief-version picks another of BRIEF_VERSIONS. Version 2's
// templates are briefs/*.md, unchanged; version 3 replaces three of them with briefs/v3/*.md.
export const VERSION = 3;
export const BRIEF_VERSIONS = [2, 3];
// Council Dial's own version, recorded with each plan so a run's setup can be rebuilt exactly. Keep it
// equal to the plugin manifest's version (a test checks).
export const PLUGIN_VERSION = '1.5.7';
const COMMANDS = ['plan', 'estimate', 'log', 'update', 'report', 'setup', 'list', 'compare'];
// The description of what's reviewed is kept at this length when planned and when read back.
export const TARGET_MAX = 600;
// The longest notes a results or recheck row keeps, in characters; log and update warn when they cut them.
export const NOTES_MAX = 400;
// The longest note an agents entry keeps, on what that agent did that its brief didn't ask for.
export const AGENT_NOTES_MAX = 200;
// Notes are a line of text: anything else is refused when logged, and read back from the log as no
// notes, so an object is never logged or shown as [object Object].
function notesOf(v, strict) {
  if (v == null) return '';
  if (typeof v === 'string') return clean(v, NOTES_MAX);
  if (strict) throw new Error('notes must be a line of text (a JSON string)');
  return '';
}
const REVIEWERS = ['specialised', 'generalist'];
const COMBINE = ['judged', 'pooled', 'consensus'];
export const DEFAULT_ROLES = ['correctness', 'security and privacy', 'docs and policy accuracy'];
const RUN_ID = /^[0-9]{8}-[0-9a-f]{4}$/;
// The Agent tool's per-call model takes these aliases; a full model id (such as claude-opus-5-5)
// names the main session's model, or a model set in CLAUDE_CODE_SUBAGENT_MODEL.
export const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'];
// A Claude model id as Claude Code names it: claude-..., with an optional [1m] suffix for the
// 1M-context variant. Only ids of this shape (or an alias) are recorded or read back as models, so a
// planted value can't reach a type's name or setup's rerun command.
export const CLAUDE_MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]{0,58}(\[1m\])?$/;
const isModelName = v => typeof v === 'string' && (MODEL_ALIASES.includes(v) || CLAUDE_MODEL_ID.test(v));
export const STEPS = ['review', 'debate', 'combine', 'appeal', 'baseline'];
// Effort levels Claude Code uses; CLAUDE_EFFORT holds the session's.
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const MAX_GROUPS = 50;

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd, reviewers: null, combine: null, n: null, roles: null, debate: false, sequential: false, baseline: false, noAppeal: false, model: null, mainModel: null, agent: null, replace: false, savedLater: false, noticeEscaped: false, input: null, effort: null, seatModel: null, seatEffort: null, briefVersion: VERSION, allowRunningCode: false, readEffortSettings: false, logDir: 'reviews', project: null, run: null, limit: 10 };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const val = () => { const v = rest[++i]; if (v == null || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
    if (a === '--reviewers') o.reviewers = val();
    else if (a === '--combine') o.combine = val();
    else if (a === '--n') o.n = Number(val());
    else if (a === '--roles') o.roles = val();
    else if (a === '--debate') o.debate = true;
    else if (a === '--sequential') o.sequential = true;
    else if (a === '--baseline') o.baseline = true;
    else if (a === '--no-appeal') o.noAppeal = true;
    else if (a === '--model') o.model = val();
    else if (a === '--effort') o.effort = val().trim().toLowerCase();
    else if (a === '--seat-model') o.seatModel = val();
    else if (a === '--seat-effort') o.seatEffort = val();
    else if (a === '--brief-version') { o.briefVersion = Number(val()); o.briefVersionGiven = true; }
    else if (a === '--allow-running-code') o.allowRunningCode = true;
    else if (a === '--read-effort-settings') o.readEffortSettings = true;
    else if (a === '--main-model') o.mainModel = val();
    else if (a === '--agent') o.agent = val();
    else if (a === '--replace') o.replace = true;
    else if (a === '--saved-later') o.savedLater = true;
    else if (a === '--notice-escaped') o.noticeEscaped = true;
    else if (a === '--input') o.input = val();
    else if (a === '--log-dir') o.logDir = val();
    else if (a === '--project') o.project = val();
    else if (a === '--run') o.run = val();
    else if (a === '--limit') { o.limit = Number(val()); o.limitGiven = true; }
    else throw new Error(`unknown option ${a}`);
  }
  if (!COMMANDS.includes(cmd)) throw new Error(`unknown command "${cmd ?? ''}"; use ${COMMANDS.join(', ')}`);
  if (cmd === 'plan' || cmd === 'estimate') {
    if (!REVIEWERS.includes(o.reviewers)) throw new Error(`--reviewers must be ${REVIEWERS.join(' or ')}`);
    if (!COMBINE.includes(o.combine)) throw new Error(`--combine must be ${COMBINE.join(', ')}`);
    if (o.roles != null && o.reviewers !== 'specialised') throw new Error('--roles is for specialised reviewers');
    if (o.noAppeal && o.combine !== 'judged') throw new Error('--no-appeal is for judged councils; only they have an appeal step');
    if (o.model != null && !MODEL_ALIASES.includes(o.model)) throw new Error(`--model must be ${MODEL_ALIASES.join(', ')} (the Agent tool takes only these aliases); leave it out to use this session's model`);
    if (o.mainModel != null && !CLAUDE_MODEL_ID.test(o.mainModel)) throw new Error('--main-model is the main session\'s model id, such as claude-opus-5-5 (it starts with claude- and may end in [1m])');
    if (!BRIEF_VERSIONS.includes(o.briefVersion)) throw new Error(`--brief-version must be ${BRIEF_VERSIONS.join(' or ')}`);
    if (o.effort != null && !EFFORT_LEVELS.includes(o.effort)) throw new Error(`--effort must be ${EFFORT_LEVELS.join(', ')} (the Agent tool's effort levels); leave it out to leave every seat's effort unset`);
  } else if (o.n != null || o.roles != null || o.reviewers || o.combine || o.debate || o.sequential || o.baseline || o.noAppeal || o.model != null || o.mainModel != null || o.effort != null || o.seatModel != null || o.seatEffort != null || o.briefVersionGiven || o.allowRunningCode || o.readEffortSettings) {
    throw new Error(`--n, --roles, --reviewers, --combine, --debate, --sequential, --baseline, --no-appeal, --model, --effort, --seat-model, --seat-effort, --brief-version, --allow-running-code, --read-effort-settings and --main-model are for estimate and plan only${cmd === 'list' ? ' (list takes --limit)' : ''}`);
  }
  if (o.n != null && (!Number.isInteger(o.n) || o.n < 1 || o.n > 9)) throw new Error('--n must be a whole number from 1 to 9');
  // Run ids are written in lower case; one retyped in capitals is the same id.
  if (o.run != null) o.run = o.run.toLowerCase();
  if (o.run != null && !RUN_ID.test(o.run)) throw new Error('--run is the run id from plan, such as 20261105-3fa9');
  if (o.limitGiven && cmd !== 'list') throw new Error('--limit is for list only');
  delete o.limitGiven;
  if (!Number.isInteger(o.limit) || o.limit < 1 || o.limit > 500) throw new Error('--limit must be a whole number from 1 to 500');
  if (['log', 'update', 'report', 'setup'].includes(cmd) && !o.run) throw new Error('give --run with the id from plan');
  if (cmd === 'report' && !o.agent) throw new Error('give --agent with the agent\'s label from the plan, such as "reviewer: correctness" or "judge"');
  if (cmd !== 'report' && (o.agent != null || o.replace || o.savedLater || o.noticeEscaped)) throw new Error('--agent, --replace, --saved-later and --notice-escaped are for report only');
  delete o.briefVersionGiven;
  if (o.input != null && !['plan', 'log', 'update', 'report'].includes(cmd)) throw new Error('--input is for plan, log, update and report, which read their input from it');
  return o;
}

const cp = n => String.fromCodePoint(n);
const HIDDEN = new RegExp(`[${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}${cp(0x200b)}${cp(0x2060)}-${cp(0x2064)}${cp(0xfeff)}${cp(0xad)}${cp(0x180e)}${cp(0x3164)}${cp(0xffa0)}${cp(0xfff9)}-${cp(0xfffb)}${cp(0xe0000)}-${cp(0xe007f)}]`, 'gu');
// One line, no control or invisible characters, capped by characters.
export function clean(text, max = 300) {
  const t = String(text ?? '').replace(/[\r\n\t\p{Zl}\p{Zp}]+/gu, ' ').replace(/\p{Cc}/gu, '').replace(HIDDEN, '').replace(/\s{2,}/g, ' ').trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : t;
}
// One line of plain text for Markdown: no table breaks, HTML, links or images.
// A backslash is doubled first, so text can't use one to undo the \[ that stops a link; @ is escaped so an
// email address doesn't become a link.
const inlineMd = (s, max) => clean(String(s), max).replace(/\\/g, '\\\\').replace(/@/g, '&#64;').replace(/\|/g, '/').replace(/</g, '&lt;').replace(/\[/g, '\\[').replace(/!/g, '&#33;').replace(/`/g, "'").replace(/:\/\//g, '&#58;//').replace(/\bwww\./gi, 'www&#46;');
const cell = s => inlineMd(s, 120);

const SHELL_CHARS = /[$`'"\\;&|<>*?%!{}\0\p{Pi}\p{Pf}]/u;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const inside = (root, p) => { const r = path.relative(root, p); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r); };

// The log folder: relative, inside the project, not hidden, not a link.
export function logPaths(project, dir) {
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error(`the project folder doesn't exist: ${clean(project, 120)}`);
  const r = String(dir ?? '').replace(/\\/g, '/').trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (!r || /^(\/|[A-Za-z]:)/.test(r) || r.includes(':') || r.split('/').includes('..')) throw new Error(`--log-dir must be a folder inside the project, such as reviews: ${clean(dir, 80)}`);
  const parts = r.split('/');
  if (SHELL_CHARS.test(r) || /[\p{Cc}\p{Cf}]/u.test(r) || parts.some(p => p.startsWith('.') || /^[^.\s]{1,6}~\d/.test(p) || RESERVED.test(p) || /[. ]$/.test(p))) throw new Error(`--log-dir must be a plain folder name (no hidden folders, short names, reserved names like NUL, trailing dots or shell characters): ${clean(dir, 80)}`);
  const abs = path.resolve(project, r);
  if (!inside(path.resolve(project), abs)) throw new Error('--log-dir must be inside the project');
  let d = abs;
  while (!fs.existsSync(d)) d = path.dirname(d);
  const real = (fs.realpathSync.native || fs.realpathSync);
  if (d !== path.resolve(project) && !inside(real(project), real(d))) throw new Error('--log-dir leads outside the project through a link');
  if (d !== abs && !fs.statSync(d).isDirectory()) throw new Error(`${path.relative(project, d) || d} is a file, so --log-dir ${r} can't be created inside it; choose another --log-dir`);
  if (fs.existsSync(abs) && !fs.lstatSync(abs).isDirectory()) throw new Error(`${r} exists but isn't a folder; choose another --log-dir`);
  for (const f of [abs, path.join(abs, 'review-log.jsonl'), path.join(abs, 'review-log.md')]) {
    let st; try { st = fs.lstatSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; continue; }
    if (st.isSymbolicLink()) throw new Error(`${path.relative(project, f)} is a link; Council Dial won't write through it`);
    if (st.isFile() && st.nlink > 1) throw new Error(`${path.relative(project, f)} has other hard links; Council Dial won't write to it`);
  }
  return { rel: r, dir: abs, jsonl: path.join(abs, 'review-log.jsonl'), md: path.join(abs, 'review-log.md') };
}

// ---- Briefs. Their wording is in Markdown templates in the skill's briefs/ folder, versioned by
// VERSION, so every run of a type gets the same wording. Each template is the text in a ```text block under a
// "## <name>" heading. Each {{name}} in a template is filled in once, so text that is filled in (such
// as the user's description of what's reviewed) is never read as a template itself.
const BRIEF_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'briefs');
const BRIEF_TEMPLATES = {
  shared: ['rules', 'format', 'what-to-review', 'focus: correctness', 'focus: security and privacy', 'focus: docs and policy accuracy'],
  reviewer: ['brief', 'brief-sequential', 'alone-role', 'alone-role-area', 'alone-everything', 'council-role', 'council-role-area', 'council-everything'],
  debate: ['brief', 'who-role', 'who-seat'],
  judge: ['brief', 'reports', 'reports-after-debate', 'severity-rule'],
  appeal: ['brief'],
  baseline: ['brief'],
};
// The SHA-256 of the template texts this version ships with (the texts only, not the notes around
// them). plan refuses templates that differ, so a run logged as brief version VERSION always had this
// wording. Change it only with the texts and VERSION; a test keeps it equal to the files.
export const BRIEF_SHA256 = '317ae729a8abed8e4f2ed91b5b479066c57cff6c4ca9c31409bf8eec7b7e3d5d';
export const BRIEF_SHA256_V3 = '2f545f09d9477094e4ead755b5a7a92781a811ff2ef1497f9a20251577b5fec0';
export const BRIEF_DIGESTS = { 2: BRIEF_SHA256, 3: BRIEF_SHA256_V3 };
// The templates version 3 replaces; the rest are the same files for both versions.
export const BRIEF_V3_FILES = ['shared', 'judge', 'appeal'];
const REINSTALL = 'reinstall Council Dial (the plugin, or the whole skills/council-dial folder)';
export const briefDigest = texts => crypto.createHash('sha256').update(JSON.stringify(Object.entries(BRIEF_TEMPLATES).map(([name, need]) => need.map(k => texts[name][k])))).digest('hex');
const briefTexts = new Map();
// Read only when a plan needs briefs, so the other commands don't depend on the templates.
function templates(v = VERSION) {
  if (briefTexts.has(v)) return briefTexts.get(v);
  const out = {};
  for (const [name, need] of Object.entries(BRIEF_TEMPLATES)) {
    const rel = v >= 3 && BRIEF_V3_FILES.includes(name) ? `v3/${name}.md` : `${name}.md`;
    let text;
    try { text = fs.readFileSync(path.join(BRIEF_DIR, rel), 'utf8'); } catch (e) { throw new Error(`Council Dial's brief template briefs/${rel} can't be read (${clean(e.code || e.message, 60)}); ${REINSTALL}`); }
    // Line breaks are read as \n whatever the checkout used, so the briefs are the same on every system.
    text = text.replace(new RegExp('^' + cp(0xfeff)), '').replace(/\r\n?/g, '\n');
    const sections = Object.create(null);
    for (const part of text.split(/^## /m).slice(1)) {
      const nl = part.indexOf('\n');
      const m = nl < 0 ? null : part.slice(nl + 1).match(/^```text\n([\s\S]*?)\n```$/m);
      if (m) sections[part.slice(0, nl).trim()] = m[1];
    }
    for (const s of need) if (!(s in sections)) throw new Error(`Council Dial's brief template briefs/${rel} has no "${s}" text; ${REINSTALL}`);
    out[name] = sections;
  }
  if (briefDigest(out) !== BRIEF_DIGESTS[v]) throw new Error(`the brief templates in Council Dial's briefs/ folder have been changed, so this run's briefs wouldn't match brief version ${v} and it wouldn't compare with other runs; ${REINSTALL}`);
  briefTexts.set(v, out);
  return out;
}
function fill(template, values) {
  return template.replace(/\{\{([a-z-]+)\}\}/g, (_, k) => {
    if (!Object.hasOwn(values, k) || values[k] == null) throw new Error(`a Council Dial brief template has {{${k}}}, which the script doesn't fill in; ${REINSTALL}`);
    return String(values[k]);
  });
}
const shared = v => { const s = templates(v).shared; return { 'what-to-review': null, rules: s.rules, format: s.format }; };
const focusOf = (role, v) => { const s = templates(v).shared, k = `focus: ${role.toLowerCase()}`; return k in s ? s[k] : null; };
const whatToReview = (t, v) => fill(templates(v).shared['what-to-review'], { target: t });

function reviewerBrief(target, role, k, n, sequential, v = VERSION) {
  const r = templates(v).reviewer, focus = role ? focusOf(role, v) : null;
  const lens = fill(r[`${n === 1 ? 'alone' : 'council'}-${role ? (focus ? 'role-area' : 'role') : 'everything'}`], { role, n, k, focus });
  return fill(r[sequential ? 'brief-sequential' : 'brief'], { ...shared(v), lens, 'what-to-review': whatToReview(target, v) });
}
function debateBrief(target, role, label, n, v = VERSION) {
  const d = templates(v).debate;
  const who = role && role !== 'generalist' ? fill(d['who-role'], { role }) : fill(d['who-seat'], { label });
  return fill(d.brief, { ...shared(v), n, who, 'what-to-review': whatToReview(target, v) });
}
// How every merged finding is counted by severity, so the counts add up to the merged count one way.
// The judge's brief gives it as briefs/judge.md's severity-rule; log gives it in these words when the
// counts it's given don't add up (a test keeps the two the same).
export const COUNT_RULE = 'count every merged finding once: a REAL one at its severity, an OVERSTATED one at the judge\'s corrected severity, and a NOT REAL one at the highest severity a reviewer gave it';
export const COUNT_RULE_V3 = 'count every merged finding once: a REAL or PARTLY REAL one at its severity, an OVERSTATED or UNDERSTATED one at the severity the judge set, and a NOT REAL one at the highest severity a reviewer gave it';
export const countRuleOf = v => (v >= 3 ? COUNT_RULE_V3 : COUNT_RULE);
function judgeBrief(target, n, debate, v = VERSION) {
  const j = templates(v).judge;
  return fill(j.brief, { ...shared(v), n, 'what-to-review': whatToReview(target, v), reports: j[debate ? 'reports-after-debate' : 'reports'], 'severity-rule': j['severity-rule'] });
}
// The appeal agent sees only the judge's dismissals and the material: not the target description,
// the reviewers' reports or their briefs, so it reads the dismissed findings without their framing.
function appealBrief(v = VERSION) {
  return fill(templates(v).appeal.brief, shared(v));
}
// A brief must never tell reviewers the target has planted or deliberate problems: that changes how
// they review it, so a run on a sample would look better than it is.
const PRIMING = /\bplanted\b|\bseeded\s+(bugs?|problems?|errors?|flaws?|issues?|mistakes?|defects?)\b|\b(deliberate|intentional)(ly)?\b[^.]{0,40}\b(bugs?|problems?|errors?|flaws?|issues?|mistakes?|defects?)\b|\b(bugs?|problems?|errors?|flaws?|issues?|mistakes?|defects?)\b[^.]{0,40}\b(deliberate(ly)?|intentional(ly)?|on purpose)\b|\bon purpose\b|\bknown\s+(bugs|problems|errors|flaws|issues|mistakes|defects)\b|\b(answer key|expected findings)\b/i;
export function checkTarget(t) {
  const m = t.match(PRIMING);
  if (m) throw new Error(`the description of what to review says "${clean(m[0], 60)}"; give the material's paths and anything out of scope, not whether it has planted, deliberate or known problems, because that changes how the reviewers review it`);
}
function baselineBrief(target, v = VERSION) {
  return fill(templates(v).baseline.brief, { ...shared(v), 'what-to-review': whatToReview(target, v) });
}

function parseRoles(raw) {
  const roles = String(raw).split(',').map(r => clean(r, 60)).filter(Boolean);
  if (!roles.length) throw new Error('--roles needs at least one role, such as "correctness, performance"');
  if (roles.length > 9) throw new Error('give 1 to 9 roles');
  for (const r of roles) if (SHELL_CHARS.test(r) || r.startsWith('-')) throw new Error(`a role can't start with "-" or contain quotation marks or shell characters: ${r}`);
  const seen = new Set();
  for (const r of roles) { if (seen.has(r.toLowerCase())) throw new Error(`role listed twice: ${r}`); seen.add(r.toLowerCase()); }
  return roles;
}
// Each agent's report is saved under a file name made from its label, so two roles that differ only
// in punctuation or non-ASCII letters would share one file, as would the roles "api" and "api debate"
// in a council with a debate round (reviewer: api (debate) and reviewer: api debate). Checked over
// every agent the type starts.
function checkReportNames(type) {
  const files = new Map();
  for (const l of agentLabels(type)) {
    const f = reportName(l);
    if (files.get(f) === l) throw new Error(`two agents would both have the label "${l}", so their reports would go to the same file (${f}); rename a role so every agent's label differs (a role that is another role's name followed by " (debate)" does this in a council with a debate round)`);
    if (files.has(f)) throw new Error(`"${files.get(f)}" and "${l}" would save their reports to the same file (${f}), whose name is made from the letters a to z and digits in an agent's label; rename the roles so those differ`);
    files.set(f, l);
  }
}

// ---- Seats: each reviewer (with its debate turn), the judge, the appeal and the baseline reviewer can
// have its own model and effort. Claude passes them as the Agent tool's model and effort parameters, the
// per-call route Claude Code supports (model takes only the aliases; effort needs Claude Code 2.1.292 or
// later). For each seat, its own --seat-model or --seat-effort entry wins, then a "reviewers" entry for a
// reviewer seat, then --model or --effort for every seat; without any, the seat is left to the default.
// Seats are named by their agent's label, so the log and the type's name never depend on how the user
// typed them.
export function seatIds(type) {
  const rev = Array.from({ length: type.n }, (_, i) => (type.reviewers === 'specialised' && type.roles ? `reviewer: ${type.roles[i]}` : `reviewer ${i + 1}`));
  return [...rev, ...(type.combine === 'judged' ? ['judge'] : []), ...(type.appeal ? ['appeal'] : []), ...(type.baseline ? ['baseline reviewer'] : [])];
}
// The seat an agent sits in: a debate turn belongs to its reviewer's seat.
export const seatOfLabel = label => label.replace(/ \(debate\)$/, '');
function parseSeatList(raw, type, what, check) {
  const ids = seatIds(type), out = new Map();
  let group = null;
  const parts = String(raw).split(';').map(x => x.trim()).filter(Boolean);
  if (!parts.length) throw new Error(`${what} needs one or more seat=value entries, separated by semicolons, such as 'reviewers=sonnet; judge=haiku'`);
  for (const part of parts) {
    const at = part.lastIndexOf('=');
    if (at < 1) throw new Error(`${what}: "${clean(part, 60)}" isn't seat=value`);
    const key = part.slice(0, at).trim().toLowerCase().replace(/\s+/g, ' '), value = check(part.slice(at + 1).trim().toLowerCase(), key);
    let id = null;
    if (key === 'reviewers') { if (group != null) throw new Error(`${what} names reviewers twice`); group = value; continue; }
    if (key === 'judge' || key === 'appeal') id = key;
    else if (key === 'baseline' || key === 'baseline reviewer') id = 'baseline reviewer';
    else if (type.reviewers === 'specialised') id = ids.find(x => x.startsWith('reviewer: ') && [x.toLowerCase(), x.slice(10).toLowerCase()].includes(key)) ?? null;
    else { const m = key.match(/^(?:reviewer )?([1-9])$/); id = m ? `reviewer ${m[1]}` : null; }
    if (!id || !ids.includes(id)) throw new Error(`${what}: this council has no seat "${clean(key, 60)}"; its seats are reviewers, ${ids.map(x => x.startsWith('reviewer: ') ? x.slice(10) : x === 'baseline reviewer' ? 'baseline' : x).join(', ')}`);
    if (out.has(id)) throw new Error(`${what} names ${id} twice`);
    out.set(id, value);
  }
  return { out, group };
}
// Every seat's model and effort as asked for, with where each came from (shown before the run).
export function seatsOf(o, type) {
  const okModel = (v, k) => { if (!MODEL_ALIASES.includes(v)) throw new Error(`--seat-model: the model for ${clean(k, 60)} must be ${MODEL_ALIASES.join(', ')} (the Agent tool takes only these aliases)`); return v; };
  const okEffort = (v, k) => { if (!EFFORT_LEVELS.includes(v)) throw new Error(`--seat-effort: the effort for ${clean(k, 60)} must be ${EFFORT_LEVELS.join(', ')}`); return v; };
  const sm = o.seatModel != null ? parseSeatList(o.seatModel, type, '--seat-model', okModel) : { out: new Map(), group: null };
  const se = o.seatEffort != null ? parseSeatList(o.seatEffort, type, '--seat-effort', okEffort) : { out: new Map(), group: null };
  const pick = (id, own, group, all, flag) => {
    if (own.has(id)) return { value: own.get(id), source: `${flag} (this seat)` };
    if (id.startsWith('reviewer') && id !== 'baseline reviewer' && group != null) return { value: group, source: `${flag} (reviewers)` };
    if (all != null) return { value: all, source: flag === '--seat-model' ? '--model (every seat)' : '--effort (every seat)' };
    return { value: null, source: 'default' };
  };
  return seatIds(type).map(seat => {
    const m = pick(seat, sm.out, sm.group, o.model ?? null, '--seat-model'), e = pick(seat, se.out, se.group, o.effort ?? null, '--seat-effort');
    return { seat, model: m.value, effort: e.value, modelSource: m.source, effortSource: e.source };
  });
}
// The model a seat runs on as far as the plan can tell: CLAUDE_CODE_SUBAGENT_MODEL when forced, else the
// seat's own, else CLAUDE_CODE_SUBAGENT_MODEL, else the main session's; 'inherit' when none is known.
const seatRunsOn = (models, seat) => { const m = models || {}, env = m.env && m.env !== 'inherit' ? m.env : null; return (m.force && env ? env : seat.model ?? env ?? m.main) || 'inherit'; };
// Seats as the log keeps them; rows from before 1.4.0 have none, so every seat had --model, or nothing.
export const typeSeats = type => type.seats ?? seatIds(type).map(seat => ({ seat, model: type.models?.requested ?? null, effort: null }));
function modelSuffix(type) {
  // A row from before 1.4.0 keeps the name it had: its recorded effective model, checked when read.
  if (!type.seats) return type.models?.effective ? ` @${type.models.effective}` : '';
  const seats = typeSeats(type);
  const v = s => `${seatRunsOn(type.models, s)}${s.effort ? `/${s.effort}` : ''}`;
  const vals = seats.map(v);
  if (vals.every(x => x === vals[0])) {
    // One model and effort for every seat: named as before 1.4.0 (@model), with /effort when one was set.
    if (!type.models && !seats[0].effort) return '';
    return vals[0] === 'inherit' ? '' : ` @${vals[0]}`;
  }
  const rev = seats.filter(s => s.seat.startsWith('reviewer') && s.seat !== 'baseline reviewer'), rest = seats.filter(s => !rev.includes(s));
  const rv = rev.map(v), parts = [];
  if (rv.every(x => x === rv[0])) parts.push(`reviewers=${rv[0]}`);
  else {
    const named = rev.map(s => [s.seat.startsWith('reviewer: ') ? s.seat.slice(10).toLowerCase() : s.seat, v(s)]);
    if (type.reviewers === 'specialised') named.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    parts.push(...named.map(([k, x]) => `${k}=${x}`));
  }
  for (const s of rest) parts.push(`${s.seat === 'baseline reviewer' ? 'baseline' : s.seat}=${v(s)}`);
  return ` @{${parts.join(', ')}}`;
}

// The type's name, always rebuilt from the type itself (never read back from the log), so every run of
// the same council gets the same name. Custom roles are marked, in lower case and sorted, so they
// aren't compared as if they were the default council, and role order or case doesn't split a type.
export function labelOf(type) {
  const roles = Array.isArray(type.roles) ? type.roles.map(r => r.toLowerCase()).sort() : null;
  const custom = type.reviewers === 'specialised' && roles && roles.join('|') !== [...DEFAULT_ROLES].sort().join('|');
  return `${type.reviewers}-${type.n}${custom ? ` [${roles.join(', ')}]` : ''}/${type.combine}${type.debate ? '+debate' : ''}${type.sequential ? '+sequential' : ''}${type.appeal ? '+appeal' : ''}${type.briefVersion >= 3 ? ` v${type.briefVersion}` : ''}${modelSuffix(type)}`;
}

// The model the subagents run on, as far as the main session can tell. Claude Code's order: the
// Agent call's model (--model), then the agent type's own model (none for the general-purpose agent),
// then CLAUDE_CODE_SUBAGENT_MODEL, then the main session's model; CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1
// makes the variable win over everything. The model a subagent actually ran on isn't reported back
// to the main session, so this records what was asked for.
export function resolveModels(o, env = {}) {
  const warnings = [];
  let envModel = env.CLAUDE_CODE_SUBAGENT_MODEL ? String(env.CLAUDE_CODE_SUBAGENT_MODEL).trim() : null;
  if (envModel && envModel !== 'inherit' && !isModelName(envModel)) { warnings.push('CLAUDE_CODE_SUBAGENT_MODEL is set to something Council Dial can\'t read as a model (an alias, or a Claude model id such as claude-opus-5-5), so it isn\'t recorded'); envModel = null; }
  const envSets = !!envModel && envModel !== 'inherit';
  const force = envSets && ['1', 'true'].includes(String(env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE ?? '').trim().toLowerCase());
  const main = o.mainModel ?? null;
  const effective = force ? envModel : (o.model ?? (envSets ? envModel : main));
  if (force && o.model && o.model !== envModel) warnings.push(`CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set, so every subagent runs on ${envModel}, not --model ${o.model}`);
  if (!main) warnings.push(`no --main-model given, so the log doesn't record this session's model${effective ? '' : ' or the model the subagents inherit'}`);
  return { models: { main, requested: o.model ?? null, env: envModel, force, effective }, warnings };
}
// How many agents each step of a type starts (at most: the appeal runs only if the judge dismisses something).
export function stepCounts(type) {
  return { review: type.n, debate: type.debate ? type.n : 0, combine: type.combine === 'judged' ? 1 : 0, appeal: type.appeal ? 1 : 0, baseline: type.baseline ? 1 : 0 };
}

// The council type the options describe, and its name: shared by plan and estimate, so an estimate
// looks up exactly the type that plan would log.
export function councilType(o, env = {}) {
  const appeal = o.combine === 'judged' && !o.noAppeal;
  const roles = o.reviewers === 'specialised' ? (o.roles != null ? parseRoles(o.roles) : DEFAULT_ROLES) : null;
  if (roles && o.n != null && o.n !== roles.length) throw new Error(`--n is ${o.n} but there are ${roles.length} roles; leave --n out for specialised reviewers`);
  const n = roles ? roles.length : (o.n ?? 3);
  if (n < 2 && (o.debate || o.combine === 'consensus')) throw new Error('debate and consensus need at least 2 reviewers');
  const { models, warnings: modelWarnings } = resolveModels(o, env);
  const type = { reviewers: o.reviewers, n, roles, combine: o.combine, debate: o.debate, sequential: o.sequential, baseline: o.baseline, appeal, models, briefVersion: o.briefVersion ?? VERSION };
  checkReportNames(type);
  const seats = seatsOf(o, type);
  type.effort = o.effort ?? null;
  type.seats = seats.map(({ seat, model, effort }) => ({ seat, model, effort }));
  if (models.force && models.env) {
    const off = seats.filter(x => x.model && x.model !== models.env && x.modelSource !== '--model (every seat)');
    if (off.length) modelWarnings.push(`CLAUDE_CODE_SUBAGENT_MODEL_FORCE is set, so every subagent runs on ${models.env}, not the model asked for these seats: ${off.map(x => `${x.seat} (${x.model})`).join(', ')}`);
  }
  return { type, label: labelOf(type), modelWarnings, seats };
}
// The most agents a type can start (its plan), counting the appeal agent whenever the type has one.
const plannedAgents = type => Object.values(stepCounts(type)).reduce((s, x) => s + x, 0);
// The agents a logged run had: every step's, and the appeal only if it ran.
const agentsOf = (type, res) => ({ ...stepCounts(type), appeal: type.appeal && res?.appeal?.ran === true ? 1 : 0 });
const agentsHad = (type, res) => Object.values(agentsOf(type, res)).reduce((s, x) => s + x, 0);
// Whether a results row lists exactly the agents the run had (one per seat, at its step). Tokens and
// the critical path are worked out only from a complete list, so a run with an agent left out
// doesn't look cheaper or quicker than it was.
export function agentsComplete(type, res) {
  const ag = res?.agents;
  if (!ag?.length) return false;
  const c = agentsOf(type, res);
  return STEPS.every(s => ag.filter(a => a.step === s).length === c[s]);
}

// The session's effort level, from CLAUDE_EFFORT. Council Dial doesn't set effort; this records the
// session's level as the plan saw it, not the level each subagent actually ran at, which isn't
// reported to the main session. It's kept out of the type's name for now.
export function sessionEffortOf(env = {}) {
  const raw = env.CLAUDE_EFFORT == null ? '' : String(env.CLAUDE_EFFORT).trim().toLowerCase();
  if (!raw) return { effort: null, warnings: [] };
  if (!EFFORT_LEVELS.includes(raw)) return { effort: null, warnings: [`CLAUDE_EFFORT is set to something Council Dial can't read as an effort level (${EFFORT_LEVELS.join(', ')}), so it isn't recorded`] };
  return { effort: raw, warnings: [] };
}

// CLAUDE_CODE_EFFORT_LEVEL, when set, takes precedence over every other effort setting in Claude Code:
// /effort, --effort, the effortLevel and modelSettings settings, a subagent definition's effort field and
// the Agent tool's per-call effort parameter (an effort cap, maxEffortLevel, still applies). It can come from
// the shell Claude Code was started from or from the env block of any settings file, which wins over the
// shell, and Claude Code passes it to the script either way. auto and unset make Claude Code send no effort
// level. plan warns when it's set and records it, so per-seat effort can't silently not apply.
export const EFFORT_OVERRIDE_VALUES = [...EFFORT_LEVELS, 'auto', 'unset'];
const OVERRIDE_HOW = "which overrides every other effort setting, including /effort, --effort, the effortLevel and modelSettings settings, any effort set for a seat in an agent definition, and the Agent tool's per-call effort parameter; it can come from your shell or from the env block of a settings file";
export function effortOverrideOf(env = {}) {
  const raw = env.CLAUDE_CODE_EFFORT_LEVEL == null ? '' : String(env.CLAUDE_CODE_EFFORT_LEVEL).trim().toLowerCase();
  if (!raw) return { override: null, warnings: [] };
  if (!EFFORT_OVERRIDE_VALUES.includes(raw)) return { override: null, warnings: [`CLAUDE_CODE_EFFORT_LEVEL is set, ${OVERRIDE_HOW}. Its value isn't one Council Dial can read (${EFFORT_OVERRIDE_VALUES.join(', ')}), so it isn't recorded, and the level the agents run at isn't known`] };
  const effect = raw === 'auto' || raw === 'unset'
    ? "Claude Code sends no effort level, so every agent in this run gets the API's default for its model"
    : `every agent in this run runs at ${raw}, or lower if an effort cap applies or its model doesn't support ${raw}`;
  return { override: raw, warnings: [`CLAUDE_CODE_EFFORT_LEVEL is set to ${raw}, ${OVERRIDE_HOW}: ${effect}. Per-seat effort settings won't apply; to use them, start Claude Code without it (the README says how)`] };
}

// ---- The effort a seat gets when none is passed. On the session's model it's the session's level (from
// CLAUDE_EFFORT). On another model it's the level saved for that model, or a top-level effortLevel that
// applies to it, in the highest-precedence settings file that has one (managed, then local, then
// project, then user); otherwise the model's default. Claude Code's docs give this order, and a test in
// scratch projects confirmed a saved level reaches a subagent on that model. Only the effort keys are
// read from each file; nothing else in it is kept, logged or passed on. The user's settings file is
// read only with --read-effort-settings. MDM, registry and server-managed policies and --settings files
// can't be read, so the level shown is the one these files give.
export const MODEL_OF_ALIAS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' };
export const defaultEffortOf = m => (/^claude-(opus|sonnet|haiku)-5-5$/.test(m) ? 'medium' : m === 'claude-opus-4-7' ? 'xhigh' : 'high');
const SAVED_LEVELS = ['low', 'medium', 'high', 'xhigh'];
const familyOf = m => (m && /^claude-(opus|sonnet|haiku|fable)-/.exec(m)?.[1]) || null;
const bareId = m => (m ? String(m).replace(/\[1m\]$/, '') : null);
// The model id a seat runs on, as far as the plan can tell (null when it can't): an alias in the
// session model's family is the session's model, as the sub-agents docs say.
export function seatModelId(models, seat) {
  const r = seatRunsOn(models, seat);
  if (r === 'inherit') return null;
  if (MODEL_ALIASES.includes(r)) { const main = bareId(models?.main); return familyOf(main) === r ? main : MODEL_OF_ALIAS[r]; }
  return bareId(r);
}
export const MANAGED_SETTINGS_DIR = process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code';
function effortKeysOf(file, warnings, what) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile() || st.size > 1024 * 1024) return null;
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(new RegExp('^' + cp(0xfeff)), '')); } catch { warnings.push(`${what} couldn't be read as JSON, so its effort settings weren't checked`); return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const lvl = (x, all) => (typeof x === 'string' && (all ? EFFORT_LEVELS : SAVED_LEVELS).includes(x) ? x : null);
  const models = {};
  if (j.modelSettings && typeof j.modelSettings === 'object' && !Array.isArray(j.modelSettings)) {
    for (const [k, x] of Object.entries(j.modelSettings)) if (x && typeof x === 'object') models[String(k).toLowerCase()] = { effortLevel: lvl(x.effortLevel, false), maxEffortLevel: lvl(x.maxEffortLevel, true) };
  }
  return { effortLevel: lvl(j.effortLevel, false), maxEffortLevel: lvl(j.maxEffortLevel, true), models };
}
export function effortSettingsOf(project, env = {}, { readUser = false, managedDir = MANAGED_SETTINGS_DIR } = {}) {
  const warnings = [], sources = [], checked = [];
  // Managed: managed-settings.json, then managed-settings.d/*.json in alphabetical order, later values winning.
  let managed = null;
  const mfiles = [path.join(managedDir, 'managed-settings.json')];
  try { mfiles.push(...fs.readdirSync(path.join(managedDir, 'managed-settings.d')).filter(n => n.endsWith('.json') && !n.startsWith('.')).sort().map(n => path.join(managedDir, 'managed-settings.d', n))); } catch {}
  for (const mf of mfiles) {
    const k = effortKeysOf(mf, warnings, 'a managed settings file');
    if (!k) continue;
    managed ??= { effortLevel: null, maxEffortLevel: null, models: {} };
    if (k.effortLevel) managed.effortLevel = k.effortLevel;
    if (k.maxEffortLevel) managed.maxEffortLevel = k.maxEffortLevel;
    for (const [m, x] of Object.entries(k.models)) managed.models[m] = { ...managed.models[m], ...Object.fromEntries(Object.entries(x).filter(([, v]) => v)) };
  }
  checked.push('managed');
  if (managed) sources.push({ kind: 'managed', where: 'managed settings', ...managed });
  for (const [kind, rel, where] of [['local', '.claude/settings.local.json', 'project local settings (.claude/settings.local.json)'], ['project', '.claude/settings.json', 'project settings (.claude/settings.json)']]) {
    const k = effortKeysOf(path.join(project, rel), warnings, where);
    checked.push(kind);
    if (k) sources.push({ kind, where, ...k });
  }
  if (readUser) {
    const dir = env.CLAUDE_CONFIG_DIR ? String(env.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
    const k = effortKeysOf(path.join(dir, 'settings.json'), warnings, 'user settings');
    checked.push('user');
    if (k) sources.push({ kind: 'user', where: 'user settings', ...k });
  }
  return { sources, checked, userChecked: readUser, warnings };
}
const entryFor = (src, m) => {
  for (const [k, x] of Object.entries(src.models)) {
    const key = k.replace(/\[1m\]$/, '').replace(/-\d{8}$/, '');
    if (key === m || MODEL_OF_ALIAS[key] === m) return x;
  }
  return null;
};
// A top-level effortLevel in user settings is the older form /effort wrote: it applies to Opus 5, Fable
// 5.1 and earlier models, not to Opus 5.5 and models released after it. Elsewhere it applies to every model.
const topApplies = (src, m) => src.kind !== 'user' || !/-5-5$/.test(m);
const rank = l => EFFORT_LEVELS.indexOf(l);
export function savedEffortOf(settings, m) {
  let level = null, from = null, cap = null, capFrom = null;
  for (const src of settings.sources) {
    const e = entryFor(src, m);
    const l = e?.effortLevel ?? (topApplies(src, m) ? src.effortLevel : null);
    if (l && !level) { level = l; from = src.where; }
    const c = e?.maxEffortLevel ?? src.maxEffortLevel;
    if (c && c !== 'max' && (cap == null || rank(c) < rank(cap))) { cap = c; capFrom = src.where; }
  }
  return { level, from, cap, capFrom };
}
export function expectedEffortOf(seat, models, sessionEffort, effortOverride, settings) {
  const m = seatModelId(models, seat), main = bareId(models?.main);
  if (effortOverride) return { level: effortOverride, source: 'CLAUDE_CODE_EFFORT_LEVEL', model: m, fromSettings: false };
  const saved = m ? savedEffortOf(settings, m) : { cap: null };
  const capped = l => (l && saved.cap && rank(l) > rank(saved.cap) ? saved.cap : l);
  const cap = saved.cap ? `capped at ${saved.cap} by ${saved.capFrom}` : null;
  if (seat.effort) return { level: capped(seat.effort), source: 'asked for', model: m, fromSettings: false, cap: saved.cap && rank(seat.effort) > rank(saved.cap) ? cap : null };
  if (!m || m === main) return { level: sessionEffort, source: sessionEffort ? "the session's level" : "the session's level, which CLAUDE_EFFORT didn't give", model: m, fromSettings: false };
  const unchecked = settings.userChecked ? '' : '; user settings not checked, and a level saved there may apply';
  if (saved.level) return { level: capped(saved.level), source: `saved for ${m} in ${saved.from}`, model: m, fromSettings: true, cap: saved.cap && rank(saved.level) > rank(saved.cap) ? cap : null };
  const d = defaultEffortOf(m);
  return { level: capped(d), source: `${m}'s default${unchecked || ', with no level saved for it in the settings files read'}`, model: m, fromSettings: true, cap: saved.cap && rank(d) > rank(saved.cap) ? cap : null };
}

// One line per seat for Claude to show the user before the run: its model and effort, each marked
// explicit (with the option that set it) or default.
export function seatSummaryOf(seats, models, sessionEffort, effortOverride) {
  return seats.map(x => {
    const model = x.model
      ? `model ${x.model} (explicit, ${x.modelSource})${models?.force && models.env && models.env !== x.model ? `, but CLAUDE_CODE_SUBAGENT_MODEL_FORCE makes it ${models.env}` : ''}`
      : `model: default, ${x.runsOn === 'inherit' ? "the session's model" : models?.env && models.env !== 'inherit' ? `${x.runsOn} (from CLAUDE_CODE_SUBAGENT_MODEL)` : `the session's, ${x.runsOn}`}`;
    const e = x.expected;
    const effort = effortOverride
      ? `effort ${effortOverride} (CLAUDE_CODE_EFFORT_LEVEL overrides ${x.effort ? `the ${x.effort} asked for` : 'every seat'})`
      : x.effort ? `effort ${e.level ?? x.effort} (explicit, ${x.effortSource}${e.cap ? `; ${e.cap}` : ''})`
      : `effort: default, ${e.level ? `${e.level} (${e.source}${e.cap ? `; ${e.cap}` : ''})` : `not known (${e.source})`}`;
    return `${x.seat}: ${model}; ${effort}`;
  });
}

export function buildPlan(o, target, now = new Date(), usedIds = new Set(), env = {}) {
  const t = clean(target, TARGET_MAX);
  if (!t) throw new Error('say what to review on stdin (for example: "the diff of branch fix-parser in this repo: src/parser.mjs and its tests")');
  checkTarget(t);
  const { type: ctype, label, modelWarnings, seats } = councilType(o, env);
  const { appeal, roles, n, models } = ctype;
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  let runId = null;
  for (let tries = 0; tries < 200 && runId == null; tries++) { const id = `${day}-${crypto.randomBytes(2).toString('hex')}`; if (!usedIds.has(id)) runId = id; }
  // A log crowded with today's ids (planted, or very busy): look for a free one in order, or stop.
  for (let i = 0; i < 0x10000 && runId == null; i++) { const id = `${day}-${i.toString(16).padStart(4, '0')}`; if (!usedIds.has(id)) runId = id; }
  if (runId == null) throw new Error('every run id for today is already in the review log; try again tomorrow or use another --log-dir');
  const v = ctype.briefVersion;
  const reviewers = Array.from({ length: n }, (_, i) => ({ label: roles ? `reviewer: ${roles[i]}` : `reviewer ${i + 1}`, role: roles ? roles[i] : 'generalist', brief: reviewerBrief(t, roles ? roles[i] : null, i + 1, n, o.sequential, v) }));
  const steps = [{ step: 'review', how: o.sequential ? 'one at a time, in order; give each reviewer the earlier reports after its brief, each in a <report from="..."> block' : 'all at once, independently; no reviewer sees another\'s report', agents: reviewers }];
  if (o.debate) steps.push({ step: 'debate', how: 'one round: give each debate agent every review report after this brief, each in a <report from="..."> block, with the one from its own seat marked YOURS; start them all at once', agents: reviewers.map(r => ({ label: `${r.label} (debate)`, role: r.role, brief: debateBrief(t, r.role, r.label, n, v) })) });
  if (o.combine === 'judged') steps.push({ step: 'combine', how: 'a fresh judge agent that wrote none of the reports; give it every report (and debate response) after this brief, each in a <report from="..."> block', agents: [{ label: 'judge', role: 'judge', brief: judgeBrief(t, n, o.debate, v) }] });
  if (appeal) steps.push({ step: 'appeal', how: v >= 3
    ? 'after the judge, if it marked any finding NOT REAL, ruled any OVERSTATED or UNDERSTATED, or kept any other at LOW (otherwise skip this agent and say so): a fresh agent that is not a reviewer or the judge; give it, after this brief, the judge\'s NOT REAL findings, each with its title, file and line, what it claimed and the judge\'s reasons, in one <dismissed from="judge"> block, and the severity findings (every OVERSTATED or UNDERSTATED finding, and every other finding kept at LOW), each with its number, title, file and line, what it claimed, each reviewer seat that raised it with the severity it gave, the judge\'s severity and the judge\'s reason or "no reason given", in one <severity from="judge"> block laid out exactly as SKILL.md section 4 gives, with one fixed label per field, leaving out a block that would be empty; then where the material is. Never give it the reviewers\' reports, any other brief, the description of what to review, or any model or effort. It doesn\'t overrule the judge: report each finding it marks WRONGLY DISMISSED, TOO LOW, TOO HIGH or UNSURE with both views, and let the user make the call'
    : 'after the judge, only if it marked any finding NOT REAL (otherwise skip this agent and say so): a fresh agent that is not a reviewer or the judge; give it, after this brief, the judge\'s NOT REAL findings, each with the judge\'s reasons, in one <dismissed from="judge"> block, then where the material is. Never give it the reviewers\' reports, any other brief or the description of what to review. It doesn\'t overrule the judge: report each finding it marks WRONGLY DISMISSED or UNSURE with both views, and let the user make the call', agents: [{ label: 'appeal', role: 'appeal', brief: appealBrief(v) }] });
  if (o.combine === 'pooled') steps.push({ step: 'combine', how: `no agent: you (the main session) list every finding from every report${o.debate ? ', and the new findings from the debate round' : ''}, merging exact duplicates only; nothing is dropped or verified`, agents: [] });
  if (o.combine === 'consensus') steps.push({ step: 'combine', how: `no agent: you (the main session) match findings across reports; keep those raised by at least ${Math.floor(n / 2) + 1} of ${n} reviewers${o.debate ? ' (counting AGREE in the debate round)' : ''} as the council's findings, and list the rest as minority findings`, agents: [] });
  if (o.baseline) steps.push({ step: 'baseline', how: 'start this agent together with the reviewers (in the same message as the review step), give it the material only, and never show it the council\'s reports; its findings are kept separate for comparison', agents: [{ label: 'baseline reviewer', role: 'baseline', brief: baselineBrief(t, v) }] });
  const warnings = [];
  if (o.combine === 'consensus' && (o.sequential || o.reviewers === 'specialised')) warnings.push(`consensus with ${o.sequential ? 'sequential reviewers (told not to repeat each other)' : 'specialised reviewers (each on its own area)'} keeps few findings, because reviewers rarely raise the same one`);
  warnings.push(...modelWarnings);
  const { effort: sessionEffort, warnings: effortWarnings } = sessionEffortOf(env);
  warnings.push(...effortWarnings);
  const { override: effortOverride, warnings: overrideWarnings } = effortOverrideOf(env);
  warnings.push(...overrideWarnings);
  const agentCount = steps.reduce((s, x) => s + x.agents.length, 0);
  // Each agent gets its seat's model and effort, for Claude to pass as the Agent tool's parameters
  // (null: leave the parameter out). They never go into a brief, so the judge and the appeal can't tell
  // which model or effort produced a report.
  const seatOf = l => seats.find(x => x.seat === seatOfLabel(l));
  // Brief version 3 forbids running anything unless the user allowed running code, and plan enforces it:
  // every agent is the plugin's read-only agent (Read, Grep and Glob only) unless --allow-running-code
  // is given. Version 2 runs keep the general-purpose agent they always had, so they stay comparable.
  const toolLimits = v >= 3 && !o.allowRunningCode;
  const agentType = toolLimits ? READER_AGENT : 'general-purpose';
  for (const st of steps) for (const a of st.agents) { const x = seatOf(a.label); a.model = x.model; a.effort = x.effort; a.agentType = agentType; }
  const explicitEffort = seats.filter(x => x.effort);
  if (effortOverride && explicitEffort.length) warnings.push(`because CLAUDE_CODE_EFFORT_LEVEL is set, the effort asked for these seats won't apply: ${explicitEffort.map(x => `${x.seat} (${x.effort})`).join(', ')}`);
  const settings = effortSettingsOf(o.project ?? process.cwd(), env, { readUser: o.readEffortSettings, managedDir: o.managedSettingsDir });
  const seatList = seats.map(x => ({ seat: x.seat, model: x.model, modelSource: x.modelSource, runsOn: seatRunsOn(models, x), effort: x.effort, effortSource: x.effortSource, expected: expectedEffortOf(x, models, sessionEffort, effortOverride, settings) }));
  const dependsOnSettings = seatList.filter(x => x.expected.fromSettings);
  if (!settings.userChecked && dependsOnSettings.length) warnings.push(`user settings weren't checked (plan with --read-effort-settings to check them), so a level saved there for ${[...new Set(dependsOnSettings.map(x => x.expected.model))].join(', ')} may apply to ${dependsOnSettings.map(x => x.seat).join(', ')}`);
  for (const w of settings.warnings) warnings.push(w);
  return {
    runId, version: v, label, target: t, sessionEffort, effortOverride,
    runningCode: o.allowRunningCode ? 'allowed' : 'not allowed', toolLimits, agentType,
    effortSettings: { checked: settings.checked, userChecked: settings.userChecked },
    seats: seatList, seatSummary: seatSummaryOf(seatList, models, sessionEffort, effortOverride),
    type: { reviewers: o.reviewers, n, roles, combine: o.combine, debate: o.debate, sequential: o.sequential, baseline: o.baseline, appeal, models, effort: ctype.effort, seats: ctype.seats },
    agentCount, agentModel: o.model ?? null, steps, warnings,
    resultsTemplate: {
      findingsPerReviewer: reviewers.map(() => 0), findingsCombined: 0, confirmed: 0, ...(v >= 3 ? { partlyReal: 0 } : {}), overstated: 0, ...(v >= 3 ? { understated: 0 } : {}), dismissed: 0, verified: null, severity: { high: 0, med: 0, low: 0 }, baseline: o.baseline ? { findings: 0, confirmed: 0, alsoFoundByCouncil: 0 } : null, appeal: appeal ? { ran: false, reviewed: 0, items: [], ...(v >= 3 ? { severityReviewed: 0, severityItems: [] } : {}) } : null,
      agents: steps.flatMap(s => s.agents.map(a => ({ label: a.label, step: s.step, model: a.model ?? 'inherit', effort: a.effort, tokens: null, toolUses: null, durationMs: null }))),
      severityChanges: o.combine === 'judged' ? [] : null, deviations: [], wallMinutes: null, notes: '',
    },
  };
}

// ---- The log: append-only JSON Lines; review-log.md is rebuilt from it.
const int = (v, what, max = 100000) => { if (v == null) return 0; if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${what} must be a whole number from 0 to ${max}`); return v; };
const num = (v, what) => { if (v == null) return 0; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000) throw new Error(`${what} must be a number of 0 or more`); return Math.round(v * 10) / 10; };

// strict (when writing): the counts must add up. Reading an existing log checks only that the values
// are well formed, so rows written by an earlier version aren't lost.
// --input <file>: the text Claude wrote with its Write tool, read as UTF-8. Only a plain file (not a
// link, a folder or a device) of at most 4 MB is read; nothing else about the file is used.
export const MAX_INPUT_BYTES = 4 * 1024 * 1024;
export function readInputFile(file) {
  const f = path.resolve(String(file));
  let st; try { st = fs.lstatSync(f); } catch (e) { if (e.code === 'ENOENT') throw new Error(`--input: there's no file at ${f}`); throw e; }
  if (st.isSymbolicLink()) throw new Error('--input is a link; give the file itself');
  if (!st.isFile()) throw new Error('--input must be a file');
  if (st.size > MAX_INPUT_BYTES) throw new Error(`--input is ${st.size} bytes; the most Council Dial reads is ${MAX_INPUT_BYTES}`);
  return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
}
// A background agent's completion notice can show <, > and & as &lt;, &gt; and &amp;. With
// --notice-escaped, report turns those three back into the characters, in one pass, so &amp;lt; becomes
// &lt; as the agent wrote it, and says so in the report's header; log then records it for the agent.
export const UNESCAPED_NOTE = 'Its text came from a completion notice that showed <, > and & as &lt;, &gt; and &amp;; Council Dial turned';
export function unescapeNotice(text) {
  let count = 0;
  const out = String(text ?? '').replace(/&(lt|gt|amp);/g, (_, e) => { count++; return e === 'lt' ? '<' : e === 'gt' ? '>' : '&'; });
  return { text: out, count };
}
// Escaped throughout: some &lt;, &gt; or &amp;, and no <, > or & left as itself (a notice that escapes does
// so everywhere, so any of those means the agent typed the entity itself, such as in a code span).
const looksEscaped = t => /&(lt|gt|amp);/.test(t) && !/[<>]/.test(t) && !/&(?!(lt|gt|amp);)/.test(t);

// Severity changes: for each merged finding whose final severity differs from at least one reviewer's,
// Claude lists the reviewers' severities, the judge's, and the judge's reason when it gave one (the
// judge brief doesn't ask it to). log works out which way it went.
export const SEVERITIES = ['low', 'med', 'high'];
const sevOf = (v, what) => { const k = String(v ?? '').trim().toLowerCase().replace(/^medium$/, 'med'); if (!SEVERITIES.includes(k)) throw new Error(`${what} must be HIGH, MED or LOW`); return k; };
export function severityChangeOf(reviewers, judge) {
  const r = reviewers.map(x => SEVERITIES.indexOf(x)), j = SEVERITIES.indexOf(judge), lo = Math.min(...r), hi = Math.max(...r);
  if (lo === hi && j === hi) return null;
  if (j > hi) return 'raised above every reviewer';
  if (j < lo) return 'lowered below every reviewer';
  if (j === hi) return 'took the highest reviewer severity';
  if (j === lo) return 'took the lowest reviewer severity';
  return 'between the reviewers\' severities';
}
function checkSeverityChanges(list) {
  if (list == null) return null;
  if (!Array.isArray(list)) throw new Error('severityChanges must be a list, one entry per merged finding whose severity differs from any reviewer\'s');
  if (list.length > 50) throw new Error('severityChanges can have at most 50 entries');
  return list.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`severityChanges[${i}] must be an object: {"finding": "<run id>/judge/M4", "reviewers": ["MED", "HIGH"], "judge": "HIGH", "reason": "<the judge's reason, or null>"}`);
    const finding = clean(x.finding, 120);
    if (!finding) throw new Error(`severityChanges[${i}].finding needs the finding's citation, such as <run id>/judge/M4`);
    if (!Array.isArray(x.reviewers) || !x.reviewers.length || x.reviewers.length > 9) throw new Error(`severityChanges[${i}].reviewers must list each reviewer's severity for it (1 to 9)`);
    const reviewers = x.reviewers.map((v, k) => sevOf(v, `severityChanges[${i}].reviewers[${k}]`));
    const judge = sevOf(x.judge, `severityChanges[${i}].judge`);
    const change = severityChangeOf(reviewers, judge);
    if (!change) throw new Error(`severityChanges[${i}] isn't a change: every reviewer and the judge gave ${judge.toUpperCase()}`);
    const reason = x.reason == null ? null : clean(x.reason, 400) || null;
    return { finding, reviewers, judge, change, reason };
  });
}
// Deviations: anything Claude did differently from SKILL.md, such as text added to an agent's prompt or
// a report passed another way, each with the exact text it added or changed.
function checkDeviations(list) {
  if (list == null) return null;
  if (!Array.isArray(list)) throw new Error('deviations must be a list of strings, one per departure from SKILL.md, each with the exact text added or changed');
  if (list.length > 20) throw new Error('deviations can have at most 20 entries');
  return list.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`deviations[${i}] must be a string`);
    const t = x.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').replace(HIDDEN, '').trim();
    if (!t) throw new Error(`deviations[${i}] is empty`);
    if (t.length > 2000) throw new Error(`deviations[${i}] is ${t.length} characters; the most is 2000`);
    return t;
  });
}

export function checkResults(r, strict = true, version = 2) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('give the results as a JSON object on stdin (the plan\'s resultsTemplate shows the fields)');
  if (r.findingsPerReviewer != null && !Array.isArray(r.findingsPerReviewer)) throw new Error('findingsPerReviewer must be a list of numbers');
  const per = (r.findingsPerReviewer || []).map((x, i) => int(x, `findingsPerReviewer[${i}]`));
  const out = {
    findingsPerReviewer: per, findingsCombined: int(r.findingsCombined, 'findingsCombined'), confirmed: int(r.confirmed, 'confirmed'), partlyReal: int(r.partlyReal, 'partlyReal'), overstated: int(r.overstated, 'overstated'), understated: int(r.understated, 'understated'), dismissed: int(r.dismissed, 'dismissed'),
    severity: { high: int(r.severity?.high, 'severity.high'), med: int(r.severity?.med, 'severity.med'), low: int(r.severity?.low, 'severity.low') },
    baseline: r.baseline && typeof r.baseline === 'object' ? { findings: int(r.baseline.findings, 'baseline.findings'), confirmed: int(r.baseline.confirmed, 'baseline.confirmed'), alsoFoundByCouncil: int(r.baseline.alsoFoundByCouncil, 'baseline.alsoFoundByCouncil') } : null,
    appeal: checkAppeal(r.appeal, version, strict),
    agents: checkAgents(r.agents, strict),
    severityChanges: checkSeverityChanges(r.severityChanges),
    deviations: checkDeviations(r.deviations),
    notes: notesOf(r.notes, strict),
  };
  // Minutes come in two labelled measures: wallMinutes (wall time, from the start to when the last
  // agent finished, given by Claude) and criticalPathMinutes (worked out by log from the agents'
  // reported durations). Rows logged before 1.3.0 have only wallMinutes, which could be either, so
  // reading one gives it as unlabelledMinutes. A row is from 1.3.0 or later if it has
  // criticalPathMinutes (null when it couldn't be worked out).
  const mins = (v, what) => { if (v == null) return null; const m = num(v, what); return m > 0 ? m : null; };
  if (strict) {
    if (r.criticalPathMinutes != null) throw new Error('leave criticalPathMinutes out: log works it out from the agents\' durationMs');
    if (r.wallMinutes === 0) throw new Error('wallMinutes is 0; give null if you didn\'t note when the last agent finished');
    Object.assign(out, { wallMinutes: mins(r.wallMinutes, 'wallMinutes'), criticalPathMinutes: null, unlabelledMinutes: null });
  } else if (Object.hasOwn(r, 'criticalPathMinutes')) Object.assign(out, { wallMinutes: mins(r.wallMinutes, 'wallMinutes'), criticalPathMinutes: mins(r.criticalPathMinutes, 'criticalPathMinutes'), unlabelledMinutes: null });
  else Object.assign(out, { wallMinutes: null, criticalPathMinutes: null, unlabelledMinutes: mins(r.wallMinutes, 'wallMinutes') });
  if (r.verified != null && typeof r.verified !== 'boolean') throw new Error('verified must be true, false or left out');
  const checked = out.confirmed + out.partlyReal + out.overstated + out.understated + out.dismissed;
  // verified: true is accepted only when every combined finding was checked (confirmed + overstated +
  // dismissed add up to findingsCombined). Left out, a run with findings but none of the three counted
  // is unverified.
  if (strict && version < 3 && (out.partlyReal || out.understated)) throw new Error(`brief version ${version} has no PARTLY REAL or UNDERSTATED rulings; leave partlyReal and understated at 0`);
  if (strict && r.verified === true && checked !== out.findingsCombined) throw new Error(`verified is true, but ${version >= 3 ? 'confirmed + partlyReal + overstated + understated + dismissed don\'t' : 'confirmed + overstated + dismissed don\'t'} add up to findingsCombined; check every finding, or set verified to false`);
  out.verified = r.verified ?? !(out.findingsCombined > 0 && checked === 0);
  if (!strict) return out;
  if (checked > out.findingsCombined) throw new Error(`${version >= 3 ? 'confirmed + partlyReal + overstated + understated + dismissed' : 'confirmed + overstated + dismissed'} is more than findingsCombined`);
  // Severity counts every combined finding once (a NOT REAL one at the highest severity a reviewer
  // gave it), so when they are given they add up to findingsCombined exactly.
  const sev = out.severity.high + out.severity.med + out.severity.low;
  if (sev && sev !== out.findingsCombined) throw new Error(`the severity counts add up to ${sev}, not findingsCombined (${out.findingsCombined}); ${countRuleOf(version)}`);
  if (out.baseline && (out.baseline.confirmed > out.baseline.findings || out.baseline.alsoFoundByCouncil > out.baseline.findings)) throw new Error('baseline confirmed and alsoFoundByCouncil can\'t be more than baseline findings');
  if (out.appeal && out.appeal.reviewed > out.dismissed) throw new Error('appeal.reviewed can\'t be more than dismissed (the appeal sees only the findings the judge dismissed)');
  return out;
}
// Each subagent that ran: its seat, the model asked for, and the tokens, tool uses and time Claude
// Code reported for it (null where nothing was reported).
const nint = (v, what) => (v == null ? null : int(v, what, 1e10));
// A seat's effort as log records it: the level Claude passed to the Agent tool, or, when it passed
// none, "not overridden (session: <level>)"; CLAUDE_CODE_EFFORT_LEVEL, when it was set, is named instead.
const SEAT_EFFORT = /^(?:(?:low|medium|high|xhigh|max)|not overridden \(session: (?:low|medium|high|xhigh|max|not recorded)(?:; if this seat's model isn't the session's, that model's default applies)?\)|CLAUDE_CODE_EFFORT_LEVEL: (?:low|medium|high|xhigh|max|auto|unset)(?: \(overrode (?:low|medium|high|xhigh|max)\))?)$/;
export function seatEffortOf(run, agent) {
  const asked = EFFORT_LEVELS.includes(agent.effort) ? agent.effort : null;
  if (run.effortOverride) return `CLAUDE_CODE_EFFORT_LEVEL: ${run.effortOverride}${asked ? ` (overrode ${asked})` : ''}`;
  if (asked) return asked;
  return `not overridden (session: ${run.sessionEffort ?? 'not recorded'}${agent.model === 'inherit' ? '' : "; if this seat's model isn't the session's, that model's default applies"})`;
}
function checkAgents(list, strict = true) {
  if (list == null) return null;
  if (!Array.isArray(list)) throw new Error('agents must be a list, one entry per subagent that ran');
  if (list.length > 25) throw new Error('agents can have at most 25 entries');
  return list.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`agents[${i}] must be an object: {"label": "reviewer: correctness", "step": "review", "model": "inherit", "tokens": 44000, "toolUses": 3, "durationMs": 41000}`);
    const label = clean(x.label, 80);
    if (!label) throw new Error(`agents[${i}].label needs the agent's label from the plan`);
    if (!STEPS.includes(x.step)) throw new Error(`agents[${i}].step must be ${STEPS.join(', ')}`);
    const model = x.model == null ? 'inherit' : String(x.model);
    if (model !== 'inherit' && !isModelName(model)) throw new Error(`agents[${i}].model must be inherit, ${MODEL_ALIASES.join(', ')} or a Claude model id such as claude-opus-5-5`);
    // Given by Claude, effort is the level it passed to the Agent tool, or left out; read back, it's what log wrote.
    let effort = null;
    if (x.effort != null) {
      if (strict && !EFFORT_LEVELS.includes(x.effort)) throw new Error(`agents[${i}].effort is the effort you passed to the Agent tool for it (${EFFORT_LEVELS.join(', ')}); leave it out if you passed none`);
      effort = typeof x.effort === 'string' && x.effort.length <= 200 && SEAT_EFFORT.test(x.effort) ? x.effort : null;
    }
    const out = { label, step: x.step, model, effort, tokens: nint(x.tokens, `agents[${i}].tokens`), toolUses: nint(x.toolUses, `agents[${i}].toolUses`), durationMs: nint(x.durationMs, `agents[${i}].durationMs`) };
    // A note on anything the agent did that its brief didn't ask for: a line of text, cut to AGENT_NOTES_MAX.
    if (x.notes != null) {
      if (typeof x.notes !== 'string') { if (strict) throw new Error(`agents[${i}].notes must be a line of text (a JSON string)`); }
      else { const n = clean(x.notes, AGENT_NOTES_MAX); if (n) out.notes = n; }
    }
    if (!strict && Object.hasOwn(x, 'reportUnescaped')) out.reportUnescaped = typeof x.reportUnescaped === 'boolean' ? x.reportUnescaped : null;
    return out;
  });
}
// The appeal: whether it ran, how many dismissed findings it checked, and each one it flagged
// (WRONGLY DISMISSED or UNSURE) with the user's call on it.
export const APPEAL_VIEWS = ['wrongly dismissed', 'unsure'];
export const APPEAL_CALLS = ['reinstated', 'upheld', 'pending'];
// Brief version 3's appeal also checks severities: one item per finding in its severity block (every
// OVERSTATED or UNDERSTATED finding, and every other finding kept at LOW), fair ones included, so how
// often it disagrees, and on which kind, can be judged later.
export const SEVERITY_VIEWS = ['fair', 'too low', 'too high', 'unsure'];
export const SEVERITY_CALLS = ['kept', 'changed', 'pending'];
function checkSeverityItems(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error('appeal.severityItems must be a list, one per finding in the appeal\'s severity block');
  if (list.length > 50) throw new Error('appeal.severityItems can have at most 50 entries');
  return list.map((x, i) => {
    const w = `appeal.severityItems[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${w} must be an object: {"finding": "<run id>/judge/M4: <short title>", "reviewers": ["MED"], "judge": "LOW", "view": "too low", "appealSeverity": "MED", "call": "pending"}`);
    const finding = clean(x.finding, 120);
    if (!finding) throw new Error(`${w}.finding needs the finding's citation and a short title`);
    if (!Array.isArray(x.reviewers) || !x.reviewers.length || x.reviewers.length > 9) throw new Error(`${w}.reviewers must list each reviewer's severity for it (1 to 9)`);
    const reviewers = x.reviewers.map((v, k) => sevOf(v, `${w}.reviewers[${k}]`));
    const judge = sevOf(x.judge, `${w}.judge`);
    const changed = severityChangeOf(reviewers, judge) != null && SEVERITIES.indexOf(judge) !== Math.max(...reviewers.map(r => SEVERITIES.indexOf(r)));
    if (!changed && judge !== 'low') throw new Error(`${w} isn't a severity finding: the judge kept it at ${judge.toUpperCase()}, the highest reviewer's severity, and only changed severities and LOW findings go to the appeal`);
    if (!SEVERITY_VIEWS.includes(x.view)) throw new Error(`${w}.view must be ${SEVERITY_VIEWS.join(', ')}`);
    let appealSeverity = x.appealSeverity == null ? null : sevOf(x.appealSeverity, `${w}.appealSeverity`);
    if (x.view === 'too low' && !(appealSeverity && SEVERITIES.indexOf(appealSeverity) > SEVERITIES.indexOf(judge))) throw new Error(`${w}: TOO LOW needs appealSeverity above the judge's ${judge.toUpperCase()}`);
    if (x.view === 'too high' && !(appealSeverity && SEVERITIES.indexOf(appealSeverity) < SEVERITIES.indexOf(judge))) throw new Error(`${w}: TOO HIGH needs appealSeverity below the judge's ${judge.toUpperCase()}`);
    if (x.view === 'fair' || x.view === 'unsure') appealSeverity = null;
    if (!SEVERITY_CALLS.includes(x.call)) throw new Error(`${w}.call must be ${SEVERITY_CALLS.join(', ')}`);
    if (x.view === 'fair' && x.call !== 'kept') throw new Error(`${w}: the appeal found the severity fair, so call is kept`);
    return { finding, kind: changed ? 'changed' : 'kept at low', reviewers, judge, view: x.view, appealSeverity, call: x.call };
  });
}
// strict is false when a row is read back from the log, where the run's brief version isn't known here,
// so only log (strict) checks that a version 2 run has no severity items.
function checkAppeal(a, version = 2, strict = true) {
  if (a == null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) throw new Error('appeal must be an object: {"ran": true, "reviewed": 2, "items": [...]}');
  if (a.ran != null && typeof a.ran !== 'boolean') throw new Error('appeal.ran must be true or false');
  if (a.items != null && !Array.isArray(a.items)) throw new Error('appeal.items must be a list');
  if ((a.items || []).length > 50) throw new Error('appeal.items can have at most 50 entries');
  const items = (a.items || []).map((x, i) => {
    if (!x || typeof x !== 'object') throw new Error(`appeal.items[${i}] must be an object: {"finding": "short title", "view": "wrongly dismissed", "call": "pending"}`);
    const finding = clean(x.finding, 120);
    if (!finding) throw new Error(`appeal.items[${i}].finding needs a short title`);
    if (!APPEAL_VIEWS.includes(x.view)) throw new Error(`appeal.items[${i}].view must be ${APPEAL_VIEWS.join(' or ')}`);
    if (!APPEAL_CALLS.includes(x.call)) throw new Error(`appeal.items[${i}].call must be ${APPEAL_CALLS.join(', ')}`);
    return { finding, view: x.view, call: x.call };
  });
  const out = { ran: !!a.ran, reviewed: int(a.reviewed, 'appeal.reviewed'), items };
  const sev = checkSeverityItems(a.severityItems);
  if (sev.length || a.severityReviewed != null) {
    if (strict && version < 3 && sev.length) throw new Error(`brief version ${version}'s appeal checks dismissals only; leave severityItems out`);
    out.severityReviewed = int(a.severityReviewed, 'appeal.severityReviewed');
    out.severityItems = sev;
    if (out.severityReviewed !== sev.length) throw new Error('appeal.severityItems must have one entry per severity finding the appeal checked, fair ones included, so it has as many as appeal.severityReviewed');
  }
  if (!out.ran && (out.reviewed || items.length || out.severityReviewed)) throw new Error('appeal.ran is false, so leave appeal.reviewed and appeal.severityReviewed at 0 and the items empty');
  if (items.length > out.reviewed) throw new Error('appeal.items has more entries than appeal.reviewed');
  return out;
}
export function checkUpdate(r, strict = true) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('give the recheck results as a JSON object on stdin');
  const out = { fixesMade: int(r.fixesMade, 'fixesMade'), fixesFailedRecheck: int(r.fixesFailedRecheck, 'fixesFailedRecheck'), regressions: int(r.regressions, 'regressions'), newFindings: int(r.newFindings, 'newFindings'), notes: notesOf(r.notes, strict) };
  if (out.fixesFailedRecheck > out.fixesMade) throw new Error('fixesFailedRecheck can\'t be more than fixesMade');
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// Rows that don't pass the same checks as when they were written (a damaged or planted log) are
// skipped and counted, never used.
export function readLog(file) {
  const rows = [];
  let skipped = 0;
  if (!fs.existsSync(file)) return Object.assign(rows, { skipped });
  const text = fs.readFileSync(file, 'utf8').replace(new RegExp('^' + cp(0xfeff)), '');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!r || typeof r !== 'object' || !RUN_ID.test(r.runId) || typeof r.time !== 'string' || !ISO.test(r.time)) throw new Error('bad row');
      if (r.kind === 'planned') {
        if (!r.type || typeof r.type !== 'object' || !REVIEWERS.includes(r.type.reviewers) || !COMBINE.includes(r.type.combine) || !Number.isInteger(r.type.n) || r.type.n < 1 || r.type.n > 9) throw new Error('bad type');
        // Specialised rows always record their roles; one without them is read with the default
        // roles only if it has as many reviewers. Roles that don't match the reviewer count make it a
        // bad row, so it can't be read with the wrong roles under a wrong name.
        let roles = null;
        if (r.type.reviewers === 'specialised') {
          if (Array.isArray(r.type.roles)) {
            if (r.type.roles.length !== r.type.n || !r.type.roles.every(x => typeof x === 'string')) throw new Error('bad roles');
            // A role with a comma is dropped: a rerun's --roles splits on commas, so it would come back
            // as two roles. The roles then no longer match the reviewer count, so the row is bad.
            roles = r.type.roles.map(x => clean(x, 60).replace(new RegExp(SHELL_CHARS.source, 'gu'), '')).filter(x => !x.includes(','));
            if (roles.length !== r.type.n) throw new Error('bad roles');
          } else if (r.type.roles == null && r.type.n === DEFAULT_ROLES.length) roles = DEFAULT_ROLES;
          else throw new Error('bad roles');
        }
        // Rows from version 1 have no appeal field: those runs had no appeal step.
        // Rows before 1.2.0 have no models: those runs' models weren't recorded. Only an alias or a
        // Claude model id (claude-..., see CLAUDE_MODEL_ID) is read as a model; anything else is
        // dropped, so a planted row can't put text into the type's name or setup's rerun command.
        const m = r.type.models && typeof r.type.models === 'object' ? r.type.models : null;
        const mid = v => (typeof v === 'string' && CLAUDE_MODEL_ID.test(v) ? v : null);
        // The effective model is always one of the other three (see resolveModels), so any other
        // value is dropped too.
        let models = null;
        if (m) {
          models = { main: mid(m.main), requested: MODEL_ALIASES.includes(m.requested) ? m.requested : null, env: m.env === 'inherit' ? 'inherit' : (MODEL_ALIASES.includes(m.env) ? m.env : mid(m.env)), force: m.force === true, effective: null };
          const eff = isModelName(m.effective) ? m.effective : null;
          if (eff && [models.requested, models.env, models.main].includes(eff)) models.effective = eff;
        }
        const type = { reviewers: r.type.reviewers, n: r.type.n, combine: r.type.combine, debate: !!r.type.debate, sequential: !!r.type.sequential, baseline: !!r.type.baseline, appeal: r.type.combine === 'judged' && r.type.appeal === true, roles, models };
        // Rows from 1.4.0 record every seat's model and effort as asked for. Each must be this type's
        // seat, in order, with an alias or null and an effort level or null; otherwise the row is bad,
        // so a planted row can't give a run a name it didn't have.
        if (r.type.seats != null) {
          const ids = seatIds(type);
          if (!Array.isArray(r.type.seats) || r.type.seats.length !== ids.length) throw new Error('bad seats');
          type.seats = r.type.seats.map((x, i) => {
            if (!x || typeof x !== 'object' || typeof x.seat !== 'string' || clean(x.seat, 80).toLowerCase() !== ids[i].toLowerCase()) throw new Error('bad seats');
            if (x.model != null && !MODEL_ALIASES.includes(x.model)) throw new Error('bad seats');
            if (x.effort != null && !EFFORT_LEVELS.includes(x.effort)) throw new Error('bad seats');
            return { seat: ids[i], model: x.model ?? null, effort: x.effort ?? null };
          });
          type.effort = EFFORT_LEVELS.includes(r.type.effort) ? r.type.effort : null;
        }
        type.briefVersion = Number.isInteger(r.version) ? r.version : 1;
        // The label is rebuilt from the type, never taken from the line, so a planted or cut label
        // can't rename a run or merge two types.
        rows.push({ kind: 'planned', runId: r.runId, time: r.time, version: Number.isInteger(r.version) ? r.version : 1, councilDial: typeof r.councilDial === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.councilDial) ? r.councilDial : null, label: labelOf(type), target: clean(r.target, TARGET_MAX), type,
          // Rows from 1.3.0 have sessionEffort (null when CLAUDE_EFFORT wasn't set); older rows don't.
          effortRecorded: Object.hasOwn(r, 'sessionEffort'), sessionEffort: EFFORT_LEVELS.includes(r.sessionEffort) ? r.sessionEffort : null,
          // Rows from 1.3.8 have effortOverride (null when CLAUDE_CODE_EFFORT_LEVEL wasn't set); older rows don't.
          overrideRecorded: Object.hasOwn(r, 'effortOverride'), effortOverride: EFFORT_OVERRIDE_VALUES.includes(r.effortOverride) ? r.effortOverride : null,
          runningCode: ['allowed', 'not allowed'].includes(r.runningCode) ? r.runningCode : null, userEffortChecked: r.effortSettings?.userChecked === true });
      } else if (r.kind === 'results') rows.push({ kind: 'results', runId: r.runId, time: r.time, results: checkResults(r.results, false) });
      else if (r.kind === 'update') rows.push({ kind: 'update', runId: r.runId, time: r.time, update: checkUpdate(r.update, false) });
      else throw new Error('bad kind');
    } catch { skipped++; }
  }
  return Object.assign(rows, { skipped });
}
// One view per run: the plan, its latest results, and its rechecks. A second "planned" row with
// an id already seen is ignored, so it can't hide a run's results.
export function runsFrom(rows) {
  const runs = new Map();
  for (const r of rows) {
    if (r.kind === 'planned') { if (!runs.has(r.runId)) runs.set(r.runId, { runId: r.runId, time: r.time, version: r.version, councilDial: r.councilDial, label: r.label, target: r.target, type: r.type, effortRecorded: r.effortRecorded, sessionEffort: r.sessionEffort, overrideRecorded: r.overrideRecorded, effortOverride: r.effortOverride, runningCode: r.runningCode, userEffortChecked: r.userEffortChecked, results: null, resultsLogged: 0, updates: [] }); continue; }
    const run = runs.get(r.runId);
    if (!run) continue;
    // Logging a run again replaces its results; resultsLogged counts how often, so the Markdown can say so.
    if (r.kind === 'results') { run.results = r.results; run.resultsLogged++; }
    if (r.kind === 'update') run.updates.push(r.update);
  }
  return [...runs.values()];
}

const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const one = v => Math.round(v * 10) / 10;
// A run's total tokens, only when every agent the run had is listed with its tokens (null otherwise),
// so a run with an agent left out, or with gaps, doesn't look cheaper than it was.
const runUsageTotal = (type, res) => (agentsComplete(type, res) && res.agents.every(x => x.tokens != null) ? res.agents.reduce((s, x) => s + x.tokens, 0) : null);
// Kept findings are the ones that survive judging, REAL or OVERSTATED: an OVERSTATED finding is a real
// problem rated too high, so it counts as found. How often the judge cut a kept finding's severity
// is reported separately, as the overstated share of kept findings.
const kept = res => res.confirmed + (res.partlyReal ?? 0) + res.overstated + (res.understated ?? 0);
export function compare(runs) {
  const groups = new Map();
  for (const r of runs) {
    const g = groups.get(r.label) || { label: r.label, planned: 0, runs: 0, verifiedRuns: 0, combined: 0, combinedVerified: 0, kept: 0, overstated: 0, dismissed: 0, wall: [0, 0], path: [0, 0], unlabelled: [0, 0], fixes: 0, failedFixes: 0, regressions: 0, rechecked: 0, baselineRuns: 0, baselineConfirmed: 0, councilKeptWithBaseline: 0, appealRuns: 0, appealReviewed: 0, appealFlagged: 0, appealReinstated: 0, appealPending: 0, understated: 0, sevRuns: 0, sevChanged: 0, sevChangedFlagged: 0, sevLow: 0, sevLowFlagged: 0, sevChangedByUser: 0, usageRuns: 0, tokens: 0, appealUsageRuns: 0, appealUsage: 0 };
    g.planned++;
    groups.set(r.label, g);
    if (!r.results) continue;
    const res = r.results;
    g.runs++; g.combined += res.findingsCombined;
    // Each measure of minutes is averaged only over the runs that have it, never mixed.
    for (const [k, v] of [['wall', res.wallMinutes], ['path', res.criticalPathMinutes], ['unlabelled', res.unlabelledMinutes]]) if (v != null) { g[k][0]++; g[k][1] += v; }
    if (res.verified) { g.verifiedRuns++; g.combinedVerified += res.findingsCombined; g.kept += kept(res); g.overstated += res.overstated; g.understated += res.understated ?? 0; g.dismissed += res.dismissed; }
    if (r.updates.length) g.rechecked++;
    for (const u of r.updates) { g.fixes += u.fixesMade; g.failedFixes += u.fixesFailedRecheck; g.regressions += u.regressions; }
    if (res.baseline && res.verified) { g.baselineRuns++; g.baselineConfirmed += res.baseline.confirmed; g.councilKeptWithBaseline += kept(res); }
    // Only runs planned with the appeal step count here; a run where the judge dismissed nothing
    // (appeal.ran false) counts as a run with nothing to appeal.
    if (r.type.appeal && r.results.appeal) {
      const a = r.results.appeal;
      g.appealRuns++; g.appealReviewed += a.reviewed; g.appealFlagged += a.items.length;
      g.appealReinstated += a.items.filter(x => x.call === 'reinstated').length; g.appealPending += a.items.filter(x => x.call === 'pending').length;
      // The severity check, split by kind, so the LOW findings with no severity change, the part that
      // costs most, can be judged on how often the appeal disagrees with the judge there.
      if (a.severityItems) {
        g.sevRuns++;
        for (const x of a.severityItems) {
          const flagged = x.view !== 'fair';
          if (x.kind === 'changed') { g.sevChanged++; if (flagged) g.sevChangedFlagged++; } else { g.sevLow++; if (flagged) g.sevLowFlagged++; }
          if (x.call === 'changed') g.sevChangedByUser++;
        }
      }
    }
    // The appeal agent's tokens count only from a run whose total counts, so both figures come from
    // the same runs (a complete run lists every agent with its tokens).
    const t = runUsageTotal(r.type, res);
    if (t != null) {
      g.usageRuns++; g.tokens += t;
      const ap = res.agents.find(x => x.step === 'appeal');
      if (ap) { g.appealUsageRuns++; g.appealUsage += ap.tokens; }
    }
  }
  const avg = ([k, sum]) => (k ? { perRun: one(sum / k), runs: k } : null);
  const all = [...groups.values()].map(g => ({
    label: g.label, runs: g.runs,
    findingsPerRun: g.runs ? one(g.combined / g.runs) : null,
    keptPercent: ratio(g.kept, g.combinedVerified), dismissedPercent: ratio(g.dismissed, g.combinedVerified),
    overstatedOfKeptPercent: ratio(g.overstated, g.kept), understatedOfKeptPercent: ratio(g.understated, g.kept),
    minutes: { wall: avg(g.wall), criticalPath: avg(g.path), unlabelled: avg(g.unlabelled) },
    fixesFailedRecheckPercent: ratio(g.failedFixes, g.fixes), regressionsPerRecheckedRun: g.rechecked ? one(g.regressions / g.rechecked) : null,
    baseline: g.baselineRuns ? { runs: g.baselineRuns, councilKeptPerRun: one(g.councilKeptWithBaseline / g.baselineRuns), baselineConfirmedPerRun: one(g.baselineConfirmed / g.baselineRuns) } : null,
    appeal: g.appealRuns ? { runs: g.appealRuns, dismissedChecked: g.appealReviewed, flagged: g.appealFlagged, reinstated: g.appealReinstated, pending: g.appealPending, ...(g.sevRuns ? { severity: { runs: g.sevRuns, changedChecked: g.sevChanged, changedFlagged: g.sevChangedFlagged, lowUnchangedChecked: g.sevLow, lowUnchangedFlagged: g.sevLowFlagged, changedByUser: g.sevChangedByUser } } : {}) } : null,
    tokensPerRun: g.usageRuns ? Math.round(g.tokens / g.usageRuns) : null, usageRuns: g.usageRuns,
    appealUsagePerRun: g.appealUsageRuns ? Math.round(g.appealUsage / g.appealUsageRuns) : null,
    unverifiedRuns: g.runs - g.verifiedRuns, unfinishedRuns: g.planned - g.runs,
  })).sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label));
  return Object.assign(all.slice(0, MAX_GROUPS), { more: Math.max(0, all.length - MAX_GROUPS) });
}

// A rough token estimate for a council type before it runs: the average total tokens of the logged
// runs of exactly that type that have every agent's tokens. It writes nothing and gives no prices.
export function estimateOf(runs, type, label) {
  const same = runs.filter(r => r.label === label);
  const logged = same.filter(r => r.results);
  const counted = logged.map(r => ({ r, tokens: runUsageTotal(r.type, r.results) })).filter(x => x.tokens != null);
  const agentCount = plannedAgents(type);
  const quick = type.reviewers === 'generalist' && type.combine === 'pooled' && type.n <= 3 && !type.debate && !type.baseline;
  const trial = `a smaller trial run first: ${quick ? '' : 'a Quick council (3 generalist reviewers, pooled), or '}this council on one part of the material, logged like any other run`;
  const notes = [];
  let tokens = null;
  if (counted.length) {
    const all = counted.map(x => x.tokens);
    tokens = { perRun: Math.round(all.reduce((s, x) => s + x, 0) / all.length), low: Math.min(...all), high: Math.max(...all), runs: all.length };
    notes.push(`About ${tokens.perRun} tokens: the average of ${tokens.runs} logged ${tokens.runs === 1 ? 'run' : 'runs'} of ${label}${tokens.runs > 1 ? ` (${tokens.low} to ${tokens.high})` : ''}.${tokens.runs < 3 ? ' So few runs make this a very rough guide.' : ''}`);
  } else notes.push(`No logged run of ${label} has every agent's tokens, so there's no estimate for it. If the material is more than 5 files or a whole folder, or you can't tell how many files it covers, suggest ${trial}; its tokens then give a guide for the full run. For up to 5 named files, a trial isn't needed.`);
  if (logged.length > counted.length) notes.push(`${logged.length - counted.length} other logged ${logged.length - counted.length === 1 ? 'run' : 'runs'} of this type ${logged.length - counted.length === 1 ? 'is' : 'are'} left out because not every agent's tokens were reported.`);
  notes.push('Bigger material costs more: every reviewer reads all of it (and debate agents and the judge also read every report), so material larger than those runs reviewed (see basedOn) uses more tokens than this.');
  if (counted.length) notes.push(`If the material looks large, suggest ${trial}.`);
  if (type.appeal) notes.push((type.briefVersion ?? VERSION) >= 3
    ? `${agentCount} agents counts the appeal agent, which runs if the judge throws a finding out or there's a severity to check (a changed severity, or a finding kept at LOW), so in nearly every judged council.`
    : `${agentCount} agents counts the appeal agent, which runs only if the judge throws a finding out.`);
  notes.push(`These are logged context sizes, not billed tokens: each subagent's figure is what Claude Code reported when it finished, which its monitoring docs describe as roughly the subagent's context size at completion (its final request, cached tokens included), not a sum across its requests. Compare runs with them; don't read them as cost. Council Dial gives no prices.`);
  return {
    label, agentCount, tokens, loggedRuns: logged.length, trialSuggested: !counted.length,
    basedOn: counted.slice(-5).map(({ r, tokens: t }) => ({ runId: r.runId, date: r.time.slice(0, 10), target: clean(r.target, 120), tokens: t })),
    notes,
  };
}

const minutesText = (wall, crit, unlabelled) => [wall != null && `wall ${wall}`, crit != null && `critical path ${crit}`, unlabelled != null && `${unlabelled} (unlabelled)`].filter(Boolean).join(', ') || '-';

// The agents' critical path in minutes, from their reported durations: the reviewers (the slowest, or
// all of them one after another when sequential), then the slowest debate agent, the judge and the
// appeal; the baseline runs alongside. Null unless every agent that ran is listed with a duration.
export function criticalPathOf(type, res) {
  if (!agentsComplete(type, res) || res.agents.some(a => a.durationMs == null)) return null;
  const of = s => res.agents.filter(a => a.step === s).map(a => a.durationMs);
  const [review, debate, combine, appeal, baseline] = STEPS.map(of);
  const sum = xs => xs.reduce((s, x) => s + x, 0), max = xs => Math.max(0, ...xs);
  const ms = Math.max((type.sequential ? sum(review) : max(review)) + max(debate) + sum(combine) + sum(appeal), max(baseline));
  return ms > 0 ? Math.round(ms / 6000) / 10 : null;
}

function markdown(runs) {
  const pct = v => (v == null ? '-' : `${v}%`);
  const dash = v => (v == null ? '-' : v);
  const L = ['# Review log', '', 'Written by Council Dial from review-log.jsonl; edits here are replaced on the next run.', '', '## Runs', ''];
  if (!runs.length) L.push('No runs yet.', '');
  else {
    L.push('| Run | Date | Type | Target | Findings | Kept (overstated) | Dismissed | Minutes | Tokens (context sizes) | Fixes failed recheck | Baseline confirmed | Appeal |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of runs) {
      const res = r.results, fx = r.updates.reduce((a, u) => ({ made: a.made + u.fixesMade, failed: a.failed + u.fixesFailedRecheck }), { made: 0, failed: 0 });
      const sv = res?.appeal?.severityItems?.length ? `; severity ${res.appeal.severityItems.filter(x => x.view !== 'fair').length} of ${res.appeal.severityItems.length} flagged, ${res.appeal.severityItems.filter(x => x.call === 'changed').length} changed` : '';
      const ap = r.type.appeal && res?.appeal ? (res.appeal.ran ? `${res.appeal.items.length} of ${res.appeal.reviewed} flagged, ${res.appeal.items.filter(x => x.call === 'reinstated').length} reinstated${sv}` : (r.version >= 3 ? 'nothing to check' : 'nothing dismissed')) : '-';
      // The tokens reported, marked whenever the total isn't the run's whole total (and so isn't counted
      // in tokens per run): "k of n agents" when fewer than the run's agents have them, whether an
      // agent's tokens are missing or the agent was left out; "k listed, run had n" when the row lists
      // more agents than the run had (possible only in rows logged before 1.3.0); and "agents don't
      // match the run's steps" when the count is right but the steps aren't.
      const listed = res?.agents ?? [], known = listed.filter(x => x.tokens != null);
      const had = res ? agentsHad(r.type, res) : 0;
      const mark = listed.length > had ? ` (${listed.length} listed, run had ${had}${known.length < listed.length ? `, ${known.length} with tokens` : ''})`
        : known.length < had ? ` (${known.length} of ${had} agents)`
        : !agentsComplete(r.type, res) ? " (agents don't match the run's steps)" : '';
      const tok = known.length ? `${known.reduce((s, x) => s + x.tokens, 0)}${mark}` : '-';
      const min = res ? minutesText(res.wallMinutes, res.criticalPathMinutes, res.unlabelledMinutes) : '-';
      const found = res ? `${res.findingsCombined}${r.resultsLogged > 1 ? ' (re-logged)' : ''}` : 'not logged';
      L.push(`| ${r.runId} | ${cell(r.time.slice(0, 10))} | ${cell(r.label)} | ${cell(r.target)} | ${found} | ${res ? (res.verified ? `${kept(res)} (${res.overstated}${res.understated ? `, ${res.understated} raised` : ''})` : 'unverified') : '-'} | ${res ? (res.verified ? res.dismissed : '-') : '-'} | ${min} | ${tok} | ${r.updates.length ? `${fx.failed} of ${fx.made}` : '-'} | ${res?.baseline ? res.baseline.confirmed : '-'} | ${ap} |`);
    }
    L.push('');
    const noted = runs.filter(r => r.results && (r.results.severityChanges?.length || r.results.deviations?.length || r.results.agents?.some(a => a.reportUnescaped || a.notes) || r.results.appeal?.severityItems?.length));
    if (noted.length) {
      L.push('## Severity changes, severity appeals, deviations, unescaped reports and agent notes', '');
      for (const r of noted) {
        const res = r.results, parts = [];
        if (res.severityChanges?.length) parts.push(`${res.severityChanges.length} severity ${res.severityChanges.length === 1 ? 'change' : 'changes'}: ${res.severityChanges.map(x => `${cell(x.finding)} ${x.reviewers.map(v => v.toUpperCase()).join('/')} to ${x.judge.toUpperCase()} (${x.change}${x.reason ? '' : ', no reason given'})`).join('; ')}`);
        // Every severity verdict the appeal gave, fair ones included, split by kind.
        const si = res.appeal?.severityItems ?? [];
        if (si.length) {
          const kind = k => si.filter(x => x.kind === k), fl = l => l.filter(x => x.view !== 'fair').length;
          parts.push(`Appeal on severity: ${si.length} checked (${kind('changed').length} changed severities, ${fl(kind('changed'))} flagged; ${kind('kept at low').length} unchanged LOW findings, ${fl(kind('kept at low'))} flagged): ${si.map(x => `${cell(x.finding)} judge ${x.judge.toUpperCase()}, ${x.view.toUpperCase()}${x.appealSeverity ? ` (${x.appealSeverity.toUpperCase()})` : ''}${x.view === 'fair' ? '' : `, ${x.call}`}`).join('; ')}`);
        }
        if (res.deviations?.length) parts.push(`${res.deviations.length} ${res.deviations.length === 1 ? 'deviation' : 'deviations'} from SKILL.md (their exact text is in review-log.jsonl)`);
        const un = (res.agents || []).filter(a => a.reportUnescaped).map(a => cell(a.label));
        if (un.length) parts.push(`Reports unescaped from a completion notice: ${un.join(', ')}`);
        const an = (res.agents || []).filter(a => a.notes).map(a => `${cell(a.label)}: ${inlineMd(a.notes, AGENT_NOTES_MAX)}`);
        if (an.length) parts.push(`Agent notes: ${an.join('; ')}`);
        L.push(`- ${r.runId}: ${parts.join('. ')}.`);
      }
      L.push('');
    }
  }
  const c = compare(runs);
  L.push('## By type', '');
  if (!c.length) L.push('No runs yet.', '');
  else {
    const runsOf = k => `${k} ${k === 1 ? 'run' : 'runs'}`;
    const minCell = m => [m.wall && `wall ${m.wall.perRun} (${runsOf(m.wall.runs)})`, m.criticalPath && `critical path ${m.criticalPath.perRun} (${runsOf(m.criticalPath.runs)})`, m.unlabelled && `unlabelled ${m.unlabelled.perRun} (${runsOf(m.unlabelled.runs)})`].filter(Boolean).join(', ') || '-';
    L.push('| Type | Runs | Findings per run | Kept | Dismissed | Kept but severity cut | Minutes per run | Tokens per run, as context sizes (appeal agent) | Fixes that failed recheck | Regressions per rechecked run | Council kept vs baseline confirmed (per run) | Appeal: dismissals flagged, reinstated | Unverified runs | Planned, not logged |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const g of c) L.push(`| ${cell(g.label)} | ${g.runs} | ${dash(g.findingsPerRun)} | ${pct(g.keptPercent)} | ${pct(g.dismissedPercent)} | ${pct(g.overstatedOfKeptPercent)}${g.understatedOfKeptPercent ? ` (raised: ${pct(g.understatedOfKeptPercent)})` : ''} | ${minCell(g.minutes)} | ${g.tokensPerRun == null ? '-' : `${g.tokensPerRun}${g.appealUsagePerRun != null ? ` (${g.appealUsagePerRun})` : ''}`} | ${pct(g.fixesFailedRecheckPercent)} | ${dash(g.regressionsPerRecheckedRun)} | ${g.baseline ? `${g.baseline.councilKeptPerRun} vs ${g.baseline.baselineConfirmedPerRun} (${runsOf(g.baseline.runs)})` : '-'} | ${g.appeal ? `${g.appeal.flagged} of ${g.appeal.dismissedChecked}, ${g.appeal.reinstated} reinstated${g.appeal.pending ? `, ${g.appeal.pending} pending` : ''}${g.appeal.severity ? `; severity: ${g.appeal.severity.changedFlagged} of ${g.appeal.severity.changedChecked} changed and ${g.appeal.severity.lowUnchangedFlagged} of ${g.appeal.severity.lowUnchangedChecked} unchanged LOW flagged, ${g.appeal.severity.changedByUser} changed by you` : ''}` : '-'} | ${g.unverifiedRuns} | ${g.unfinishedRuns} |`);
    if (c.more) L.push('', `(${c.more} more types not shown.)`);
    L.push('', 'Kept is the share of combined findings that survived checking, REAL or OVERSTATED (an OVERSTATED finding is a real problem rated too high); dismissed is the share marked NOT REAL. Kept but severity cut is the share of kept findings marked OVERSTATED, which shows how far the reviewers\' severities had to be corrected; with brief version 3, "raised" is the share marked UNDERSTATED, rated higher than any reviewer did. Brief version 3 types end in v3 and are kept apart from version 2 types. In version 3 the appeal also checks severities: the table shows how often it disagreed on the severities the judge changed, and on the LOW findings it left unchanged, separately, so you can judge whether checking those is worth its cost. All three count only verified runs. The baseline\'s findings are counted confirmed or not, with no OVERSTATED bucket, so a real baseline finding counts as confirmed even if its severity was too high; its confirmed count is the counterpart of the council\'s kept count.', '', 'Minutes are of two kinds and never averaged together: wall time, from the start to when the last agent finished, and the critical path, worked out from the agents\' reported times (the slowest reviewer, then each later step), which leaves out Claude\'s own time between steps. Both are wall-clock time: an agent\'s reported duration includes any time it spent waiting for you to approve a permission prompt (in Claude Code\'s Manual mode), so neither is pure model time. Minutes logged before Council Dial 1.3.0 are unlabelled, because they could be either; logging the run again labels them.', '', 'Tokens are logged context sizes, not billed totals: each agent\'s figure is what Claude Code reported when it finished, roughly its context size at completion (its final request, cached tokens included), not a sum across its requests, so a run\'s figure is the sum of its agents\' context sizes, usually well below the tokens processed across all their requests. Use it to compare runs, not as cost. Tokens per run count only runs where every agent the run had is listed with the tokens Claude Code reported for it, and so does the appeal agent\'s figure in brackets. A type ending in @ and a model was run on that model (as asked for; Claude Code doesn\'t report the model a subagent actually ran on to the main session); one ending in @{...} gives each seat\'s model, and /low, /high and so on give an effort level that was set for a seat. Small numbers of runs say little; compare types on the same kind of target.', '', 'Where a run\'s reports were saved, they are in the folder named by its run id, next to this file. Finding numbers restart in every run, so cite them with the run id and the report, such as 20261107-2f23/judge/M12 or 20261107-2f23/reviewer-correctness/2.', '');
  }
  return L.join('\n');
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text, { flag: 'wx' });
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, file); break; } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 10) throw new Error(`couldn't save ${path.basename(file)} (${e.code}); is it open somewhere that locks it?`);
        sleep(100);
      }
    }
  } finally { fs.rmSync(tmp, { force: true }); }
}

// Appends one row, starting a new line if a hand edit left the file without a final newline, then
// rebuilds the Markdown. A Markdown failure is reported, not thrown, so the caller still gets its run id.
// A warning when the notes given were longer than NOTES_MAX and so were cut (null otherwise).
function notesCut(raw, what) {
  const n = Array.from(clean(raw?.notes, Infinity)).length;
  return n > NOTES_MAX ? `notes were cut to ${NOTES_MAX} characters (they had ${n}), so the log keeps the first ${NOTES_MAX - 1} and an ellipsis; ${what}` : null;
}
const warnings = (...w) => w.filter(Boolean).join('; ') || null;
function append(p, row) {
  fs.mkdirSync(p.dir, { recursive: true });
  let prefix = '';
  try { const st = fs.statSync(p.jsonl); if (st.size) { const fd = fs.openSync(p.jsonl, 'r'); const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, st.size - 1); fs.closeSync(fd); if (b[0] !== 0x0a) prefix = '\n'; } } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.appendFileSync(p.jsonl, prefix + JSON.stringify(row) + '\n');
  try { writeAtomic(p.md, markdown(runsFrom(readLog(p.jsonl)))); return null; } catch (e) { return `the log was saved, but review-log.md couldn't be rebuilt (${e.message})`; }
}

// ---- Saved reports: one Markdown file per agent in <log dir>/<run id>/, so anyone can read what each
// agent found and what the judge threw out and why.
// Every agent a type can start, with the step it belongs to, in plan order.
export function agentSteps(type) {
  const rev = Array.from({ length: type.n }, (_, i) => (type.reviewers === 'specialised' && type.roles ? `reviewer: ${type.roles[i]}` : `reviewer ${i + 1}`));
  return [...rev.map(label => ({ label, step: 'review' })), ...(type.debate ? rev.map(l => ({ label: `${l} (debate)`, step: 'debate' })) : []), ...(type.combine === 'judged' ? [{ label: 'judge', step: 'combine' }] : []), ...(type.appeal ? [{ label: 'appeal', step: 'appeal' }] : []), ...(type.baseline ? [{ label: 'baseline reviewer', step: 'baseline' }] : [])];
}
export const agentLabels = type => agentSteps(type).map(a => a.label);
const reportName = label => `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent'}.md`;
const MAX_REPORT = 200000;
// Finding numbers (a reviewer's 1, 2, 3, the judge's M1, M2) restart in every run, so anything
// Council Dial writes cites them with the run id and the report's name: 20261107-2f23/judge/M12.
export const citeAs = (runId, n) => `${runId}/${n}`;
function saveReport(p, run, label, input, now, { replace = false, savedLater = false, noticeEscaped = false } = {}) {
  // Kept as written, apart from line endings, control characters and invisible characters, and, with
  // --notice-escaped, the notice's &lt;, &gt; and &amp; turned back into <, > and &.
  if (noticeEscaped && !looksEscaped(String(input ?? ''))) throw new Error("--notice-escaped is only for a report escaped throughout, and this one has a <, a > or an & that isn't part of &lt;, &gt; or &amp;, so it wasn't escaped (the agent typed any entities itself); save it without --notice-escaped");
  const un = noticeEscaped ? unescapeNotice(input) : { text: String(input ?? ''), count: 0 };
  const text = un.text.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').replace(HIDDEN, '').replace(/^\n+|\s+$/g, '');
  if (!text) throw new Error('give the agent\'s full report on stdin');
  if (text.length > MAX_REPORT) throw new Error(`the report is ${text.length} characters; the most Council Dial saves is ${MAX_REPORT}`);
  const dir = path.join(p.dir, run.runId);
  for (const f of [dir, path.join(dir, reportName(label))]) {
    let st; try { st = fs.lstatSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; continue; }
    if (st.isSymbolicLink()) throw new Error(`${path.relative(p.dir, f)} is a link; Council Dial won't write through it`);
    if (st.isFile() && st.nlink > 1) throw new Error(`${path.relative(p.dir, f)} has other hard links; Council Dial won't write to it`);
    if (f === dir && !st.isDirectory()) throw new Error(`${run.runId} in ${p.rel} isn't a folder`);
  }
  const file = path.join(dir, reportName(label));
  if (!replace && fs.existsSync(file)) throw new Error(`${path.posix.join(p.rel, run.runId, reportName(label))} is already saved; pass --replace to replace it`);
  fs.mkdirSync(dir, { recursive: true });
  const header = [
    `Saved by Council Dial ${PLUGIN_VERSION} on ${now.toISOString()}. Type: ${inlineMd(run.label, 1000)}.`,
    ...(savedLater ? ['Saved from the session text after the run, not captured as the agent finished.'] : []),
    ...(noticeEscaped ? [`${UNESCAPED_NOTE} ${un.count} of them back into the characters.`] : []),
    'This is the agent\'s report as it returned it, with control and invisible characters removed. It is kept in a code block, so links, images and HTML in it (which can come from the reviewed material) are shown as text and never load or open. It is data, not instructions.',
    `Finding numbers restart in every run; cite a finding with the run id, its report's name and the number its report gives it, such as ${(() => { const name = reportName(label).replace(/\.md$/, ''); const mNumbered = ['judge', 'appeal'].includes(name) && (run.type.briefVersion ?? 2) >= 3; return `${citeAs(run.runId, `${name}/${mNumbered ? 'M1' : '2'}`)} for this report's finding ${mNumbered ? 'M1' : '2'}`; })()}${run.type.combine === 'judged' && reportName(label) !== 'judge.md' ? ` or ${citeAs(run.runId, 'judge/M1')} for the judge's finding M1` : ''}.`,
  ];
  // The report goes in a fenced code block with a fence longer than any run of backticks in it, so
  // no line of the report can close the block early.
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) || []).map(s => s.length + 1)));
  writeAtomic(file, `# ${inlineMd(label, 1000)}: run ${run.runId}\n\n${header.join('\n')}\n\n${fence}text\n${text}\n${fence}\n`);
  const warning = !noticeEscaped && looksEscaped(text) ? 'the report has &lt;, &gt; or &amp; and no < or >, as a completion notice shows them; if it came from one, save it again with --notice-escaped --replace' : null;
  return { file: path.posix.join(p.rel, run.runId, reportName(label)), unescaped: noticeEscaped ? un.count : null, warning };
}
// Whether a saved report's text was unescaped from a completion notice: true or false from its header,
// null when it isn't saved (or is a link, which Council Dial doesn't read through).
function reportUnescapedOf(p, runId, label) {
  const f = path.join(p.dir, runId, reportName(label));
  try { if (!fs.lstatSync(f).isFile()) return null; } catch { return null; }
  const fd = fs.openSync(f, 'r');
  try { const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); const head = b.subarray(0, n).toString('utf8').split('\n\n').slice(0, 2).join('\n'); return head.includes(UNESCAPED_NOTE); } finally { fs.closeSync(fd); }
}
const savedReports = (p, runId) => { try { return fs.readdirSync(path.join(p.dir, runId)).filter(f => f.endsWith('.md')).length; } catch { return 0; } };

// ---- A run's exact setup, and the plan command that reruns it.
export function setupOf(run) {
  const t = run.type, notes = [];
  const def = t.reviewers === 'specialised' && t.roles && t.roles.map(r => r.toLowerCase()).sort().join('|') === [...DEFAULT_ROLES].sort().join('|');
  // Every value is single-quoted, so the command is safe to paste into bash or zsh as it stands: a
  // model id such as claude-opus-4-6[1m] would otherwise be a glob. No value can contain a quote
  // (roles and model ids are checked for that when planned and when read).
  const q = v => `'${v}'`;
  const args = ['plan', '--reviewers', q(t.reviewers), '--combine', q(t.combine)];
  if (t.reviewers === 'specialised' && !def) args.push('--roles', q(t.roles.join(', ')));
  if (t.reviewers === 'generalist') args.push('--n', q(t.n));
  if (t.debate) args.push('--debate');
  if (t.sequential) args.push('--sequential');
  if (t.baseline) args.push('--baseline');
  if (t.combine === 'judged' && !t.appeal) args.push('--no-appeal');
  const seats = typeSeats(t);
  const sameModel = seats.every(x => x.model === seats[0].model), sameEffort = seats.every(x => x.effort === seats[0].effort);
  const seatArg = k => seats.filter(x => x[k]).map(x => `${x.seat.startsWith('reviewer: ') ? x.seat.slice(10) : x.seat === 'baseline reviewer' ? 'baseline' : x.seat}=${x[k]}`).join('; ');
  if (sameModel) { if (seats[0].model) args.push('--model', q(seats[0].model)); } else args.push('--seat-model', q(seatArg('model')));
  if (sameEffort) { if (seats[0].effort) args.push('--effort', q(seats[0].effort)); } else args.push('--seat-effort', q(seatArg('effort')));
  if (t.models?.main) args.push('--main-model', q(t.models.main));
  // Runs planned before 1.2.0 didn't record Council Dial's version; each brief version and model
  // record belongs to one release, so it can be told from them.
  const version = run.councilDial ?? (run.version === 1 ? '1.0.0' : t.models ? '1.2.0' : '1.1.0');
  const source = run.councilDial ? 'recorded' : 'inferred (planned before Council Dial recorded its version)';
  try { checkTarget(run.target); } catch { notes.push('Its description of what was reviewed would now be refused, because it says the material has planted, deliberate or known problems; describe the material only when you rerun it.'); }
  if (BRIEF_VERSIONS.includes(run.version)) { if (run.version !== VERSION) args.push('--brief-version', q(run.version)); }
  else notes.push(`This run used brief version ${run.version}; Council Dial ${PLUGIN_VERSION} writes versions ${BRIEF_VERSIONS.join(' and ')}, so a rerun with it gets different briefs. Install Council Dial ${version} to rerun it exactly.`);
  if (run.runningCode === 'allowed') args.push('--allow-running-code');
  if (run.userEffortChecked) args.push('--read-effort-settings');
  if (!t.models) notes.push('Its models weren\'t recorded (it was planned before Council Dial 1.2.0), so a rerun can\'t be matched on model.');
  else {
    if (t.models.env) notes.push(`CLAUDE_CODE_SUBAGENT_MODEL was ${t.models.env}${t.models.force ? ', with CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1' : ''}; set it the same way.`);
    if (!t.models.requested && t.models.main) notes.push(`Its subagents inherited the main session's model (${t.models.main}); run the rerun from a session on that model.`);
  }
  if (t.reviewers === 'specialised' && !def) notes.push('Custom roles are compared without regard to order, but a rerun should keep this order.');
  if (!run.effortRecorded) notes.push('Its effort level wasn\'t recorded (it was planned before Council Dial 1.3.0).');
  else if (!run.sessionEffort) notes.push('CLAUDE_EFFORT wasn\'t set (or couldn\'t be read) when it was planned, so its effort level wasn\'t recorded.');
  else notes.push(`The session's effort level was ${run.sessionEffort} (from CLAUDE_EFFORT); run the rerun from a session at that level. This is the session's level, not one confirmed for each subagent${t.models?.requested ? `; it asked for --model ${t.models.requested}, and if that's a different model from the session's, the subagents may have run at that model's own level instead` : ''}.`);
  if (run.effortOverride) notes.push(`CLAUDE_CODE_EFFORT_LEVEL was set to ${run.effortOverride} when it was planned, which overrode every other effort setting for every agent; set it the same way to rerun it.`);
  else if (run.overrideRecorded) notes.push('CLAUDE_CODE_EFFORT_LEVEL wasn\'t set (or couldn\'t be read) when it was planned.');
  return {
    runId: run.runId, label: run.label, councilDial: { version, source }, briefVersion: run.version,
    type: { reviewers: t.reviewers, n: t.n, roles: t.roles, combine: t.combine, debate: t.debate, sequential: t.sequential, baseline: t.baseline, appeal: t.appeal },
    models: t.models, effort: { session: run.sessionEffort, recorded: run.effortRecorded, override: run.effortOverride, overrideRecorded: run.overrideRecorded }, target: run.target,
    rerun: `node "<skill folder>/scripts/council.mjs" ${args.join(' ')} --project '<project root>'`, notes,
  };
}

function parseJsonInput(input) {
  try { return JSON.parse(String(input ?? '').trim() || 'null'); } catch (e) { throw new Error(`the input isn't valid JSON (${clean(e.message, 80)})`); }
}

// The only environment variables Council Dial reads, each by name: CLAUDE_CODE_SUBAGENT_MODEL and
// CLAUDE_CODE_SUBAGENT_MODEL_FORCE, which can change the model subagents run on, CLAUDE_EFFORT, the
// session's effort level, CLAUDE_CODE_EFFORT_LEVEL, which overrides every other effort setting, and
// CLAUDE_CONFIG_DIR, which moves the user's settings folder (used only with --read-effort-settings).
// Nothing else in the environment is read or passed on.
export const ENV_NAMES = ['CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'CLAUDE_EFFORT', 'CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_CONFIG_DIR'];
export function readEnv() {
  return {
    CLAUDE_CODE_SUBAGENT_MODEL: process.env.CLAUDE_CODE_SUBAGENT_MODEL,
    CLAUDE_CODE_SUBAGENT_MODEL_FORCE: process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE,
    CLAUDE_EFFORT: process.env.CLAUDE_EFFORT,
    CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  };
}
const envNamed = e => Object.fromEntries(ENV_NAMES.map(k => [k, e?.[k]]));

export const READER_AGENT = 'council-dial:council-reader';
export function runCommand(o, input, now = new Date(), givenEnv = readEnv()) {
  if (o.input != null) input = readInputFile(o.input);
  const env = envNamed(givenEnv);
  const project = path.resolve(o.project || process.cwd());
  const p = logPaths(project, o.logDir);
  const rows = readLog(p.jsonl);
  const runs = runsFrom(rows);
  const note = rows.skipped ? { skippedLogLines: rows.skipped } : {};
  switch (o.cmd) {
    case 'plan': {
      const plan = buildPlan(o, input, now, new Set(runs.map(r => r.runId)), env);
      const warning = append(p, { kind: 'planned', runId: plan.runId, version: plan.version, councilDial: PLUGIN_VERSION, time: now.toISOString(), label: plan.label, target: plan.target, type: plan.type, sessionEffort: plan.sessionEffort, effortOverride: plan.effortOverride, runningCode: plan.runningCode, toolLimits: plan.toolLimits, effortSettings: plan.effortSettings, seatEffort: plan.seats.map(x => ({ seat: x.seat, level: x.expected.level ?? null, source: x.expected.source })) });
      return { ...plan, log: path.posix.join(p.rel, 'review-log.jsonl'), ...note, ...(warning ? { warning } : {}) };
    }
    case 'estimate': {
      const { type, label, modelWarnings } = councilType(o, env);
      return { ...estimateOf(runs, type, label), warnings: modelWarnings, ...note };
    }
    case 'log': {
      const run = runs.find(r => r.runId === o.run);
      if (!run) throw new Error(`no planned run ${o.run} in ${p.rel}/review-log.jsonl`);
      const raw = parseJsonInput(input);
      const results = checkResults(raw, true, run.version);
      if (results.findingsPerReviewer.length && results.findingsPerReviewer.length !== run.type.n) throw new Error(`findingsPerReviewer has ${results.findingsPerReviewer.length} numbers; this run had ${run.type.n} reviewers`);
      if (results.baseline && !run.type.baseline) throw new Error('this run was planned without a baseline; leave baseline out');
      if (results.appeal && !run.type.appeal) throw new Error('this run was planned without the appeal step; leave appeal out');
      // Each seat's model and effort as given here, where they differ from what the plan asked for.
      const mismatched = [];
      if (results.agents) {
        const max = stepCounts(run.type);
        for (const s of STEPS) { const k = results.agents.filter(a => a.step === s).length; if (k > max[s]) throw new Error(`agents lists ${k} ${s} agents; this run had ${max[s]}`); }
        // Each entry must be one of this run's agents, at its own step, listed once; an appeal agent
        // only if the appeal ran.
        const plan = agentSteps(run.type), seen = new Set();
        results.agents.forEach((a, i) => {
          const m = plan.find(x => x.label.toLowerCase() === a.label.toLowerCase());
          if (!m) throw new Error(`agents[${i}].label must be one of this run's agents: ${plan.map(x => x.label).join('; ')}`);
          if (m.step !== a.step) throw new Error(`agents[${i}] (${m.label}) is at step ${m.step}, not ${a.step}`);
          if (seen.has(m.label)) throw new Error(`agents lists ${m.label} twice`);
          if (m.step === 'appeal' && results.appeal?.ran !== true) throw new Error('agents lists the appeal agent, but appeal.ran isn\'t true; drop the appeal entry if it didn\'t run, or set appeal.ran');
          seen.add(m.label); a.label = m.label;
          const st = typeSeats(run.type).find(x => x.seat === seatOfLabel(m.label));
          if (a.effort == null && st?.effort) a.effort = st.effort;
          if (st && a.model !== (st.model ?? 'inherit')) mismatched.push(`${m.label} was given model ${a.model}, but the plan asked for ${st.model ?? 'inherit'}`);
          if (st && EFFORT_LEVELS.includes(a.effort) && a.effort !== st.effort) mismatched.push(`${m.label} was given effort ${a.effort}, but the plan asked for ${st.effort ?? 'none'}`);
          a.effort = seatEffortOf(run, a);
          a.reportUnescaped = reportUnescapedOf(p, run.runId, m.label);
        });
      }
      const { unlabelledMinutes, ...row } = results;
      row.criticalPathMinutes = criticalPathOf(run.type, results);
      const warning = warnings(append(p, { kind: 'results', runId: o.run, time: now.toISOString(), results: row }), notesCut(raw, `log --run ${o.run} again with shorter notes to replace these results`), mismatched.length ? `${mismatched.join('; ')}; the type's name records what the plan asked for, so if you passed something else, say so in deviations` : null);
      return { logged: true, runId: o.run, label: run.label, replaced: !!run.results, verified: results.verified, wallMinutes: row.wallMinutes, criticalPathMinutes: row.criticalPathMinutes, message: `Logged the results of run ${o.run} (${run.label}) in ${p.rel}/review-log.md.`, ...note, ...(warning ? { warning } : {}) };
    }
    case 'update': {
      const run = runs.find(r => r.runId === o.run);
      if (!run) throw new Error(`no planned run ${o.run} in ${p.rel}/review-log.jsonl`);
      if (!run.results) throw new Error(`run ${o.run} has no results logged yet; log them first (log --run ${o.run}), then add the recheck`);
      const raw = parseJsonInput(input);
      const update = checkUpdate(raw);
      const warning = warnings(append(p, { kind: 'update', runId: o.run, time: now.toISOString(), update }), notesCut(raw, 'the recheck is saved with the cut notes; another update would add a second recheck, not replace this one'));
      return { logged: true, runId: o.run, message: `Added the recheck results to run ${o.run}.`, ...note, ...(warning ? { warning } : {}) };
    }
    case 'report': {
      const run = runs.find(r => r.runId === o.run);
      if (!run) throw new Error(`no planned run ${o.run} in ${p.rel}/review-log.jsonl`);
      const labels = agentLabels(run.type);
      const label = labels.find(l => l.toLowerCase() === clean(o.agent, 80).toLowerCase());
      if (!label) throw new Error(`--agent must be one of this run's agents: ${labels.join('; ')}`);
      const replaced = fs.existsSync(path.join(p.dir, run.runId, reportName(label)));
      const saved = saveReport(p, run, label, input, now, { replace: o.replace, savedLater: o.savedLater, noticeEscaped: o.noticeEscaped });
      return { saved: true, runId: o.run, agent: label, file: saved.file, replaced, ...(saved.unescaped != null ? { unescaped: saved.unescaped } : {}), ...note, ...(saved.warning ? { warning: saved.warning } : {}) };
    }
    case 'setup': {
      const run = runs.find(r => r.runId === o.run);
      if (!run) throw new Error(`no planned run ${o.run} in ${p.rel}/review-log.jsonl`);
      return { ...setupOf(run), ...note };
    }
    case 'list':
      return { runs: runs.slice(-o.limit).map(r => ({ runId: r.runId, time: r.time, label: r.label, target: r.target, logged: !!r.results, rechecks: r.updates.length, reports: savedReports(p, r.runId) })), ...note };
    case 'compare': {
      const c = compare(runs);
      // A log copied without its Markdown (such as the sample) gets review-log.md built here, so the
      // file compare points to exists.
      let warning = null;
      if (fs.existsSync(p.jsonl) && !fs.existsSync(p.md)) { try { writeAtomic(p.md, markdown(runs)); } catch (e) { warning = `review-log.md couldn't be built (${e.message})`; } }
      return { byType: [...c], moreTypes: c.more, ...(fs.existsSync(p.md) ? { log: path.posix.join(p.rel, 'review-log.md') } : {}), ...note, ...(warning ? { warning } : {}) };
    }
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const realOrSame = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const isMain = process.argv[1] && realOrSame(process.argv[1]) === realOrSame(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const input = ['plan', 'log', 'update', 'report'].includes(o.cmd) && o.input == null ? await readStdin() : '';
    console.log(JSON.stringify(runCommand(o, input, new Date(), readEnv())));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
    process.exit(2);
  }
}
