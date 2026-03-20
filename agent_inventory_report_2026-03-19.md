# Inventario de agentes OpenClaw

Generado: 2026-03-19T20:31:00Z

## Resumen

- Agentes runtime detectados: 16
- Agentes configurados en openclaw.json: 15
- Cuentas WhatsApp: 4
- Cron jobs: 4
- Docker compose projects: 1
- Contenedores corriendo: 4
- Contenedores salidos: 3

## Gateway y herramientas

- Gateway: mode=local, bind=loopback, port=18789, authMode=token, hasGatewayToken=true, hasRemoteToken=true
- Tools: agentToAgentEnabled=true, allowAll=false, execHost=gateway, execSecurity=full, execAsk=off

## Integraciones

- ClickUp: hasApiKey=true, workspace=9017310603, defaultList=Referidos, corpScope=Direccion General
- SQL Server: host=fibrax.database.windows.net, db=Fibrax, port=1433, hasUser=true, hasPassword=true, maxRows=200
- GHL: baseUrl=https://services.leadconnectorhq.com, hasGlobalToken=true, defaultLocationId=cX1QLQlLHj1OPhvG4a59, locationIds=qKbjy5p0Jqd3UKQh52lj, E8medlBb1d4rHrSATNYK

## Docker (levantado actualmente)

- Engine: client=29.2.1, server=29.2.1, api=1.53, platform=Docker Desktop 4.63.0 (220185), daemon=docker-desktop, os=linux, arch=aarch64
- Compose project: openclaw (running(2)) -> /Users/desarrollofibrax/Documents/GitHub/openclaw/docker-compose.yml

### Contenedores corriendo

- openclaw-openclaw-cli-run-eec4b68542e1 | image=openclaw:local | status=Up 30 hours | network=openclaw_default | ports=-
- openclaw-openclaw-cli-run-6e9333003f48 | image=openclaw:local | status=Up 30 hours | network=openclaw_default | ports=-
- dreamy_carson | image=docker/welcome-to-docker:latest | status=Up 31 hours | network=bridge | ports=80/tcp
- sion-tunnel | image=cloudflare/cloudflared:latest | status=Up 31 hours | network=bridge | ports=-

### Contenedores salidos

- confident_hugle | image=docker/welcome-to-docker:latest | status=Exited (255) 31 hours ago | network=bridge | ports=80/tcp
- sion-gateway | image=sion-openclaw:latest | status=Exited (255) 31 hours ago | network=bridge | ports=0.0.0.0:18789-18790->18789-18790/tcp
- welcome-to-docker | image=docker/welcome-to-docker:latest | status=Exited (255) 31 hours ago | network=bridge | ports=0.0.0.0:8088->80/tcp

## Acceso por alias de agente (nuevo)

- Router local activo en: `http://127.0.0.1:18890`
- Healthcheck: `/healthz`
- Emision de enlace firmado: `/issue/<alias>`
- Rutas clave:
  - `/chat/sion` -> `agent:main:main`
  - `/chat/fibrax-mind` -> `agent:fibrax-mind:fibrax-mind`
  - `/chat/mujeres` -> `agent:mujeres-inversionistas:mujeres-inversionistas`
  - `/chat/contabilidad` -> `agent:contabilidad:contabilidad`

## Bindings

- agentId=main, channel=whatsapp, accountId=default
- agentId=comercial, channel=whatsapp, accountId=commercial
- agentId=fibrax-mind, channel=whatsapp, accountId=fibrax-mind
- agentId=mujeres-inversionistas, channel=whatsapp, accountId=mujeres-inversionistas

## WhatsApp accounts

- commercial: name=WhatsApp Comercial, enabled=true, dmPolicy=open, groupPolicy=allowlist, allowFromCount=1
- default: name=WhatsApp Principal, enabled=true, dmPolicy=allowlist, groupPolicy=allowlist, allowFromCount=8
- fibrax-mind: name=WhatsApp Fibrax Mind, enabled=true, dmPolicy=open, groupPolicy=allowlist, allowFromCount=1
- mujeres-inversionistas: name=WhatsApp Mujeres Inversionistas, enabled=true, dmPolicy=open, groupPolicy=allowlist, allowFromCount=1

## Cron jobs

- Reporte ejecutivo empresarial AP (id=acd4ed59-2271-4964-a683-71558ecd61ba)
  - agent=main, enabled=true, schedule=0 7 \* \* \* (America/Cancun), delivery=whatsapp:+529981904429
  - lastStatus=ok, lastRun=2026-03-19T12:00:00.021Z, nextRun=2026-03-20T12:00:00.000Z
- Reporte ejecutivo empresarial Oscar (id=d98c825c-115b-4a3a-8e9c-31c39ef89182)
  - agent=main, enabled=true, schedule=15 7 \* \* \* (America/Cancun), delivery=whatsapp:+529981254091
  - lastStatus=ok, lastRun=2026-03-19T12:06:43.436Z, nextRun=2026-03-20T12:00:00.000Z
- Reporte ejecutivo empresarial Alma (id=0ae4cd97-e142-49af-8da0-7adce6c1b425)
  - agent=main, enabled=true, schedule=30 7 \* \* \* (America/Cancun), delivery=whatsapp:+529988961832
  - lastStatus=ok, lastRun=2026-03-19T12:14:02.765Z, nextRun=2026-03-20T12:00:00.000Z
- Reporte ejecutivo empresarial Joel (id=c0ca9a80-5bf1-4731-811d-44fb92f01bda)
  - agent=main, enabled=true, schedule=45 7 \* \* \* (America/Cancun), delivery=whatsapp:+529984927652
  - lastStatus=ok, lastRun=2026-03-19T12:19:35.139Z, nextRun=2026-03-20T12:00:00.000Z

