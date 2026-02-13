---
name: gohighlevel
description: Query GoHighLevel (LeadConnector) pipelines and count opportunities (e.g. "Referidos") via the official API.
homepage: https://marketplace.gohighlevel.com/docs/
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "requires": { "env": ["GHL_TOKEN", "GHL_LOCATION_ID"] },
        "primaryEnv": "GHL_TOKEN",
      },
  }
---

# GoHighLevel (LeadConnector)

Use this skill for **read-only** counts from GoHighLevel.

## Setup

Store your token:

```bash
openclaw config set skills.entries.gohighlevel.apiKey "pit_your_token"
```

Set your Location/Subaccount ID:

```bash
openclaw config set skills.entries.gohighlevel.env.GHL_LOCATION_ID "your_location_id"
```

Optional overrides:

```bash
openclaw config set skills.entries.gohighlevel.env.GHL_BASE_URL "https://services.leadconnectorhq.com"
openclaw config set skills.entries.gohighlevel.env.GHL_DEFAULT_PIPELINE_NAME "Referidos"
```

## Commands

```bash
node {baseDir}/scripts/gohighlevel.js pipelines --location <locationId>
node {baseDir}/scripts/gohighlevel.js find-pipeline --location <locationId> --name "Referidos"
node {baseDir}/scripts/gohighlevel.js count-pipeline --location <locationId> --pipeline <pipelineId>
node {baseDir}/scripts/gohighlevel.js count-pipeline-by-name --location <locationId> --name "Referidos" --match exact|contains
node {baseDir}/scripts/gohighlevel.js count-referidos --location <locationId>
```

## Notes

- The script prints structured JSON for reliable parsing.
- "Prospectos en el pipeline de Referidos" = total de **opportunities** en el pipeline "Referidos".
- Trigger phrases for this skill:
  - "gohighlevel", "ghl", "leadconnector"
  - "pipeline de referidos"
  - "cuantos referidos tenemos"
  - "cuantos prospectos hay en referidos"
