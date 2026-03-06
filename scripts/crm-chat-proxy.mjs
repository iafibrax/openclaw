#!/usr/bin/env node

import express from "express";
import process from "node:process";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT || "8789");
const openclawUrl = (process.env.OPENCLAW_URL || "http://127.0.0.1:18789").replace(/\/$/, "");
const openclawToken = (process.env.OPENCLAW_TOKEN || "").trim();
const defaultAgentId = (process.env.OPENCLAW_AGENT_ID || "main").trim();
const defaultModel = (process.env.OPENCLAW_MODEL || "openclaw:main").trim();
const crmApiKey = (process.env.CRM_CHAT_API_KEY || "").trim();
const timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS || "25000");
const corsOrigin = (process.env.CORS_ORIGIN || "*").trim();
const sessionPrefix = (process.env.OPENCLAW_SESSION_PREFIX || "crm").trim();
const systemPrompt = (process.env.OPENCLAW_SYSTEM_PROMPT || "").trim();

if (!openclawToken) {
  console.error("Missing OPENCLAW_TOKEN");
  process.exit(1);
}

if (Number.isNaN(port) || port <= 0) {
  console.error("Invalid PORT");
  process.exit(1);
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "crm-chat-proxy" });
});

app.post("/crm/chat", async (req, res) => {
  try {
    if (crmApiKey) {
      const incomingKey = String(req.header("x-api-key") || "").trim();
      if (!incomingKey || incomingKey !== crmApiKey) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
    }

    const message = String(req.body?.message || "").trim();
    const userId = String(req.body?.userId || "anon").trim();
    const context = req.body?.context;
    const agentId = String(req.body?.agentId || defaultAgentId).trim() || "main";
    const model = String(req.body?.model || defaultModel).trim() || "openclaw:main";

    if (!message) {
      res.status(400).json({ ok: false, error: "message is required" });
      return;
    }

    const safeUserId = userId.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 128) || "anon";
    const sessionKey = `${sessionPrefix}:${safeUserId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const userContent = context
      ? `Contexto CRM:\n${JSON.stringify(context)}\n\nConsulta:\n${message}`
      : message;

    const messages = systemPrompt
      ? [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ]
      : [{ role: "user", content: userContent }];

    const openclawResponse = await fetch(`${openclawUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openclawToken}`,
        "Content-Type": "application/json",
        "x-openclaw-agent-id": agentId,
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const raw = await openclawResponse.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!openclawResponse.ok) {
      const maybe404 = openclawResponse.status === 404;
      const hint = maybe404
        ? "Enable gateway.http.endpoints.chatCompletions.enabled=true in OpenClaw config and restart gateway."
        : null;

      res.status(502).json({
        ok: false,
        error: "openclaw_request_failed",
        status: openclawResponse.status,
        hint,
        details: data,
      });
      return;
    }

    const content = data?.choices?.[0]?.message?.content;
    const reply = Array.isArray(content)
      ? content.map((item) => (typeof item === "string" ? item : item?.text || "")).join("")
      : String(content || "").trim();

    res.json({
      ok: true,
      reply,
      sessionKey,
      agentId,
      model,
      usage: data?.usage || null,
      raw: req.body?.debug === true ? data : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = message.toLowerCase().includes("abort");
    res.status(isAbort ? 504 : 500).json({
      ok: false,
      error: isAbort ? "openclaw_timeout" : "internal_error",
      message,
    });
  }
});

app.listen(port, () => {
  console.log(`CRM chat proxy listening on :${port}`);
  console.log(`OpenClaw URL: ${openclawUrl}`);
});
