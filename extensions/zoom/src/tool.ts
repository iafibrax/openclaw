import { Type } from "@sinclair/typebox";
import {
  jsonResult,
  readNumberParam,
  readStringParam,
  stringEnum,
  type AnyAgentTool,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk";

const ACTIONS = ["status", "personal", "list", "get", "create"] as const;
const LIST_TYPES = [
  "scheduled",
  "live",
  "upcoming",
  "upcoming_meetings",
  "previous_meetings",
] as const;
const AUTO_RECORDING = ["local", "cloud", "none"] as const;

const ENV_ACCOUNT_ID = ["OPENCLAW_ZOOM_ACCOUNT_ID", "ZOOM_ACCOUNT_ID"];
const ENV_CLIENT_ID = ["OPENCLAW_ZOOM_CLIENT_ID", "ZOOM_CLIENT_ID"];
const ENV_CLIENT_SECRET = ["OPENCLAW_ZOOM_CLIENT_SECRET", "ZOOM_CLIENT_SECRET"];
const ENV_SECRET_TOKEN = ["OPENCLAW_ZOOM_SECRET_TOKEN", "ZOOM_SECRET_TOKEN"];
const ENV_USER_ID = ["OPENCLAW_ZOOM_USER_ID", "ZOOM_USER_ID"];
const ENV_DEFAULT_TIMEZONE = ["OPENCLAW_ZOOM_DEFAULT_TIMEZONE"];
const ENV_DEFAULT_PASSWORD = ["OPENCLAW_ZOOM_DEFAULT_PASSWORD"];

const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";
const ZOOM_API_BASE_URL = "https://api.zoom.us/v2";
const TOKEN_SKEW_MS = 30_000;

type ToolParams = {
  action: (typeof ACTIONS)[number];
  type?: (typeof LIST_TYPES)[number];
  pageSize?: number;
  nextPageToken?: string;
  meetingId?: string;
  topic?: string;
  startTime?: string;
  durationMinutes?: number;
  timezone?: string;
  agenda?: string;
  password?: string;
  waitingRoom?: boolean;
  joinBeforeHost?: boolean;
  autoRecording?: (typeof AUTO_RECORDING)[number];
  alternativeHosts?: string;
  hostVideo?: boolean;
  participantVideo?: boolean;
  muteUponEntry?: boolean;
};

type ZoomAction = (typeof ACTIONS)[number];

type CreateZoomToolOptions = {
  allowedActions?: ZoomAction[];
};

type ZoomPluginConfig = {
  accountId?: string;
  clientId?: string;
  clientSecret?: string;
  secretToken?: string;
  userId?: string;
  defaultTimezone?: string;
  defaultPassword?: string;
};

type ZoomBaseCredentials = {
  accountId: string;
  clientId: string;
  clientSecret: string;
};

type ZoomResolvedConfig = ZoomBaseCredentials & {
  secretToken?: string;
  userId?: string;
  defaultTimezone?: string;
  defaultPassword?: string;
};

type ZoomTokenCache = {
  key: string;
  token: string;
  expiresAt: number;
};

let tokenCache: ZoomTokenCache | null = null;

function resolveAllowedActions(allowed?: ZoomAction[]): ZoomAction[] {
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return [...ACTIONS];
  }
  const normalized = allowed
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ZoomAction => ACTIONS.includes(value as ZoomAction));
  if (normalized.length === 0) {
    return [...ACTIONS];
  }
  return Array.from(new Set(normalized));
}

