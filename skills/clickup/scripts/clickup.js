#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://api.clickup.com/api/v2";
const DEFAULT_LIST_NAME = "Referidos";
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_CORP_SCOPE_NAME = "Direccion General";

function usage() {
  console.log(
    [
      "Usage:",
      "  node clickup.js whoami",
      "  node clickup.js workspaces",
      "  node clickup.js spaces --workspace <id>",
      "  node clickup.js find-list --workspace <id> --name <listName>",
      "  node clickup.js count-list --list <id> [--include-closed true|false] [--max-pages <n>]",
      "  node clickup.js count-list-by-name --workspace <id> --name <listName> [--match exact|contains] [--include-closed true|false]",
      "  node clickup.js tasks-by-scope --workspace <id> --scope <name> [--match exact|contains] [--include-closed true|false] [--max-pages <n>] [--limit <n>]",
      "  node clickup.js corporate-summary --workspace <id> [--scope <name>] [--match exact|contains] [--include-closed true|false]",
      '  node clickup.js departments-report --workspace <id> --departments "<Label=Scope|AltScope,...>" [--match exact|contains] [--recent-hours <n>] [--stale-days <n>] [--top <n>] [--max-pages <n>]',
      "",
      "Env:",
      "  CLICKUP_API_TOKEN (required)",
      "  CLICKUP_BASE_URL (optional, default https://api.clickup.com/api/v2)",
      "  CLICKUP_WORKSPACE_ID (optional default for --workspace)",
      '  CLICKUP_DEFAULT_LIST_NAME (optional default for --name, default "Referidos")',
      '  CLICKUP_CORP_SCOPE_NAME (optional default for --scope, default "Direccion General")',
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

function requireToken() {
  const raw = process.env.CLICKUP_API_TOKEN?.trim();
  if (!raw) {
    throw new Error("Missing CLICKUP_API_TOKEN.");
  }
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw;
}

function parseBoolean(value, defaultValue) {
  if (!value) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${value}". Use true/false.`);
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value "${value}".`);
  }
  return parsed;
}

function parseOptionalPositiveInt(value) {
  if (!value) {
    return null;
  }
  return parsePositiveInt(value, 1);
}

function normalizeName(value) {
  return value.trim().toLowerCase();
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
  if (!normalizedSource || !normalizedTarget) {
    return false;
  }
  if (mode !== "contains") {
    return normalizedSource === normalizedTarget;
  }

  // Avoid accidental matches for very short targets (e.g. "IT") inside other words.
  if (normalizedTarget.length <= 3) {
    const tokens = normalizedSource.split(/[^a-z0-9]+/g).filter(Boolean);
    return tokens.includes(normalizedTarget);
  }

  return mode === "contains"
    ? normalizedSource.includes(normalizedTarget)
    : normalizedSource === normalizedTarget;
}

function classifyStatus(statusText) {
  const status = normalizeText(statusText || "");
  if (!status) {
    return "other";
  }
  if (
    status.includes("done") ||
    status.includes("complete") ||
    status.includes("terminad") ||
    status.includes("finaliz") ||
    status.includes("cerrad")
  ) {
    return "done";
  }
  if (status.includes("revision") || status.includes("review") || status.includes("qa")) {
    return "review";
  }
  if (
    status.includes("blocked") ||
    status.includes("bloque") ||
    status.includes("pausa") ||
    status.includes("hold")
  ) {
    return "blocked";
  }
  if (
    status.includes("in progress") ||
    status.includes("progreso") ||
    status.includes("curso") ||
    status.includes("working")
  ) {
    return "in_progress";
  }
  if (status.includes("todo") || status.includes("pending") || status.includes("pendiente")) {
    return "todo";
  }
  return "other";
}

function pickTopTasks(tasks, limit = 6) {
  return tasks.slice(0, limit).map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    listName: task.listName,
    assignees: task.assignees,
    dueDate: task.dueDate,
  }));
}

function buildCorporateSummaryText(summary) {
  const lines = [];
  lines.push("Resumen general");
  lines.push(
    `- Se analizaron ${summary.totalTasks} tareas en ${summary.listsMatched} listas del alcance "${summary.scope}".`,
  );
  lines.push(
    `- Completadas: ${summary.byGroup.done} | En revision: ${summary.byGroup.review} | En curso: ${summary.byGroup.inProgress} | Bloqueadas: ${summary.byGroup.blocked}.`,
  );
  lines.push(`- Pendientes (todo/otros): ${summary.byGroup.todo + summary.byGroup.other}.`);
  lines.push("");

  lines.push("Lo completado");
  if (summary.top.done.length === 0) {
    lines.push("- Sin tareas completadas detectadas en el alcance.");
  } else {
    for (const task of summary.top.done) {
      lines.push(`- ${task.name} [${task.status}] (${task.listName})`);
    }
  }
  lines.push("");

  lines.push("En revision");
  if (summary.top.review.length === 0) {
    lines.push("- Sin tareas en revision.");
  } else {
    for (const task of summary.top.review) {
      lines.push(`- ${task.name} [${task.status}] (${task.listName})`);
    }
  }
  lines.push("");

  lines.push("En curso");
  if (summary.top.inProgress.length === 0) {
    lines.push("- Sin tareas en curso.");
  } else {
    for (const task of summary.top.inProgress) {
      lines.push(`- ${task.name} [${task.status}] (${task.listName})`);
    }
  }
  lines.push("");

  lines.push("Riesgos / bloqueos");
  if (summary.top.blocked.length === 0) {
    lines.push("- No se detectaron bloqueos en este corte.");
  } else {
    for (const task of summary.top.blocked) {
      lines.push(`- ${task.name} [${task.status}] (${task.listName})`);
    }
  }

  return lines.join("\n");
}

class ClickUpClient {
  constructor({ token, baseUrl }) {
    this.token = token;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  async request(path) {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(normalizedPath, `${this.baseUrl}/`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: this.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(`ClickUp API ${response.status} ${url.pathname}: ${detail}`);
    }

    return payload;
  }

  async getUser() {
    return this.request("/user");
  }

  async getWorkspaces() {
    const payload = await this.request("/team");
    return Array.isArray(payload?.teams) ? payload.teams : [];
  }

  async getSpaces(workspaceId) {
    const payload = await this.request(
      `/team/${encodeURIComponent(workspaceId)}/space?archived=false`,
    );
    return Array.isArray(payload?.spaces) ? payload.spaces : [];
  }

  async getFolders(spaceId) {
    const payload = await this.request(
      `/space/${encodeURIComponent(spaceId)}/folder?archived=false`,
    );
    return Array.isArray(payload?.folders) ? payload.folders : [];
  }

  async getFolderLists(folderId) {
    const payload = await this.request(
      `/folder/${encodeURIComponent(folderId)}/list?archived=false`,
    );
    return Array.isArray(payload?.lists) ? payload.lists : [];
  }

  async getSpaceLists(spaceId) {
    const payload = await this.request(`/space/${encodeURIComponent(spaceId)}/list?archived=false`);
    return Array.isArray(payload?.lists) ? payload.lists : [];
  }

  async getListTasksPage(listId, { includeClosed, page }) {
    const payload = await this.request(
      `/list/${encodeURIComponent(listId)}/task?archived=false&include_closed=${
        includeClosed ? "true" : "false"
      }&page=${page}`,
    );
    return {
      tasks: Array.isArray(payload?.tasks) ? payload.tasks : [],
      lastPage: payload?.last_page === true,
    };
  }

  async getWorkspaceTasksPage(workspaceId, { includeClosed, page, query }) {
    const queryParams = new URLSearchParams();
    queryParams.set("archived", "false");
    queryParams.set("include_closed", includeClosed ? "true" : "false");
    queryParams.set("page", String(page));
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) {
          continue;
        }
        const normalized = String(value).trim();
        if (!normalized) {
          continue;
        }
        queryParams.set(key, normalized);
      }
    }

    const payload = await this.request(
      `/team/${encodeURIComponent(workspaceId)}/task?${queryParams.toString()}`,
    );
    return {
      tasks: Array.isArray(payload?.tasks) ? payload.tasks : [],
      lastPage: payload?.last_page === true,
    };
  }
}

async function collectListsByWorkspace(client, workspaceId) {
  const spaces = await client.getSpaces(workspaceId);
  const lists = [];

  for (const space of spaces) {
    const spaceId = String(space?.id ?? "");
    if (!spaceId) {
      continue;
    }

    const folderlessLists = await client.getSpaceLists(spaceId);
    for (const list of folderlessLists) {
      lists.push({
        listId: String(list?.id ?? ""),
        listName: String(list?.name ?? ""),
        spaceId,
        spaceName: String(space?.name ?? ""),
        folderId: null,
        folderName: null,
      });
    }

    const folders = await client.getFolders(spaceId);
    for (const folder of folders) {
      const folderId = String(folder?.id ?? "");
      if (!folderId) {
        continue;
      }
      const folderLists = await client.getFolderLists(folderId);
      for (const list of folderLists) {
        lists.push({
          listId: String(list?.id ?? ""),
          listName: String(list?.name ?? ""),
          spaceId,
          spaceName: String(space?.name ?? ""),
          folderId,
          folderName: String(folder?.name ?? ""),
        });
      }
    }
  }

  return lists.filter((item) => item.listId && item.listName);
}

async function countTasksInList(client, listId, { includeClosed, maxPages }) {
  let total = 0;
  let pagesFetched = 0;
  let reachedLastPage = false;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.getListTasksPage(listId, { includeClosed, page });
    pagesFetched += 1;
    total += result.tasks.length;

    if (result.lastPage || result.tasks.length === 0) {
      reachedLastPage = true;
      break;
    }
  }

  return { total, pagesFetched, reachedLastPage };
}

async function fetchTasksInList(client, list, { includeClosed, maxPages }) {
  const tasks = [];
  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.getListTasksPage(list.listId, { includeClosed, page });
    for (const task of result.tasks) {
      const assignees = Array.isArray(task?.assignees)
        ? task.assignees
            .map((assignee) => assignee?.username || assignee?.email || "")
            .filter(Boolean)
        : [];
      tasks.push({
        id: String(task?.id ?? ""),
        name: String(task?.name ?? ""),
        status: String(task?.status?.status ?? "unknown"),
        listId: list.listId,
        listName: list.listName,
        spaceName: list.spaceName,
        folderName: list.folderName,
        assignees,
        dueDate: task?.due_date ? Number(task.due_date) : null,
        dateCreated: task?.date_created ? Number(task.date_created) : null,
        dateUpdated: task?.date_updated ? Number(task.date_updated) : null,
        dateDone: task?.date_done ? Number(task.date_done) : null,
        dateClosed: task?.date_closed ? Number(task.date_closed) : null,
      });
    }
    if (result.lastPage || result.tasks.length === 0) {
      break;
    }
  }
  return tasks;
}

async function fetchWorkspaceTasks(client, workspaceId, { includeClosed, maxPages, query }) {
  const tasks = [];
  let pagesFetched = 0;
  let reachedLastPage = false;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.getWorkspaceTasksPage(workspaceId, { includeClosed, page, query });
    pagesFetched += 1;
    for (const task of result.tasks) {
      const assignees = Array.isArray(task?.assignees)
        ? task.assignees
            .map((assignee) => assignee?.username || assignee?.email || "")
            .filter(Boolean)
        : [];
      tasks.push({
        id: String(task?.id ?? ""),
        name: String(task?.name ?? ""),
        status: String(task?.status?.status ?? "unknown"),
        listId: String(task?.list?.id ?? ""),
        listName: String(task?.list?.name ?? ""),
        spaceName: String(task?.space?.name ?? ""),
        folderName: String(task?.folder?.name ?? ""),
        assignees,
        dueDate: task?.due_date ? Number(task.due_date) : null,
        dateCreated: task?.date_created ? Number(task.date_created) : null,
        dateUpdated: task?.date_updated ? Number(task.date_updated) : null,
        dateDone: task?.date_done ? Number(task.date_done) : null,
        dateClosed: task?.date_closed ? Number(task.date_closed) : null,
      });
    }
    if (result.lastPage || result.tasks.length === 0) {
      reachedLastPage = true;
      break;
    }
  }

  return { tasks, pagesFetched, reachedLastPage };
}

function buildCorporateSummary({ scope, lists, tasks }) {
  const grouped = {
    done: [],
    review: [],
    in_progress: [],
    blocked: [],
    todo: [],
    other: [],
  };
  for (const task of tasks) {
    const group = classifyStatus(task.status);
    grouped[group].push(task);
  }

  return {
    scope,
    listsMatched: lists.length,
    listNames: lists.map((item) => item.listName),
    totalTasks: tasks.length,
    byGroup: {
      done: grouped.done.length,
      review: grouped.review.length,
      inProgress: grouped.in_progress.length,
      blocked: grouped.blocked.length,
      todo: grouped.todo.length,
      other: grouped.other.length,
    },
    top: {
      done: pickTopTasks(grouped.done),
      review: pickTopTasks(grouped.review),
      inProgress: pickTopTasks(grouped.in_progress),
      blocked: pickTopTasks(grouped.blocked),
      todo: pickTopTasks(grouped.todo),
      other: pickTopTasks(grouped.other),
    },
  };
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function toIsoTimestamp(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function parseDepartmentSpecs(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [left, right] = item.split("=").map((part) => (part ? part.trim() : ""));
      const label = right ? left : item;
      const scopeSpec = right ? right : item;
      const scopes = scopeSpec
        .split("|")
        .map((scope) => scope.trim())
        .filter(Boolean);
      return { label, scopes: scopes.length ? scopes : [label] };
    })
    .filter((item) => item.label && Array.isArray(item.scopes) && item.scopes.length > 0);
}

function dedupeTasks(tasks) {
  const map = new Map();
  for (const task of tasks) {
    const id = String(task?.id ?? "").trim();
    if (!id) {
      continue;
    }
    if (!map.has(id)) {
      map.set(id, task);
    }
  }
  return Array.from(map.values());
}

function pickTop(items, { limit, sortKey, direction }) {
  const dir = direction === "asc" ? 1 : -1;
  return items
    .slice()
    .sort((a, b) => {
      const av = Number(a?.[sortKey] ?? 0);
      const bv = Number(b?.[sortKey] ?? 0);
      if (av === bv) {
        return 0;
      }
      return av > bv ? dir : -dir;
    })
    .slice(0, limit);
}

function buildDepartmentsReportText(report) {
  const lines = [];
  lines.push(`ClickUp por departamentos (corte: ${report.generatedAt})`);
  lines.push(
    `Fuentes: tareas actualizadas en las ultimas ${report.recentHours}h + vencidas + con vencimiento en las proximas 24h.`,
  );
  lines.push("");

  for (const dept of report.departments) {
    lines.push(`${dept.label}`);
    lines.push(`A) Logros 24h: ${dept.doneRecent.count} tareas hechas.`);
    if (dept.doneRecent.top.length) {
      lines.push(
        `   Top: ${dept.doneRecent.top.map((t) => `${t.name} [${t.status}]`).join(" | ")}`,
      );
    }

    lines.push(
      `B) Bloqueos/atrasos: bloqueadas ${dept.blocked.count} | vencidas ${dept.overdue.count} | sin update >=${report.staleDays}d ${dept.stale.count}.`,
    );
    if (dept.blocked.top.length) {
      lines.push(
        `   Bloqueos: ${dept.blocked.top.map((t) => `${t.name} [${t.status}]`).join(" | ")}`,
      );
    }
    if (dept.overdue.top.length) {
      lines.push(
        `   Vencidas: ${dept.overdue.top
          .map((t) => `${t.name} (due ${t.dueDateIso || "sin fecha"})`)
          .join(" | ")}`,
      );
    }
    if (dept.stale.top.length) {
      lines.push(
        `   Sin update: ${dept.stale.top
          .map((t) => `${t.name} (upd ${t.dateUpdatedIso || "N/A"})`)
          .join(" | ")}`,
      );
    }

    lines.push(
      `C) Hoy: vencen <=24h ${dept.dueSoon.count} | en curso (upd <=${report.recentHours}h) ${dept.activeRecent.count}.`,
    );
    if (dept.dueSoon.top.length) {
      lines.push(
        `   Vencen <=24h: ${dept.dueSoon.top
          .map((t) => `${t.name} (due ${t.dueDateIso || "sin fecha"})`)
          .join(" | ")}`,
      );
    }
    if (dept.activeRecent.top.length) {
      lines.push(
        `   En curso: ${dept.activeRecent.top.map((t) => `${t.name} [${t.status}]`).join(" | ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function run() {
  const baseUrl = process.env.CLICKUP_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = (positionals[0] || "").trim();

  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }

  const token = requireToken();
  const client = new ClickUpClient({ token, baseUrl });

  if (command === "whoami") {
    const [userPayload, workspaces] = await Promise.all([client.getUser(), client.getWorkspaces()]);
    printJson({
      ok: true,
      baseUrl,
      user: {
        id: userPayload?.user?.id ?? null,
        username: userPayload?.user?.username ?? null,
        email: userPayload?.user?.email ?? null,
      },
      workspaces: workspaces.map((workspace) => ({
        id: workspace?.id ?? null,
        name: workspace?.name ?? null,
      })),
    });
    return;
  }

  if (command === "workspaces") {
    const workspaces = await client.getWorkspaces();
    printJson({
      ok: true,
      count: workspaces.length,
      workspaces: workspaces.map((workspace) => ({
        id: workspace?.id ?? null,
        name: workspace?.name ?? null,
      })),
    });
    return;
  }

  if (command === "spaces") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }
    const spaces = await client.getSpaces(workspaceId);
    printJson({
      ok: true,
      workspaceId,
      count: spaces.length,
      spaces: spaces.map((space) => ({
        id: space?.id ?? null,
        name: space?.name ?? null,
        private: space?.private ?? null,
      })),
    });
    return;
  }

  if (command === "find-list") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    const targetName =
      flagValue(flags, "name") ||
      process.env.CLICKUP_DEFAULT_LIST_NAME?.trim() ||
      DEFAULT_LIST_NAME;

    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }

    const lists = await collectListsByWorkspace(client, workspaceId);
    const normalizedTarget = normalizeName(targetName);
    const exact = lists.filter((list) => normalizeName(list.listName) === normalizedTarget);
    const partial = lists
      .filter((list) => normalizeName(list.listName).includes(normalizedTarget))
      .slice(0, 20);

    printJson({
      ok: true,
      workspaceId,
      query: targetName,
      exactMatches: exact,
      partialMatches: partial,
      totalListsScanned: lists.length,
    });
    return;
  }

  if (command === "count-list") {
    const listId = flagValue(flags, "list");
    if (!listId) {
      throw new Error("Missing list id. Use --list <id>.");
    }
    const includeClosed = parseBoolean(flagValue(flags, "include-closed"), false);
    const maxPages = parsePositiveInt(flagValue(flags, "max-pages"), DEFAULT_MAX_PAGES);
    const result = await countTasksInList(client, listId, { includeClosed, maxPages });

    printJson({
      ok: true,
      listId,
      includeClosed,
      maxPages,
      totalTasks: result.total,
      pagesFetched: result.pagesFetched,
      reachedLastPage: result.reachedLastPage,
    });
    return;
  }

  if (command === "count-list-by-name") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    const targetName =
      flagValue(flags, "name") ||
      process.env.CLICKUP_DEFAULT_LIST_NAME?.trim() ||
      DEFAULT_LIST_NAME;
    const matchMode = parseMatchMode(flagValue(flags, "match"), "exact");
    const includeClosed = parseBoolean(flagValue(flags, "include-closed"), false);
    const maxPages = parsePositiveInt(flagValue(flags, "max-pages"), DEFAULT_MAX_PAGES);

    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }

    const lists = await collectListsByWorkspace(client, workspaceId);
    const matches = lists.filter((list) => namesMatch(list.listName, targetName, matchMode));

    if (matches.length === 0) {
      const nearby = lists
        .filter((list) => normalizeName(list.listName).includes(normalizeName(targetName)))
        .slice(0, 20);
      throw new Error(
        `List "${targetName}" not found in workspace ${workspaceId}. Similar: ${
          nearby.map((item) => item.listName).join(", ") || "none"
        }`,
      );
    }

    const counts = [];
    for (const match of matches) {
      const count = await countTasksInList(client, match.listId, { includeClosed, maxPages });
      counts.push({
        ...match,
        totalTasks: count.total,
        pagesFetched: count.pagesFetched,
        reachedLastPage: count.reachedLastPage,
      });
    }

    printJson({
      ok: true,
      workspaceId,
      listName: targetName,
      matchMode,
      includeClosed,
      matches: counts,
      totalTasks: counts.reduce((sum, item) => sum + item.totalTasks, 0),
    });
    return;
  }

  if (command === "corporate-summary") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    const scopeName =
      flagValue(flags, "scope") ||
      process.env.CLICKUP_CORP_SCOPE_NAME?.trim() ||
      DEFAULT_CORP_SCOPE_NAME;
    const matchMode = parseMatchMode(flagValue(flags, "match"), "contains");
    const includeClosed = parseBoolean(flagValue(flags, "include-closed"), false);
    const maxPages = parsePositiveInt(flagValue(flags, "max-pages"), DEFAULT_MAX_PAGES);

    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }

    const workspaceTasks = await fetchWorkspaceTasks(client, workspaceId, {
      includeClosed,
      maxPages,
    });
    const scopedTasks = workspaceTasks.tasks.filter(
      (task) =>
        namesMatch(task.listName, scopeName, matchMode) ||
        namesMatch(task.spaceName, scopeName, matchMode) ||
        namesMatch(task.folderName, scopeName, matchMode),
    );
    const effectiveTasks = scopedTasks.length > 0 ? scopedTasks : workspaceTasks.tasks;
    const listMap = new Map();
    for (const task of effectiveTasks) {
      const key = `${task.listId}:${task.listName}`;
      if (!listMap.has(key)) {
        listMap.set(key, {
          listId: task.listId,
          listName: task.listName,
          spaceName: task.spaceName,
          folderName: task.folderName,
        });
      }
    }
    const effectiveLists = Array.from(listMap.values());

    const summary = buildCorporateSummary({
      scope: scopedTasks.length > 0 ? scopeName : `${scopeName} (fallback: workspace completo)`,
      lists: effectiveLists,
      tasks: effectiveTasks,
    });

    printJson({
      ok: true,
      workspaceId,
      scopeName,
      matchMode,
      includeClosed,
      pagesFetched: workspaceTasks.pagesFetched,
      reachedLastPage: workspaceTasks.reachedLastPage,
      usedFallbackWorkspace: scopedTasks.length === 0,
      summary,
      text: buildCorporateSummaryText(summary),
    });
    return;
  }

  if (command === "tasks-by-scope") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    const scopeName = flagValue(flags, "scope");
    const matchMode = parseMatchMode(flagValue(flags, "match"), "contains");
    const includeClosed = parseBoolean(flagValue(flags, "include-closed"), false);
    const maxPages = parsePositiveInt(flagValue(flags, "max-pages"), DEFAULT_MAX_PAGES);
    const limit = parseOptionalPositiveInt(flagValue(flags, "limit"));

    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }
    if (!scopeName) {
      throw new Error('Missing scope name. Use --scope "<name>".');
    }

    const workspaceTasks = await fetchWorkspaceTasks(client, workspaceId, {
      includeClosed,
      maxPages,
    });

    const scopedTasks = workspaceTasks.tasks.filter(
      (task) =>
        namesMatch(task.listName, scopeName, matchMode) ||
        namesMatch(task.spaceName, scopeName, matchMode) ||
        namesMatch(task.folderName, scopeName, matchMode),
    );

    let matchedLists = [];
    if (scopedTasks.length > 0) {
      const listMap = new Map();
      for (const task of scopedTasks) {
        const key = `${task.listId}:${task.listName}`;
        if (!listMap.has(key)) {
          listMap.set(key, {
            listId: task.listId,
            listName: task.listName,
            spaceName: task.spaceName,
            folderName: task.folderName,
          });
        }
      }
      matchedLists = Array.from(listMap.values());
    } else {
      const lists = await collectListsByWorkspace(client, workspaceId);
      matchedLists = lists
        .filter(
          (list) =>
            namesMatch(list.listName, scopeName, matchMode) ||
            namesMatch(list.spaceName, scopeName, matchMode) ||
            namesMatch(list.folderName || "", scopeName, matchMode),
        )
        .map((list) => ({
          listId: list.listId,
          listName: list.listName,
          spaceName: list.spaceName,
          folderName: list.folderName,
        }))
        .slice(0, 50);
    }

    const returnedTasks = limit ? scopedTasks.slice(0, limit) : scopedTasks;
    const truncated = limit ? scopedTasks.length > limit : false;

    printJson({
      ok: true,
      workspaceId,
      scopeName,
      matchMode,
      includeClosed,
      maxPages,
      pagesFetched: workspaceTasks.pagesFetched,
      reachedLastPage: workspaceTasks.reachedLastPage,
      matchedTasks: scopedTasks.length,
      returnedTasks: returnedTasks.length,
      truncated,
      matchedListsCount: matchedLists.length,
      matchedLists,
      tasks: returnedTasks.map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        listId: task.listId,
        listName: task.listName,
        spaceName: task.spaceName,
        folderName: task.folderName,
        assignees: task.assignees,
        dueDate: task.dueDate,
        dueDateIso: task.dueDate ? toIsoTimestamp(task.dueDate) : null,
      })),
      hints:
        scopedTasks.length === 0
          ? [
              "No matching tasks were found for this scope with the current filters.",
              "Try `find-list` to confirm the exact list name, or rerun with `--include-closed true`.",
            ]
          : [],
    });
    return;
  }

  if (command === "departments-report") {
    const workspaceId =
      flagValue(flags, "workspace") || process.env.CLICKUP_WORKSPACE_ID?.trim() || "";
    const departmentsRaw = flagValue(flags, "departments") || flagValue(flags, "scopes");
    const matchMode = parseMatchMode(flagValue(flags, "match"), "contains");
    const maxPages = parsePositiveInt(flagValue(flags, "max-pages"), 20);
    const recentHours = parsePositiveInt(flagValue(flags, "recent-hours"), 24);
    const staleDays = parsePositiveInt(flagValue(flags, "stale-days"), 7);
    const top = parsePositiveInt(flagValue(flags, "top"), 5);

    if (!workspaceId) {
      throw new Error("Missing workspace id. Use --workspace <id> or set CLICKUP_WORKSPACE_ID.");
    }
    if (!departmentsRaw) {
      throw new Error('Missing departments. Use --departments "<Label=Scope|AltScope,...>".');
    }

    const departments = parseDepartmentSpecs(departmentsRaw);
    if (departments.length === 0) {
      throw new Error('No valid departments parsed. Format: "Label=Scope|AltScope,Otro=Scope".');
    }

    const nowMs = Date.now();
    const recentUpdatedGt = nowMs - recentHours * 60 * 60 * 1000;
    const staleUpdatedLt = nowMs - staleDays * 24 * 60 * 60 * 1000;
    const dueSoonLt = nowMs + 24 * 60 * 60 * 1000;

    const [recentAll, overdueOpen, dueSoonOpen] = await Promise.all([
      fetchWorkspaceTasks(client, workspaceId, {
        includeClosed: true,
        maxPages,
        query: { date_updated_gt: String(recentUpdatedGt) },
      }),
      fetchWorkspaceTasks(client, workspaceId, {
        includeClosed: false,
        maxPages,
        query: { due_date_lt: String(nowMs) },
      }),
      fetchWorkspaceTasks(client, workspaceId, {
        includeClosed: false,
        maxPages,
        query: { due_date_gt: String(nowMs), due_date_lt: String(dueSoonLt) },
      }),
    ]);

    const union = dedupeTasks([...recentAll.tasks, ...overdueOpen.tasks, ...dueSoonOpen.tasks]);

    const deptReports = [];
    for (const dept of departments) {
      const matchesScope = (task) =>
        dept.scopes.some(
          (scope) =>
            namesMatch(task.listName, scope, matchMode) ||
            namesMatch(task.spaceName, scope, matchMode) ||
            namesMatch(task.folderName || "", scope, matchMode),
        );

      const deptUnion = union.filter(matchesScope);
      const deptRecent = recentAll.tasks.filter(matchesScope);
      const deptOverdue = overdueOpen.tasks.filter(matchesScope);
      const deptDueSoon = dueSoonOpen.tasks.filter(matchesScope);

      const doneRecent = deptRecent.filter((task) => classifyStatus(task.status) === "done");
      const activeRecent = deptRecent.filter((task) => {
        const group = classifyStatus(task.status);
        return group !== "done" && group !== "blocked";
      });
      const blocked = deptUnion.filter((task) => classifyStatus(task.status) === "blocked");
      const stale = deptUnion.filter(
        (task) =>
          classifyStatus(task.status) !== "done" &&
          Number.isFinite(task.dateUpdated) &&
          task.dateUpdated < staleUpdatedLt,
      );

      const mapTask = (task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        listName: task.listName,
        dueDateIso: task.dueDate ? toIsoTimestamp(task.dueDate) : null,
        dateUpdatedIso: task.dateUpdated ? toIsoTimestamp(task.dateUpdated) : null,
      });

      deptReports.push({
        label: dept.label,
        scopes: dept.scopes,
        counts: {
          recent: deptRecent.length,
          overdue: deptOverdue.length,
          dueSoon: deptDueSoon.length,
          union: deptUnion.length,
        },
        doneRecent: {
          count: doneRecent.length,
          top: pickTop(doneRecent, {
            limit: top,
            sortKey: "dateUpdated",
            direction: "desc",
          }).map(mapTask),
        },
        activeRecent: {
          count: activeRecent.length,
          top: pickTop(activeRecent, {
            limit: top,
            sortKey: "dateUpdated",
            direction: "desc",
          }).map(mapTask),
        },
        blocked: {
          count: blocked.length,
          top: pickTop(blocked, {
            limit: top,
            sortKey: "dateUpdated",
            direction: "desc",
          }).map(mapTask),
        },
        overdue: {
          count: deptOverdue.length,
          top: pickTop(deptOverdue, {
            limit: top,
            sortKey: "dueDate",
            direction: "asc",
          }).map(mapTask),
        },
        dueSoon: {
          count: deptDueSoon.length,
          top: pickTop(deptDueSoon, {
            limit: top,
            sortKey: "dueDate",
            direction: "asc",
          }).map(mapTask),
        },
        stale: {
          count: stale.length,
          top: pickTop(stale, {
            limit: top,
            sortKey: "dateUpdated",
            direction: "asc",
          }).map(mapTask),
        },
      });
    }

    const generatedAt = new Date().toISOString();
    const report = {
      ok: true,
      workspaceId,
      matchMode,
      recentHours,
      staleDays,
      top,
      generatedAt,
      queries: {
        recentUpdatedGt,
        overdueDueDateLt: nowMs,
        dueSoon: { dueDateGt: nowMs, dueDateLt: dueSoonLt },
        pages: {
          recent: recentAll.pagesFetched,
          overdue: overdueOpen.pagesFetched,
          dueSoon: dueSoonOpen.pagesFetched,
        },
      },
      departments: deptReports,
    };

    printJson({
      ...report,
      text: buildDepartmentsReportText(report),
    });
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

run().catch((error) => {
  console.error(
    `[clickup] ${error instanceof Error ? error.message : String(error)}\nRun with "help" to see usage.`,
  );
  process.exit(1);
});
