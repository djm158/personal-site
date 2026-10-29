# Rebase pass

This run doesn't build anything new. PR #{{number}} (`agent/{{slug}}`) conflicts with `main`,
so it can't be merged and CI can't run on it. Your job is to bring `main` into the branch and
resolve the conflicts, nothing else. Use the iteration prompt above for verifying and the hard
rules. Skip its other steps.

Merge, don't rebase: a rebase would need a force-push, which the hard rules forbid, and it
would detach the review comments from their lines.

1. Read the PR (`gh pr view {{number}}`) so you know what the branch is for.
2. `git merge origin/main`, then resolve each conflict:
   - Code: keep what the branch does for its item, on top of what `main` now has. `main`'s
     side is merged work, so don't undo it.
   - `BACKLOG.md`: keep every tick and every line from both sides.
   - `pnpm-lock.yaml`: take `main`'s version (`git checkout --theirs pnpm-lock.yaml`), then run
     `pnpm install` so the branch's own dependencies go back in.
3. Verify (step 3 of the iteration prompt). Fix anything the merge broke, keeping to the
   item's scope.
4. Commit the merge (`git commit --no-edit`, then make sure the message ends with the
   `Co-Authored-By` trailer: `git commit --amend` is fine here, before pushing) and push
   `agent/{{slug}}`. Never force-push.
5. Comment on the PR, from a file in the scratch folder
   (`gh pr comment {{number}} --body-file <file>`): which files conflicted, how you resolved
   each, and whether anything that renders could have changed. Don't re-shoot screenshots
   unless the resolution changed how something looks; if it did, say so in the comment.

If `main` changed the same code so much that the item's approach no longer fits, don't
rewrite the item. Abort the merge (`git merge --abort`), comment with what changed on `main`
and the options you see, convert the PR to a draft (`gh pr ready {{number}} --undo`), add the
`needs-input` label, and stop with `RESULT: needs-input #{{number}} agent/{{slug}}`.

When you're done, your last line is `RESULT: rebased #{{number}} agent/{{slug}}`.
