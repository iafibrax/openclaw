#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_API_BASE_URL = "https://api.clickup.com/api/v3";
const START_MARKER = "<!-- BEGIN CLICKUP_WIKI_SYNC -->";
const END_MARKER = "<!-- END CLICKUP_WIKI_SYNC -->";
const DEFAULT_DOC_LIMIT = 7;

const GLOBAL_DOC_PATTERNS = [
  /wiki fx/i,
  /vision estrategica/i,
  /politica interna/i,
  /documentos obligatorios/i,
  /reporte de actividades/i,
];

const PINNED_PAGE_KEYWORDS_BY_AGENT = {
  juridico: ["comunicado a los asesores"],
};

const AGENT_KEYWORDS = {
  main: [
    "direccion general",
    "vision estrategica",
    "politica interna",
    "documentos obligatorios",
    "wiki fx",
    "reporte de actividades",
  ],
  desarrollo: ["portal", "app", "angular", "crm", "sistema", "ux", "tecnico", "producto"],
  marketing: [
    "marketing",
    "mkt",
    "landing",
    "reels",
    "copy",
    "contenido",
    "marca",
    "lead",
    "funnel",
    "comunicacion",
  ],
  obra: ["obra", "ejecucion", "control de flujo", "inventario", "proyecto"],
  calidad: ["sop", "procedimiento", "control", "calidad", "politica", "documentos obligatorios"],
  "recursos-humanos": [
    "rh",
    "recursos humanos",
    "capacitacion",
    "cultura",
    "onboarding",
    "comunicados",
  ],
  comercial: [
    "ventas",
    "comercial",
    "prospectos",
    "pipeline",
    "reclutamiento",
    "cliente",
    "inversion",
  ],
  "atencion-clientes": [
    "cliente",
    "atencion",
    "portal",
    "acceso informativo",
    "experiencia",
    "soporte",
  ],
  cobranza: ["cobranza", "mensualidades", "pagos", "atraso", "cartera", "morosidad"],
  "concierge-vip": ["cliente", "experiencia", "portal", "acompanamiento", "comunicacion"],
  juridico: ["juridica", "legal", "politica", "contrato", "cumplimiento", "riesgo"],
  contabilidad: ["contabilidad", "contable", "fiscal", "polizas", "conciliacion", "crm sion"],
  tesoreria: ["tesoreria", "flujo", "caja", "liquidez", "pagos", "cfo"],
};

