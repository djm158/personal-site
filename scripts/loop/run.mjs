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

async function runItem(item, token, mode = null) {
  const action = {
    resume: "Resuming",
    fix: "Fixing",
    rebase: "Merging main into",
    retry: "Retrying, replacing",
  }[mode?.kind];
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
    kind: opts.smoke ? "smoke" : (mode?.kind ?? "new"),
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
    const { mainCi, open, pick, items } = survey(gh);
    if (open.length === 0) log("  none");
    if (mainCi?.conclusion === "failure" && !opts.force) {
      log(
        `Stopping: CI is failing on main (${mainCi.url}). Fix it first, or rerun with --force.`,
      );
      return "stop";
    }

    // Finish answered PRs before starting anything new. They're already open, so the cap
    // doesn't apply.
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
        if (!opts["dry-run"])
          gh(
            "api",
            "-X",
            "POST",
            `repos/${REPO}/issues/${pr.number}/labels`,
            "-f",
            "labels[]=reviewed",
          );
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

let outcome;
do {
  outcome = await pass();
} while (
  opts["until-idle"] &&
  !opts.smoke &&
  /^(opened|needs-input|fixed|rebased)/.test(outcome)
);
process.exitCode = /^(error|stop)/.test(outcome) ? 1 : 0;
