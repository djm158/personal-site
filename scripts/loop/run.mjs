#!/usr/bin/env node
// The backlog loop driver. Each pass picks the next backlog item, sets up a fresh clone for it,
// and runs one headless Claude Code session in the sandbox, as the loop's GitHub App, to build
// it and open a PR. Run with --help for options.
//
// Design notes: docs/research/agentic-backlog-loop.md, loop-github-identity.md, loop-sandbox.md.

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mintToken, revokeToken } from "./app-token.mjs";
import { parseBacklog, pickNext } from "./backlog.mjs";

const HELP = `Usage: node scripts/loop/run.mjs [options]

Runs one backlog item: picks it, opens a PR for it as djm158-site-loop[bot], and exits.

  --dry-run           Show what would run next, using your own gh login. Changes nothing.
  --until-idle        Keep going, one item at a time, until the PR cap is reached, nothing
                      is eligible, a limit is hit or a run fails.
  --watch             Never exit: when there's nothing to do, check again every few minutes.
                      Ctrl-C once finishes the current run and stops; twice stops now.
  --every <min>       How often --watch checks when idle. Default: 3
  --notify            macOS notification when a PR becomes your turn.
  --max-usage <pct>   Pause before your subscription's 5-hour window is this full, until it
                      resets, leaving room for your own sessions. Default: 80 (7-day: 90)
  --smoke             Check the setup: mint a token, clone, and have Claude run a fixed list
                      of sandbox checks. Opens no PR.
  --model <name>      Default: opus
  --budget <usd>      Estimated spend limit per run (Claude's --max-budget-usd). Default: 10
  --daily-budget <usd> Stop once today's runs add up to this. Default: 40
  --timeout <min>     Kill a run after this long. Default: 45 (tokens last 60)
  --keep              Keep the run folder even when the run succeeds.
  --force             Run even after two failed runs in a row or with CI failing on main.
  -h, --help

While a run works, each step it takes is printed as it happens. Logs go to .loop/runs.jsonl,
full transcripts to .loop/transcripts/, and notes the runs leave for you to .loop/notes.md.`;

const { values: opts } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "until-idle": { type: "boolean", default: false },
    watch: { type: "boolean", default: false },
    every: { type: "string", default: "3" },
    notify: { type: "boolean", default: false },
    "max-usage": { type: "string", default: "80" },
    smoke: { type: "boolean", default: false },
    model: { type: "string", default: "opus" },
    budget: { type: "string", default: "10" },
    "daily-budget": { type: "string", default: "40" },
    timeout: { type: "string", default: "45" },
    keep: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const REPO = "djm158/personal-site";
const REMOTE = `https://github.com/${REPO}.git`;
const ROOT = resolve(import.meta.dirname, "../..");
const LOG_DIR = join(ROOT, ".loop");
const RUNS_DIR = join(homedir(), ".cache/personal-site-loop/runs");
const PR_CAP = 3;
const BOT = {
  name: "djm158-site-loop[bot]",
  email: "350019459+djm158-site-loop[bot]@users.noreply.github.com",
};
// Git reads the token from the environment, so it never sits in a config file.
const CREDENTIAL_HELPER =
  '!f() { test "$1" = get && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f';
mkdirSync(join(RUNS_DIR, ".gh"), { recursive: true });

// ---------------------------------------------------------------- helpers

// In --watch, an idle pass's output is held back and shown only if it differs from the last
// one, so hours of "nothing to do" don't fill the terminal.
let held = null;
const log = (...parts) => {
  if (held) held.push(parts.join(" "));
  else console.log(...parts);
};
const flushHeld = () => {
  const lines = held ?? [];
  held = null;
  for (const line of lines) console.log(line);
};

const clock = (date = new Date()) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A macOS notification, with --notify. Arguments go through argv, so nothing needs escaping. */
function notify(title, message) {
  if (!opts.notify) return;
  try {
    execFileSync("osascript", [
      "-e",
      "on run argv",
      "-e",
      "display notification (item 2 of argv) with title (item 1 of argv)",
      "-e",
      "end run",
      title,
      message,
    ]);
  } catch {
    // A missing notification isn't worth stopping for.
  }
}