export const ZoomToolSchema = Type.Object(
  {
    action: Type.Optional(
      stringEnum(ACTIONS, {
        description: `Action to perform: ${ACTIONS.join(", ")}`,
      }),
    ),
    type: Type.Optional(
      stringEnum(LIST_TYPES, {
        description: `Meeting list type for action=list: ${LIST_TYPES.join(", ")}`,
      }),
    ),
    pageSize: Type.Optional(
      Type.Number({
        minimum: 1,
        maximum: 300,
        description: "Page size for action=list (1-300)",
      }),
    ),
    nextPageToken: Type.Optional(
      Type.String({
        description: "Pagination token returned by action=list",
      }),
    ),
    meetingId: Type.Optional(
      Type.String({
        description: "Meeting ID for action=get",
      }),
    ),
    topic: Type.Optional(
      Type.String({
        description: "Meeting topic for action=create",
      }),
    ),
    startTime: Type.Optional(
      Type.String({
        description:
          "Start time for action=create, ISO-8601 (for example: 2026-02-16T20:30:00-06:00)",
      }),
    ),
    durationMinutes: Type.Optional(
      Type.Number({
        minimum: 1,
        maximum: 1440,
        description: "Duration in minutes for action=create",
      }),
    ),
    timezone: Type.Optional(
      Type.String({
        description: "IANA timezone for action=create (for example: America/Cancun)",
      }),
    ),
    agenda: Type.Optional(
      Type.String({
        description: "Agenda text for action=create",
      }),
    ),
    password: Type.Optional(
      Type.String({
        description: "Meeting passcode for action=create",
      }),
    ),
    waitingRoom: Type.Optional(
      Type.Boolean({
        description: "Enable waiting room (action=create)",
      }),
    ),
    joinBeforeHost: Type.Optional(
      Type.Boolean({
        description: "Allow participants to join before host (action=create)",
      }),
    ),
    autoRecording: Type.Optional(
      stringEnum(AUTO_RECORDING, {
        description: `Recording mode for action=create: ${AUTO_RECORDING.join(", ")}`,
      }),
    ),
    alternativeHosts: Type.Optional(
      Type.String({
        description: "Comma-separated alternative host emails (action=create)",
      }),
    ),
    hostVideo: Type.Optional(
      Type.Boolean({
        description: "Enable host video by default (action=create)",
      }),
    ),
    participantVideo: Type.Optional(
      Type.Boolean({
        description: "Enable participant video by default (action=create)",
      }),
    ),
    muteUponEntry: Type.Optional(
      Type.Boolean({
        description: "Mute participants upon entry (action=create)",
      }),
    ),
  },
  { additionalProperties: false },
);

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function readConfigString(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveZoomConfig(api: OpenClawPluginApi): ZoomPluginConfig {
  const pluginConfig =
    api.pluginConfig && typeof api.pluginConfig === "object"
      ? (api.pluginConfig as Record<string, unknown>)
      : undefined;

  return {
    accountId: readEnv(ENV_ACCOUNT_ID) ?? readConfigString(pluginConfig, "accountId"),
    clientId: readEnv(ENV_CLIENT_ID) ?? readConfigString(pluginConfig, "clientId"),
    clientSecret: readEnv(ENV_CLIENT_SECRET) ?? readConfigString(pluginConfig, "clientSecret"),
    secretToken: readEnv(ENV_SECRET_TOKEN) ?? readConfigString(pluginConfig, "secretToken"),
    userId: readEnv(ENV_USER_ID) ?? readConfigString(pluginConfig, "userId"),
    defaultTimezone:
      readEnv(ENV_DEFAULT_TIMEZONE) ?? readConfigString(pluginConfig, "defaultTimezone"),
    defaultPassword:
      readEnv(ENV_DEFAULT_PASSWORD) ?? readConfigString(pluginConfig, "defaultPassword"),
  };
}

function requireCredentials(config: ZoomPluginConfig): ZoomResolvedConfig {
  const missing: string[] = [];
  if (!config.accountId) {
    missing.push("accountId");
  }
  if (!config.clientId) {
    missing.push("clientId");
  }
  if (!config.clientSecret) {
    missing.push("clientSecret");
  }
  if (missing.length > 0) {
    throw new Error(
      `Zoom credentials missing: ${missing.join(", ")}. Set plugins.entries.zoom.config or OPENCLAW_ZOOM_* env vars.`,
    );
  }

  const accountId = config.accountId!;
  const clientId = config.clientId!;
  const clientSecret = config.clientSecret!;

  return {
    accountId,
    clientId,
    clientSecret,
    secretToken: config.secretToken,
    userId: config.userId,
    defaultTimezone: config.defaultTimezone,
    defaultPassword: config.defaultPassword,
  };
}

function requireUserId(config: ZoomResolvedConfig): string {
  const userId = config.userId?.trim();
  if (!userId) {
    throw new Error(
      "Zoom userId is required for this action. Set plugins.entries.zoom.config.userId or OPENCLAW_ZOOM_USER_ID.",
    );
  }
  return userId;
}

function truncate(text: string, maxChars = 400): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}...`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw };
  }
}

function cacheKey(credentials: ZoomBaseCredentials): string {
  return `${credentials.accountId}:${credentials.clientId}:${credentials.clientSecret}`;
}

async function fetchAccessToken(credentials: ZoomBaseCredentials): Promise<string> {
  const key = cacheKey(credentials);
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString(
    "base64",
  );
  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: credentials.accountId,
  });
  const response = await fetch(`${ZOOM_OAUTH_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const payload = (await parseResponseBody(response)) as {
    access_token?: string;
    expires_in?: number;
    reason?: string;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    const detail = truncate(
      String(payload.reason ?? payload.message ?? payload.error ?? JSON.stringify(payload)),
    );
    throw new Error(`Zoom OAuth failed (${response.status}): ${detail}`);
  }

  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("Zoom OAuth succeeded but returned no access_token.");
  }

  const expiresInSec =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;
  tokenCache = {
    key,
    token: accessToken,
    expiresAt: Date.now() + expiresInSec * 1000 - TOKEN_SKEW_MS,
  };
  return accessToken;
}