function usage() {
  console.log(
    [
      "Usage:",
      "  node clickup-wiki-sync.js sync [--workspace <id>] [--config-path <file>] [--only <agentIdsCsv>] [--doc-limit <n>] [--dry-run true|false]",
      "",
      "Env:",
      "  CLICKUP_API_TOKEN (required)",
      "  CLICKUP_WORKSPACE_ID (optional default for --workspace)",
      "  OPENCLAW_CONFIG_PATH (optional default config path)",
      "",
      "Examples:",
      "  node clickup-wiki-sync.js sync --workspace 9017310603",
      "  node clickup-wiki-sync.js sync --dry-run true",
      "  node clickup-wiki-sync.js sync --only juridico,comercial,contabilidad",
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

function parseBoolean(rawValue, defaultValue) {
  if (!rawValue) {
    return defaultValue;
  }
  const value = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(value)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${rawValue}". Use true/false.`);
}

function parsePositiveInt(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value "${rawValue}".`);
  }
  return parsed;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readToken() {
  const raw = process.env.CLICKUP_API_TOKEN?.trim();
  if (!raw) {
    throw new Error("Missing CLICKUP_API_TOKEN.");
  }
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw;
}

function defaultConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH?.trim()) {
    return process.env.OPENCLAW_CONFIG_PATH.trim();
  }
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function loadOpenClawConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`OpenClaw config file not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function toPlainText(markdown) {
  return String(markdown || "")
    .replace(/\r/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickHighlights(text, maxLines = 4) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 40)
    .map((line) => line.replace(/^[-*#\d.)\s]+/, "").trim());

  const unique = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(line.length > 220 ? `${line.slice(0, 220)}...` : line);
    if (unique.length >= maxLines) {
      break;
    }
  }
  return unique;
}

function isGlobalDoc(name) {
  const normalized = normalizeText(name);
  return GLOBAL_DOC_PATTERNS.some((pattern) => pattern.test(normalized));
}

function scoreDocForAgent(doc, agentId) {
  const keywords = AGENT_KEYWORDS[agentId] || [];
  const normalizedName = normalizeText(doc.name);
  const normalizedCorpus = normalizeText(
    [doc.name, ...doc.pageNames, ...doc.highlights, doc.textPreview].join(" "),
  );
  let score = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    if (normalizedCorpus.includes(normalizedKeyword)) {
      score += 1;
    }
    if (normalizedName.includes(normalizedKeyword)) {
      score += 2;
    }
  }

  if (agentId === "juridico" && /(legal|juridic|politica|contrato|cumplim)/.test(normalizedName)) {
    score += 3;
  }
  if (agentId === "contabilidad" && /(contabil|fiscal|poliza|concili)/.test(normalizedName)) {
    score += 3;
  }
  if (
    agentId === "marketing" &&
    /(mkt|marketing|landing|reels|copy|contenido)/.test(normalizedName)
  ) {
    score += 3;
  }
  if (
    agentId === "comercial" &&
    /(inversion|perfil|pipeline|ventas|reclutamiento)/.test(normalizedName)
  ) {
    score += 2;
  }

  const isGenericName =
    normalizedName === "documento" ||
    normalizedName === "document" ||
    normalizedName === "(untitled doc)";
  if (isGenericName && score < 3) {
    return 0;
  }

  return score;
}

function flattenDocPages(pages) {
  const flat = [];
  const seen = new Set();

  const visit = (page) => {
    if (!page || typeof page !== "object") {
      return;
    }
    const id = String(page.id || "");
    if (id && seen.has(id)) {
      return;
    }
    if (id) {
      seen.add(id);
    }
    flat.push(page);
    const children = Array.isArray(page.pages) ? page.pages : [];
    for (const child of children) {
      visit(child);
    }
  };

  for (const page of Array.isArray(pages) ? pages : []) {
    visit(page);
  }

  return flat;
}

function upsertGeneratedSection(existingContent, generatedContent) {
  const block = `${START_MARKER}\n${generatedContent.trim()}\n${END_MARKER}`;
  const source = String(existingContent || "");
  const startIndex = source.indexOf(START_MARKER);
  const endIndex = source.indexOf(END_MARKER);

  if (startIndex >= 0 && endIndex >= 0 && endIndex > startIndex) {
    const before = source.slice(0, startIndex).trimEnd();
    const after = source.slice(endIndex + END_MARKER.length).trimStart();
    const merged = [before, block, after].filter(Boolean).join("\n\n");
    return merged.endsWith("\n") ? merged : `${merged}\n`;
  }

  const base = source.trimEnd();
  const merged = [base, block].filter(Boolean).join("\n\n");
  return merged.endsWith("\n") ? merged : `${merged}\n`;
}

function ensureMemoryHeader(content) {
  const trimmed = String(content || "").trimStart();
  if (trimmed.startsWith("# MEMORY.md")) {
    return content;
  }
  const body = String(content || "").trim();
  if (!body) {
    return "# MEMORY.md\n";
  }
  return `# MEMORY.md\n\n${body}\n`;
}

class ClickUpDocsClient {
  constructor({ token, baseUrl = DEFAULT_API_BASE_URL }) {
    this.token = token;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  async request(pathWithQuery) {
    const normalized = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    const url = new URL(`${this.baseUrl}${normalized}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: this.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(`ClickUp API ${response.status} ${url.pathname}: ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  async getWorkspaceDocs(workspaceId, cursor) {
    const query = new URLSearchParams();
    if (cursor) {
      query.set("cursor", cursor);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request(`/workspaces/${encodeURIComponent(workspaceId)}/docs${suffix}`);
  }

  async getDocPages(workspaceId, docId) {
    const payload = await this.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/docs/${encodeURIComponent(docId)}/pages`,
    );
    const pages = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.pages)
        ? payload.pages
        : [];
    return flattenDocPages(pages);
  }
}

function buildGeneratedMemoryBlock({ agentId, generatedAt, workspaceId, docs }) {
  const lines = [];
  lines.push("## ClickUp Wiki Sync");
  lines.push(`- GeneratedAt: ${generatedAt}`);
  lines.push(`- WorkspaceId: ${workspaceId}`);
  lines.push(`- AgentId: ${agentId}`);
  lines.push(
    "- Rule: When policies/processes are requested, prioritize this context before general assumptions.",
  );
  lines.push("");
  lines.push("### Source Docs");
  if (docs.length === 0) {
    lines.push("- No relevant Wiki docs were matched for this agent in this sync.");
  } else {
    for (const doc of docs) {
      lines.push(`- ${doc.name}`);
      if (doc.pageNames.length > 1) {
        const maxPagesToShow = 60;
        lines.push(`  - Pages (${doc.pageNames.length}):`);
        for (const pageName of doc.pageNames.slice(0, maxPagesToShow)) {
          lines.push(`    - ${pageName}`);
        }
        if (doc.pageNames.length > maxPagesToShow) {
          lines.push(`    - ... (+${doc.pageNames.length - maxPagesToShow} more)`);
        }
      } else if (doc.pageNames.length === 1) {
        lines.push(`  - Page: ${doc.pageNames[0]}`);
      }
      for (const point of doc.highlights.slice(0, 3)) {
        lines.push(`  - ${point}`);
      }
    }
  }

  const pinnedKeywords = PINNED_PAGE_KEYWORDS_BY_AGENT[agentId] || [];
  if (pinnedKeywords.length > 0) {
    const matches = [];
    for (const doc of docs) {
      const pages = Array.isArray(doc.pages) ? doc.pages : [];
      for (const keyword of pinnedKeywords) {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) {
          continue;
        }
        const page = pages.find((entry) =>
          normalizeText(entry?.name || "").includes(normalizedKeyword),
        );
        if (!page) {
          continue;
        }
        matches.push({
          docName: doc.name,
          pageName: String(page?.name || "").trim() || "(untitled page)",
          text: String(page?.text || ""),
        });
      }
    }

    lines.push("");
    lines.push("### Pinned Pages (Extract)");
    if (matches.length === 0) {
      lines.push("- No pinned pages were found in the synced docs.");
    } else {
      for (const match of matches) {
        const excerptLimit = 2800;
        const excerpt = match.text.trim().slice(0, excerptLimit);
        lines.push(`- ${match.docName} / ${match.pageName}`);
        if (!excerpt) {
          lines.push("  - (No text content extracted.)");
          continue;
        }
        lines.push("```text");
        lines.push(excerpt);
        if (match.text.trim().length > excerpt.length) {
          lines.push("...[truncated]");
        }
        lines.push("```");
      }
    }
  }
  lines.push("");
  lines.push("### Response Guardrails");
  lines.push(
    "- If a user asks about a policy, answer with the closest matching policy from these docs.",
  );
  lines.push(
    "- If policy text is ambiguous or appears outdated, ask for confirmation and cite the doc title.",
  );
  lines.push(
    "- Never invent legal, finance, or compliance rules that are not present in the Wiki context.",
  );
  return lines.join("\n");
}

function getAgentWorkspaces(openclawConfig) {
  const results = [];
  const defaultsWorkspace = openclawConfig?.agents?.defaults?.workspace;
  if (typeof defaultsWorkspace === "string" && defaultsWorkspace.trim()) {
    results.push({ id: "main", workspace: defaultsWorkspace.trim() });
  }

  const list = Array.isArray(openclawConfig?.agents?.list) ? openclawConfig.agents.list : [];
  for (const item of list) {
    const id = String(item?.id || "").trim();
    const workspace = String(item?.workspace || "").trim();
    if (!id || !workspace) {
      continue;
    }
    if (!results.some((entry) => entry.id === id)) {
      results.push({ id, workspace });
    }
  }
  return results;
}

async function fetchDocsWithContent(client, workspaceId) {
  let cursor = "";
  const docs = [];
  const warnings = [];

  for (;;) {
    const payload = await client.getWorkspaceDocs(workspaceId, cursor || undefined);
    const page = Array.isArray(payload?.docs) ? payload.docs : [];
    docs.push(...page);
    const nextCursor = String(payload?.next_cursor || "").trim();
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  const hydrated = [];
  for (const doc of docs) {
    const docId = String(doc?.id || "").trim();
    if (!docId) {
      continue;
    }
    let pages = [];
    try {
      pages = await client.getDocPages(workspaceId, docId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Skipped doc ${docId} (${String(doc?.name || "").trim() || "untitled"}): ${message}`,
      );
      continue;
    }
    const pageEntries = pages.map((page) => {
      const name = String(page?.name || "").trim();
      const text = toPlainText(page?.content || "");
      return {
        id: String(page?.id || "").trim(),
        name,
        text,
      };
    });

    const mergedText = pageEntries
      .map((entry) => entry.text)
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const highlights = pickHighlights(mergedText, 5);
    hydrated.push({
      id: docId,
      name: String(doc?.name || "").trim() || "(untitled doc)",
      pageNames: pageEntries.map((entry) => entry.name).filter(Boolean),
      pages: pageEntries,
      highlights,
      textPreview: mergedText.slice(0, 2000),
    });
  }

  return { docs: hydrated, warnings };
}

function selectDocsForAgent(allDocs, agentId, limit) {
  const globalDocs = allDocs.filter((doc) => isGlobalDoc(doc.name));
  const scored = allDocs
    .map((doc) => ({ doc, score: scoreDocForAgent(doc, agentId) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const aIsCopy = /\(copy\)/i.test(a.doc.name) ? 1 : 0;
      const bIsCopy = /\(copy\)/i.test(b.doc.name) ? 1 : 0;
      if (aIsCopy !== bIsCopy) {
        return aIsCopy - bIsCopy;
      }
      return a.doc.name.localeCompare(b.doc.name, "es");
    })
    .map((entry) => entry.doc);

  const selected = [];
  const seen = new Set();
  const seenByName = new Set();

  const normalizeDocNameForDedup = (name) =>
    normalizeText(name)
      .replace(/\(copy\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const addDoc = (doc) => {
    if (!doc || seen.has(doc.id)) {
      return;
    }
    if (/\(copy\)/i.test(doc.name)) {
      return;
    }
    const normalizedName = normalizeDocNameForDedup(doc.name);
    if (normalizedName && seenByName.has(normalizedName)) {
      return;
    }
    seen.add(doc.id);
    if (normalizedName) {
      seenByName.add(normalizedName);
    }
    selected.push(doc);
  };

  for (const doc of globalDocs) {
    addDoc(doc);
  }
  for (const doc of scored) {
    addDoc(doc);
  }

  return selected.slice(0, limit);
}

async function run() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = String(positionals[0] || "").trim();

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command !== "sync") {
    throw new Error(`Unknown command "${command}". Only "sync" is supported.`);
  }

  const workspaceId =
    flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
  if (!workspaceId) {
    throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
  }

  const dryRun = parseBoolean(flagValue(flags, "dry-run"), false);
  const docLimit = parsePositiveInt(flagValue(flags, "doc-limit"), DEFAULT_DOC_LIMIT);
  const configPath = flagValue(flags, "config-path") || defaultConfigPath();
  const onlyRaw = flagValue(flags, "only");
  const onlyAgents = onlyRaw
    ? new Set(
        onlyRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      )
    : null;

  const token = readToken();
  const client = new ClickUpDocsClient({ token });
  const fetched = await fetchDocsWithContent(client, workspaceId);
  const docs = fetched.docs;
  const generatedAt = new Date().toISOString();

  const openclawConfig = loadOpenClawConfig(configPath);
  const agentWorkspaces = getAgentWorkspaces(openclawConfig).filter((entry) =>
    onlyAgents ? onlyAgents.has(entry.id) : true,
  );

  const report = [];
  for (const entry of agentWorkspaces) {
    const selectedDocs = selectDocsForAgent(docs, entry.id, docLimit);
    const generatedBlock = buildGeneratedMemoryBlock({
      agentId: entry.id,
      generatedAt,
      workspaceId,
      docs: selectedDocs,
    });
    const memoryPath = path.join(entry.workspace, "MEMORY.md");
    const existingContent = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, "utf8") : "";
    const updatedContent = ensureMemoryHeader(
      upsertGeneratedSection(existingContent, generatedBlock),
    );

    if (!dryRun) {
      fs.mkdirSync(entry.workspace, { recursive: true });
      fs.writeFileSync(memoryPath, updatedContent, "utf8");
    }

    report.push({
      agentId: entry.id,
      workspace: entry.workspace,
      memoryPath,
      docsApplied: selectedDocs.map((doc) => doc.name),
      changed: existingContent !== updatedContent,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        configPath,
        workspaceId,
        docsScanned: docs.length,
        warnings: fetched.warnings,
        agentsProcessed: report.length,
        report,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(`[clickup-wiki-sync] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