function run(command, args, { env, cwd, input } = {}) {
  return execFileSync(command, args, {
    cwd,
    env: env ?? process.env,
    encoding: "utf8",
    input,
    stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** gh as the App when there's a token, as Dan (his own login) for --dry-run. */
function ghFor(token) {
  const env = token
    ? { ...process.env, GH_TOKEN: token, GH_CONFIG_DIR: join(RUNS_DIR, ".gh") }
    : process.env;
  const gh = (...args) => run("gh", args, { env });
  gh.json = (...args) => JSON.parse(gh(...args) || "null");
  return gh;
}

// Each git call in the driver ignores hooks: the clones are written by the agent.
const git = (cwd, args, env) =>
  run("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, env });

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*/, "")
    .replace("T", "-");
}

function readLog() {
  const file = join(LOG_DIR, "runs.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeLog(entry) {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(join(LOG_DIR, "runs.jsonl"), `${JSON.stringify(entry)}\n`);
}

// ---------------------------------------------------------------- checks

/**
 * A reason not to start a run, from the log, or null. `until` is when it lifts by itself;
 * without one, it needs Dan.
 * @returns {{ reason: string, until?: Date } | null}
 */
function limitsReached() {
  const entries = readLog();
  const today = new Date().toDateString();
  const spent = entries
    .filter((e) => new Date(e.time).toDateString() === today)
    .reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
  if (spent >= Number(opts["daily-budget"])) {
    const midnight = new Date();
    midnight.setHours(24, 5, 0, 0);
    return {
      reason: `today's runs add up to an estimated $${spent.toFixed(2)} (--daily-budget ${opts["daily-budget"]})`,
      until: midnight,
    };
  }

  // Subscription usage, as the last run reported it. Pausing early leaves room for Dan's own
  // sessions, which share the same limits.
  const usage = entries.findLast((e) => e.usage)?.usage;
  const windows = [
    ["5-hour", usage?.fiveHour, Number(opts["max-usage"]) / 100],
    ["7-day", usage?.sevenDay, 0.9],
  ];
  for (const [name, window, limit] of windows) {
    if (!window || window.utilization < limit) continue;
    const until = new Date(window.resetsAt * 1000);
    if (until > new Date()) {
      return {
        reason: `the ${name} usage window is ${Math.round(window.utilization * 100)}% used`,
        until,
      };
    }
  }

  const lastTwo = entries.filter((e) => !e.smoke).slice(-2);
  if (
    !opts.force &&
    lastTwo.length === 2 &&
    lastTwo.every((e) => e.result.startsWith("error"))
  ) {
    return {
      reason:
        "the last two runs failed; read .loop/runs.jsonl, then rerun with --force",
    };
  }
  return null;
}

/** What GitHub says: open agent PRs, branches, PR states, main's CI. Also reports problems. */
function survey(gh) {
  const [mainCi] = gh.json(
    "run",
    "list",
    "--repo",
    REPO,
    "--workflow",
    "ci.yml",
    "--branch",
    "main",
    "--event",
    "push",
    "--limit",
    "1",
    "--json",
    "conclusion,status,url",
  );
  const open = gh.json(
    "pr",
    "list",
    "--repo",
    REPO,
    "--label",
    "agent",
    "--state",
    "open",
    "--json",
    "number,headRefName,isDraft,labels,title",
  );
  for (const pr of open) {
    const labels = pr.labels.map((l) => l.name);
    // MERGEABLE, CONFLICTING or UNKNOWN (GitHub works it out lazily; a later pass sees it).
    pr.mergeable = gh.json(
      "pr",
      "view",
      String(pr.number),
      "--repo",
      REPO,
      "--json",
      "mergeable",
    ).mergeable;
    const flags = [
      labels.includes("needs-input") && "needs input",
      isResumable(pr) && "answered, will resume",
      pr.mergeable === "CONFLICTING" && "conflicts with main",
    ].filter(Boolean);
    log(
      `  #${pr.number} ${pr.title}${flags.length ? `  [${flags.join(", ")}]` : ""}`,
    );
  }

  const branches = new Set(
    gh
      .json("api", `repos/${REPO}/git/matching-refs/heads/agent/`)
      .map((ref) => ref.ref.replace("refs/heads/", "")),
  );
  // If a branch has had several PRs (retries), the newest decides.
  const prs = new Map();
  for (const pr of gh.json(
    "pr",
    "list",
    "--repo",
    REPO,
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "number,headRefName,state,labels",
  )) {
    if (!pr.headRefName.startsWith("agent/")) continue;
    if (pr.number < (prs.get(pr.headRefName)?.number ?? 0)) continue;
    prs.set(pr.headRefName, {
      number: pr.number,
      state: pr.state,
      retry: pr.labels.some((label) => label.name === "retry"),
    });
  }

  const backlog = gh(
    "api",
    `repos/${REPO}/contents/BACKLOG.md?ref=main`,
    "-H",
    "Accept: application/vnd.github.raw",
  );
  const items = parseBacklog(backlog);
  const pick = pickNext(items, { branches, prs });
  for (const { item, pr } of pick.rejected)
    log(
      `  Rejected: #${pr} (${item.slug}) was closed. Add the retry label to it to start over, or reword or retag the item.`,
    );
  for (const item of pick.stranded)
    log(
      `  Stranded (branch agent/${item.slug} has no PR): delete the branch to retry it`,
    );
  for (const { item, slug } of pick.unknownAfter)
    log(`  ${item.slug} waits on "${slug}", which no item has`);
  return { mainCi, open, pick, items };
}

// Agent PRs are drafts only while they need input. A draft without the label means Dan has
// answered and taken the label off: carry on.
const isResumable = (pr) =>
  pr.isDraft && !pr.labels.some((label) => label.name === "needs-input");

const OWNER = REPO.split("/")[0];
const REVIEWER = "claude[bot]";
const CI_CHECK = "Check, test and build";

/**
 * Comments on a PR from the given logins, oldest first, quoted for a prompt. Nobody else's
 * reach the agent: on a public repo anyone can comment.
 */
function prComments(gh, number, { logins, since = "" }) {
  const get = (path) => gh.json("api", `repos/${REPO}/${path}?per_page=100`);
  const all = [
    ...get(`issues/${number}/comments`).map((c) => ({
      ...c,
      kind: "PR comment",
    })),
    ...get(`pulls/${number}/comments`).map((c) => ({
      ...c,
      kind: "inline comment",
    })),
    ...get(`pulls/${number}/reviews`)
      .filter((r) => r.body?.trim())
      .map((r) => ({ ...r, kind: "review", created_at: r.submitted_at })),
  ];
  return (
    all
      .filter((c) => logins.includes(c.user?.login) && c.created_at > since)
      // The review's summary when it found nothing isn't a finding.
      .filter(
        (c) => !(c.user.login === REVIEWER && /No issues found/.test(c.body)),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => {
        const who = c.user.login === OWNER ? "Dan" : "Claude review";
        const where = c.path
          ? ` on ${c.path}${c.line ? ` line ${c.line}` : ""}`
          : "";
        return [
          `${who}, ${c.created_at.slice(0, 10)}, ${c.kind} ${c.id}${where}:`,
          ...c.body.split("\n").map((line) => `> ${line}`),
        ].join("\n");
      })
  );
}

/**
 * Where a ready agent PR stands with its review:
 * - "none": not ours to handle (a draft, or labelled reviewed or needs-input)
 * - "waiting": CI or the review hasn't finished
 * - "clean": nothing to fix, so it can go straight to Dan
 * - "fix": findings, or a failed CI run, for a fix run
 * Only comments since the PR became ready, or since `reviewed` was last added, count. To ask
 * for another round, Dan comments and removes `reviewed`.
 */
function reviewState(gh, pr) {
  const labels = pr.labels.map((label) => label.name);
  if (
    pr.isDraft ||
    labels.includes("reviewed") ||
    labels.includes("needs-input")
  )
    return { state: "none" };
  const { statusCheckRollup } = gh.json(
    "pr",
    "view",
    String(pr.number),
    "--repo",
    REPO,
    "--json",
    "statusCheckRollup",
  );
  // A check can have several runs (pushes cancel older ones); the latest counts.
  const ci = statusCheckRollup
    .filter((check) => check.name === CI_CHECK)
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""))
    .at(-1);
  if (ci?.status !== "COMPLETED") return { state: "waiting", why: "CI" };
  const reviewed = gh
    .json("api", `repos/${REPO}/issues/${pr.number}/comments?per_page=100`)
    .some(
      (c) => c.user?.login === REVIEWER && c.body.startsWith("## Code review"),
    );
  if (!reviewed) return { state: "waiting", why: "the review" };

  const since =
    gh
      .json("api", `repos/${REPO}/issues/${pr.number}/events?per_page=100`)
      .filter(
        (e) =>
          e.event === "ready_for_review" ||
          (e.event === "labeled" && e.label?.name === "reviewed"),
      )
      .at(-1)?.created_at ?? "";
  const comments = prComments(gh, pr.number, {
    logins: [OWNER, REVIEWER],
    since,
  });
  const ciFailed = ci.conclusion === "FAILURE";
  if (comments.length === 0 && !ciFailed) return { state: "clean" };
  return { state: "fix", comments, ciFailed };
}

// ---------------------------------------------------------------- a run

function setUp(slug, token, { existing = false } = {}) {
  const runDir = join(RUNS_DIR, `${stamp()}-${slug}`);
  const repo = join(runDir, "repo");
  const assets = join(runDir, "pr-assets");
  const scratch = join(runDir, "scratch");
  mkdirSync(scratch, { recursive: true });
  const env = { ...process.env, GH_TOKEN: token, GIT_TERMINAL_PROMPT: "0" };
  const auth = [
    "-c",
    "credential.helper=",
    "-c",
    `credential.helper=${CREDENTIAL_HELPER}`,
  ];

  // Repo-local config, so pushes from inside the sandbox use the App token and the bot's name.
  const configure = (dir) => {
    git(dir, ["config", "credential.helper", ""]);
    git(dir, ["config", "--add", "credential.helper", CREDENTIAL_HELPER]);
    git(dir, ["config", "user.name", BOT.name]);
    git(dir, ["config", "user.email", BOT.email]);
    git(dir, ["config", "commit.gpgsign", "false"]);
  };

  git(runDir, [...auth, "clone", "--quiet", REMOTE, repo], env);
  configure(repo);
  // Resume and fix runs continue the PR's branch; a new item starts from main.
  if (existing) git(repo, ["switch", "--quiet", `agent/${slug}`]);
  else if (slug !== "smoke")
    git(repo, ["switch", "--quiet", "-c", `agent/${slug}`]);

  try {
    git(
      runDir,
      [
        ...auth,
        "clone",
        "--quiet",
        "--single-branch",
        "--branch",
        "pr-assets",
        "--depth",
        "1",
        REMOTE,
        assets,
      ],
      env,
    );
  } catch {
    // First run ever: start the orphan branch.
    git(runDir, ["init", "--quiet", "--initial-branch", "pr-assets", assets]);
    git(assets, ["remote", "add", "origin", REMOTE]);
  }
  configure(assets);

  log("  Installing dependencies…");
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: repo });

  // Base settings from this checkout, plus the folders this run may write to.
  const settings = JSON.parse(
    readFileSync(join(ROOT, ".claude/loop-settings.json"), "utf8"),
  );
  const pnpmStore = run("pnpm", ["store", "path"], { cwd: repo }).trim();
  // pnpm 12 takes a lock in /tmp before it writes to the store, wherever the store is.
  const pnpmLocks = `/private/tmp/pnpm-store-operation-locks-${process.getuid()}`;
  settings.sandbox.filesystem.allowWrite = [runDir, pnpmStore, pnpmLocks];
  const settingsFile = join(runDir, "settings.json");
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

  return { runDir, repo, assets, scratch, settingsFile };
}

