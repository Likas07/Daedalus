# 06. Virtual Resource Schemes

## Why This Is Strong

OhMyPi's `pr://`, `issue://`, `agent://`, `skill://`, and `conflict://` direction is one of the cleanest harness ideas in the research set.

The core insight: teach the model fewer tools by making more things readable and writable through a common resource interface.

## Product Shape

Daedalus should introduce virtual resource schemes:

```text
read pr://owner/repo/123
read issue://owner/repo/456
read agent://run-id/result.json
read skill://review/checklist
read goal://current/evidence
write conflict://1 @ours
search pr://owner/repo/123 "auth"
```

This does not mean every scheme is writable. It means each scheme has a typed capability contract.

## Candidate Schemes

High-value V1 schemes:

- `agent://` - subagent result artifacts, transcripts, output refs
- `goal://` - current goal ledger, evidence, verification output refs
- `skill://` - skill docs, checklists, bundled templates
- `pr://` - PR metadata, files, comments, diff
- `issue://` - issue body, comments, labels, linked PRs
- `conflict://` - unresolved merge conflicts

## Why This Beats One-Off Tools

Without schemes:

```text
github_pr_view
github_pr_files
github_pr_comments
github_issue_view
subagent_result_read
skill_read
conflict_list
conflict_resolve
```

With schemes:

```text
read
search
write/apply when allowed
```

The model learns one access pattern.

## Safety Rules

- Writable schemes require explicit capability flags.
- `conflict://` writes must validate the file is still conflicted.
- Remote schemes should show provider/auth provenance.
- Large resources return windows/refs.
- Internal resources should never leak secrets through summaries.

## Integration With Existing Tools

This should extend Daedalus' existing read/search/write concepts rather than replacing them.

Potential layers:

```text
ResourceResolver
  -> FileResourceProvider
  -> AgentArtifactResourceProvider
  -> SkillResourceProvider
  -> GitHubResourceProvider
  -> ConflictResourceProvider
```

## Acceptance Criteria

- `read agent://...` can retrieve a subagent artifact.
- `read skill://...` can retrieve a skill document.
- Unknown schemes fail with a typed error.
- Large resource reads support windows.
- Scheme providers can declare read/search/write capabilities.
