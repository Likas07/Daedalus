A previous attempt partially implemented JSON output support in `/app`, then stopped.

Continue that work.

Requirements:
- Read `/app/SESSION_SUMMARY.md` before editing.
- Make `python /app/app.py --json` print valid JSON.
- Keep the default `python /app/app.py` output unchanged.
- Preserve the already completed files listed in the summary.

The final program should support both text and JSON output without rewriting the completed pieces.