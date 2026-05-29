# AGENTS.md

You are working in the iii monorepo — a backend unification engine with three primitives: **Function**, **Trigger**, **Worker**. The engine is Rust. SDKs exist for TypeScript, Python, and Rust. All communicate over WebSocket.

## Commands

```bash
# Setup
pnpm install                     # JS/TS dependencies
cargo build --release            # Rust workspace

# Build
pnpm build                       # all JS/TS packages (Turborepo)
cargo build --release             # engine + Rust SDK + console

# Test
pnpm test                        # all JS/TS tests
cargo test                       # all Rust tests
cargo test -p iii                 # engine only
cargo test -p iii-sdk             # Rust SDK only
cd sdk/packages/python/iii && uv sync --extra dev && uv run pytest  # Python SDK

# Lint & Format
pnpm fmt                         # format JS/TS (Biome)
pnpm fmt:check                   # check without changes
pnpm lint                        # lint JS/TS
cargo fmt --all                   # format Rust
cargo clippy --workspace          # lint Rust

# Run
cargo run --release               # start engine (reads engine/config.yaml)
pnpm dev:console                  # console frontend dev server
pnpm dev:docs                     # docs dev server (Mintlify)
pnpm dev:website                  # website dev server

# Cloud
iii cloud deploy --config <path>  # deploy to iii Cloud
iii cloud list                    # list deployments
iii cloud update <deployment-id>  # update a deployment
iii cloud delete <deployment-id>  # delete a deployment
```

## Project Map

```
engine/                          Rust engine — runtime, modules, protocol, CLI
sdk/packages/node/iii/           TypeScript SDK (npm: iii-sdk)
sdk/packages/node/iii-browser/   Browser SDK (npm: iii-browser-sdk)
sdk/packages/python/iii/         Python SDK (PyPI: iii-sdk)
sdk/packages/rust/iii/           Rust SDK (crates.io: iii-sdk)
console/                         Developer console (React + Rust)
skills/                          26 agent skills (auto-discovered by SkillKit)
docs/                            Documentation site (Mintlify/MDX)
website/                         iii.dev website
scripts/                         Build and CI scripts
```

**Workspaces:** `Cargo.toml` (Rust), `pnpm-workspace.yaml` (JS/TS), `turbo.json` (build orchestration).

## Boundaries

### Always

- Use `pnpm` (never `npm`) for JS/TS packages
- Use `cargo fmt --all` before committing Rust changes
- Use `pnpm fmt` before committing JS/TS changes
- Use leading slashes for HTTP `api_path` values: `/orders`, `/users/:id`
- Use `expression` (not `cron`) for cron trigger config fields
- Use `::` separator for function IDs: `orders::validate`, `reports::daily-summary`
- Use `workspace:*` for internal pnpm package references
- Include `## When to Use` and `## Boundaries` sections in every SKILL.md
- Match SKILL.md `name` field to its directory name exactly

### Ask First

- Changes to public SDK APIs (npm/PyPI/crates.io surface)
- Changes to engine config schema (`engine/config.yaml`)
- Changes to CI/CD workflows (`.github/`)
- Adding new engine modules
- Modifying the WebSocket protocol between SDK and engine

### Never

- Commit secrets, API keys, or credentials
- Use `npm` instead of `pnpm`
- Push directly to `main`
- Change engine licensing (ELv2) or SDK licensing (Apache-2.0)
- Remove "When to Use" / "Boundaries" from SKILL.md files (SkillKit validates these)
- Use `cron` as a config key — the engine uses `expression`
- Omit leading slashes on `api_path` — the engine standard is `/path`

## Code Style

**Rust (engine + SDK):**
```rust
// Function IDs use :: separator
iii.register_function(
    RegisterFunction::new("orders::validate", validate_order)
        .description("Validate an incoming order"),
);

// HTTP triggers use leading slash
iii.register_trigger(
    IIITrigger::Http(HttpTriggerConfig::new("/orders/validate").method(HttpMethod::Post))
        .for_function("orders::validate"),
);

// Cron triggers use `expression` field (7-field: sec min hour dom month dow year)
iii.register_trigger(
    IIITrigger::Cron(CronTriggerConfig::new("0 0 9 * * * *"))
        .for_function("reports::daily-summary"),
);
```

**TypeScript (SDK):**
```typescript
// HTTP trigger with leading slash
iii.registerTrigger({
  type: 'http',
  function_id: 'orders::validate',
  config: { api_path: '/orders/validate', http_method: 'POST' },
});

// HTTP trigger with middleware chain
iii.registerTrigger({
  type: 'http',
  function_id: 'orders::validate',
  config: {
    api_path: '/orders/validate',
    http_method: 'POST',
    middleware_function_ids: ['middleware::auth', 'middleware::rate-limit'],
  },
});

// Cron trigger with `expression` (not `cron`)
iii.registerTrigger({
  type: 'cron',
  function_id: 'reports::daily-summary',
  config: { expression: '0 0 9 * * * *' },
});

// Trigger with metadata (optional, stored with the trigger)
iii.registerTrigger({
  type: 'cron',
  function_id: 'reports::daily-summary',
  config: { expression: '0 0 9 * * * *' },
  metadata: { owner: 'billing-team', priority: 'high' },
});
```

