# Loop GitHub identity: machine user or GitHub App

Research note, 2026-10-29. The question: should the local backlog loop (`claude -p` on Dan's
Mac, one run per backlog item) act on GitHub as a separate machine-user account or as a GitHub
App? It follows the "own identity" gap in [agentic-backlog-loop.md](agentic-backlog-loop.md#guardrails-and-permissions).

The setup it assumes:

- The repo is public, `djm158/personal-site`, and owned by a personal account.
- Each run creates a worktree and pushes `agent/<slug>`. It opens PRs with `gh pr create`,
  adds and removes the `agent`, `needs-input` and `reviewed` labels, comments, and pushes
  screenshots to an orphan `pr-assets` branch. Later passes push fixes to those branches and
  rebase them.
- A ruleset on `main` will require a PR, CI, the content guard and one approval. Only Dan can
  bypass it.
- The review is `claude-code-action@v1`, and Netlify builds deploy previews.
- Everything runs on Dan's Claude subscription.

How to read the citations:

- **ToS / Docs**: GitHub's Terms of Service, or GitHub or Netlify documentation. Pages are
  undated unless stated, and were read on 2026-10-29.
- **Source**: code or docs in a first-party repo. `cli/cli` was read at `main`, and the local
  `gh` is 2.103.2. `claude-code-action` was read at `main` `d70510b`, which `v1` points to
  (compare shows them identical).
- **Repo check**: something I confirmed in this repository or with a read-only `gh api` call
  on it.
- **Inference**: my reasoning from the cited facts, not a claim any source makes.

## 1. Summary

**Recommendation: a private GitHub App installed only on `personal-site`**, with no
`Workflows` permission and no bypass, plus the planned ruleset with only the Repository admin
role (Dan) on the bypass list. Use the App for git over HTTPS as well; no deploy key.

The factors that decide it:

1. **The machine user can't have a narrow token.** Fine-grained PATs don't work on repos where
   the user is a collaborator, and a token can only reach resources owned by one owner. That
   leaves a classic PAT (`public_repo`, which may never expire) or an SSH key (which has no
   scopes at all). The App mints a 1-hour token for one repo, with only the permissions it
   asks for, and the driver can revoke it when the run ends.
   → [Local auth](#2-local-auth-for-gh-and-git-push)
2. **The ruleset works either way.** Bypass is granted by role, team or App. Dan's
   `admin` role can be on the list while the machine user's `write` role, or the App, stays
   off. Neither identity can approve its own PR. Both *could* merge once Dan approves. No
   source says whether "Restrict updates" stops that, so test it.
   → [Rulesets](#5-rulesets-on-a-personal-account-repo)
3. **The App gives a server-side block on workflow edits.** Without the `Workflows`
   permission, the App can't push changes under `.github/workflows`. A classic PAT without the
   `workflow` scope gives the same block, but an SSH key goes around it.
   → [Permissions](#3-permission-granularity)
4. **The review Action needs one line for the App.** Its actor is a `Bot`, so the review
   workflow needs `allowed_bots: <app-slug>`. A machine user passes as a `User` with write
   access. → [claude-code-action](#6-claude-code-action-and-bot-actors)
5. **Neither option helps if the agent can reach Dan's own credentials.** *Repo check:* `gh` is
   logged in as `djm158` from the keyring with `repo` and `workflow` scopes, and `origin` uses
   Dan's SSH key. Any agent that can run `gh auth token` or `git push git@github.com:…` can act
   as Dan, whatever `GH_TOKEN` says. → [Secrets](#9-storing-secrets-on-macos)

Both identities fire `pull_request` and `push` workflows, get Netlify previews on the same
terms, and are allowed by GitHub's ToS. The machine user wins on signed commits and needs no
token-minting script. Neither of those outweighs factors 1 and 3.

## 2. Findings

### 1. GitHub ToS on machine accounts

**What the sources say**

- "You must be a human to create an Account. Accounts registered by 'bots' or other automated
  methods are not permitted. We do permit machine accounts" (ToS §B.3, effective 2026-04-27)
  [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
- A machine account is "set up by an individual human who accepts the Terms on behalf of the
  Account, provides a valid email address, and is responsible for its actions". It is "used
  exclusively for performing automated tasks". "The owner of the Account is ultimately
  responsible for the machine's actions. You may maintain no more than one free machine account
  in addition to your free Personal Account" (ToS) [same](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
- GitHub's own gloss: "you cannot automate the creation of accounts. But if you want to create
  a single machine user for automating tasks … that is totally cool" (docs)
  [Managing deploy keys: Machine users](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#machine-users).
- Accounts that "contribute code" may be picked for mandatory 2FA. Bots and service accounts
  picked this way "must enroll in 2FA", and tokens keep working if enrollment lapses (docs)
  [About mandatory 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/about-mandatory-two-factor-authentication).
- GitHub Apps "are not tied to a user account and do not consume a seat" (docs)
  [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app).
  The ToS account terms don't mention GitHub Apps, so an App doesn't use up the one free
  machine account (inference from the ToS saying nothing about Apps).

**For this setup:** one machine account for the loop is allowed. Dan creates it by hand,
gives it its own email address, is responsible for what it does, and may need to set up 2FA
for it. An App raises no account question.

### 2. Local auth for `gh` and `git push`

**Machine user: what the sources say**

- Fine-grained PAT gaps include "contribute to repositories where the user is an outside or
  repository collaborator". Also: "The token will only be able to access resources owned by the
  selected resource owner", which is the user or one of their orgs (docs)
  [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations).
  So a machine user can't point a fine-grained PAT at `djm158/personal-site`. *Inference:* the
  repo is owned by `djm158`, who is not the machine user and not an org it belongs to.
- That leaves a classic PAT. "Only personal access tokens (classic) have write access for public
  repositories that are not owned by you". A classic token "can access every repository that
  you can access" (docs) [same](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#personal-access-tokens-classic).
  The narrowest classic scope is `public_repo`: "read/write access to code, commit statuses,
  repository projects, collaborators, and deployment statuses for public repositories" (docs)
  [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
- Expiry: you pick a date or a custom one when you create the token. "Infinite lifetimes are
  allowed but may be blocked by a maximum lifetime policy" from an org or enterprise, which a
  personal account doesn't have. GitHub removes tokens "that haven't been used in a year"
  (docs) [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
- PATs work only for HTTPS git. "The username is not used to authenticate you" (docs)
  [same](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#using-a-personal-access-token-on-the-command-line).
  The alternative is an SSH key on the machine account, which GitHub suggests for machine users
  (docs) [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#machine-users).

**GitHub App: what the sources say**

- The driver signs a JWT with RS256. `iat` should be "60 seconds in the past", and `exp` "no
  more than 10 minutes into the future". `iss` is the client ID. The docs include a Bash
  example that uses only `openssl` (docs)
  [Generating a JWT for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
- `POST /app/installations/{id}/access_tokens` with the JWT returns a token that "will expire
  after 1 hour". The `repositories` and `permissions` body fields can narrow it further, but
  never beyond what the installation has (docs)
  [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
  Since 2026-04-27, tokens are rolling out in a new `ghs_APPID_JWT` format and are no longer
  always 40 characters (docs) [same](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
- For git, the app needs the "Contents" permission. Use the token as the HTTP password with
  `x-access-token` as the user (docs)
  [Authenticating as an installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
- `gh` reads `GH_TOKEN`, which "takes precedence over previously stored credentials". The
  `gh auth login` help says to "Favour setting `GH_TOKEN`" for headless use, and shows it with
  the Actions token, which is itself an installation token (source)
  `gh help environment`, `gh auth login --help` (cli/cli v2.103.2).
- `gh auth git-credential` answers git with `username=x-access-token` and the env token when the
  token's source ends in `_TOKEN`. Otherwise it uses the stored account (source)
  [cli/cli `pkg/cmd/auth/gitcredential/helper.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/auth/gitcredential/helper.go).
  `gh auth setup-git` installs that helper "for all authenticated hosts" (source)
  `gh auth setup-git --help`. `claude-code-action` does the same with a two-line helper script
  that echoes `x-access-token` and `$GH_TOKEN` (source)
  [`src/github/operations/git-config.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/operations/git-config.ts).
- An empty `credential.helper` entry "resets the helper list to empty", so later entries replace
  inherited helpers such as the system `osxkeychain` (source) `gitcredentials(7)`.

**What the driver does on each run (App)**, assembled from the docs above:

1. Read the private key from the keychain, in the driver and never in the agent.
2. Build a JWT that lasts at most 10 minutes.
3. Call `POST …/access_tokens` with `repositories: ["personal-site"]` and `permissions` set to
   `contents`, `pull_requests` and `issues`, all `write`.
4. Start `claude -p` with `GH_TOKEN` set. The worktree uses an HTTPS push URL, an empty
   `credential.helper` followed by `!gh auth git-credential`, and the bot's `user.name` and
   `user.email` (see [§8](#8-commit-attribution-and-verified-signatures)).
5. Keep each run under an hour, or mint a fresh token for each pass. The token can't be
   refreshed in the middle of a run without the key, and the agent must never have the key.
6. When the run ends, call `DELETE /installation/token`
   ([REST: installations](https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token)).

**What the driver does on each run (machine user):** read the PAT, set `GH_TOKEN`, and
configure the same credential helper. There is nothing to mint, so the agent holds the real,
long-lived credential for the whole run (inference).

### 3. Permission granularity

**What the sources say**

- A personal repo has only "the repository owner and collaborators". Collaborators can push,
  "Manage labels", "Create, merge, and close pull requests", "Enable and disable auto-merge",
  and "Submit a review on a pull request that affects the mergeability". Only the owner can
  merge a PR on a protected branch with no approving reviews (docs)
  [Permission levels for a personal account repository](https://docs.github.com/en/account-and-profile/reference/permission-levels-for-a-personal-account-repository).
- "Personal repositories always grant collaborators read/write access". Read-only is only
  possible in orgs (docs)
  [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#cons-of-machine-users).
  The REST `permission` argument for adding a collaborator is "Only valid on organization-owned
  repositories" (docs) [REST: collaborators](https://docs.github.com/en/rest/collaborators/collaborators).
- App permissions start at none, and you pick each one. "The success of an API request with an
  installation access token only depends on the app's permissions". "If your app specifically
  needs to access or edit Actions files in the `.github/workflows` directory, request the
  'Workflows' repository permission" (docs)
  [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).
- Endpoints the loop needs:
  - "Pull requests: write" to create and update PRs.
  - Issues or Pull requests write for labels and comments.
  - "Contents: write" to create refs and to merge.

  The same table says "Workflows" is needed as well for content and ref writes that touch
  workflow files (docs)
  [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps),
  […for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).
- Classic scope `workflow`: "Grants the ability to add and update GitHub Actions workflow
  files" (docs) [Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

**For this setup (inference):**

- Merging needs `contents: write`, the same permission as pushing a branch. So neither
  identity can be given push without merge. Stopping merges falls to the ruleset
  ([§5](#5-rulesets-on-a-personal-account-repo)).
- What the App can drop: Workflows, Administration, Actions and everything else. The machine
  user gets every collaborator action GitHub lists. That includes releases, wiki, packages
  and auto-merge.
- Labels can't be limited to particular names under either option. The content guard already
  checks who added `content-ok`, so that holds for both.

### 4. Do pushes and PRs trigger Actions?

**What the sources say**

- "Events triggered by the `GITHUB_TOKEN` will not create a new workflow run", with exceptions.
  A `pull_request` opened by `GITHUB_TOKEN` creates runs in an **approval-required** state. A
  GitHub App installation token or a PAT used instead "also lets `pull_request` workflows run
  automatically (without the approval prompt)" (docs)
  [Triggering a workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow).
- First-time-contributor approval is described under "Controlling changes from forks to
  workflows in public repositories". It checks the PR author and the actor that triggered the
  event. "By default, all first-time contributors require approval". `pull_request_target`
  runs "will always run, regardless of approval settings" (docs)
  [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#controlling-changes-from-forks-to-workflows-in-public-repositories),
  [Approving workflow runs from forks](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/approving-workflow-runs-from-public-forks).

**For this setup:**

- Both identities push from outside Actions with their own token, never `GITHUB_TOKEN`. So
  `ci.yml`, which listens for `pull_request` and pushes to `main`, runs for both. *Inference:*
  the docs name only `GITHUB_TOKEN` as the exception.
- The approval gate is documented only for fork PRs, and the loop pushes branches to the base
  repo. The docs don't say outright that same-repo PRs by a new collaborator or App are exempt,
  so watch the first agent PR. *Repo check:* `content-guard.yml` uses `pull_request_target`,
  so it runs without approval either way.
- The `GITHUB_TOKEN` exception matters only if the driver later moves into Actions.

### 5. Rulesets on a personal-account repo

**What the sources say**

- "Rulesets are available in public repositories with GitHub Free" (docs, page banner)
  [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).
  This confirms the claim the earlier note left unverified.
- Who can be given bypass: "Repository admins, organization owners, and enterprise owners";
  "The maintain or write role"; teams; "GitHub Apps"; Dependabot. Individual users are not on
  the list (docs)
  [Creating rulesets for a repository](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository#granting-bypass-permissions-for-your-branch-or-tag-ruleset).
- "Restrict updates: only users with bypass permissions can push to branches … whose name
  matches". "Require a pull request before merging" can require a number of approvals "from
  people with write permissions". It can also require approval of the most recent push "from
  someone other than the last person to push" (docs)
  [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
- "Pull request authors cannot approve their own pull requests". "Repository owners and
  administrators can merge a pull request even if it hasn't received an approving review"
  (docs)
  [Approving a pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews).
- The org-only "Restrict who can push" in classic branch protection keeps people "prevented
  from merging … when the required checks fail". It is not available for personal repos (docs)
  [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#restrict-who-can-push-to-matching-branches).
- *Repo check:* `gh api …/collaborators/djm158/permission` returns `admin`, and the repo has no
  rulesets yet.

**For this setup:**

| Question | Machine user | GitHub App |
| --- | --- | --- |
| Left off the bypass list while Dan is on it? | Yes. Put only "Repository admin" on the list, never "Write". A personal-repo collaborator has `write` ([§3](#3-permission-granularity)) | Yes. Add no App to the list |
| Does Dan's approval count on its PRs? | Yes. Dan isn't the author and has write | Yes, for the same reason |
| Can it approve its own PR? | No: authors can't approve their own | No, by the same rule. *Inference:* the docs say "authors", not "users" |
| Can it merge its own PR? | Not before Dan approves and the checks pass. After that, yes: collaborators can merge | Same, through `PUT …/merge` with `contents: write` |
| Can it push straight to `main`? | No, if the ruleset requires a PR and the role has no bypass | Same |

**Gap the docs leave open:** the docs don't say whether "Restrict updates" (bypass: admin
only) also blocks *merging a PR* by someone without bypass. If it does, it closes the "merge
after Dan approves" hole for both options. Test it once with the loop identity before relying
on it. Otherwise the client-side `gh pr merge` deny rule is the only thing stopping that merge.
If Dan ever pushes to an agent branch himself, "approval of the most recent push" means his own
approval can't count for that push.

### 6. claude-code-action and bot actors

**What the sources say (source, `main` = `v1`)**

- PR events `opened`, `synchronize`, `ready_for_review` and `reopened` with a `prompt` run in
  agent mode
  ([`src/modes/detector.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/modes/detector.ts)).
  Agent mode calls `checkHumanActor` first
  ([`src/modes/agent/index.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/modes/agent/index.ts)).
- `checkHumanActor` looks up `GITHUB_ACTOR` with `users.getByUsername`.
  - If `type !== "User"`, it throws "Workflow initiated by non-human actor" unless the actor
    is in `allowed_bots`. A `[bot]` suffix is stripped before matching.
  - An actor that returns 404 is treated as an App and gets the same allowlist check.
  - `allowed_bots` "is only for bot actors and is not consulted" for Users.

  [`src/github/validation/actor.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/validation/actor.ts).
- `run.ts` calls `checkWritePermissions` for PR events
  ([`src/entrypoints/run.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/entrypoints/run.ts)).
  An actor ending in `[bot]` passes at once. Any other actor needs `admin` or `write` from the
  collaborator-permission endpoint
  ([`src/github/validation/permissions.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/validation/permissions.ts)).
- "By default, GitHub Apps and bots cannot trigger this action". "Allowed bots are not checked
  for repository permissions". Prefer an explicit list over `'*'` (source)
  [`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md).
- The code-review plugin skips a PR that "does not need code review (e.g. automated PR …)", but
  adds "Still review Claude generated PR's" (source)
  [claude-plugins-official `code-review.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md).

**For this setup:**

- **Machine user:** it is a `User` with `write`, so both checks pass with no config.
- **App:** the actor is `<slug>[bot]`, of type `Bot`. The review workflow needs
  `allowed_bots: <slug>`, or every `opened` and `reopened` event the loop triggers will fail.
  The same applies to `ready_for_review` if the driver runs `gh pr ready` with the App token.
  Keep it to that one name, never `'*'`, on this public repo.
- **Both:** whether the plugin's model treats a loop PR as an "automated PR" is a judgement
  call. The `Co-Authored-By: Claude` trailer and the "Claude generated" line point towards
  reviewing it. A `[bot]` author might tip the balance the other way, which is untested
  (inference).

### 7. Netlify deploy previews

**What the sources say**

- The Deploy Request Policy builds "changes pushed to private repositories" only from
  recognized authors: Owners, Developers, Git Contributors, and "bots from GitHub Marketplace …
  in private repositories". Other bots are unrecognized (docs)
  [Netlify, Deploy overview: Deploy permissions](https://docs.netlify.com/deploy/deploy-overview/#deploy-permissions).
- For public repos, the separate sensitive variable policy applies. Deploys from "people,
  automated services, or bots from outside your Netlify team" are always untrusted, and Git
  accounts "connected to a site member" deploy without restrictions. The default is **Require
  approval**, applied "when Netlify detects potentially sensitive environment variables". The
  other options are *Deploy without sensitive variables* and *Deploy without restrictions*
  (docs)
  [Netlify, Sensitive variable policy](https://docs.netlify.com/build/environment-variables/get-started/#sensitive-variable-policy).
- The docs don't say how Netlify decides who authored a PR deploy (PR opener, pusher or commit
  email). They also don't say how a custom, non-Marketplace App is classed on a public repo.

**For this setup:**

- The repo is public, so the private-repo Deploy Request Policy doesn't apply to either option.
- Both identities are "outside your Netlify team", so both previews count as untrusted. They
  need approval only if the site has variables Netlify flags as sensitive. *Repo check:*
  `netlify.toml` sets only `TYPST_VERSION`. Variables set in the Netlify UI weren't checked.
- A machine user could be linked to a Netlify team member to become trusted. An App can't be
  linked. If previews show "pending approval", choose *Deploy without sensitive variables*
  rather than linking an account.

### 8. Commit attribution and verified signatures

**What the sources say**

- GitHub links pushed commits to an account by "the email address set in your local Git
  configuration". A user's noreply address is `ID+USERNAME@users.noreply.github.com` (docs)
  [Setting your commit email address](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address),
  [Email addresses reference](https://docs.github.com/en/account-and-profile/reference/email-addresses-reference#your-noreply-email-address).
  GitHub's docs don't document the address for an App's bot user.
  `claude-code-action` uses `${botId}+${botName}@users.noreply.github.com`, with the bot
  *user* ID, for example `41898282+claude[bot]` (source)
  [`git-config.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/operations/git-config.ts),
  [`constants.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/constants.ts).
- Bot signatures are verified "only … if the request is verified and authenticated as the
  GitHub App or bot and contains no custom author information, custom committer information,
  and no custom signature information, such as Commits API". Users sign with GPG, SSH or S/MIME
  keys on their account (docs)
  [About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).
- `use_commit_signing` makes commits through the API, so they are "verified from the GitHub
  App", but it "cannot perform complex git operations like rebasing". An SSH signing key gives
  verified commits "attributed to the GitHub account that owns the signing key" (source)
  [`docs/security.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md#commit-signing).
- If a branch requires signed commits, unsigned commits on the head branch "can block a squash
  merge, even though GitHub would sign the final squash commit" (docs)
  [Available rules: Require signed commits](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-signed-commits).

**For this setup:**

- **App:** commits made with `git commit` and pushed are unsigned. They show as authored by
  `<slug>[bot]` if `user.email` uses the bot-ID form, which is unverified in GitHub's docs and
  worth checking on the first PR. API-made commits would be verified but rule out rebasing,
  which the fix pass needs. So don't enable "Require signed commits" on `main`.
- **Machine user:** add an SSH signing key to the account and set `gpg.format=ssh` in the
  loop's git config to get "Verified" on every commit, rebases included.
- **Both:** the content guard's `byLoop` check reads `c.author?.login`, so it works only if
  the commit email links to the account. Set `LOOP_LOGINS` to the login (`<slug>[bot]` for the
  App).

### 9. Storing secrets on macOS

**What the sources say**

- The App private key "grants access to every account that the app is installed on". Store it
  "in a key vault … sign-only". An environment variable is weaker, because an attacker who reads
  it gains "persistent authentication as the GitHub App" (docs)
  [Best practices for creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app),
  [Managing private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps#storing-private-keys).
- The same page says an app that "runs on a user device" should "not generate installation
  access tokens since doing so requires a private key" (docs)
  [Best practices](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app).
  *Inference:* that advice is about apps shipped to other people's devices. Here Dan owns the
  App and the Mac, and is its only user. The underlying risk, a key on a machine the agent
  shares, still applies.
- `security add-generic-password … -T appPath` limits which apps may read an item, and `-A`
  lets any app read it ("insecure"). `find-generic-password -w` prints the secret (source)
  `man security`. The man page doesn't say what the default access list is when `-T` is left
  out.
- `gh` keeps its token in the system keyring through `zalando/go-keyring` (source)
  [cli/cli `internal/keyring/keyring.go`](https://github.com/cli/cli/blob/trunk/internal/keyring/keyring.go).
  `gh auth token --user <login>` prints a stored account's token (source)
  `gh auth token --help`.

**For this setup (inference):**

- A deny rule on reading credential files doesn't cover the keychain. The keychain is read
  through `security` or `gh`, not by opening a file, and the earlier note found that Claude Code
  Bash rules are easy to sidestep
  ([agentic-backlog-loop.md](agentic-backlog-loop.md#guardrails-and-permissions)). Whatever the
  driver can read silently as Dan's macOS user, the agent can probably read too.
- **App:** keep the PEM only in the keychain, stored base64-encoded, and delete the downloaded
  file. Only the driver reads it, piping it into `openssl dgst -sign` through process
  substitution. The agent gets only the 1-hour token, which it could reach in its environment
  anyway. A key the agent could read would be a lasting credential, so check the keychain
  access list by running `security find-generic-password -w` from inside a sandboxed `claude`
  Bash call.
- **Machine user:** the PAT goes into the agent's environment, so the agent holds the lasting
  credential itself no matter where it's stored.
- **Both:** Dan's own `gh` keyring token (`repo` and `workflow` scopes) and his SSH key are
  reachable unless the agent is sandboxed away from them. The strongest local fix is to run the
  loop as a separate macOS user with no `gh` login and no SSH key. Next best is the Claude Code
  sandbox, with `~/.ssh` and `~/.config/gh` on `denyRead` and network limited to the needed
  hosts. I haven't verified whether the sandbox also blocks keychain lookups.

### 10. Revocation and blast radius

**What the sources say**

- An installation token expires after 1 hour and can be revoked with `DELETE
  /installation/token` ([REST: installations](https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token)).
  Dan can suspend or uninstall the App to block it at once (docs)
  [Reviewing and modifying installed GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).
  The App owner can also suspend it through
  [`PUT /app/installations/{id}/suspended`](https://docs.github.com/en/rest/apps/apps#suspend-an-app-installation).
- App private keys "do not expire and instead need to be manually revoked". Up to 25 can exist,
  and you must generate a new key before deleting the last one (docs)
  [Managing private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).
- PATs "become inactive if the user loses access to the resource" (docs)
  [Managing your PATs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
  A token "pushed to a public repository or public gist" is revoked automatically, for PATs and
  App tokens alike (docs)
  [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation).
- The docs don't say whether the new stateless `ghs_APPID_JWT` tokens can be revoked exactly
  like the old ones.

**For this setup:**

| Leak | Machine user (classic PAT `public_repo`) | App installation token | App private key |
| --- | --- | --- | --- |
| Lifetime | Until its expiry, or forever if none was set | ≤ 1 hour, less if the driver revokes it | Until Dan deletes the key |
| Reach | Write to `personal-site`. Also acts publicly as the machine user anywhere on GitHub (comments, issues, forks) | Only `personal-site`, and only Contents, PRs and Issues | Mints tokens with every permission the installation has |
| Kill switch | Remove the collaborator (Dan can do this alone), then revoke the token (needs the machine login) | Wait an hour, or revoke | Suspend or uninstall (Dan can do this alone), then rotate the key |
| Can it get past `main`? | No, if the ruleset holds | No | No |

*Inference:* the App's worst case (the key) is about as bad as the machine user's normal case
(the PAT). The App's normal case is much smaller.

### 11. Setup, step by step

**Machine user** (about 30–45 min, plus a PAT rotation now and then)

1. Create the account by hand, with its own email address, a TOTP 2FA app and saved recovery
   codes.
2. From `djm158`, invite it as a collaborator, then accept the invite as the machine user.
3. As the machine user, create a classic PAT with `public_repo` only (no `workflow`) and an
   expiry such as 90 days.
4. Optionally add an SSH *signing* key to the machine account, and set `gpg.format=ssh`,
   `user.signingkey` and `commit.gpgsign` in the loop's git config.
5. Store the PAT in the keychain. The driver exports it as `GH_TOKEN` and sets the worktree's
   push URL to HTTPS, with an empty `credential.helper` and then `!gh auth git-credential`. Set
   `user.name` and `user.email` to the machine account's `ID+login` noreply address.
6. Set the repo variable `LOOP_LOGINS` to the machine login.
7. Create the ruleset on `main` ([below](#ruleset-common-to-both)).
8. Open one test PR. Check that CI and the content guard ran, the review ran, Netlify built a
   preview, and the commits link to the account.

**GitHub App** (about 45–60 min, most of it the token script)

1. In `djm158` → Settings → Developer settings → GitHub Apps → New:
   - Homepage: the repo URL.
   - Untick webhook **Active**.
   - Repository permissions: Contents, Pull requests and Issues, all read and write. Leave
     Workflows and everything else off.
   - Installable "Only on this account".

   [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).
2. Generate a private key. Store it base64-encoded in the keychain, then delete the PEM file.
3. Install the App on `djm158` → "Only select repositories" → `personal-site`
   ([Installing your own GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)).
   Note the client ID and installation ID.
4. Look up the bot user ID with `gh api 'users/<slug>%5Bbot%5D' --jq .id`, for `user.email`.
   This is the claude-code-action pattern, not something GitHub documents.
5. Add the per-run mint, export and revoke steps to the driver ([§2](#2-local-auth-for-gh-and-git-push)),
   using the docs' Bash JWT example and `curl`. Also add a run timeout under 60 minutes.
6. Set `LOOP_LOGINS` to `<slug>[bot]`. In the review workflow, set `allowed_bots: <slug>`.
7. Create the ruleset on `main` ([below](#ruleset-common-to-both)).
8. Open one test PR and check the same things as for the machine user. Also check that a push
   touching `.github/workflows/` is rejected.

#### Ruleset common to both

Target the default branch with these rules:

- Require a pull request, with 1 approval and stale approvals dismissed.
- Require the status checks "Check, test and build" and "Content guard".
- Block force pushes, and restrict deletions.
- Optionally restrict updates.

Bypass: **Repository admin** only, set to "Always" so Dan can still push directly. Don't add
the Write role or the App. Leave `agent/**` alone, because fix passes force-push there after a
rebase. [Creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

## 3. Comparison

| | Machine user | GitHub App |
| --- | --- | --- |
| ToS | Allowed: one free machine account, created by a human | Not an account; the ToS doesn't mention Apps |
| Token type for this repo | Classic PAT (`public_repo`) or SSH key. Fine-grained isn't possible | 1-hour installation token, limited to this repo and these permissions |
| Expiry | Optional; can be never | 1 hour, fixed. The key never expires |
| Per-run driver work | Export the PAT | Sign a JWT, mint, export, and revoke at the end |
| Permissions | Every collaborator action. Can't be made read-only on a personal repo | Only what you choose. No Workflows unless granted |
| Block on workflow-file edits | Only with a PAT lacking `workflow`; an SSH key goes around it | Yes, while Workflows isn't granted |
| Triggers `pull_request` / `push` | Yes | Yes |
| Left off ruleset bypass | Yes (`write` role not listed) | Yes (App not listed) |
| Approve own PR | No | No |
| Merge own PR after Dan approves | Yes, unless Restrict updates blocks it (untested) | Same |
| claude-code-action | Works as is | Needs `allowed_bots: <slug>` |
| Netlify preview | Untrusted unless linked to a Netlify member; gated only if there are sensitive variables | Untrusted and can't be linked; same gate |
| Verified commits | Yes, with an SSH signing key, rebases included | Only through API commits, which can't rebase |
| Blast radius of a leak | Long-lived write, plus a public account to misuse | ≤ 1 hour, one repo. Key leak: until rotated |
| Kill switch Dan holds alone | Remove the collaborator | Suspend or uninstall |
| Setup | Second account, email, 2FA, invite, PAT | Register, install, key, mint script |

## 4. Recommendation

**Use a GitHub App.** It is the only option where the credential the agent holds is
short-lived, limited to one repo, and missing the Workflows permission. It also doesn't need
a second account kept alive with 2FA and PAT rotation. Its costs are a small token-minting step
in the driver, `allowed_bots: <slug>` in the review workflow, and unsigned commits. The fix
pass rebases, so verified commits were never on offer for the App.

**Hybrid options considered**

- **App plus deploy key for git:** not recommended. The installation token already handles
  HTTPS git. A write deploy key "can perform the same actions as … a collaborator on a personal
  repository" and has "no expiry date". It also isn't on the ruleset bypass list. GitHub itself
  recommends "using a GitHub App instead" (docs)
  [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys).
  The only gain would be avoiding the 1-hour expiry, and a run timeout handles that.
- **App for the loop, machine user only for signing:** not worth it. Commits authored by the
  bot can't be signed by another account's key and still show as the bot (inference from the
  verification rules in §8).
- **Driver-held credentials (App, optional later step):** the driver, not the agent, does
  `git push`, `gh pr create` and label changes from the run's structured result. The agent then
  needs no token, which also takes the Bash-pattern problem out of play. This is a bigger change
  to `backlog-iteration.md`, so treat it as a follow-up.

**Before relying on it** (these come from the docs gaps above):

- Isolate the agent from Dan's own `gh` keyring token and SSH key ([§9](#9-storing-secrets-on-macos)).
- Test whether "Restrict updates" blocks the App from merging ([§5](#5-rulesets-on-a-personal-account-repo)).
- On the first PR, check the bot commit email links to the bot account, the review ran,
  Actions didn't ask for approval, and the Netlify preview wasn't held.

## 5. Sources

| Source | Date | Type | What it contributed |
| --- | --- | --- | --- |
| [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) | effective 2026-04-27 | ToS | Machine account definition and the one-free-machine-account limit |
| [Types of GitHub accounts](https://docs.github.com/en/get-started/learning-about-github/types-of-github-accounts) | undated | Docs | "Machine user" term |
| [Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) | undated | Docs | Machine users get read/write on personal repos; ToS gloss; deploy key powers and risks |
| [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) | undated | Docs | Fine-grained gaps for collaborators, resource owner, classic token reach, expiry, HTTPS only |
| [Scopes for OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) | undated | Docs | `public_repo` and `workflow` scopes |
| [About mandatory 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/about-mandatory-two-factor-authentication) | undated | Docs | Service accounts picked for 2FA must enroll |
| [Generating a JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app) | undated | Docs | JWT claims, 10-minute maximum, Bash example |
| [Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) | undated | Docs | 1-hour expiry, narrowing by repo and permission, new token format |
| [Authenticating as an installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) | undated | Docs | `x-access-token` HTTPS git; actions attributed to the app |
| [Managing private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps) | undated | Docs | Keys don't expire; 25 maximum; storage advice |
| [Best practices for creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app) | undated | Docs | Least permissions, key storage, user-device caveat, token lifetimes |
| [Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app) | undated | Docs | Apps aren't tied to a user; App versus PAT advice |
| [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) | undated | Docs | No default permissions; Workflows permission for `.github/workflows` |
| [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) | undated | Docs | Webhook "Active" toggle; "Only on this account" |
| [Installing your own GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app) | undated | Docs | "Only select repositories" |
| [Reviewing and modifying installed GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps) | undated | Docs | Suspend and uninstall |
| [REST: installations](https://docs.github.com/en/rest/apps/installations), [REST: apps](https://docs.github.com/en/rest/apps/apps) | undated | Docs | Revoke token, suspend installation, create token |
| [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps), […for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) | undated | Docs | Permission for each endpoint the loop uses |
| [Permission levels for a personal account repository](https://docs.github.com/en/account-and-profile/reference/permission-levels-for-a-personal-account-repository) | undated | Docs | What collaborators can do |
| [REST: collaborators](https://docs.github.com/en/rest/collaborators/collaborators) | undated | Docs | Permission argument is org-only; legacy `admin`/`write` values |
| [Triggering a workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow) | undated | Docs | `GITHUB_TOKEN` exception; App tokens and PATs trigger runs |
| [Managing GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#controlling-changes-from-forks-to-workflows-in-public-repositories), [Approving runs from forks](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/approving-workflow-runs-from-public-forks) | undated | Docs | First-time-contributor gates for fork PRs; `pull_request_target` always runs |
| [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) | undated | Docs | Available on public repos on GitHub Free; rule layering |
| [Creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) | undated | Docs | Who can be given bypass |
| [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) | undated | Docs | Restrict updates, required reviews, last-push approval, signed commits |
| [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) | undated | Docs | "Restrict who can push" is org-only |
| [Approving a PR with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews) | undated | Docs | Authors can't approve their own PRs; admins can merge without approval |
| [About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification) | undated | Docs | Bot signature rules; SSH and GPG signing |
| [Setting your commit email address](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address), [Email addresses reference](https://docs.github.com/en/account-and-profile/reference/email-addresses-reference) | undated | Docs | Commits linked by email; user noreply format |
| [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation) | undated | Docs | Automatic revocation when pushed publicly; one-year unused rule |
| cli/cli: `gh help environment`, `gh auth login/setup-git/token --help` | v2.103.2, 2026-10-23 | Source | `GH_TOKEN` precedence, headless use, credential helper, token printing |
| [cli/cli `gitcredential/helper.go`](https://github.com/cli/cli/blob/trunk/pkg/cmd/auth/gitcredential/helper.go), [`internal/keyring/keyring.go`](https://github.com/cli/cli/blob/trunk/internal/keyring/keyring.go) | read 2026-10-29 | Source | `x-access-token` for env tokens; keyring storage |
| [claude-code-action `actor.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/validation/actor.ts), [`permissions.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/validation/permissions.ts), [`run.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/entrypoints/run.ts), [`agent/index.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/modes/agent/index.ts), [`detector.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/modes/detector.ts) | `d70510b`, 2026-10-27 | Source | Human-actor check, `allowed_bots`, write check, agent mode on PR events |
| [claude-code-action `docs/security.md`](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md), [`action.yml`](https://github.com/anthropics/claude-code-action/blob/main/action.yml), [`git-config.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/operations/git-config.ts), [`constants.ts`](https://github.com/anthropics/claude-code-action/blob/main/src/github/constants.ts) | `d70510b`, 2026-10-27 | Source | Bot policy, signing options, bot noreply format, credential helper |
| [claude-plugins-official `code-review.md`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md) | read 2026-10-29 | Source | Skip rule for "automated PR" |
| [Netlify, Deploy overview: Deploy permissions](https://docs.netlify.com/deploy/deploy-overview/#deploy-permissions) | undated | Docs | Deploy Request Policy is for private repos only; recognized authors |
| [Netlify, Sensitive variable policy](https://docs.netlify.com/build/environment-variables/get-started/#sensitive-variable-policy) | undated | Docs | Public-repo untrusted deploys; Require approval by default |
| [Netlify, Roles and permissions](https://docs.netlify.com/manage/accounts-and-billing/team-management/roles-and-permissions/) | undated | Docs | What a Git Contributor is |
| `man security`, `gitcredentials(7)` (git 2.39.5) | local | Source | Keychain `-T` and `-A` flags; empty helper resets the list |

### Not reached or not verified

- **Whether "Restrict updates" blocks PR merges** by an actor without bypass: the docs only
  say it controls who "can push". Test it.
- **The commit email of an App bot user:** GitHub's docs don't document it. The `ID+slug[bot]`
  form comes from claude-code-action's source.
- **First-time-contributor approval for same-repo PRs** by a new collaborator or App: the docs
  describe it only for forks.
- **How Netlify decides who authored a PR deploy**, and how it treats a custom App on a public
  repo.
- **Whether stateless `ghs_APPID_JWT` tokens revoke the same way** through `DELETE
  /installation/token`.
- **The default keychain access list** when `security add-generic-password` is run without
  `-T`, and whether the Claude Code sandbox blocks keychain lookups.
- **Classic PAT expiry options:** the docs say "select an expiration" and that infinite
  lifetimes are allowed, but don't list a maximum for classic tokens. The 366-day cap appears
  only for the fine-grained URL parameter.
- **GitHub Marketplace and API Terms** for Apps: not read. The ToS account terms were enough
  for the machine-account question.