// Resume, fix and rebase runs carry on the PR's branch; new items and retries start from main.
const continuesBranch = (mode) => Boolean(mode) && mode.kind !== "retry";

/**
 * @param {{ kind: "resume" | "fix" | "rebase" | "retry", number: number, comments: string[], ciFailed?: boolean } | null} mode
 *   null for a new item. For a retry, `number` is the closed PR it replaces.
 */
function promptFor(item, dirs, mode) {
  const branch = continuesBranch(mode)
    ? `the existing branch from PR #${mode.number}`
    : "a fresh clone of `main`";
  const header = `## This run

- Backlog item (BACKLOG.md line ${item.line}):

  > ${item.text}

- Slug \`${item.slug}\`. Branch \`agent/${item.slug}\` is checked out in your working directory,
  ${branch}, with dependencies installed.
- The \`pr-assets\` branch is cloned at \`${dirs.assets}\`.
- Scratch folder for setup modules and media: \`${dirs.scratch}\`. Use it instead of \`$TMPDIR\`.

`;
  const prompt = (name) =>
    readFileSync(join(ROOT, `.claude/prompts/${name}`), "utf8");
  let text = header + prompt("backlog-iteration.md");
  if (mode) {
    const none = {
      resume: "(Dan left no comment; the commits he pushed are his answer.)",
      fix: "(No comments. Only CI needs fixing.)",
      retry:
        "(Dan left no notes. Work out from the old PR and the item why it might have been turned down.)",
    }[mode.kind];
    const comments = mode.comments.length ? mode.comments.join("\n\n") : none;
    const ci = mode.ciFailed
      ? "**CI failed** on this branch. Read why with `gh pr checks` and `gh run view <id> --log-failed`, and fix it."
      : "CI passed.";
    text += `\n${prompt(`backlog-${mode.kind}.md`)
      .replaceAll("{{number}}", String(mode.number))
      .replaceAll("{{slug}}", item.slug)
      .replace("{{ci}}", () => ci)
      .replace("{{comments}}", () => comments)}`;
  }
  return text;
}