async function callZoomApi(params: {
  credentials: ZoomBaseCredentials;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  retryOnUnauthorized?: boolean;
}): Promise<unknown> {
  const { credentials, method, path, body, retryOnUnauthorized = true } = params;
  const accessToken = await fetchAccessToken(credentials);
  const response = await fetch(`${ZOOM_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retryOnUnauthorized) {
    tokenCache = null;
    return await callZoomApi({ credentials, method, path, body, retryOnUnauthorized: false });
  }

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const detail = truncate(
      typeof payload === "object" && payload !== null ? JSON.stringify(payload) : String(payload),
    );
    throw new Error(`Zoom API ${method} ${path} failed (${response.status}): ${detail}`);
  }
  return payload;
}

function normalizeMeetingId(params: Record<string, unknown>): string {
  const meetingId = readStringParam(params, "meetingId", { required: true, label: "meetingId" });
  if (!meetingId) {
    throw new Error("meetingId required");
  }
  return meetingId;
}

function parseIsoDate(raw: string): string {
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid startTime "${raw}". Use ISO-8601 format.`);
  }
  return new Date(parsed).toISOString();
}

async function runStatus(config: ZoomResolvedConfig): Promise<unknown> {
  const userId = requireUserId(config);
  const user = (await callZoomApi({
    credentials: config,
    method: "GET",
    path: `/users/${encodeURIComponent(userId)}`,
  })) as Record<string, unknown>;

  return {
    ok: true,
    accountId: config.accountId,
    userId,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      timezone: user.timezone,
      pmi: user.pmi,
      personalMeetingUrl: user.personal_meeting_url,
      status: user.status,
      type: user.type,
    },
  };
}

async function runPersonal(config: ZoomResolvedConfig): Promise<unknown> {
  const userId = requireUserId(config);
  const user = (await callZoomApi({
    credentials: config,
    method: "GET",
    path: `/users/${encodeURIComponent(userId)}`,
  })) as Record<string, unknown>;

  return {
    ok: true,
    userId,
    email: user.email,
    pmi: user.pmi,
    personalMeetingUrl: user.personal_meeting_url,
  };
}