## Agentes

### atencion-clientes (Gerente Atencion Clientes)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-atencion-clientes
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Reporte SLA (primera respuesta, resolucion, backlog). | Clasificacion por severidad y causa. | Playbooks de respuesta y escalacion.

### calidad (Gerente Calidad)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-calidad
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Reporte de defectos por proyecto o proceso. | Causa raiz (5 whys) + plan CAPA. | Criterios de aceptacion verificables.

### cobranza (Gerente Cobranza)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-cobranza
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Segmentar cartera (0-30, 31-60, 61-90, 90+). | Top deudores + plan de contacto. | Plantillas de mensajes por etapa (WhatsApp/correo).

### comercial (fx IA)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-comercial
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: whatsapp / commercial / +5214141125878
- whatsappStats: accounts=commercial directCount=35 groupCount=1
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather, gohighlevel-referidos
- puedesHacer (AGENTS.md): -

### concierge-vip (Concierge VIP)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-concierge-vip
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Itinerarios, recordatorios y checklists de viaje/eventos. | Scripts de confirmacion y seguimiento. | Manejo de incidencias con alternativas.

### contabilidad (Gerente Contabilidad)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-contabilidad
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather, sion-reportes
- puedesHacer (AGENTS.md): Estado de cierre (que falta, por que, responsables). | Validaciones de integridad (facturas, XML, complementos, timbrado). | Conciliacion: diferencias y acciones.

### desarrollo (Gerente Desarrollo)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-desarrollo
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, session-logs, skill-creator, weather, sqlserver-readonly
- puedesHacer (AGENTS.md): Estado por modulo: En progreso / Bloqueado / Listo para QA / En produccion. | Identificar bloqueos (dependencias, accesos, requisitos incompletos). | Proponer roadmap corto (hoy/semana/sprint). | Generar checklist de release (QA, UAT, deploy, rollback, monitoreo). | Consultas **solo lectura** a SQL Server (SELECT) cuando la solicitud venga claramente como escalamiento: | Desde **SION IA** (cualquier consulta permitida por policy). | Desde **fx IA** solo para **inventarios/disponibilidad** por motivo comercial (lotes activos y desarrollos vigentes).

### fibrax-mind (Fibrax Mind IA)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-fibrax-mind
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: whatsapp / fibrax-mind / +5219984149274
- whatsappStats: accounts=fibrax-mind directCount=13 groupCount=0
- skillsFromLastMain: sqlserver-readonly, clickup, gog, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): -

### juridico (Gerente Juridico)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-juridico
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Resumen de contratos, pendientes y fechas clave. | Matriz de riesgos (alto/medio/bajo) con mitigacion. | Checklist de cumplimiento por proceso. | Consultar politicas y procesos internos desde la Wiki FX (ClickUp) cuando esten disponibles en `MEMORY.md` (ClickUp Wiki Sync).

### main (SION IA)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-sion
- model: openai/gpt-5.1-codex
- toolsProfile: full
- lastMainChannel/account/to: webchat / default / +5219984927652
- whatsappStats: accounts=default,commercial,mujeres-inversionistas,fibrax-mind directCount=19 groupCount=10
- skillsFromLastMain: sqlserver-readonly, clickup, gog, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): -

### marketing (Gerente Marketing)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-marketing
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: coding-agent, healthcheck, openai-image-gen, openai-whisper-api, session-logs, skill-creator, weather
- puedesHacer (AGENTS.md): Estado de campanas (Meta/Google/TikTok) y KPIs (leads, CPL, ROAS). | Auditoria rapida del embudo (landing -> formulario -> CRM -> seguimiento). | Sugerir optimizaciones (copy, creatividades, audiencias, seguimiento).

### mujeres-inversionistas (Mujeres inversionistas IA)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-mujeres-inversionistas
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / mujeres-inversionistas / +5219984927652
- whatsappStats: accounts=mujeres-inversionistas directCount=13 groupCount=0
- skillsFromLastMain: sqlserver-readonly, clickup, gog, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): -

### obra (Gerente Obra)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-obra
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather, sqlserver-readonly
- puedesHacer (AGENTS.md): Avance por fase (porcentaje, hitos completados, siguientes hitos). | Control de riesgos (clima, materiales, permisos, contratistas). | Pendientes criticos con responsable y fecha compromiso. | Inventarios de disponibilidad (lotes activos) SOLO lectura para apoyar al area comercial.

### recursos-humanos (Gerente RH)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-recursos-humanos
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, gohighlevel, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Estado de vacantes (abiertas/cerradas y etapa). | Resumen de incidencias y rotacion. | Planes de onboarding y capacitacion. | Reglas de organigrama y roles.

### sion (sin identidad)

- configuredInOpenclaw: false
- workspace: /Users/desarrollofibrax/.openclaw/workspace-sion
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: whatsapp / default / +5219984927652
- whatsappStats: accounts=default directCount=2 groupCount=0
- skillsFromLastMain: sqlserver-readonly, clickup, gog, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): -

### tesoreria (Gerente Tesoreria)

- configuredInOpenclaw: true
- workspace: /Users/desarrollofibrax/.openclaw/workspace-tesoreria
- model: openai/gpt-5.1-codex
- toolsProfile: -
- lastMainChannel/account/to: webchat / - / -
- whatsappStats: accounts=- directCount=0 groupCount=0
- skillsFromLastMain: clickup, coding-agent, healthcheck, openai-image-gen, openai-whisper-api, skill-creator, weather
- puedesHacer (AGENTS.md): Forecast semanal/mensual (entradas/salidas). | Priorizacion de pagos (criticos vs diferibles). | Alertas por saldo minimo y riesgos.
