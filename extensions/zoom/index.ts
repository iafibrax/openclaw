import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createZoomTool } from "./src/tool.js";

const plugin = {
  id: "zoom",
  name: "Zoom",
  description: "Zoom meetings tool restricted to create meetings for the comercial agent",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        if (ctx.agentId !== "comercial") {
          return null;
        }
        return createZoomTool(api, { allowedActions: ["create"] });
      },
      { names: ["zoom"] },
    );
  },
};

export default plugin;
