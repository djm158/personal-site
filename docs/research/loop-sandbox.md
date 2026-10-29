# Running the loop in Claude Code's sandbox on macOS

Tested 2026-10-29 with `@anthropic-ai/sandbox-runtime` 0.0.81 (`srt`), the open-source runtime
Claude Code's sandbox is built on, on macOS with Playwright's Chromium (headless shell 1248).
Confirmed the same day through a real headless `claude -p` run with `.claude/loop-settings.json`.
Inside Claude Code's sandbox `$TMPDIR` is `/tmp/claude-<uid>`, so runs get an explicit scratch folder.

## Result

The sandbox works for the loop, with three changes: Chromium needs different launch options,
`gh` needs the weaker network isolation option, and the keychain folder has to be denied
explicitly.

| Check | Result |
| --- | --- |
| Read `~/.ssh`, `~/.config/gh` | Blocked by `denyRead` |
| `git` over SSH (Dan's key) | Fails: the sandbox allows no traffic but its proxy, and SSH ignores the proxy |
| `git` over HTTPS | Works through the proxy |
| Hosts not on the allowlist | Blocked (proxy returns 403) |
| `gh` (a Go program) | TLS fails (`x509: OSStatus -26276`) until `enableWeakerNetworkIsolation` is on |
| Keychain (`security find-generic-password`) | **Leaks** by default; blocked once `~/Library/Keychains` is in `denyRead` |
| Chromium, default launch | Crashes: `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied` |
| Chromium, `--single-process` | Works, but only one context per browser |
| Chromium reaching production | Needs the proxy passed to Playwright; it ignores `HTTPS_PROXY` |
| `pr-media.mjs` before/after shots and GIF recording | Work with the changes below |

## Sandbox settings

In Claude Code these sit under `sandbox` in the settings file; the `srt` file used for testing
has the same keys at the top level.

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "enableWeakerNetworkIsolation": true,
    "network": {
      "allowedDomains": [
        "danielmcgrath.xyz",
        "github.com",
        "api.github.com",
        "raw.githubusercontent.com",
        "registry.npmjs.org",
        "api.fontsource.org",
        "cdn.jsdelivr.net"
      ],
      "allowLocalBinding": true
    },
    "filesystem": {
      "denyRead": ["~/.ssh", "~/.config/gh", "~/Library/Keychains"],
      "allowWrite": ["<worktree>", "<pr-assets worktree>", "$TMPDIR"]
    }
  }
}
```

- `enableWeakerNetworkIsolation` lets the sandbox reach `com.apple.trustd.agent`, which Go needs
  to verify certificates. The runtime describes it as "a potential data exfiltration vector
  through the trustd service". Accepted, because `gh` is essential to the loop.
- The macOS profile always allows `com.apple.SecurityServer` and `com.apple.securityd.xpc`, and
  no setting removes them. Denying reads of `~/Library/Keychains` is what blocks keychain
  items: the login keychain is a file that the client reads.
- `api.fontsource.org` and `cdn.jsdelivr.net` are for the build: Astro downloads the site's fonts
  from Fontsource. Without them the build still succeeds, but with no font files, so every
  "after" screenshot shows fallback fonts.
- `allowLocalBinding` is for `pr-media.mjs`, which serves `./dist` on a local port.
- Set `TMPDIR` to a writable folder. Under `srt` it pointed at `/tmp/claude`, which didn't
  exist, and Playwright's `mkdtemp` failed.

## Changes `pr-media.mjs` needs

Apply these only when `HTTPS_PROXY` is set (inside the sandbox), so normal runs don't change:

1. Launch with `args: ["--no-sandbox", "--single-process", "--no-zygote"]`.
2. Pass the proxy from `HTTPS_PROXY` to `chromium.launch({ proxy })` as `server`, `username` and
   `password`, with `bypass: "localhost,127.0.0.1"`.
3. Use one browser per context: single-process Chromium crashes on a second `newContext`.
   A run of four shots plus a GIF took about 5 seconds.

`--no-sandbox` turns off Chromium's own sandbox; the pages it loads are this site's build and
production. `--single-process` isn't a supported Chromium mode, so a Playwright update could
break it. If it does, the fallback is to run `pr-media.mjs` outside the sandbox with
`excludedCommands` while everything else stays inside. Check first that this still works with
`allowUnsandboxedCommands: false`; it wasn't tested.
