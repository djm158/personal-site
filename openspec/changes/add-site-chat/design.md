# Design

## Context

See proposal.md for why. The constraints that shape the approach:

- The site is a fully static Astro build on Netlify, with no adapter and no server code. Pages
  are real routes with plain links, so every navigation is a full page load.
- The contact form (`src/components/ContactSection.astro`) already submits by `fetch("/")` with
  URL-encoded fields (`form-name=contact`, `topic`, `name`, `email`, `message`, honeypot
  `bot-field`), and Netlify Forms handles spam and email notification.
- Résumé facts come from `resume/resume.yaml` through `src/lib/resume/load.ts`. Site copy lives
  in `content/site-content.yaml`. Both are content paths that the loop must not edit.
- The backlog loop runs in a sandbox that can reach GitHub, npm and production, and not the
  Anthropic API. Loop agents can't call the real model.
- The visual design doesn't exist yet. Who made each decision below is noted: **Dan** if he
  made the call in exploration, **(agent)** if it's a recommendation awaiting his review.

## Goals / Non-Goals

**Goals:**

- Keep the static architecture intact for everything except one endpoint.
- Make every piece of chat logic testable without the real model.
- Keep the blast radius of a misbehaving or manipulated model small: it can say things, but it
  can't act.
- Leave room to add blog posts and projects as knowledge without redesigning anything.

**Non-Goals:**

- Retrieval (embeddings, a vector store). The knowledge is small enough to send whole.
- Server-side conversation storage, accounts, or analytics.
- The widget's visual design: that comes from the design session, and then UI specs.

## Decisions

### 1. A standalone Netlify Function, not an Astro adapter (agent)

`netlify/functions/chat.ts` (Functions API v2, returning a web `Response`) on a fixed path such
as `/api/chat`. Astro's config and output mode stay as they are.

- _Alternative: `@astrojs/netlify` with an on-demand `src/pages/api/chat.ts` route._ It keeps
  everything in `src/pages`, but changes the build pipeline for the whole site to serve one
  endpoint. Not worth it until a second server route exists.
- The function bundles from the same repo, so it can import `src/lib` code directly.

### 2. A thin handler over pure, tested logic, with an injectable model client (agent)

```
  netlify/functions/chat.ts      wiring only: env, limits, createChatHandler({ client })
          |
  src/lib/chat/                  pure functions + Vitest tests
    prompt.ts    buildSystemPrompt(facts) -> string
    request.ts   validate and trim the incoming history (length, roles, size caps)
    handler.ts   createChatHandler({ client }) -> (Request) => Response
    tools.ts     the draft_contact tool definition and validation of its input
          |
  client: the Anthropic SDK in production; a fake in tests that returns canned
          text and canned tool calls
```

This is what lets loop agents build and test the endpoint without network access to the API.
The real model is smoke-tested by hand on the deploy preview.

### 3. Knowledge goes whole into the system prompt (agent)

The system prompt is fixed instructions plus the résumé (from `load.ts`) plus a new
personal-facts file Dan writes (for example `content/about-me.yaml`, validated with a Zod schema
like the résumé). It's a few thousand tokens, so prompt caching makes repeats cheap.

- _Alternative: retrieval._ More moving parts and worse answers at this size. Revisit only if
  posts and projects grow the prompt past what caching keeps cheap.
- Adding posts and projects later means more inputs to `buildSystemPrompt`, nothing else.
- The bot knows only what's in these files. That is the privacy boundary for personal facts.
- The instructions tell it to answer only from the facts, say when it doesn't know (and offer
  the contact handoff), and decline topics that aren't about Dan.

### 4. The model drafts, the visitor sends (agent; Dan chose to hook into the contact form)

The model has one tool, `draft_contact { topic, name?, email?, message }`, with `topic`
restricted to the contact form's topics from `content/site-content.yaml`. The function streams
the tool call to the browser and **never sends anything itself**. The widget shows the draft as
an editable card; when the visitor confirms, the browser submits it exactly as the contact form
does (`form-name=contact`, same field names, reusing the `src/lib/contact/form` validation).

