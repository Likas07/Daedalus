# Asaas API Integration Guidance

Use the Asaas docs tool before making claims about unfamiliar endpoints or parameters.

Rules:
- Never ask the user to paste `ASAAS_ACCESS_TOKEN` into chat; use the environment variable only.
- Prefer sandbox base URLs while testing.
- Prefer `asaas_api_get` for inspection before any mutation.
- Use `asaas_api_mutate` in dry-run mode first and show the planned method, path, query, and body.
- Live `POST`, `PUT`, `PATCH`, and `DELETE` calls require explicit user confirmation from the Daedalus UI.
- Never print authorization headers, access tokens, or raw secret-bearing errors.
- If the docs and API behavior disagree, report the discrepancy and stop before making live changes.

## Local setup

```bash
export ASAAS_ACCESS_TOKEN="your-token"
export ASAAS_BASE_URL="https://sandbox.asaas.com/api/v3"
```

Example prompts:
- "Use Asaas docs to explain how to create a customer."
- "Dry-run creating an Asaas customer named Test Customer."
- "List my first five Asaas customers using the sandbox token."

Do not use production mutation prompts until the dry-run payload has been reviewed.
