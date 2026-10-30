#!/usr/bin/env node
// Before/after screenshots and GIF recordings for PR descriptions.
// "Before" is production, "after" is the local build. Run with --help for usage.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const HELP = `Usage: node scripts/pr-media.mjs --path <path> [options]

Shoots each path at each width, before (production) and after (local build).

  --path <path>      Page to capture, e.g. / or /resume or /#about. Repeatable.
  --setup <file>     Module whose default export runs before each shot:
                       export default async (page, { side, width }) => { ... }
                     Use it to click, hover, scroll or open dialogs. If it fails on
                     the before side (the feature isn't live yet), that shot is skipped.
  --clip <selector>  Capture only this element instead of the viewport.
  --clip-box <x,y,w,h>  Capture this rectangle of the viewport instead, in CSS
                     pixels. For things that close or move during the setup.
  --name <label>     Add a label to the file names, e.g. --name sheet-open gives
                     resume-sheet-open-after-375.png. Use one per captured state.
  --full-page        Capture the whole page instead of the viewport.
  --theme night      Set data-theme="night" before the page loads.
  --widths <list>    Comma-separated widths. Default: 375,1280.
  --record <secs>    Also record the after side as a GIF: the setup runs, then
                     recording continues for <secs>. Needs ffmpeg; without it
                     the .webm is kept.
  --replay           With --record: restart the page's animations when the
                     recording starts, so animations that play on load are in
                     the GIF (otherwise they finish before it begins).
  --motion           Allow motion in screenshots. By default stills use
                     reduced motion and disabled animations so they're stable.
  --skip-before      Only shoot the after side (new pages).
  --before <url>     Default: https://danielmcgrath.xyz
  --after <url>      Default: serve this repo's ./dist on a free port (run
                     pnpm build first). Pass a URL to use a server you
                     started yourself.
  --out <dir>        Default: $TMPDIR/pr-media
  --url-base <url>   Print a markdown table with image links under this URL.
  -h, --help`;

const { values: opts } = parseArgs({
  options: {
    path: { type: "string", multiple: true },
    setup: { type: "string" },
    clip: { type: "string" },
    "clip-box": { type: "string" },
    name: { type: "string" },
    "full-page": { type: "boolean", default: false },
    theme: { type: "string" },
    widths: { type: "string", default: "375,1280" },
    record: { type: "string" },
    replay: { type: "boolean", default: false },
    motion: { type: "boolean", default: false },
    "skip-before": { type: "boolean", default: false },
    before: { type: "string", default: "https://danielmcgrath.xyz" },
    after: { type: "string" },
    out: { type: "string", default: join(tmpdir(), "pr-media") },
    "url-base": { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help || !opts.path?.length) {
  console.log(HELP);
  process.exit(opts.help ? 0 : 1);
}

const root = resolve(import.meta.dirname, "..");
const widths = opts.widths.split(",").map(Number);
const recordSecs = opts.record ? Number(opts.record) : 0;
const clipBox = opts["clip-box"]
  ? (([x, y, width, height]) => ({ x, y, width, height }))(
      opts["clip-box"].split(",").map(Number),
    )
  : null;
if (clipBox && Object.values(clipBox).some(Number.isNaN)) {
  console.error("--clip-box takes four numbers: x,y,width,height");
  process.exit(1);
}
const outDir = resolve(opts.out);
const setup = opts.setup
  ? (await import(pathToFileURL(resolve(opts.setup)).href)).default
  : null;

/** "/" -> "home", "/resume" -> "resume", "/#about" -> "about"; then the --name label */
const slugOf = (path) =>
  [
    path.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "home",
    opts.name,
  ]
    .filter(Boolean)
    .join("-");

// Phones get a phone-shaped viewport, everything else a laptop one.
const viewportFor = (width) => ({ width, height: width < 760 ? 812 : 900 });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

// Serves ./dist on a free port, the way Netlify serves a static site (/resume finds
// resume/index.html). A server of its own means a dev server left on 4321, possibly
// for another project, never ends up in the screenshots, and it doesn't clash with
// Astro's one-preview-per-project rule.
async function serveDist() {
  const dist = join(root, "dist");
  if (!existsSync(dist)) {
    throw new Error("No ./dist to serve. Run pnpm build first.");
  }
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const base = join(dist, normalize(decodeURIComponent(pathname)));
    if (base.startsWith(dist)) {
      for (const file of [base, join(base, "index.html"), `${base}.html`]) {
        if (existsSync(file) && statSync(file).isFile()) {
          res.writeHead(200, {
            "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          });
          return res.end(await readFile(file));
        }
      }
    }
    const notFound = join(dist, "404.html");
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(existsSync(notFound) ? await readFile(notFound) : "Not found");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function openPage(browser, base, path, contextOptions) {
  const context = await browser.newContext(contextOptions);
  if (opts.theme) {
    await context.addInitScript((theme) => {
      document.documentElement.dataset.theme = theme;
    }, opts.theme);
  }
  const page = await context.newPage();
  const response = await page.goto(new URL(path, base).href, {
    waitUntil: "load",
  });
  if (!response || response.status() >= 400) {
    await context.close();
    return { status: response?.status() ?? "no response" };
  }
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

// Returns the file name, or null with a warning when the shot can't be taken.
async function shoot(browser, side, base, path, width) {
  const label = `${side} ${path} @${width}`;
  const opened = await openPage(browser, base, path, {
    viewport: viewportFor(width),
    // 2x keeps phone shots sharp; desktop at 1x is already wide and keeps files small.
    deviceScaleFactor: width < 760 ? 2 : 1,
    reducedMotion: opts.motion ? "no-preference" : "reduce",
  });
  if (!opened.page) {
    console.warn(`skip ${label}: HTTP ${opened.status}`);
    return null;
  }
  const { context, page } = opened;
  try {
    if (setup) await setup(page, { side, width });
    const file = `${slugOf(path)}-${side}-${width}.png`;
    const shotOptions = {
      path: join(outDir, file),
      animations: opts.motion ? "allow" : "disabled",
    };
    if (clipBox) await page.screenshot({ ...shotOptions, clip: clipBox });
    else if (opts.clip)
      await page
        .locator(opts.clip)
        .filter({ visible: true })
        .first()
        // A selector that matches nothing should fail fast, not after 30 seconds.
        .screenshot({ ...shotOptions, timeout: 10_000 });
    else await page.screenshot({ ...shotOptions, fullPage: opts["full-page"] });
    return file;
  } catch (error) {
    // Expected when the feature isn't in production yet.
    if (side === "before") {
      console.warn(`skip ${label}: ${error.message.split("\n")[0]}`);
      return null;
    }
    throw error;
  } finally {
    await context.close();
  }
}

// Inside the Claude Code sandbox (the backlog loop), traffic has to go through the sandbox's
// proxy, which it announces in HTTPS_PROXY. Chromium ignores that variable, and it can't start
// in its usual multi-process mode there. See docs/research/loop-sandbox.md.
const sandboxProxy = process.env.HTTPS_PROXY
  ? new URL(process.env.HTTPS_PROXY)
  : null;

async function launchBrowser() {
  if (!sandboxProxy) return chromium.launch();
  const launched = [];
  const launch = async () => {
    const browser = await chromium.launch({
      args: ["--no-sandbox", "--single-process", "--no-zygote"],
      proxy: {
        server: `${sandboxProxy.protocol}//${sandboxProxy.host}`,
        username: decodeURIComponent(sandboxProxy.username),
        password: decodeURIComponent(sandboxProxy.password),
        bypass: "localhost,127.0.0.1",
      },
    });
    launched.push(browser);
    return browser;
  };
  // Single-process Chromium crashes when a second context opens, so each context gets a
  // browser of its own, closed with it.
  return {
    newContext: async (options) => {
      const browser = await launch();
      const context = await browser.newContext(options);
      const close = context.close.bind(context);
      context.close = async () => {
        await close();
        await browser.close();
      };
      return context;
    },
    close: () => Promise.all(launched.map((browser) => browser.close())),
  };
}

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