- _Alternative: the function submits the form or calls an email API._ That gives a manipulated
  model a way to send Dan mail, and needs a second spam defence. Rejected.
- Netlify Forms keeps doing spam filtering and notifications. Dan's inbox setup is unchanged.
- Submissions from the chat should be recognisable, for example a hidden `source=chat` field.
  Netlify Forms only stores fields that appear in the build-time form, so this means adding a
  hidden input to the `contact` form markup.

### 5. A stateless endpoint; the browser keeps the conversation (agent)

Each request carries the conversation so far, trimmed and capped by `request.ts`. The widget
keeps it in `sessionStorage` so it survives the full page loads that plain links cause. Every
storage access is wrapped in try/catch, as the theme code learned to be: with storage blocked,
the chat still works and only loses history on navigation.

- _Alternative: server-side sessions._ Needs a store (Netlify Blobs) and IDs. Not needed for v0.

### 6. Streaming responses (agent)

The function returns a streamed `Response`, so answers appear as they're written. The widget
renders text deltas and the final `draft_contact` call. The streaming format between function
and widget is a small, documented event shape owned by `src/lib/chat`, so both sides test
against it.

### 7. Limits on a public endpoint (agent)

| Threat                       | Mitigation                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Scripted abuse, runaway cost | Netlify per-IP rate limit on the function; spend limit on the API workspace   |
| Long or huge conversations   | Caps on messages per conversation, characters per message and output tokens   |
| Calls from other sites       | Reject requests whose `Origin` isn't the site (or a deploy preview)           |
| Missing key or API outage    | Function returns a clear error; the widget points to the contact form instead |

Model: a small, fast, cheap model is enough for questions and answers over a short prompt.

### 8. Widget loading and placement (Dan: a floating widget visible on first load; details wait on design)

A React island in `Layout.astro` so it's on every page. The launcher is tiny and hydrates with
`client:idle`. The panel and its chat logic load with a dynamic `import()` the first time it
opens, so pages that never use the chat pay almost nothing. Its layering with the mobile menu,
`SkillSheet` and the cyclist ride, and its mobile form (probably a full-screen `<dialog>`), are
for the design session and the `chat-widget` spec.

## Risks / Trade-offs

- [The model invents facts about Dan] → Strict grounding instructions; a short, curated facts
  file; Dan tests known traps (dates, employers, things not in the files) on the preview before
  launch.
- [Prompt injection makes the bot say something embarrassing] → It can only produce text and
  drafts a human must send. Instructions keep it on topic; the risk can't be removed entirely,
  and is accepted for a showcase.
- [Cost runs away] → Rate limit, caps and the workspace spend limit; the hard ceiling is the
  spend limit.
- [Loop agents can't run the real model] → The fake client and the event-shape tests cover the
  logic. A manual smoke test on the preview covers the rest. Spec scenarios are written against
  the fake.
- [The site is no longer purely static] → One function, one secret. CLAUDE.md and
  `docs/decisions.md` record the change.
- [A widget on every page reads as templated] → For the design session. The site's own avatar
  is a candidate for the launcher.
- [The facts file is content the loop must not write] → Dan writes it first. Check whether CI's
  content guard covers a new file under `content/` or needs a new path.

## Migration Plan

1. The endpoint and `src/lib/chat` ship first with no UI. Dan sets `ANTHROPIC_API_KEY` and the
   spend limit in Netlify, then tries the endpoint on a preview.
2. The widget ships after the design session, behind its own PR.
3. Rollback: remove the widget from `Layout.astro`, or unset the key (the widget then falls
   back to pointing at the contact form). Pages are unaffected either way.

## Open Questions

- Exact numbers: the rate limit, message caps and output token cap. Tune on the preview.
- Which model exactly. Any small, fast model works with this design.
- The personal-facts file's shape and name. Dan writes it; the schema follows what he writes.
