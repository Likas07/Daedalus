A change was committed from a detached HEAD in `/app/site`, and then the repository was switched back to `master`.

Please recover that lost work and land it on `master`.

Requirements:
- Work inside `/app/site`.
- The recovered change must end up on the `master` branch.
- Keep the original detached commit in history by replaying it onto `master`; do not recreate the file contents by hand.
- Leave the repository with a clean working tree.

When you are done, `master` should contain the recovered profile update and the new projects file.