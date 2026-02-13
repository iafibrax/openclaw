#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";
const DEFAULT_VERSION = "2021-07-28";
const DEFAULT_PIPELINE_NAME = "Referidos";

function usage() {
  console.log(
    [
      "Usage:",
      "  node gohighlevel.js pipelines --location <id>",
      "  node gohighlevel.js find-pipeline --location <id> --name <pipelineName> [--match exact|contains]",
      "  node gohighlevel.js count-pipeline --location <id> --pipeline <pipelineId>",
      "  node gohighlevel.js count-pipeline-by-name --location <id> --name <pipelineName> [--match exact|contains]",
      "  node gohighlevel.js count-referidos [--location <id>]",
      "",
      "Env:",
      "  GHL_TOKEN (required)",
      "  GHL_LOCATION_ID (optional default for --location)",
      `  GHL_BASE_URL (optional default ${DEFAULT_BASE_URL})`,
      `  GHL_VERSION (optional default ${DEFAULT_VERSION})`,
      `  GHL_DEFAULT_PIPELINE_NAME (optional default "${DEFAULT_PIPELINE_NAME}")`,
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const positionals = [];
  const flags = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags.set(key, "true");
      } else {
        flags.set(key, next);
        i += 1;
      }
      continue;
    }
    positionals.push(value);
  }

  return { positionals, flags };
}

function flagValue(flags, name) {
  const value = flags.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(rawToken) {
  const raw = rawToken.trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

function requireToken() {
  const raw = process.env.GHL_TOKEN?.trim();
  if (!raw) {
    throw new Error("Missing GHL_TOKEN.");
  }
  return normalizeToken(raw);
}

function resolveLocationId(flags) {
  return flagValue(flags, "location") || process.env.GHL_LOCATION_ID?.trim() || "";
}

function requireLocationId(flags) {
  const locationId = resolveLocationId(flags);
  if (!locationId) {
    throw new Error('Missing location id. Provide --location or set env "GHL_LOCATION_ID".');
  }
  return locationId;
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseMatchMode(value, fallback = "exact") {
  if (!value) {
    return fallback;
  }
  const mode = value.trim().toLowerCase();
  if (mode === "exact" || mode === "contains") {
    return mode;
  }
  throw new Error(`Invalid match mode "${value}". Use exact or contains.`);
}

function namesMatch(source, target, mode) {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);
  return mode === "contains"
    ? normalizedSource.includes(normalizedTarget)
    : normalizedSource === normalizedTarget;
}

function extractPipelines(payload) {
  const candidates = [
    payload?.pipelines,
    payload?.data?.pipelines,
    payload?.data,
    payload?.items,
    payload,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractPipelineId(pipeline) {
  const candidates = [pipeline?.id, pipeline?._id, pipeline?.pipelineId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function extractTotal(payload) {
  const value = payload?.data?.total ?? payload?.total ?? 0;
  const total = Number(value);
  return Number.isFinite(total) ? total : 0;
}

async function requestJson({ baseUrl, version, path, method = "GET", token, body }) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null
        ? JSON.stringify(data)
        : (data ?? `HTTP ${response.status}`);
    throw new Error(`GoHighLevel API ${response.status} ${method} ${url.pathname}: ${detail}`);
  }

  return data;
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function run() {
  const baseUrl = process.env.GHL_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const version = process.env.GHL_VERSION?.trim() || DEFAULT_VERSION;
  const defaultPipelineName =
    process.env.GHL_DEFAULT_PIPELINE_NAME?.trim() || DEFAULT_PIPELINE_NAME;

  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = (positionals[0] || "").trim();
  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }

  const token = requireToken();

  if (command === "pipelines") {
    const locationId = requireLocationId(flags);
    const payload = await requestJson({
      baseUrl,
      version,
      path: `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      method: "GET",
      token,
    });
    const pipelines = extractPipelines(payload).map((pipeline) => ({
      id: extractPipelineId(pipeline) || null,
      name: typeof pipeline?.name === "string" ? pipeline.name : null,
    }));
    printJson({ ok: true, baseUrl, version, locationId, pipelines });
    return;
  }

  if (command === "find-pipeline") {
    const locationId = requireLocationId(flags);
    const name = flagValue(flags, "name") || defaultPipelineName;
    const matchMode = parseMatchMode(flagValue(flags, "match"), "exact");
    const payload = await requestJson({
      baseUrl,
      version,
      path: `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      method: "GET",
      token,
    });
    const pipelines = extractPipelines(payload);
    const found = pipelines.find(
      (pipeline) =>
        typeof pipeline?.name === "string" && namesMatch(pipeline.name, name, matchMode),
    );
    const pipelineId = found ? extractPipelineId(found) : "";
    if (!pipelineId) {
      const available = pipelines
        .map((pipeline) => (typeof pipeline?.name === "string" ? pipeline.name : ""))
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Pipeline "${name}" not found (match=${matchMode}). Available pipelines: ${available || "none"}`,
      );
    }
    printJson({
      ok: true,
      baseUrl,
      version,
      locationId,
      pipeline: {
        id: pipelineId,
        name: typeof found?.name === "string" ? found.name : name,
      },
    });
    return;
  }

  if (command === "count-pipeline") {
    const locationId = requireLocationId(flags);
    const pipelineId = flagValue(flags, "pipeline");
    if (!pipelineId) {
      throw new Error('Missing pipeline id. Provide --pipeline "<id>".');
    }
    const payload = await requestJson({
      baseUrl,
      version,
      path: "/opportunities/search",
      method: "POST",
      token,
      body: { locationId, pipelineId, limit: 1 },
    });
    const total = extractTotal(payload);
    printJson({
      ok: true,
      baseUrl,
      version,
      locationId,
      pipeline: { id: pipelineId },
      total,
      text: `En GoHighLevel, el pipeline tiene ${total} oportunidades.`,
    });
    return;
  }

  if (command === "count-pipeline-by-name" || command === "count-referidos") {
    const locationId = requireLocationId(flags);
    const name =
      command === "count-referidos"
        ? defaultPipelineName
        : flagValue(flags, "name") || defaultPipelineName;
    const matchMode = parseMatchMode(flagValue(flags, "match"), "exact");

    const pipelinesPayload = await requestJson({
      baseUrl,
      version,
      path: `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      method: "GET",
      token,
    });
    const pipelines = extractPipelines(pipelinesPayload);
    const found = pipelines.find(
      (pipeline) =>
        typeof pipeline?.name === "string" && namesMatch(pipeline.name, name, matchMode),
    );
    const pipelineId = found ? extractPipelineId(found) : "";
    if (!pipelineId) {
      const available = pipelines
        .map((pipeline) => (typeof pipeline?.name === "string" ? pipeline.name : ""))
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Pipeline "${name}" not found (match=${matchMode}). Available pipelines: ${available || "none"}`,
      );
    }

    const searchPayload = await requestJson({
      baseUrl,
      version,
      path: "/opportunities/search",
      method: "POST",
      token,
      body: { locationId, pipelineId, limit: 1 },
    });
    const total = extractTotal(searchPayload);

    const pipelineName = typeof found?.name === "string" ? found.name : name;
    printJson({
      ok: true,
      baseUrl,
      version,
      locationId,
      pipeline: { id: pipelineId, name: pipelineName },
      total,
      text: `En GoHighLevel, en el pipeline "${pipelineName}" hay ${total} oportunidades.`,
    });
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

run().catch((error) => {
  console.error(
    `[gohighlevel] ${error instanceof Error ? error.message : String(error)}\nRun with "help" to see usage.`,
  );
  process.exit(1);
});
