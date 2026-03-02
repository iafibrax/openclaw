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

Use this skill for ClickUp reporting and controlled task operations.

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
node {baseDir}/scripts/clickup.js projects --workspace 1234567
node {baseDir}/scripts/clickup.js list-space --workspace 1234567 --space "IT" --match exact
node {baseDir}/scripts/clickup.js space-summary --workspace 1234567 --space "IT" --match exact --max-pages 20 --top 10
node {baseDir}/scripts/clickup.js space-members --workspace 1234567 --space "Direccion General"
node {baseDir}/scripts/clickup.js find-list --workspace 1234567 --name "Referidos"
node {baseDir}/scripts/clickup.js count-list --list 901234567890 --include-closed false
node {baseDir}/scripts/clickup.js count-list-by-name --workspace 1234567 --name "Referidos" --include-closed false
node {baseDir}/scripts/clickup.js count-list-by-name --workspace 1234567 --name "Referidos" --match contains --include-closed false
node {baseDir}/scripts/clickup.js create-task --workspace 1234567 --list 901234567890 --name "Nueva tarea" --assignees "Damaris" --start-date "2026-02-20T09:00:00-05:00" --due-date "2026-02-20T11:00:00-05:00" --priority urgent --notify-space-members true
node {baseDir}/scripts/clickup.js create-ceo-task --name "FibraxMind" --assignees "Damaris" --start-date "2026-02-20T09:00:00-05:00" --due-date "2026-02-20T11:00:00-05:00" --priority urgent --notify-space-members true
node {baseDir}/scripts/clickup.js create-ceo-task --name "FibraxMind" --assignees "Damaris" --due-date "2026-02-20T11:00:00-05:00" --priority urgent --dry-run true
node {baseDir}/scripts/clickup.js tasks-by-scope --workspace 1234567 --scope "IT" --match contains --include-closed false --limit 200
node {baseDir}/scripts/clickup.js corporate-summary --workspace 1234567 --scope "Direccion General" --match contains
node {baseDir}/scripts/clickup.js departments-report --workspace 1234567 --departments "Marketing=MARKETING,Legal=LEGAL" --recent-hours 24 --top 10 --max-pages 20
node {baseDir}/scripts/clickup-wiki-sync.js sync --workspace 1234567
node {baseDir}/scripts/clickup-wiki-sync.js sync --workspace 1234567 --only juridico,comercial --dry-run true
```

## Notes

- The script prints structured JSON for reliable parsing.
- For assignees in `create-task` / `create-ceo-task`, `--assignees` accepts ClickUp user IDs or user-name/email fragments.
- `create-ceo-task` targets `Direccion General > CEO > List` in the configured workspace.
- Use `--dry-run true` to validate destination, assignees, dates, and payload without creating the task.
- For space-level reports, use `space-summary` (or `tasks-by-scope`) and prefer `--match exact` for short names like `IT`.
- A space ID is not a list ID. Use `list-space` first, then `count-list` with a real `listId`.
- Avoid `node -e` one-liners that contain backticks (template literals); in `zsh` those can be interpreted as command substitution. Prefer running the scripts directly as shown above.
- For "cuantas tareas hay en la lista Referidos de ClickUp", use `count-list-by-name`.
- For "cuantos prospectos/oportunidades hay en el pipeline Referidos" (GHL), use the `gohighlevel` skill.
- If the list name is not exact, use `--match contains`.
- For very short scopes (e.g. `IT`, `RH`), prefer `--match exact` when possible to avoid accidental partial matches.
- If workspace id is missing, run `workspaces` first.
- For "como vamos en ClickUp corporativo", use `corporate-summary` and return the `text` field.
- Trigger phrases for this skill:
  - "clickup corporativo"
  - "direccion general"
  - "como vamos en tareas de clickup"
  - "resumen de clickup"
