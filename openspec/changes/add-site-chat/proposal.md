# Proposal

## Why

Visitors (in theory a recruiter, in practice anyone curious) can read the site but can't ask it
anything. A chat that answers questions about Dan's experience and interests gives them a faster
path to what they want and a direct route to getting in touch, and it is another showcase of
agentic work on a site built to practise it. It is also the first experiment in whether an
OpenSpec change gets better output from the backlog loop than a one-line backlog item.

## What Changes

- A floating chat widget on every page, visible from first load: a launcher that opens a chat
  panel. Its look, placement and mobile behaviour wait on a claude.ai/design session; specs and
  tasks for the UI come after it.
- A server endpoint that answers questions with an LLM, grounded only in the site's own facts:
  `resume/resume.yaml` and a new personal-facts content file Dan writes (hobbies and the like).
  It says when it doesn't know, and politely declines questions that aren't about Dan.
- A contact handoff: when a visitor wants to get in touch, the model drafts a message and the
  widget shows it as an editable card. Nothing is sent until the visitor confirms; then it goes
  through the existing Netlify contact form.
- Limits on a public endpoint that spends Dan's API credit: rate limits, conversation and output
  caps.
- The conversation survives full-page navigation within a browser session.
- **BREAKING (architecture)**: the site stops being purely static. It gains one serverless
  function and one secret (`ANTHROPIC_API_KEY`) in Netlify. Pages stay static.

Out of scope for v0: knowledge from blog posts and projects (planned once they exist), sending
email from the server, saving conversations anywhere beyond the visitor's browser session,
analytics.

## Capabilities

### New Capabilities

- `site-chat`: answering visitors' questions about Dan from the site's own facts; staying on
  topic; admitting gaps; the limits that protect the endpoint.
- `chat-widget`: the launcher and panel on every page: opening and closing, layering with the
  site's other fixed and top-layer UI, mobile behaviour, accessibility, reduced motion, and
  keeping the conversation across page loads.
- `chat-contact-handoff`: turning a visitor's wish to get in touch into a drafted message they
  review, edit and send through the existing contact form.

### Modified Capabilities

None. There are no existing specs. The contact form's behaviour doesn't change; the handoff
reuses its submission path.

## Impact

- **New**: a Netlify Function for chat, a chat island loaded from `Layout.astro`, a
  personal-facts file in the content paths (Dan writes it; the loop must not), the Anthropic SDK
  as a dependency.
- **Reused**: `src/lib/resume/load.ts` for résumé facts, `src/lib/contact/form` validation and the
  `contact` Netlify form's submission path.
- **Netlify**: an `ANTHROPIC_API_KEY` environment variable (Dan sets it) and a spend limit on the
  API workspace it belongs to.
- **Docs**: CLAUDE.md's "fully static" description and conventions; entries in
  `docs/decisions.md` for the function, the handoff pattern and the knowledge approach.
- **Testing**: the loop's sandbox can't reach the Anthropic API, so the model client must be
  replaceable with a fake in tests. The live model is checked by hand on the deploy preview.
- **Depends on**: the chat widget design session (Dan) before any UI specs or tasks.