async function runList(
  config: ZoomResolvedConfig,
  params: Record<string, unknown>,
): Promise<unknown> {
  const userId = requireUserId(config);
  const type = readStringParam(params, "type", { label: "type" }) ?? "upcoming";
  const pageSizeRaw = readNumberParam(params, "pageSize", { label: "pageSize", integer: true });
  const pageSize = pageSizeRaw ? Math.max(1, Math.min(300, Math.trunc(pageSizeRaw))) : 30;
  const nextPageToken = readStringParam(params, "nextPageToken", { label: "nextPageToken" });

  const query = new URLSearchParams({
    type,
    page_size: String(pageSize),
  });
  if (nextPageToken) {
    query.set("next_page_token", nextPageToken);
  }

  const listPayload = (await callZoomApi({
    credentials: config,
    method: "GET",
    path: `/users/${encodeURIComponent(userId)}/meetings?${query.toString()}`,
  })) as {
    meetings?: Array<Record<string, unknown>>;
    next_page_token?: string;
    total_records?: number;
    page_count?: number;
  };

  const meetings = Array.isArray(listPayload.meetings) ? listPayload.meetings : [];
  const normalizedMeetings = await Promise.all(
    meetings.map(async (meeting) => {
      let joinUrl = typeof meeting.join_url === "string" ? meeting.join_url : undefined;
      if (!joinUrl && (typeof meeting.id === "number" || typeof meeting.id === "string")) {
        try {
          const details = (await callZoomApi({
            credentials: config,
            method: "GET",
            path: `/meetings/${encodeURIComponent(String(meeting.id))}`,
          })) as Record<string, unknown>;
          if (typeof details.join_url === "string") {
            joinUrl = details.join_url;
          }
        } catch {
          // Best effort; keep list response even if detail fetch fails.
        }
      }

      return {
        id: meeting.id,
        uuid: meeting.uuid,
        topic: meeting.topic,
        status: meeting.status,
        type: meeting.type,
        startTime: meeting.start_time,
        durationMinutes: meeting.duration,
        timezone: meeting.timezone,
        joinUrl,
        password: meeting.password,
      };
    }),
  );

  return {
    ok: true,
    userId,
    type,
    totalRecords: listPayload.total_records,
    pageCount: listPayload.page_count,
    nextPageToken: listPayload.next_page_token,
    meetings: normalizedMeetings,
  };
}

async function runGet(
  config: ZoomResolvedConfig,
  params: Record<string, unknown>,
): Promise<unknown> {
  const meetingId = normalizeMeetingId(params);
  const details = (await callZoomApi({
    credentials: config,
    method: "GET",
    path: `/meetings/${encodeURIComponent(meetingId)}`,
  })) as Record<string, unknown>;

  return {
    ok: true,
    meeting: {
      id: details.id,
      uuid: details.uuid,
      topic: details.topic,
      status: details.status,
      type: details.type,
      startTime: details.start_time,
      durationMinutes: details.duration,
      timezone: details.timezone,
      joinUrl: details.join_url,
      startUrl: details.start_url,
      password: details.password,
      agenda: details.agenda,
      settings: details.settings,
    },
  };
}

