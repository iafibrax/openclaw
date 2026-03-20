import type { AnnounceTarget } from "./sessions-send-helpers.js";
import { getChannelPlugin, normalizeChannelId } from "../../channels/plugins/index.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { listBindings } from "../../routing/bindings.js";
import { normalizeAgentId, parseAgentSessionKey } from "../../routing/session-key.js";
import { SessionListRow } from "./sessions-helpers.js";
import { resolveAnnounceTargetFromKey } from "./sessions-send-helpers.js";

function resolveBoundAccountId(params: {
  sessionKey: string;
  displayKey: string;
  channel: string;
}): string | undefined {
  const normalizedChannel =
    normalizeChannelId(params.channel) ?? params.channel.trim().toLowerCase();
  if (!normalizedChannel) {
    return undefined;
  }
  const parsed = parseAgentSessionKey(params.sessionKey) ?? parseAgentSessionKey(params.displayKey);
  const agentId = parsed ? normalizeAgentId(parsed.agentId) : "";
  if (!agentId) {
    return undefined;
  }
  const cfg = loadConfig();
  const candidates = new Set<string>();
  for (const binding of listBindings(cfg)) {
    const bindingAgentId = normalizeAgentId(binding?.agentId);
    if (bindingAgentId !== agentId) {
      continue;
    }
    const rawChannel = typeof binding?.match?.channel === "string" ? binding.match.channel : "";
    const bindingChannel = normalizeChannelId(rawChannel) ?? rawChannel.trim().toLowerCase();
    if (!bindingChannel || bindingChannel !== normalizedChannel) {
      continue;
    }
    const accountId =
      typeof binding?.match?.accountId === "string" ? binding.match.accountId.trim() : "";
    if (!accountId || accountId === "*") {
      continue;
    }
    candidates.add(accountId);
  }
  if (candidates.size !== 1) {
    return undefined;
  }
  return Array.from(candidates)[0];
}

function applyBoundAccountPreference(params: {
  target: AnnounceTarget | null;
  sessionKey: string;
  displayKey: string;
}): AnnounceTarget | null {
  if (!params.target) {
    return null;
  }
  const preferred = resolveBoundAccountId({
    sessionKey: params.sessionKey,
    displayKey: params.displayKey,
    channel: params.target.channel,
  });
  if (!preferred) {
    return params.target;
  }
  return { ...params.target, accountId: preferred };
}

export async function resolveAnnounceTarget(params: {
  sessionKey: string;
  displayKey: string;
}): Promise<AnnounceTarget | null> {
  const parsed = resolveAnnounceTargetFromKey(params.sessionKey);
  const parsedDisplay = resolveAnnounceTargetFromKey(params.displayKey);
  const fallback = parsed ?? parsedDisplay ?? null;

  if (fallback) {
    const normalized = normalizeChannelId(fallback.channel);
    const plugin = normalized ? getChannelPlugin(normalized) : null;
    if (!plugin?.meta?.preferSessionLookupForAnnounceTarget) {
      return applyBoundAccountPreference({
        target: fallback,
        sessionKey: params.sessionKey,
        displayKey: params.displayKey,
      });
    }
  }

  try {
    const list = await callGateway<{ sessions: Array<SessionListRow> }>({
      method: "sessions.list",
      params: {
        includeGlobal: true,
        includeUnknown: true,
        limit: 200,
      },
    });
    const sessions = Array.isArray(list?.sessions) ? list.sessions : [];
    const match =
      sessions.find((entry) => entry?.key === params.sessionKey) ??
      sessions.find((entry) => entry?.key === params.displayKey);

    const deliveryContext =
      match?.deliveryContext && typeof match.deliveryContext === "object"
        ? (match.deliveryContext as Record<string, unknown>)
        : undefined;
    const channel =
      (typeof deliveryContext?.channel === "string" ? deliveryContext.channel : undefined) ??
      (typeof match?.lastChannel === "string" ? match.lastChannel : undefined);
    const to =
      (typeof deliveryContext?.to === "string" ? deliveryContext.to : undefined) ??
      (typeof match?.lastTo === "string" ? match.lastTo : undefined);
    const accountId =
      (typeof deliveryContext?.accountId === "string" ? deliveryContext.accountId : undefined) ??
      (typeof match?.lastAccountId === "string" ? match.lastAccountId : undefined);
    if (channel && to) {
      return applyBoundAccountPreference({
        target: { channel, to, accountId },
        sessionKey: params.sessionKey,
        displayKey: params.displayKey,
      });
    }
  } catch {
    // ignore
  }

  return applyBoundAccountPreference({
    target: fallback,
    sessionKey: params.sessionKey,
    displayKey: params.displayKey,
  });
}