**Python (SDK):**
```python
# Same patterns — leading slash, expression field
iii.register_trigger({
    "type": "http",
    "function_id": "orders::validate",
    "config": {"api_path": "/orders/validate", "http_method": "POST"},
})
```

## Skills

The `skills/` directory contains 26 agent skills (iii-prefixed) auto-discovered by `npx skills add iii-hq/iii` and `npx skillkit install iii-hq/iii`. Reference implementations live in `skills/references/` with TypeScript, Python, and Rust variants.

## Licensing

- `engine/` — Elastic License v2 (ELv2)
- Everything else — Apache-2.0

<!-- switchboard:agents-protocol:start -->
# AGENTS.md - Switchboard Protocol

## 🚨 STRICT PROTOCOL ENFORCEMENT 🚨

This project relies on **Switchboard Workflows** defined in `.agent/workflows`.

**Rule #1**: If a user request matches a known workflow trigger, you **MUST** execute that workflow exactly as defined in the corresponding `.md` file. Do not "wing it" or use internal capability unless explicitly told to ignore the workflow.

**Rule #2**: You MUST NOT call `send_message` with unsupported actions. Only `submit_result` and `status_update` are valid (see Code-Level Enforcement below). The tool will reject unrecognized or unauthorized actions.

**Rule #3**: The `send_message` tool auto-routes actions to the correct recipient based on the active workflow. You do NOT need to specify a recipient. If the workflow requires a specific role (e.g. `reviewer`), ensure an agent with that role is registered.

### Workflow Registry

| Trigger Words | Workflow File | Description |
| :--- | :--- | :--- |
| `/accuracy` | **`accuracy.md`** | High accuracy mode with self-review (Standard Protocol). |
| `/improve-plan` | **`improve-plan.md`** | Deep planning, dependency checks, and adversarial review. |
| `/challenge`, `/challenge --self` | **`challenge.md`** | Internal adversarial review workflow (no delegation). |
| `/chat` | **`chat.md`** | Activate chat consultation workflow. |
| `/archive` | **`archive.md`** | Query or search the plan archive. |
| `/export` | **`export.md`** | Export current conversation to archive. |


### ⚠️ MANDATORY PRE-FLIGHT CHECK

Before EVERY response, you MUST:

1. **Scan** the user's message for explicit workflow commands from the table above (prefer `/workflow` forms).
2. **Do not auto-trigger on generic language** (for example: "review this", "delegate this", "quick start") unless the user explicitly asks to run that workflow.
3. **If a command match is found**: Read the workflow file with `view_file .agent/workflows/[WORKFLOW].md` and execute it step-by-step. Do NOT improvise an alternative approach.
4. **Fast Kanban Resolution**: If the user asks about plans in specific Kanban columns (e.g. "update all created plans"), you MUST use the `get_kanban_state` MCP tool to instantly identify the target plans.
5. **If no match is found**: Respond normally.

### Execution Rules

1. **Read Definition**: Use `view_file .agent/workflows/[WORKFLOW].md` to read the steps.
2. **Execute Step-by-Step**: Follow the numbered steps in the workflow.
   - If a step says "Call tool X", call it.
   - If a step says "Generate artifact Y", generate it.
3. **Do Not Skip**: Do not merge steps or skip persona adoption unless the workflow explicitly allows it (e.g. `// turbo`).
4. **Do Not Improvise**: If a workflow exists for the user's request, you MUST use it. Calling tools directly without following the workflow is a protocol violation and will be rejected by the tool layer.

### Code-Level Enforcement

The following actions are enforced at the tool level and WILL be rejected if misused:

| Action | Required Active Workflow |
| :--- | :--- |
| `submit_result` | *(no restriction — this is a response)* |
| `status_update` | *(no restriction — informational)* |

Sending to non-existent recipients is always rejected (even when auto-routed).

### 🏗️ Switchboard Global Architecture

```
User ──► Switchboard Operator (chat.md)
              │  Plans captured in .switchboard/plans/
              │
              ├──► /improve-plan   Deep planning, dependency checks, and adversarial review
              └──► Kanban Board    Plans moved through workflow stages (Created → Coded → Reviewed → Done)

All file writes to .switchboard/ MUST use IsArtifact: false.
Plans are executed via Kanban board workflow, not delegation.
```

Conversational routing: when the intent is to advance a kanban card or send a plan to the next agent/stage, prefer `move_kanban_card(sessionId, target)` over raw `send_message`. The `target` may be a kanban column label, a built-in role, or a kanban-enabled custom agent name; generic conversational `coded` / `team` targets are smart-routed by plan complexity.

### 📚 Available Skills

Skills provide specialized capabilities and domain knowledge. Invoke with `skill: "<name>"`.

| Skill | When to Use |
|-------|-------------|
| `archive` | User asks to "search archives", "query archives", "find old plans", "export conversation" |
| `review` | User asks to review code changes, a PR, or specific files |

**Usage**: Call `skill: "archive"` before performing archive operations to access detailed tool documentation and examples.

**Skill Files Location**: `.agent/skills/` (distributed with plugin)
<!-- switchboard:agents-protocol:end -->
