import dotenv from "dotenv";

dotenv.config();

const PIPELINE_NAME = "Referidos";
const DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeToken(rawToken) {
  return rawToken.startsWith("Bearer ") ? rawToken.slice(7).trim() : rawToken;
}

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
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

function extractTotal(payload) {
  const value = payload?.data?.total ?? payload?.total ?? 0;
  const total = Number(value);
  return Number.isFinite(total) ? total : 0;
}

async function requestJson({ baseUrl, path, method = "GET", token, body }) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    method,
    headers: getHeaders(token),
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
    throw new Error(`Request failed (${method} ${url.pathname}): ${detail}`);
  }

  return data;
}

async function getReferidosPipelineId({ baseUrl, token, locationId }) {
  // locationId query keeps the result scoped to the target subaccount.
  const payload = await requestJson({
    baseUrl,
    path: `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
    method: "GET",
    token,
  });

  const pipelines = extractPipelines(payload);
  if (!pipelines.length) {
    throw new Error("No pipelines returned by /opportunities/pipelines");
  }

  const referidos = pipelines.find((pipeline) => pipeline?.name === PIPELINE_NAME);
  if (!referidos?.id) {
    const available = pipelines
      .map((pipeline) => pipeline?.name)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Pipeline "${PIPELINE_NAME}" not found. Available pipelines: ${available || "none"}`,
    );
  }

  return referidos.id;
}

async function countOpportunitiesByPipeline({ baseUrl, token, locationId, pipelineId }) {
  const payload = await requestJson({
    baseUrl,
    path: "/opportunities/search",
    method: "POST",
    token,
    body: {
      locationId,
      pipelineId,
      limit: 1,
    },
  });

  return extractTotal(payload);
}

async function main() {
  const token = normalizeToken(requireEnv("GHL_TOKEN"));
  const locationId = requireEnv("GHL_LOCATION_ID");
  const baseUrl = process.env.GHL_BASE_URL?.trim() || DEFAULT_BASE_URL;

  console.log(`[GHL] Base URL: ${baseUrl}`);
  console.log(`[GHL] Location ID: ${locationId}`);
  console.log(`[GHL] Fetching pipelines...`);

  const pipelineId = await getReferidosPipelineId({ baseUrl, token, locationId });
  console.log(`[GHL] Pipeline ID encontrado: ${pipelineId}`);

  console.log(`[GHL] Counting opportunities in "${PIPELINE_NAME}"...`);
  const total = await countOpportunitiesByPipeline({ baseUrl, token, locationId, pipelineId });

  console.log(`[GHL] Total de oportunidades en ese pipeline: ${total}`);
}

main().catch((error) => {
  console.error(`[GHL] Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