const SMOKE_PROMPT = `This is a setup check, not a backlog run. Don't change files, commit or push.
Run each command below as its own Bash call, exactly as written, and report each one's output
verbatim (first 3 lines) in a numbered list. Some are meant to fail; don't retry or work around them.

1. gh api repos/${REPO} --jq .full_name
2. git ls-remote origin HEAD
3. git ls-remote git@github.com:${REPO}.git HEAD 2>&1 | tail -1
4. cat ~/.ssh/known_hosts 2>&1 | head -1
5. security find-generic-password -s "gh:github.com" >/dev/null 2>&1 && echo LEAK || echo blocked
6. curl -sS -m 5 -o /dev/null -w "%{http_code}" https://example.com 2>&1
7. pnpm build 2>&1 | tail -2; echo "font files: $(find dist -name '*.woff2' | wc -l)"
8. node scripts/pr-media.mjs --path / --widths 375 --out SCRATCH/smoke 2>&1 | tail -3
9. pnpm add is-number 2>&1 | tail -1; git checkout -- package.json pnpm-lock.yaml

End with a line "RESULT: smoke ok" if 1, 2, 7 (with more than 0 font files), 8 and 9 worked and 3–6 failed or printed
"blocked"; otherwise "RESULT: error smoke" and say which check was wrong.`;

