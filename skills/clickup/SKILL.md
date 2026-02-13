---
name: clickup
description: Query ClickUp workspaces/lists and count tasks (including "Referidos") via the official API.
homepage: https://developer.clickup.com/docs/authentication
metadata:
  {
    "openclaw":
      {
        "emoji": "🧭",
        "requires": { "env": ["CLICKUP_API_TOKEN"] },
        "primaryEnv": "CLICKUP_API_TOKEN",
      },
  }
---

# ClickUp

Use this skill to query ClickUp with read-only operations.

## Setup

Store your token:

```bash
openclaw config set skills.entries.clickup.apiKey "pk_your_clickup_token"
```

Optional defaults:

```bash
openclaw config set skills.entries.clickup.env.CLICKUP_WORKSPACE_ID "1234567"
openclaw config set skills.entries.clickup.env.CLICKUP_DEFAULT_LIST_NAME "Referidos"
```

## Commands

```bash
node {baseDir}/scripts/clickup.js whoami
node {baseDir}/scripts/clickup.js workspaces
node {baseDir}/scripts/clickup.js spaces --workspace 1234567
node {baseDir}/scripts/clickup.js find-list --workspace 1234567 --name "Referidos"
node {baseDir}/scripts/clickup.js count-list --list 901234567890 --include-closed false
node {baseDir}/scripts/clickup.js count-list-by-name --workspace 1234567 --name "Referidos" --include-closed false
node {baseDir}/scripts/clickup.js count-list-by-name --workspace 1234567 --name "Referidos" --match contains --include-closed false
node {baseDir}/scripts/clickup.js corporate-summary --workspace 1234567 --scope "Direccion General" --match contains
```

## Notes

- The script prints structured JSON for reliable parsing.
- For "cuantas tareas hay en la lista Referidos de ClickUp", use `count-list-by-name`.
- For "cuantos prospectos/oportunidades hay en el pipeline Referidos" (GHL), use the `gohighlevel` skill.
- If the list name is not exact, use `--match contains`.
- If workspace id is missing, run `workspaces` first.
- For "como vamos en ClickUp corporativo", use `corporate-summary` and return the `text` field.
- Trigger phrases for this skill:
  - "clickup corporativo"
  - "direccion general"
  - "como vamos en tareas de clickup"
  - "resumen de clickup"
