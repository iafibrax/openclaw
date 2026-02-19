#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const portRaw = process.env.PORT?.trim();
const port = portRaw && /^\d+$/.test(portRaw) ? portRaw : "18789";

const args = ["openclaw.mjs", "gateway", "--allow-unconfigured", "--bind", "lan", "--port", port];

const child = spawn(process.execPath, args, {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});