// The Claude run in progress, so Ctrl-C can stop it.
let currentChild = null;
const killGroup = (child, signal) => {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Already gone.
  }
};

/** One line per step a run takes: each tool call and each thing Claude says. */
function feed(label, message, runDir) {
  if (message.type !== "assistant") return;
  // Steps inside a subagent are indented under the call that started it.
  const indent = message.parent_tool_use_id ? "      " : "  ";
  for (const part of message.message?.content ?? []) {
    let text;
    if (part.type === "tool_use") {
      const input = part.input ?? {};
      const detail =
        input.command ??
        input.file_path ??
        input.path ??
        input.pattern ??
        input.url ??
        input.description ??
        "";
      text = `→ ${part.name}${detail ? `: ${detail}` : ""}`;
    } else if (part.type === "text" && part.text.trim()) {
      text = part.text.trim();
    } else {
      continue;
    }
    const line = text.replaceAll(`${runDir}/`, "").replace(/\s+/g, " ");
    log(
      `${indent}[${label}] ${line.length > 150 ? `${line.slice(0, 149)}…` : line}`,
    );
  }
}

/**
 * Runs Claude in the clone, printing its steps as they happen and saving the full transcript
 * to .loop/transcripts/. Resolves with the final result message (plus the subscription usage
 * it reported, as `rateLimit`), or an error result.
 */