// Records the after side, trimmed to start when the setup does. Returns the file name.
async function record(browser, afterUrl, path, width) {
  const viewport = viewportFor(width);
  const videoDir = await mkdtemp(join(tmpdir(), "pr-media-video-"));
  const opened = await openPage(browser, afterUrl, path, {
    viewport,
    reducedMotion: "no-preference",
    recordVideo: { dir: videoDir, size: viewport },
  });
  if (!opened.page) throw new Error(`after ${path}: HTTP ${opened.status}`);
  const { context, page } = opened;

  // The video starts with the page load; measure it so it can be cut.
  const loadSecs = (await page.evaluate(() => performance.now())) / 1000;
  if (opts.replay) {
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.cancel();
        animation.play();
      }
    });
  }
  if (setup) await setup(page, { side: "after", width });
  // Where to crop: a fixed box, or the element straight after the setup (it may close by the
  // end), or at the end if it only appears later.
  const measure = () =>
    page
      .locator(opts.clip)
      .filter({ visible: true })
      .first()
      .boundingBox({ timeout: 2000 })
      .catch(() => null);
  let box = clipBox ?? (opts.clip ? await measure() : null);
  await page.waitForTimeout(recordSecs * 1000);
  if (opts.clip && !box) box = await measure();
  if (opts.clip && !box)
    console.warn(`--clip ${opts.clip} wasn't visible; recording the viewport`);
  await context.close();
  const webm = await page.video().path();

  const name = `${slugOf(path)}-after-${width}`;
  if (!hasFfmpeg) {
    console.warn(
      "ffmpeg not found: keeping the .webm (brew install ffmpeg for GIFs)",
    );
    await copyFile(webm, join(outDir, `${name}.webm`));
    return `${name}.webm`;
  }

  const filters = [];
  if (box) {
    const x = Math.max(0, Math.round(box.x));
    const y = Math.max(0, Math.round(box.y));
    const w = Math.min(viewport.width - x, Math.round(box.width));
    const h = Math.min(viewport.height - y, Math.round(box.height));
    filters.push(`crop=${w}:${h}:${x}:${y}`);
  }
  filters.push(
    "fps=15",
    "scale='min(800,iw)':-1:flags=lanczos",
    "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
  );
  const gif = join(outDir, `${name}.gif`);
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-ss",
      String(loadSecs),
      "-i",
      webm,
      "-vf",
      filters.join(","),
      gif,
    ],
    { stdio: "inherit" },
  );
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
  const mb = statSync(gif).size / 1024 / 1024;
  if (mb > 3)
    console.warn(
      `${name}.gif is ${mb.toFixed(1)} MB; try --clip or a shorter --record`,
    );
  return `${name}.gif`;
}

