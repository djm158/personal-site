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
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mintToken, revokeToken } from "./app-token.mjs";
import { parseBacklog, pickNext } from "./backlog.mjs";

const HELP = `Usage: node scripts/loop/run.mjs [options]

Runs one backlog item: picks it, opens a PR for it as djm158-site-loop[bot], and exits.

  --dry-run           Show what would run next, using your own gh login. Changes nothing.
  --until-idle        Keep going, one item at a time, until the PR cap is reached, nothing
                      is eligible, a limit is hit or a run fails.
  --smoke             Check the setup: mint a token, clone, and have Claude run a fixed list
                      of sandbox checks. Opens no PR.
  --model <name>      Default: opus
  --budget <usd>      Estimated spend limit per run (Claude's --max-budget-usd). Default: 10
  --daily-budget <usd> Stop once today's runs add up to this. Default: 40
  --timeout <min>     Kill a run after this long. Default: 45 (tokens last 60)
  --keep              Keep the run folder even when the run succeeds.
  --force             Run even after two failed runs in a row or with CI failing on main.
  -h, --help

Logs go to .loop/runs.jsonl, and notes the runs leave for you to .loop/notes.md.`;

const { values: opts } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "until-idle": { type: "boolean", default: false },
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

const log = (...lines) => console.log(...lines);

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

/** Reasons not to start a run, from the log. */
function limitsReached() {
  const entries = readLog();
  const today = new Date().toDateString();
  const spent = entries
    .filter((e) => new Date(e.time).toDateString() === today)
    .reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
  if (spent >= Number(opts["daily-budget"])) {
    return `today's runs add up to an estimated $${spent.toFixed(2)} (--daily-budget ${opts["daily-budget"]})`;
  }
  const lastTwo = entries.filter((e) => !e.smoke).slice(-2);
  if (
    !opts.force &&
    lastTwo.length === 2 &&
    lastTwo.every((e) => e.result.startsWith("error"))
  ) {
    return "the last two runs failed; read .loop/runs.jsonl, then rerun with --force";
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
    const { mergeable } = gh.json(
      "pr",
      "view",
      String(pr.number),
      "--repo",
      REPO,
      "--json",
      "mergeable",
    );
    const flags = [
      labels.includes("needs-input") && "needs input",
      mergeable === "CONFLICTING" && "conflicts with main",
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
  // If a branch has had several PRs, the open one wins, then a merged one.
  const rank = { CLOSED: 1, MERGED: 2, OPEN: 3 };
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
    "headRefName,state",
  )) {
    if (!pr.headRefName.startsWith("agent/")) continue;
    if ((rank[pr.state] ?? 0) > (rank[prs.get(pr.headRefName)] ?? 0))
      prs.set(pr.headRefName, pr.state);
  }

  const backlog = gh(
    "api",
    `repos/${REPO}/contents/BACKLOG.md?ref=main`,
    "-H",
    "Accept: application/vnd.github.raw",
  );
  const pick = pickNext(parseBacklog(backlog), { branches, prs });
  for (const item of pick.rejected)
    log(
      `  Rejected (PR closed without merging), retag or reword: ${item.slug}`,
    );
  for (const item of pick.stranded)
    log(
      `  Stranded (branch agent/${item.slug} has no PR): delete the branch to retry it`,
    );
  for (const { item, slug } of pick.unknownAfter)
    log(`  ${item.slug} waits on "${slug}", which no item has`);
  return { mainCi, open, pick };
}

// ---------------------------------------------------------------- a run

function setUp(slug, token) {
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
  if (slug !== "smoke") git(repo, ["switch", "--quiet", "-c", `agent/${slug}`]);

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
  settings.sandbox.filesystem.allowWrite = [runDir, pnpmStore];
  const settingsFile = join(runDir, "settings.json");
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

  return { runDir, repo, assets, scratch, settingsFile };
}

