#!/usr/bin/env node
// Installation tokens for the loop's GitHub App (djm158-site-loop).
//
// The App's private key lives in the macOS login keychain, base64-encoded. Only this file
// reads it, in the driver's process, outside the sandbox. Runs get a 1-hour token limited to
// this repo, and the driver revokes it when the run ends.
//
// Run directly to check the setup: it mints a token, prints what it can do (never the token
// itself), and revokes it.

import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { userInfo } from "node:os";

const APP_ID = 5532866;
const INSTALLATION_ID = 176685886;
const REPO = "personal-site";
const KEYCHAIN_SERVICE = "personal-site-loop-app-key";

// What runs need. Asking for exactly this means a token fails to mint if the App is missing a
// permission, and never gets one the App gained later by mistake.
const PERMISSIONS = {
  contents: "write", // push agent/* and pr-assets
  pull_requests: "write", // open PRs, comment
  issues: "write", // labels (GitHub keeps PR labels on the issue)
  checks: "read", // CI results
  statuses: "read", // the Netlify deploy status
  actions: "read", // failed CI logs
  metadata: "read",
};

const API = "https://api.github.com";
const HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "personal-site-loop",
};

function readPrivateKey() {
  let base64;
  try {
    base64 = execFileSync(
      "security",
      [
        "find-generic-password",
        "-a",
        userInfo().username,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error(
      `No keychain item "${KEYCHAIN_SERVICE}". Store the App's private key there (see docs/research/loop-github-identity.md).`,
    );
  }
  return createPrivateKey(Buffer.from(base64, "base64").toString("utf8"));
}

// A JWT that proves the request comes from the App. GitHub allows at most 10 minutes, and
// iat is backdated a minute for clock drift.
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const part = (object) =>
    Buffer.from(JSON.stringify(object)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: now - 60, exp: now + 540, iss: String(APP_ID) })}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    readPrivateKey(),
  ).toString("base64url");
  return `${unsigned}.${signature}`;
}

/** @returns {Promise<{ token: string, expiresAt: string, permissions: Record<string, string> }>} */
export async function mintToken() {
  const response = await fetch(
    `${API}/app/installations/${INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: { ...HEADERS, authorization: `Bearer ${appJwt()}` },
      body: JSON.stringify({ repositories: [REPO], permissions: PERMISSIONS }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Minting a token failed (HTTP ${response.status}): ${body.message}`,
    );
  }
  return {
    token: body.token,
    expiresAt: body.expires_at,
    permissions: body.permissions,
  };
}

export async function revokeToken(token) {
  const response = await fetch(`${API}/installation/token`, {
    method: "DELETE",
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
  });
  if (response.status !== 204) {
    console.warn(
      `Revoking the token failed (HTTP ${response.status}); it expires within the hour anyway.`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { token, expiresAt, permissions } = await mintToken();
  console.log(
    `Minted a token for ${REPO}, expiring ${expiresAt}. Permissions:`,
  );
  for (const [name, level] of Object.entries(permissions))
    console.log(`  ${name}: ${level}`);
  await revokeToken(token);
  console.log("Revoked it again.");
}