async function runCreate(
  config: ZoomResolvedConfig,
  params: Record<string, unknown>,
): Promise<unknown> {
  const userId = requireUserId(config);
  const topic = readStringParam(params, "topic", { label: "topic" }) ?? "OpenClaw Meeting";
  const startTimeRaw = readStringParam(params, "startTime", { label: "startTime" });
  const startTime = startTimeRaw ? parseIsoDate(startTimeRaw) : undefined;
  const durationRaw = readNumberParam(params, "durationMinutes", {
    label: "durationMinutes",
    integer: true,
  });
  const durationMinutes =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? Math.max(1, Math.trunc(durationRaw))
      : undefined;
  const timezone =
    readStringParam(params, "timezone", { label: "timezone" }) ?? config.defaultTimezone;
  const agenda = readStringParam(params, "agenda", { label: "agenda" });
  const password =
    readStringParam(params, "password", { label: "password" }) ?? config.defaultPassword;
  const autoRecording = readStringParam(params, "autoRecording", { label: "autoRecording" });
  const alternativeHosts = readStringParam(params, "alternativeHosts", {
    label: "alternativeHosts",
  });

  const settings: Record<string, unknown> = {};
  if (typeof params.waitingRoom === "boolean") {
    settings.waiting_room = params.waitingRoom;
  }
  if (typeof params.joinBeforeHost === "boolean") {
    settings.join_before_host = params.joinBeforeHost;
  }
  if (typeof params.hostVideo === "boolean") {
    settings.host_video = params.hostVideo;
  }
  if (typeof params.participantVideo === "boolean") {
    settings.participant_video = params.participantVideo;
  }
  if (typeof params.muteUponEntry === "boolean") {
    settings.mute_upon_entry = params.muteUponEntry;
  }
  if (autoRecording) {
    settings.auto_recording = autoRecording;
  }
  if (alternativeHosts) {
    settings.alternative_hosts = alternativeHosts;
  }

  const payload: Record<string, unknown> = {
    topic,
    type: startTime ? 2 : 1,
  };
  if (startTime) {
    payload.start_time = startTime;
  }
  if (durationMinutes) {
    payload.duration = durationMinutes;
  }
  if (timezone) {
    payload.timezone = timezone;
  }
  if (agenda) {
    payload.agenda = agenda;
  }
  if (password) {
    payload.password = password;
  }
  if (Object.keys(settings).length > 0) {
    payload.settings = settings;
  }

  const created = (await callZoomApi({
    credentials: config,
    method: "POST",
    path: `/users/${encodeURIComponent(userId)}/meetings`,
    body: payload,
  })) as Record<string, unknown>;

  return {
    ok: true,
    userId,
    meeting: {
      id: created.id,
      uuid: created.uuid,
      topic: created.topic,
      status: created.status,
      type: created.type,
      startTime: created.start_time,
      durationMinutes: created.duration,
      timezone: created.timezone,
      joinUrl: created.join_url,
      startUrl: created.start_url,
      password: created.password,
      encryptedPassword: created.encrypted_password,
      settings: created.settings,
    },
  };
}

export function createZoomTool(
  api: OpenClawPluginApi,
  options?: CreateZoomToolOptions,
): AnyAgentTool {
  const allowedActions = resolveAllowedActions(options?.allowedActions);
  const defaultAction = allowedActions[0] ?? "create";
  const actionsLabel = allowedActions.join(", ");

  return {
    name: "zoom",
    label: "Zoom",
    description: `Manage Zoom meetings using Server-to-Server OAuth. Actions enabled: ${actionsLabel}.`,
    parameters: ZoomToolSchema,
    execute: async (_toolCallId, rawParams: ToolParams) => {
      const params = (rawParams ?? {}) as Record<string, unknown>;
      const action = (
        readStringParam(params, "action", { label: "action" }) ?? defaultAction
      ).toLowerCase();
      try {
        if (!allowedActions.includes(action as ZoomAction)) {
          return jsonResult({
            ok: false,
            error: `Action "${action}" is disabled. Allowed actions: ${actionsLabel}`,
          });
        }
        const config = requireCredentials(resolveZoomConfig(api));

        switch (action) {
          case "status":
            return jsonResult(await runStatus(config));
          case "personal":
            return jsonResult(await runPersonal(config));
          case "list":
            return jsonResult(await runList(config, params));
          case "get":
            return jsonResult(await runGet(config, params));
          case "create":
            return jsonResult(await runCreate(config, params));
          default:
            return jsonResult({
              ok: false,
              error: `Unknown action "${action}". Valid actions: ${ACTIONS.join(", ")}`,
            });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        api.logger.warn(`zoom tool failed: ${message}`);
        return jsonResult({ ok: false, error: message });
      }
    },
  };
}
