# Agent PR descriptions: getting them short and useful

Research note, 2026-10-29. The question: how do we get concise, useful PR descriptions from the
backlog loop? Dan finds them far too long. The body template is in step 6 of
`.claude/prompts/backlog-iteration.md`, and step 5 of `.claude/prompts/backlog-fix.md`
rewrites it after review.

How to read the citations:

- **Docs**: vendor documentation or guidance. Pages are undated unless stated, and were read
  on 2026-10-29.
- **Source**: a prompt or skill file in a vendor's own repo, read at the commit linked.
- **Study**: peer-reviewed or preprint research. Every study here is observational.
- **Repo check**: something I measured on PRs #8–#12 with `gh`.
- **Inference**: my reasoning from the cited facts, not a claim any source makes.

## 1. Summary

The template causes most of the length, not the model. It has six required headings, and it
asks for evidence on every check, test steps that repeat those checks, and captions under the
media. The fix pass then adds review history on top. The sources agree on a short
description that leads with *why*, describes the net change, leaves out anything the diff or
CI already shows, and leaves out sections that don't apply. Anthropic's docs add that Opus 5
models write longer documents unless told otherwise. A length target, the reason for it, and
a good example work better than a list of don'ts.

Top changes, ranked, are in [§4](#4-recommendations).

## 2. What our PRs show

*Repo check.* Word counts are for the body, with image URLs left out of the per-section counts.
"Diff" is additions and deletions from `gh pr view`, including the one-line `BACKLOG.md` tick.

| PR | Diff | Body words | Done when | What changed | How to test | Screenshots (prose) | Noticed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #9 PDF button lift | +7 −2 | 270 | 57 | 27 | 30 | 29 | 76 |
| #12 avatar SVG | +2 −11 | 329 | 98 | 65 | 61 | 39 | 52 |
| #8 timeline hover | +24 −6 | 567 | 111 | 118 | 100 | 81 | 81 |
| #10 hero intro | +43 −8 | 583 | 180 | 145 | 73 | 52 | 59 |
| #11 sheet drag | +173 −2 | 771 | 197 | 170 | 118 | 69 | 74 |

Patterns:

- **Length tracks the template more than the change.** #9 changes two class names and still
  gets six headings and 270 words. Every section is filled on every PR, because the template
  never says one can be left out (Noticed, not changed even has to say "Nothing.").
- **"What changed" restates the diff.** #8 names `pointerenter`/`pointerleave`, `data-linked`,
  the `in-data-linked:` classes and the `segmentFor(article)` helper. #9 and #12 list "Ticked
  the item in `BACKLOG.md`". The template asks for "where the code lives", which invites this.
- **"How to test" repeats "Done when".** In #8, test steps 1–4 are the four Done-when items
  rephrased as instructions. Only step 5 (reduced motion) is new.
- **Evidence on every box.** The template asks for "a few words of evidence" per check. #10's
  Done when quotes built CSS and computed `animation-delay` values (180 words). #9 and #12 tick
  "`pnpm check`, `pnpm test --run` and `pnpm build` pass", which CI already reports
  (`.github/workflows/ci.yml` runs the same three).
- **Media gets prose.** The template asks for a caption under each GIF only, but #8 adds 81
  words of captions to three stills, and #10/#11 explain how the GIF was recorded.
- **The fix pass adds history.** #8's final body has a struck-through check "removed at Dan's
  request (review 5707037751)", and captions saying "after review". The loop's reply comment on
  the PR already says the same thing. The body went from about 563 to 567 words: the fix pass
  replaced text, but didn't shorten anything.
- **What's worth keeping:** the Done when checklist, and the one or two real notes in each
  PR. Examples are the reduced-motion gap in #9, the `--hop-delay` departure in #10 and the
  "needs a real finger" caveat in #11. They are buried in everything else.

## 3. What sources say

### What descriptions are for

- Google: the first line is "a short summary of specifically what is being done", and the body
  covers the problem, "why this is the best approach", and any shortcomings. "Reading source
  code may reveal what the software is doing but it may not reveal why it exists." The page
  gives no length rule, and it says to re-read the description before submitting so it
  "still reflects what the CL does" (docs)
  [Google eng-practices, Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html).
- GitHub: context "often explains why the change is needed, what changed, and where reviewers
  should pay special attention". Summaries are most useful when they "explain the purpose of
  the change, call out important files". Nothing on length (docs)
  [GitHub Docs, Helping others review your changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/helping-others-review-your-changes).
  The template page suggests three things for a template: a related issue, a description of
  the change, and who should review (docs)
  [GitHub Docs, Creating a pull request template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).
  The older GitHub blog post asks for purpose, why, and "what feedback you want"
  [McMinn, How to write the perfect pull request, 2015, updated 2022](https://github.blog/developer-skills/github/how-to-write-the-perfect-pull-request/).
- At Microsoft, "code and change understanding is the key aspect of code reviewing" (study,
  surveys and interviews)
  [Bacchelli & Bird, Expectations, Outcomes, and Challenges of Modern Code Review, ICSE 2013](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/).

### Length and review outcomes

- Description length was the largest factor in PR latency at submission (46.3% of explained
  variance), and longer descriptions went with *higher* latency. The model also included churn,
  commits and files changed, so this isn't only "bigger PRs have longer descriptions". The
  authors advise "a clear and concise description" (study, preprint; venue not confirmed)
  [Zhang et al., Pull Request Latency Explained, arXiv 2108.09946, 2021](https://arxiv.org/abs/2108.09946).
  It's an association, not proof that cutting words speeds review.
- PRs with descriptions partly written by Copilot for PRs "require less review time and have a
  higher likelihood of being merged" (study of 18,256 PRs). This is about having a
  generated summary at all, not about its length
  [Xiao et al., Generative AI for Pull Request Descriptions, FSE 2024, arXiv 2402.08967](https://arxiv.org/abs/2402.08967).
- Across five agents in the AIDev dataset, Claude Code and Copilot PRs have high text volume.
  Codex is the only agent that often uses headers and lists, and it had the highest merge rate
  and fastest completion. The authors report "more structured PRs associated with faster
  reviewer responses", but say the analysis is observational and "does not support causal
  claims" (study, MSR '26)
  [Watanabe et al., How AI Coding Agents Communicate, arXiv 2602.17084, 2026-02-19](https://arxiv.org/abs/2602.17084).
  So keep a little structure; this doesn't argue for a wall of prose.
- Agent PR summaries trail human ones slightly on alignment with the code (0.86 vs 0.88). The
  abstract gives no length figures (study)
  [Pham & Ghaleb, arXiv 2601.17627, 2026-01-24](https://arxiv.org/abs/2601.17627).
- **Not found:** any study that directly tests description length or section count against
  reviewer comprehension. The evidence on length is correlational.

### How vendors shape agent PR bodies

- **Claude Code**: the official `commit-commands` plugin opens PRs with a "Summary of changes
  (1-3 bullet points)" and a "Test plan checklist" (source)
  [anthropics/claude-plugins-official, commit-commands README](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/commit-commands/README.md).
  The Claude Code docs say to "Review Claude's generated PR before submitting" (docs)
  [Claude Code, Common workflows](https://code.claude.com/docs/en/common-workflows).
- **OpenAI Codex**: the `codex-pr-body` skill that Codex's maintainers used on their own repo
  says that explaining *why* is "critically important" and should come before *what*. It says
  to "Limit discussion to the _net change_", and to drop "changes that were attempted but later
  undone" when rewriting. It calls it "unnecessary to mention things that CI checks
  automatically", but naming new tests is fine. An optional docs section is used only when it
  applies: "Omit this section if there is no documentation that needs to be updated" (source)
  [openai/codex `.codex/skills/codex-pr-body/SKILL.md` at 14272b2](https://github.com/openai/codex/blob/14272b21e95ed9a54fae21c27d33d3771a9ee30f/.codex/skills/codex-pr-body/SKILL.md).
  The repo removed its local skills on 2026-09-30 (#49713), so this is the last version.
- **Copilot coding agent**: it follows the repo's `pull_request_template.md`
  [GitHub changelog, 2025-11-05](https://github.blog/changelog/2025-11-05-copilot-coding-agent-now-supports-pull-request-templates/),
  and it keeps the title and body up to date as it responds to review
  [GitHub changelog, 2025-07-30](https://github.blog/changelog/2025-07-30-copilot-coding-agent-keeps-pull-request-titles-and-bodies-up-to-date).
  GitHub's sample instructions ask for What changed / Why / Testing / Breaking changes and
  call the result "comprehensive", with no length guidance (docs)
  [GitHub Docs, Pull request assistant](https://docs.github.com/en/copilot/tutorials/customization-library/custom-instructions/pull-request-assistant).
- **Devin**: with no template, the default is "a single **Summary** section that describes
  what changed and why, written for a reader who hasn't seen the diff". A
  `devin_pr_template.md` gives the agent a different template from the one humans use (docs)
  [Devin Docs, GitHub Pull Request Templates](https://docs.devin.ai/integrations/pr-templates).
- **CodeRabbit**: puts its high-level summary in the description and the longer walkthrough in
  a comment. `collapse_walkthrough` defaults to `true` ("Wrap the walkthrough in a Markdown
  collapsible section"), and `high_level_summary_instructions` changes the summary's format
  (docs) [CodeRabbit, Configuration reference](https://docs.coderabbit.ai/reference/configuration).
- **Not found:** Cursor's default PR body format. Its docs cover artifacts in PR
  descriptions but not their structure. Graphite has only blog-level material on generated
  descriptions (weaker, not cited).

### Model tendencies and prompting levers

The loop runs `--model opus`, and its commits are signed Claude Opus 5.5 (*repo check*).

- Opus 5 writes longer user-facing responses than earlier models, and "files that Claude Opus 5
  writes to disk ... are often longer". Effort doesn't reliably shorten visible output: "prompt
  for it explicitly". Suggested line: "Match the length of written documents to what the task
  needs: cover the substance, but do not pad with filler sections, redundant summaries, or
  boilerplate." (docs)
  [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5).
  The Opus 5.5 guide says Opus 5 patterns "remain a reasonable starting point" and doesn't
  revisit document length (docs)
  [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5).
- The same Opus 5 page: explicit verification instructions "cause over-verification". This
  is about effort spent, but it's the same pressure that puts evidence on every check (docs,
  same page). *Inference.*
- Explain why an instruction matters: "Claude can generalize from the explanation". Tell it
  what to do, not what not to do. Match the prompt's style to the output you want ("removing
  markdown from your prompt can reduce the volume of markdown in the output"). Examples are
  "one of the most reliable ways to steer Claude's output format", and they should be diverse
  so Claude doesn't "pick up unintended patterns" (docs)
  [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).
- "Positive examples showing how Claude can communicate with the appropriate level of
  concision tend to be more effective than negative examples or instructions that tell the
  model what not to do." The same page notes Opus 4.8 follows instructions literally (docs)
  [Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8).
  The Opus 5 and 5.5 pages don't repeat the literal-following note.
- `<details>` collapses content so readers expand it only if they want it (docs)
  [GitHub Docs, Collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections).
  Collapsing hides text but doesn't stop it being written, so it's a fallback, not the fix.
  *Inference.*

## 4. Recommendations

Ranked by expected effect on length, highest first. Nothing in `scripts/` or `.github/` parses
the body's headings (*repo check*: only the driver's prompt mentions "Backlog item"), so the
format can change freely.

1. **Replace the six required sections with a lead plus optional parts, and name the ones to
   leave out.** Devin's default is one Summary section, and Claude Code's plugin uses one to
   three bullets plus a test plan. Codex's skill says to omit a section that doesn't apply.
   Evidence: #9 has six headings for a two-class change, and "Nothing." is required.
2. **Give the reader, the reason and a budget, scaled to the diff.** For example: "Dan reads
   this on GitHub before opening the preview. He needs what a visitor will see change, anything
   you departed from, and anything to look at. Aim for under 100 words of your own text when
   the diff is under ~30 lines, and under 250 otherwise, not counting the item quote and
   media." The numbers are my suggestion; no source sets one. Sources: Anthropic (explain why;
   prompt length explicitly on Opus 5; the filler-sections line), and Zhang et al. (length and
   latency). Evidence: #8 has 567 words for +24 −6.
3. **Show one good example, not just a skeleton.** Add a rewritten #9 (sketch below) and a
   medium one, such as #10 cut to its departure note. Anthropic: examples steer format most
   reliably, and positive examples of concision beat don'ts. Match prompt style too: the
   template's six `##` headings are reproduced on every PR.
4. **Leave out what the diff and CI already say.** No code-level "What changed" (identifiers,
   helpers, `BACKLOG.md` tick), and no "checks pass" box. Done-when evidence is a few words,
   or a pointer to a named test or shot. Sources: Google ("why", not what the code shows);
   Codex skill (CI checks are "unnecessary to mention"). Evidence: #8's What changed, the
   check boxes in #9 and #12, #10's 180-word Done when.
5. **Merge "How to test" into "Done when".** Write each check as something Dan can do on the
   preview, and add steps only for what the checks don't cover (reduced motion, night mode, a
   real device). Source: Claude Code's plugin has one test-plan checklist, not both. Evidence:
   in #8, four of five test steps repeat the checks.
6. **Media: the table only.** No prose above or below stills. One line under a GIF only when
   it shows something you can't see from a still. "No visible change expected" stays, since
   it's required for refactors. Evidence: 52–81 words of screenshot prose in #8, #10 and #11.
7. **Fix pass: rewrite for the net change and keep history in comments.** Change step 5 of
   `backlog-fix.md` to edit the affected lines so the body reads as if written fresh. Drop
   checks that no longer apply, don't strike them through, and leave review details to the
   reply comment. Sources: Codex skill (net change; drop undone attempts), Copilot (keeps the
   body current), Google (re-read so it "still reflects" the change). Evidence: #8's struck
   check and "after review" captions repeat its reply comment.
8. **Fallback: a collapsed "Implementation notes" block,** only when Dan needs it to read the
   diff (like #10's `--hop-delay` workaround). It follows CodeRabbit's collapsed walkthrough.
   It ranks last because it hides text rather than preventing it.

If prompting alone doesn't hold, the driver could count the words with `gh pr view --json
body` and print a `NOTE:` when a body is over budget. *Inference*: a deterministic check
instead of one more instruction.

### Sketch of the revised template

```markdown
<One or two sentences: what changes for a visitor, and why if the item doesn't already say.>

> <the backlog item, verbatim>

- [x] <check Dan can do on the preview> (<a few words: test name or shot>)
- [ ] <check you couldn't confirm>: <why>

<Only if needed: "Also check:" reduced motion / night mode / a real device, one line each.>

<pr-media.mjs output as printed; one line under a GIF only if needed.>

<Only if any, one line each: "Departed from the item:" … / "Noticed, not changed:" …>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Example for #9 (about 50 words of the agent's own text, against about 245 today):

```markdown
**Download PDF** on `/resume` now lifts 2px on hover, the same as the header's Résumé button.

> Download PDF button hover: lift it on hover the same way … (agent: pdf-button-hover)

- [x] Same lift classes as the header button
- [x] Lifts on hover (after shots)

<media table>

Noticed, not changed: neither button turns the lift off under reduced motion
(no `motion-safe:`). I matched the header, as the item asks.
```

## 5. Sources

| Source | Date | Type | What it contributed |
| --- | --- | --- | --- |
| [Google, Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html) | undated | Docs | Why over what; no length rule; re-read before submitting |
| [GitHub, Helping others review your changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/helping-others-review-your-changes) | undated | Docs | Purpose, what changed, where to look |
| [GitHub, Creating a pull request template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) | undated | Docs | Three suggested template contents |
| [McMinn, How to write the perfect pull request](https://github.blog/developer-skills/github/how-to-write-the-perfect-pull-request/) | 2015, updated 2022 | Blog (first-party) | Purpose, why, what feedback you want |
| [Bacchelli & Bird, ICSE 2013](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/) | 2013 | Study | Understanding the change is the key part of review |
| [Zhang et al., arXiv 2108.09946](https://arxiv.org/abs/2108.09946) | 2021 | Study | Description length associated with higher latency |
| [Xiao et al., arXiv 2402.08967](https://arxiv.org/abs/2402.08967) | FSE 2024 | Study | Generated descriptions associated with faster review and more merges |
| [Watanabe et al., arXiv 2602.17084](https://arxiv.org/abs/2602.17084) | 2026-02-19 | Study | Agent description styles; structure associated with faster responses |
| [Pham & Ghaleb, arXiv 2601.17627](https://arxiv.org/abs/2601.17627) | 2026-01-24 | Study | Agent summaries align slightly less with code |
| [Claude Code commit-commands README](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/commit-commands/README.md) | read at `main` | Source | Default: 1–3 summary bullets plus a test plan |
| [Claude Code, Common workflows](https://code.claude.com/docs/en/common-workflows) | undated | Docs | Review the generated PR |
| [openai/codex codex-pr-body skill](https://github.com/openai/codex/blob/14272b21e95ed9a54fae21c27d33d3771a9ee30f/.codex/skills/codex-pr-body/SKILL.md) | 2026-06-03 | Source | Why first, net change, skip what CI checks, optional sections |
| [GitHub changelog, PR templates](https://github.blog/changelog/2025-11-05-copilot-coding-agent-now-supports-pull-request-templates/) | 2025-11-05 | Docs | Copilot agent follows the repo template |
| [GitHub changelog, PR bodies kept up to date](https://github.blog/changelog/2025-07-30-copilot-coding-agent-keeps-pull-request-titles-and-bodies-up-to-date) | 2025-07-30 | Docs | Body updated as the agent responds to review |
| [GitHub, Pull request assistant instructions](https://docs.github.com/en/copilot/tutorials/customization-library/custom-instructions/pull-request-assistant) | undated | Docs | Sample four-section instructions, "comprehensive" |
| [Devin, PR templates](https://docs.devin.ai/integrations/pr-templates) | undated | Docs | Single Summary default; agent-only template |
| [CodeRabbit, Configuration](https://docs.coderabbit.ai/reference/configuration) | undated | Docs | Summary in description, walkthrough collapsed in a comment |
| [Anthropic, Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | undated | Docs | Explain why, positive instructions, match prompt style, examples |
| [Anthropic, Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) | undated | Docs | Longer written deliverables; prompt length explicitly; over-verification |
| [Anthropic, Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) | undated | Docs | Opus 5 patterns still the starting point |
| [Anthropic, Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) | undated | Docs | Positive examples of concision beat don'ts |
| [GitHub, Collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections) | undated | Docs | `<details>` behaviour |

### Not reached or not verified

- **Yu et al., "Wait for it" (MSR 2015)**: often cited on PR latency. I couldn't confirm from
  the abstract that description length is one of its factors, so it isn't cited.
- **Cursor**: no documented default PR body format. **Graphite**: only blog guides, not
  cited.
- **Per-agent description lengths** in Watanabe et al.: the paper reports them only in a
  figure, so no numbers are quoted.
- **No controlled study** of description length against reviewer comprehension or defects
  turned up.