function markdown(results) {
  const link = (file) => (file ? `![](${opts["url-base"]}/${file})` : "—");
  const lines = [];
  for (const { path, shots, recordings } of results) {
    lines.push(`**\`${path}\`**`, "");
    if (opts["skip-before"]) {
      lines.push("| | After |", "| --- | --- |");
      for (const w of widths)
        lines.push(`| ${w}px | ${link(shots[w].after)} |`);
    } else {
      lines.push("| | Before | After |", "| --- | --- | --- |");
      for (const w of widths) {
        lines.push(
          `| ${w}px | ${link(shots[w].before)} | ${link(shots[w].after)} |`,
        );
      }
    }
    for (const file of recordings) lines.push("", link(file));
    lines.push("");
  }
  return lines.join("\n");
}

await mkdir(outDir, { recursive: true });
const preview = opts.after ? null : await serveDist();
const afterUrl = opts.after ?? preview.url;
const sides = opts["skip-before"]
  ? [["after", afterUrl]]
  : [
      ["before", opts.before],
      ["after", afterUrl],
    ];
let browser;
try {
  browser = await launchBrowser();
  const results = [];
  for (const path of opts.path) {
    const shots = {};
    for (const width of widths) {
      shots[width] = {};
      for (const [side, base] of sides) {
        shots[width][side] = await shoot(browser, side, base, path, width);
      }
    }
    const recordings = [];
    if (recordSecs > 0) {
      for (const width of widths)
        recordings.push(await record(browser, afterUrl, path, width));
    }
    results.push({ path, shots, recordings });
  }

  console.log(`Wrote to ${outDir}:`);
  for (const { shots, recordings } of results) {
    const files = [
      ...Object.values(shots).flatMap(Object.values),
      ...recordings,
    ];
    for (const file of files.filter(Boolean)) console.log(`  ${file}`);
  }
  if (opts["url-base"]) console.log(`\n${markdown(results)}`);
} finally {
  await browser?.close();
  preview?.server.closeAllConnections();
  preview?.server.close();
}