function runClaude(prompt, dirs, token, label) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    opts.smoke ? "haiku" : opts.model,
    "--settings",
    dirs.settingsFile,
    // Only the repo's own settings: not your user settings, plugins or MCP connectors.
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    // Edits in the clone and the added folders go through; anything that would ask is denied.
    "--permission-mode",
    "acceptEdits",
    "--permission-prompts",
    "none",
    "--add-dir",
    dirs.assets,
    dirs.scratch,
    "--max-budget-usd",
    opts.smoke ? "1" : opts.budget,
  ];
  const env = {
    ...process.env,
    GH_TOKEN: token,
    GH_CONFIG_DIR: join(dirs.runDir, "gh"),
    GIT_TERMINAL_PROMPT: "0",
    // Subagents in the foreground: started in the background, a headless session can end
    // before they finish.
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  };
  delete env.ANTHROPIC_API_KEY; // always the subscription, never an API key
  delete env.GITHUB_TOKEN;

  const transcripts = join(LOG_DIR, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  const transcript = join(transcripts, `${basename(dirs.runDir)}.jsonl`);

  return new Promise((done) => {
    // Its own process group, so Ctrl-C in the terminal reaches the driver, which decides
    // whether to let the run finish.
    const child = spawn("claude", args, {
      cwd: dirs.repo,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    currentChild = child;
    let pending = "";
    let stderr = "";
    let result = null;
    let rateLimit = null;
    child.stdout.on("data", (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (!line.trim()) continue;
        appendFileSync(transcript, `${line}\n`);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.type === "result") result = message;
        else if (message.type === "rate_limit_event")
          rateLimit = message.rate_limit_info;
        else feed(label, message, dirs.runDir);
      }
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const minutes = Number(opts.timeout);
    const timer = setTimeout(() => {
      log(`  Timed out after ${minutes} minutes; stopping the run.`);
      killGroup(child, "SIGTERM");
      setTimeout(() => killGroup(child, "SIGKILL"), 10_000).unref();
    }, minutes * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      currentChild = null;
      writeFileSync(join(dirs.runDir, "claude-stderr.log"), stderr);
      done({
        ...(result ?? {
          result: `RESULT: error claude exited ${code} without a result`,
          is_error: true,
        }),
        rateLimit,
      });
    });
  });
}

async function runItem(item, token, mode = null) {
  const action = {
    resume: "Resuming",
    fix: "Fixing",
    rebase: "Merging main into",
    retry: "Retrying, replacing",
  }[mode?.kind];
  // A run is always worth showing, along with the survey that led to it.
  if (held) {
    console.log(`\n── ${clock()} ──`);
    flushHeld();
  }
  log(
    `\n${action ? `${action} #${mode.number}` : "Running"} ${item.slug}: ${item.text.slice(0, 100)}${item.text.length > 100 ? "…" : ""}`,
  );
  const slug = opts.smoke ? "smoke" : item.slug;
  const started = Date.now();
  let dirs;
  let output;
  try {
    dirs = setUp(slug, token, { existing: continuesBranch(mode) });
    log(`  Folder: ${dirs.runDir}`);
    const prompt = opts.smoke
      ? SMOKE_PROMPT.replaceAll("SCRATCH", dirs.scratch)
      : promptFor(item, dirs, mode);
    log("  Claude is working:");
    output = await runClaude(prompt, dirs, token, slug);
  } catch (error) {
    output = {
      result: `RESULT: error setup failed: ${error.message.split("\n")[0]}`,
      is_error: true,
    };
  }

  const text = output.result ?? "";
  const result =
    [...text.matchAll(/^RESULT: (.+)$/gm)].at(-1)?.[1] ??
    "error no RESULT line";
  const notes = [...text.matchAll(/^NOTE: (.+)$/gm)].map((m) => m[1]);
  const windows = output.rateLimit?.unifiedWindows;
  const usage = windows && {
    fiveHour: windows.five_hour,
    sevenDay: windows.seven_day,
  };
  const entry = {
    time: new Date().toISOString(),
    slug,
    kind: opts.smoke ? "smoke" : (mode?.kind ?? "new"),
    smoke: opts.smoke || undefined,
    result,
    costUsd: output.total_cost_usd,
    turns: output.num_turns,
    minutes: Math.round((Date.now() - started) / 600) / 100,
    denials: output.permission_denials?.length,
    sessionId: output.session_id,
    usage,
    runDir: dirs?.runDir,
  };
  writeLog(entry);
  if (notes.length) {
    appendFileSync(
      join(LOG_DIR, "notes.md"),
      `\n## ${entry.time.slice(0, 10)} ${slug}\n\n${notes.map((n) => `- ${n}`).join("\n")}\n`,
    );
  }

  log(opts.smoke ? `\n${text}\n` : "");
  log(`  RESULT: ${result}`);
  const percent = (window) =>
    window ? `${Math.round(window.utilization * 100)}%` : "?";
  log(
    `  ~$${(entry.costUsd ?? 0).toFixed(2)} estimated, ${entry.turns ?? "?"} turns, ${entry.minutes} min` +
      (usage
        ? ` · usage: 5-hour ${percent(usage.fiveHour)}, 7-day ${percent(usage.sevenDay)}`
        : ""),
  );
  if (notes.length) log(`  ${notes.length} note(s) added to .loop/notes.md`);
  const pr = result.match(/#(\d+)/)?.[0] ?? "";
  if (result.startsWith("needs-input"))
    notify("Backlog loop needs you", `${pr} ${slug} is waiting for an answer`);
  else if (result.startsWith("fixed"))
    notify("Backlog loop", `${pr} ${slug} is reviewed and ready for you`);
  else if (result.startsWith("error"))
    notify("Backlog loop run failed", `${slug}: ${result}`);
  if (dirs && !opts.keep && !result.startsWith("error")) {
    rmSync(dirs.runDir, { recursive: true, force: true });
  } else if (dirs) {
    log(`  Kept ${dirs.runDir}`);
  }
  return result;
}

// ---------------------------------------------------------------- main

// When a pass returns "pause": the time a limit lifts, or null to check again as usual.
let pauseUntil = null;

/**
 * One pass: at most one Claude run. Returns its RESULT, or "idle", "pause" (wait, then carry
 * on) or "stop" (needs Dan).
 */
async function pass() {
  const limit = limitsReached();
  if (limit && !opts["dry-run"]) {
    if (limit.until && opts.watch) {
      log(`Paused: ${limit.reason}. Carrying on at ${clock(limit.until)}.`);
      pauseUntil = limit.until;
      return "pause";
    }
    log(`Stopping: ${limit.reason}.`);
    return "stop";
  }

  const minted = opts["dry-run"] ? null : await mintToken();
  const token = minted?.token ?? null;
  try {
    const gh = ghFor(token);
    if (opts["dry-run"]) log("Dry run, using your gh login.");

    if (opts.smoke)
      return await runItem({ slug: "smoke", text: "setup check" }, token);

    log("Open agent PRs:");
    const { mainCi, open, pick, items } = survey(gh);
    if (open.length === 0) log("  none");
    if (mainCi?.conclusion === "failure" && !opts.force) {
      if (opts.watch) {
        log(`Waiting: CI is failing on main (${mainCi.url}).`);
        return "pause";
      }
      log(
        `Stopping: CI is failing on main (${mainCi.url}). Fix it first, or rerun with --force.`,
      );
      return "stop";
    }

    // The backlog item behind an open PR, or a stand-in if its line has gone.
    const itemFor = (pr) => {
      const slug = pr.headRefName.replace(/^agent\//, "");
      return (
        items.find((i) => i.slug === slug) ?? {
          slug,
          line: "?",
          text: pr.title,
        }
      );
    };

    // Finish answered PRs before starting anything new. They're already open, so the cap
    // doesn't apply.
    const answered = open.find(isResumable);
    if (answered) {
      const item = itemFor(answered);
      if (opts["dry-run"]) {
        log(`Next: resume #${answered.number} (${item.slug})`);
        return "idle";
      }
      const comments = prComments(gh, answered.number, { logins: [OWNER] });
      return await runItem(item, token, {
        kind: "resume",
        number: answered.number,
        comments,
      });
    }

    // Then PRs that conflict with main: they can't merge, and CI doesn't run on them, so
    // they come before fix passes. One waiting on Dan keeps waiting.
    const conflicting = open.find(
      (pr) =>
        pr.mergeable === "CONFLICTING" &&
        !pr.labels.some((label) => label.name === "needs-input"),
    );
    if (conflicting) {
      const item = itemFor(conflicting);
      if (opts["dry-run"]) {
        log(`Next: merge main into #${conflicting.number} (${item.slug})`);
        return "idle";
      }
      return await runItem(item, token, {
        kind: "rebase",
        number: conflicting.number,
        comments: [],
      });
    }

    // Then reviewed PRs. A clean review goes straight to Dan; findings get one fix run.
    let toFix = null;
    for (const pr of open) {
      const review = reviewState(gh, pr);
      if (review.state === "waiting") {
        log(`  #${pr.number}: waiting for ${review.why}`);
      } else if (review.state === "clean") {
        log(`  #${pr.number}: review found nothing; labelling it reviewed`);
        if (!opts["dry-run"]) {
          gh(
            "api",
            "-X",
            "POST",
            `repos/${REPO}/issues/${pr.number}/labels`,
            "-f",
            "labels[]=reviewed",
          );
          notify("Backlog loop", `#${pr.number} is reviewed and ready for you`);
        }
      } else if (review.state === "fix" && !toFix) {
        toFix = { pr, review };
      }
    }
    if (toFix) {
      const { pr, review } = toFix;
      const item = itemFor(pr);
      const what = [
        review.comments.length && `${review.comments.length} comment(s)`,
        review.ciFailed && "failed CI",
      ].filter(Boolean);
      if (opts["dry-run"]) {
        log(`Next: fix #${pr.number} (${item.slug}): ${what.join(", ")}`);
        return "idle";
      }
      const result = await runItem(item, token, {
        kind: "fix",
        number: pr.number,
        comments: review.comments,
        ciFailed: review.ciFailed,
      });
      // Make sure the round is closed even if the run forgot the label; otherwise the next
      // pass would fix the same comments again.
      if (result.startsWith("fixed"))
        gh(
          "api",
          "-X",
          "POST",
          `repos/${REPO}/issues/${pr.number}/labels`,
          "-f",
          "labels[]=reviewed",
        );
      return result;
    }
    if (open.length >= PR_CAP) {
      log(`Idle: ${open.length} agent PRs are open (cap ${PR_CAP}).`);
      return "idle";
    }
    if (!pick.item) {
      log("Idle: nothing eligible.");
      return "idle";
    }
    const retryOf = pick.retryOf;
    if (opts["dry-run"]) {
      log(
        `Next: ${pick.item.slug}${retryOf ? `, from scratch, replacing #${retryOf}` : ""} (BACKLOG.md line ${pick.item.line})\n  ${pick.item.text}`,
      );
      return "idle";
    }
    if (!retryOf) return await runItem(pick.item, token);

    // A retry: the old branch has to go, since the new one can't be force-pushed over it.
    // The closed PR keeps its diff, so nothing is lost.
    try {
      gh(
        "api",
        "-X",
        "DELETE",
        `repos/${REPO}/git/refs/heads/agent/${pick.item.slug}`,
      );
    } catch {
      // Already gone (GitHub may have deleted it when the PR closed).
    }
    return await runItem(pick.item, token, {
      kind: "retry",
      number: retryOf,
      comments: prComments(gh, retryOf, { logins: [OWNER] }),
    });
  } finally {
    if (token) await revokeToken(token);
  }
}

// Ctrl-C once: let a run in progress finish, then stop. Twice: stop it now. With no run in
// progress there's nothing to finish, so the first one stops straight away.
let stopping = false;
process.on("SIGINT", () => {
  if (stopping || !currentChild) {
    if (currentChild) killGroup(currentChild, "SIGTERM");
    console.log("\nStopped.");
    process.exit(130);
  }
  stopping = true;
  console.log(
    "\nFinishing the current run, then stopping. Press Ctrl-C again to stop it now.",
  );
});

const didWork = (outcome) =>
  /^(opened|needs-input|fixed|rebased|error)/.test(outcome);

if (opts.watch && !opts.smoke && !opts["dry-run"]) {
  const every = Number(opts.every) * 60_000;
  console.log(
    `Watching ${REPO}: checking every ${opts.every} min when there's nothing to do. Ctrl-C to stop.`,
  );
  let lastIdle = null;
  for (;;) {
    held = [];
    pauseUntil = null;
    const outcome = await pass();
    const lines = held ?? [];
    held = null;
    if (stopping) break;
    if (outcome === "stop") {
      console.log(`\n── ${clock()} ──\n${lines.join("\n")}`);
      notify("Backlog loop stopped", lines.at(-1) ?? "");
      process.exitCode = 1;
      break;
    }
    // After a run there may be more to do (a fix, the next item), so check again now.
    if (didWork(outcome)) {
      lastIdle = null;
      continue;
    }
    // Idle or paused: print only what changed since the last quiet pass.
    const text = lines.join("\n");
    if (text !== lastIdle) {
      console.log(`\n── ${clock()} ──\n${text}`);
      lastIdle = text;
    }
    const wait = pauseUntil ? Math.max(pauseUntil - Date.now(), 60_000) : every;
    await new Promise((wake) => setTimeout(wake, wait));
  }
} else {
  let outcome;
  do {
    outcome = await pass();
  } while (
    opts["until-idle"] &&
    !opts.smoke &&
    !stopping &&
    /^(opened|needs-input|fixed|rebased)/.test(outcome)
  );
  process.exitCode = /^(error|stop|pause)/.test(outcome) ? 1 : 0;
}
