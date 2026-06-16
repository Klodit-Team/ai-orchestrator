# ═══════════════════════════════════════════════════════════════════════════════
# AL-MIZAN — AI Orchestrator — Multi-stage Dockerfile
#
# Stage 1 (builder): installs all deps and compiles TypeScript.
# Stage 2 (runtime): lean image that contains only production artefacts plus
#   the ai-agents and mcp directories needed by spawned agent child processes.
#
# Build context must be the repo root so that ai-agents/ and mcp/ are available.
#   docker build -f ai-orchestrator/Dockerfile -t al-mizan-ai-orchestrator .
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install orchestrator dependencies
COPY ai-orchestrator/package*.json ./
RUN npm install --legacy-peer-deps

# Copy orchestrator source and compile
COPY ai-orchestrator/tsconfig.json ./
COPY ai-orchestrator/src ./src
RUN npm run build


# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# tsx is used by the orchestrator to spawn agent scripts
RUN npm install -g tsx@4.19.2

WORKDIR /workspace

# ── Orchestrator app ──
COPY --from=builder /build/node_modules ./ai-orchestrator/node_modules
COPY --from=builder /build/dist         ./ai-orchestrator/dist
COPY ai-orchestrator/package.json        ./ai-orchestrator/package.json

# ── MCP servers (required by spawned agents at runtime) ──
COPY mcp /workspace/mcp
RUN for dir in /workspace/mcp/*/; do \
      if [ -f "${dir}package.json" ]; then \
        echo "Installing MCP deps in $dir" && \
        npm --prefix "$dir" ci --legacy-peer-deps; \
      fi; \
    done

# ── AI agent scripts (spawned as child processes by the orchestrator) ──
COPY ai-agents/package*.json /workspace/ai-agents/
RUN npm --prefix /workspace/ai-agents ci --legacy-peer-deps
COPY ai-agents/src /workspace/ai-agents/src

ENV NODE_ENV=production
ENV AI_AGENTS_PATH=/workspace/ai-agents/src/agents

CMD ["sh", "-c", "node ai-orchestrator/dist/ai-services/index.js & node ai-orchestrator/dist/main.js"]