function promptFor(item, dirs) {
  const header = `## This run

- Backlog item (BACKLOG.md line ${item.line}):

  > ${item.text}

- Slug \`${item.slug}\`. Branch \`agent/${item.slug}\` is checked out in your working directory,
  a fresh clone of \`main\` with dependencies installed.
- The \`pr-assets\` branch is cloned at \`${dirs.assets}\`.
- Scratch folder for setup modules and media: \`${dirs.scratch}\`. Use it instead of \`$TMPDIR\`.

`;
  return (
    header +
    readFileSync(join(ROOT, ".claude/prompts/backlog-iteration.md"), "utf8")
  );
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

End with a line "RESULT: smoke ok" if 1, 2, 7 (with more than 0 font files) and 8 worked and 3–6 failed or printed
"blocked"; otherwise "RESULT: error smoke" and say which check was wrong.`;

/** Runs Claude in the clone. Resolves with its JSON output, or an error result. */
function runClaude(prompt, dirs, token) {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
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

  return new Promise((done) => {
    const child = spawn("claude", args, {
      cwd: dirs.repo,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const minutes = Number(opts.timeout);
    const timer = setTimeout(() => {
      log(`  Timed out after ${minutes} minutes; stopping the run.`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, minutes * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      writeFileSync(join(dirs.runDir, "claude-output.json"), stdout);
      writeFileSync(join(dirs.runDir, "claude-stderr.log"), stderr);
      try {
        done(JSON.parse(stdout));
      } catch {
        done({
          result: `RESULT: error claude exited ${code} without JSON output`,
          is_error: true,
        });
      }
    });
  });
}

async function runItem(item, token) {
  log(
    `\nRunning ${item.slug}: ${item.text.slice(0, 100)}${item.text.length > 100 ? "…" : ""}`,
  );
  const slug = opts.smoke ? "smoke" : item.slug;
  const started = Date.now();
  let dirs;
  let output;
  try {
    dirs = setUp(slug, token);
    log(`  Folder: ${dirs.runDir}`);
    const prompt = opts.smoke
      ? SMOKE_PROMPT.replaceAll("SCRATCH", dirs.scratch)
      : promptFor(item, dirs);
    log("  Claude is working…");
    output = await runClaude(prompt, dirs, token);
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
  const entry = {
    time: new Date().toISOString(),
    slug,
    smoke: opts.smoke || undefined,
    result,
    costUsd: output.total_cost_usd,
    turns: output.num_turns,
    minutes: Math.round((Date.now() - started) / 600) / 100,
    denials: output.permission_denials?.length,
    sessionId: output.session_id,
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
  log(
    `  ~$${(entry.costUsd ?? 0).toFixed(2)} estimated, ${entry.turns ?? "?"} turns, ${entry.minutes} min`,
  );
  if (notes.length) log(`  ${notes.length} note(s) added to .loop/notes.md`);
  if (dirs && !opts.keep && !result.startsWith("error")) {
    rmSync(dirs.runDir, { recursive: true, force: true });
  } else if (dirs) {
    log(`  Kept ${dirs.runDir}`);
  }
  return result;
}

// ---------------------------------------------------------------- main

async function pass() {
  const limit = limitsReached();
  if (limit && !opts["dry-run"]) {
    log(`Stopping: ${limit}.`);
    return "stop";
  }

  const minted = opts["dry-run"] ? null : await mintToken();
  const token = minted?.token ?? null;
  try {
    const gh = ghFor(token);
    log(
      opts["dry-run"]
        ? "Dry run, using your gh login."
        : `Token for djm158-site-loop[bot], expires ${minted.expiresAt}.`,
    );

    if (opts.smoke)
      return await runItem({ slug: "smoke", text: "setup check" }, token);

    log("Open agent PRs:");
    const { mainCi, open, pick } = survey(gh);
    if (open.length === 0) log("  none");
    if (mainCi?.conclusion === "failure" && !opts.force) {
      log(
        `Stopping: CI is failing on main (${mainCi.url}). Fix it first, or rerun with --force.`,
      );
      return "stop";
    }
    if (open.length >= PR_CAP) {
      log(`Idle: ${open.length} agent PRs are open (cap ${PR_CAP}).`);
      return "idle";
    }
    if (!pick.item) {
      log("Idle: nothing eligible.");
      return "idle";
    }
    if (opts["dry-run"]) {
      log(
        `Next: ${pick.item.slug} (BACKLOG.md line ${pick.item.line})\n  ${pick.item.text}`,
      );
      return "idle";
    }
    return await runItem(pick.item, token);
  } finally {
    if (token) await revokeToken(token);
  }
}

let outcome;
do {
  outcome = await pass();
} while (
  opts["until-idle"] &&
  !opts.smoke &&
  /^(opened|needs-input)/.test(outcome)
);
process.exitCode = /^(error|stop)/.test(outcome) ? 1 : 0;
