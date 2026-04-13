# Khadim — Agentic Automation Platform

## Product Vision

Khadim is an open-source, local-first agentic automation platform. It uses AI coding agents (Claude Code, OpenCode, or Khadim's own LLM backend) to build, run, and manage automations — not by dragging pre-built blocks, but by having AI agents write and execute automation scripts on the fly.

**Core differentiator vs UiPath/n8n/Zapier:** When a UI changes or an edge case appears, Khadim's agents can see the screen, understand what broke, rewrite the script, and retry. No brittle selectors. No manual maintenance.

**Deployment model:**
- **Desktop app** — build, test, run automations locally. Docker for headless local execution.
- **Web app** — cloud control plane. Deploy managed agents, monitor runs, team dashboards.
- **Shared core** — same agent engine, same tool system, same data model.

**Enterprise focus, open-source distribution.** The core is free. Enterprise gets: team management, audit logs, SSO, cloud runners, priority support.

---

## Target Users

### Persona 1: The Automator (Simple User)
- **Who:** Office worker, small business owner, ops manager
- **Technical level:** Can use a browser and describe tasks in plain English. Not a programmer.
- **Entry point:** Chat interface. "Every morning, check my email for invoices and add the totals to my spreadsheet."
- **Key need:** It just works. Minimal setup. See results.

### Persona 2: The Builder (Power User)
- **Who:** IT analyst, automation engineer, technical ops
- **Technical level:** Comfortable with configuration. May know some scripting.
- **Entry point:** Automation builder. Creates multi-step workflows, configures triggers, manages agents.
- **Key need:** Control, visibility, reliability. Needs to see what the agent is doing and intervene.

### Persona 3: The Deployer (Enterprise)
- **Who:** IT team lead, CTO, platform engineer
- **Technical level:** Technical. Manages infrastructure.
- **Entry point:** Web dashboard. Deploys managed agents for the team. Monitors fleet.
- **Key need:** Governance, audit trail, team management, uptime.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Khadim Desktop                     │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │  Chat    │  │ Builder  │  │   Run Monitor       │ │
│  │  Mode    │  │ Mode     │  │   (live progress)   │ │
│  └────┬─────┘  └────┬─────┘  └─────────┬───────────┘ │
│       │              │                  │             │
│  ┌────┴──────────────┴──────────────────┴───────────┐ │
│  │              Agent Engine                         │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │         Tool Domains (pluggable)             │ │ │
│  │  │                                              │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │ │
│  │  │  │ Screen   │ │ Browser  │ │ Connectors   │ │ │ │
│  │  │  │ capture  │ │ automate │ │ email/http/  │ │ │ │
│  │  │  │ OCR      │ │ CDP      │ │ spreadsheet  │ │ │ │
│  │  │  │ input    │ │ navigate │ │ file ops     │ │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────────┘ │ │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │ │
│  │  │  │ Coding   │ │ System   │ │ Plugins      │ │ │ │
│  │  │  │ read/    │ │ shell    │ │ WASM user    │ │ │ │
│  │  │  │ write/   │ │ process  │ │ extensions   │ │ │ │
│  │  │  │ LSP/git  │ │ docker   │ │              │ │ │ │
│  │  │  └──────────┘ └──────────┘ └──────────────┘ │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────┘ │
│                          │                             │
│  ┌───────────────────────┴───────────────────────────┐ │
│  │              Runner (local / Docker)               │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Desktop App Redesign

### Navigation Model

Keep the existing `chat | work` mode switcher. Chat stays simple. Work becomes the full platform.

```
Sidebar — Top Level:
  ┌─────────────────────────┐
  │  Khadim                 │
  │                         │
  │  [ Chat ]  [ Work ]     │  ← Mode switcher (existing component)
  │                         │
  │  ⚙️  Settings           │  ← Always visible
  └─────────────────────────┘

Chat mode sidebar:
  ┌─────────────────────────┐
  │  [ Chat ]  [ Work ]     │
  │                         │
  │  + New Chat              │
  │                         │
  │  Today                   │
  │    Download invoices     │
  │    Update spreadsheet    │
  │  Yesterday               │
  │    Email report           │
  │    Price check            │
  └─────────────────────────┘

Work mode sidebar:
  ┌─────────────────────────┐
  │  [ Chat ]  [ Work ]     │
  │                         │
  │  🤖  Agents             │  ← Managed agent definitions
  │  📋  Sessions           │  ← Execution transcripts
  │  🌍  Environments       │  ← Runtime configs (dev/prod)
  │  🔐  Credentials        │  ← Secure vault
  │  🧠  Memory             │  ← Persistent knowledge
  │  ⚡  Analytics          │  ← Usage stats + costs
  └─────────────────────────┘
```

**Chat mode** is intentionally minimal:
- Conversation list in the sidebar (existing)
- Chat input + streaming output in the main area (existing)
- After a task completes, offer "Save as Automation" to promote to an agent
- No dashboards, no nav, no platform complexity
- This is where simple users live permanently

**Work mode** is the full Claude Console-style platform:
- Agents: create, configure, deploy managed automation agents
- Sessions: view execution transcripts (User/Agent/Tool turns with token counts)
- Environments: isolated runtime configs with variables + credential bindings
- Credentials: secure vault for API keys, logins, OAuth tokens
- Memory: persistent knowledge agents accumulate across sessions
- Analytics: success rates, token usage, cost tracking
- This is where power users and enterprise teams live

This maps directly to the existing `InteractionMode = "chat" | "work"` type in the codebase. The mode switcher component already exists.

### Screen Definitions

#### 1. Work Mode Landing (Dashboard)

The first thing a power user sees when switching to Work mode. Answers: "What's happening across my agents?"

```
┌────────────────────────────────────────────────────────┐
│  3 agents active. 14 sessions completed today.         │
│                                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │ Active       │ │ Completed   │ │ Failed      │     │
│  │     2        │ │    14       │ │     1       │     │
│  └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                        │
│  Recent Sessions                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │ ✅ Invoice extraction    2 min ago    12 items │   │
│  │ ⚡ Web scraping          running      page 3/8 │   │
│  │ ❌ Email report          failed       timeout  │   │
│  │ ✅ Data entry            1 hour ago   done     │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  [ + New Agent ]                                       │
└────────────────────────────────────────────────────────┘
```

This is the default view when clicking into Work mode. It shows at-a-glance status across all agents and sessions. Clicking any item navigates to the relevant Work sub-section.

**States:**
- Empty: first-time → guided agent creation
- Active: shows live sessions with progress
- Idle: shows recent history + agent status

#### 2. Chat (Simple Mode)

The simple user's primary interface. Conversational automation creation and execution.

```
┌────────────────────────────────────────────────────────┐
│  Khadim                                                │
│                                                        │
│  ┌─ Assistant ─────────────────────────────────────┐  │
│  │ I can help you automate tasks on your computer. │  │
│  │ What would you like me to do?                   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ You ───────────────────────────────────────────┐  │
│  │ Every morning, go to mybank.com, download last  │  │
│  │ month's statement, and save it to my Documents  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Assistant ─────────────────────────────────────┐  │
│  │ I'll create an automation for that. Let me:     │  │
│  │                                                 │  │
│  │ ▸ Writing browser script...                     │  │
│  │   ▸ Opening mybank.com                          │  │
│  │   ▸ Navigating to statements                    │  │
│  │   ▸ Downloading PDF                             │  │
│  │                                                 │  │
│  │ ✅ Done! Statement saved to ~/Documents/        │  │
│  │                                                 │  │
│  │ [ Save as Automation ] [ Run Again ] [ Edit ]   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────┐             │
│  │ Type a task to automate...      [▶]  │             │
│  └──────────────────────────────────────┘             │
└────────────────────────────────────────────────────────┘
```

Key difference from current chat: after the agent completes a task, it offers to **save as automation** for reuse. Chat conversations become automation prototypes.

**Approval flow:** When the agent needs to do something sensitive (open browser, access files, send email), the existing ApprovalOverlay appears. The user approves/denies. This is already built.

#### 3. Automations (Library)

Saved automations that can be run on demand or scheduled.

```
┌────────────────────────────────────────────────────────┐
│  Automations                          [ + New ]        │
│                                                        │
│  ┌─ Search... ─────────────────────────────────────┐  │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ 📄 Invoice Extraction                          │   │
│  │    Checks email, extracts invoice PDFs,        │   │
│  │    logs amounts to spreadsheet                 │   │
│  │    ⏰ Daily at 9:00 AM  │  Last run: 2h ago ✅ │   │
│  │    [ Run Now ] [ Edit ] [ Schedule ]           │   │
│  ├────────────────────────────────────────────────┤   │
│  │ 🌐 Price Monitor                               │   │
│  │    Scrapes competitor prices from 3 sites,     │   │
│  │    alerts if price drops below threshold       │   │
│  │    ⏰ Every 6 hours  │  Last run: 1h ago ✅    │   │
│  │    [ Run Now ] [ Edit ] [ Schedule ]           │   │
│  ├────────────────────────────────────────────────┤   │
│  │ 📧 Weekly Report                               │   │
│  │    Compiles data from CRM, generates report,   │   │
│  │    emails to team@company.com                  │   │
│  │    ⏰ Monday 8:00 AM  │  Last run: 5d ago ✅   │   │
│  │    [ Run Now ] [ Edit ] [ Schedule ]           │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

**Automation detail view** (when you click into one):

```
┌────────────────────────────────────────────────────────┐
│  ← Automations  /  Invoice Extraction                  │
│                                                        │
│  ┌─ Overview ──────────────────────────────────────┐  │
│  │ Description: Checks email for invoices...       │  │
│  │ Created: Jan 15, 2026                           │  │
│  │ Trigger: Daily at 9:00 AM                       │  │
│  │ Last run: 2 hours ago ✅                        │  │
│  │ Success rate: 94% (47/50 runs)                  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Steps ─────────────────────────────────────────┐  │
│  │ 1. Check email for new invoices                 │  │
│  │ 2. Download PDF attachments                     │  │
│  │ 3. Extract amounts using OCR                    │  │
│  │ 4. Append to spreadsheet                        │  │
│  │ 5. Send confirmation email                      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Recent Runs ───────────────────────────────────┐  │
│  │ ✅ Today 9:01 AM      12 invoices   32s        │  │
│  │ ✅ Yesterday 9:00 AM   8 invoices   28s        │  │
│  │ ❌ Jan 10 9:02 AM      timeout      60s        │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  [ Run Now ]  [ Edit ]  [ Duplicate ]  [ Delete ]     │
└────────────────────────────────────────────────────────┘
```

#### 4. Agents (Managed Agents)

This is the Claude managed agents concept adapted for RPA. An "agent" is a persistent, specialized automation persona with its own instructions, tools, and deployment target.

```
┌────────────────────────────────────────────────────────┐
│  Agents                               [ + New Agent ]  │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ 🤖 Support Agent                               │   │
│  │    Handles customer support tickets via email   │   │
│  │    Tools: email, knowledge base, CRM            │   │
│  │    Status: ● Active  │  Handled: 142 tickets   │   │
│  │    [ Configure ] [ Pause ] [ View Logs ]       │   │
│  ├────────────────────────────────────────────────┤   │
│  │ 🤖 Data Entry Agent                            │   │
│  │    Processes form submissions into database     │   │
│  │    Tools: browser, spreadsheet, OCR             │   │
│  │    Status: ● Active  │  Processed: 1,204 rows  │   │
│  │    [ Configure ] [ Pause ] [ View Logs ]       │   │
│  ├────────────────────────────────────────────────┤   │
│  │ 🤖 Report Generator                            │   │
│  │    Compiles weekly analytics reports            │   │
│  │    Tools: API, spreadsheet, email               │   │
│  │    Status: ○ Scheduled  │  Next: Monday 8AM    │   │
│  │    [ Configure ] [ Pause ] [ View Logs ]       │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

**Agent configuration** (when creating/editing):

```
┌────────────────────────────────────────────────────────┐
│  ← Agents  /  Configure: Support Agent                 │
│                                                        │
│  Name:         [ Support Agent                    ]    │
│  Description:  [ Handles customer support tickets ]    │
│                                                        │
│  Instructions:                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ You are a support agent for Acme Corp.          │  │
│  │ When a new email arrives at support@acme.com:   │  │
│  │ 1. Classify the ticket (billing/technical/etc)  │  │
│  │ 2. Search the knowledge base for a solution     │  │
│  │ 3. Draft a response                             │  │
│  │ 4. If confident, send. If not, flag for human.  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Tools:                                                │
│  [✓] Email        [✓] Knowledge Base  [ ] Browser     │
│  [✓] CRM API      [ ] Spreadsheet    [ ] Screen      │
│  [ ] File System   [ ] Docker        [ ] Custom...    │
│                                                        │
│  Trigger:                                              │
│  ( ) Manual only                                       │
│  (•) On schedule    [ Every ] [ 15 ] [ minutes ]      │
│  ( ) On event       [ New email to support@... ]      │
│                                                        │
│  Approval:                                             │
│  (•) Auto-approve known actions                        │
│  ( ) Always ask before executing                       │
│  ( ) Never ask (fully autonomous)                      │
│                                                        │
│  Runner:                                               │
│  (•) Local (this machine)                              │
│  ( ) Docker container                                  │
│  ( ) Cloud (requires Khadim Cloud)                     │
│                                                        │
│  [ Save ]  [ Test Run ]  [ Deploy ]                   │
└────────────────────────────────────────────────────────┘
```

#### 5. Runs (Execution History)

Live and historical execution monitoring.

```
┌────────────────────────────────────────────────────────┐
│  Runs                    [ All ▾ ] [ Last 7 days ▾ ]  │
│                                                        │
│  ┌─ Live ──────────────────────────────────────────┐  │
│  │ ⚡ Invoice Extraction   running   step 3/5  32s │  │
│  │ ⚡ Price Monitor         running   page 2/3  12s │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Recent ────────────────────────────────────────┐  │
│  │ ✅ Support Agent  #142  2 min ago    resolved   │  │
│  │ ✅ Data Entry     batch 1h ago       204 rows   │  │
│  │ ❌ Report Gen     failed 3h ago      API error  │  │
│  │ ✅ Invoice Ext    today 9:01         12 items   │  │
│  │ ✅ Support Agent  #141  5h ago       resolved   │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Run detail view** (click into a run):

```
┌────────────────────────────────────────────────────────┐
│  ← Runs  /  Invoice Extraction  #47                    │
│                                                        │
│  Status: ⚡ Running        Duration: 32s               │
│  Started: Today 9:01 AM   Trigger: Scheduled           │
│                                                        │
│  ┌─ Steps ─────────────────────────────────────────┐  │
│  │ ✅ 1. Connect to email        2s               │  │
│  │ ✅ 2. Found 3 new invoices    4s               │  │
│  │ ⚡ 3. Extracting amounts      running...        │  │
│  │    ▸ Processing invoice-001.pdf                 │  │
│  │    ▸ OCR: detected "$1,234.56"                  │  │
│  │ ○ 4. Update spreadsheet                        │  │
│  │ ○ 5. Send confirmation                         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Agent Output ──────────────────────────────────┐  │
│  │ Found 3 unread emails with PDF attachments.     │  │
│  │ Processing invoice-001.pdf...                   │  │
│  │ Extracted: Vendor=Acme, Amount=$1,234.56,       │  │
│  │ Date=2026-01-10                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Screenshots ───────────────────────────────────┐  │
│  │ [thumb] [thumb] [thumb]  ← agent vision snaps   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  [ Abort ]  [ Retry ]  [ View Full Log ]              │
└────────────────────────────────────────────────────────┘
```

---

## Data Model

### Rename mapping (current → new)

| Current | New | Purpose |
|---------|-----|---------|
| `Workspace` | `Project` | A collection of related automations |
| `Conversation` | `ChatSession` | Chat = draft, saved = automation |
| `Message` | `Message` | Keep as-is |
| `AgentInstance` | `Agent` | A managed agent definition |
| — | `Automation` | A saved, runnable automation |
| — | `Session` | A single execution/conversation with an agent |
| — | `SessionTurn` | A turn within a session (User/Agent/Tool) |
| — | `Environment` | Runtime config (dev/staging/prod) |
| — | `Credential` | Secure stored secret (API key, login, etc.) |
| — | `MemoryStore` | Persistent knowledge for an agent |
| — | `Schedule` | Cron/trigger for an automation |
| — | `Connector` | Configured external service |

### New SQLite tables

```sql
-- Saved automations (promoted from chat conversations)
CREATE TABLE automations (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL,     -- The prompt/instructions for the agent
    tools TEXT NOT NULL DEFAULT '[]', -- JSON array of enabled tool domains
    trigger_type TEXT DEFAULT 'manual', -- manual, schedule, event
    trigger_config TEXT,            -- JSON trigger configuration
    approval_mode TEXT DEFAULT 'ask', -- auto, ask, never
    runner_type TEXT DEFAULT 'local', -- local, docker, cloud
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Managed agent definitions
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL,
    tools TEXT NOT NULL DEFAULT '[]',
    trigger_type TEXT DEFAULT 'manual',
    trigger_config TEXT,
    approval_mode TEXT DEFAULT 'ask',
    runner_type TEXT DEFAULT 'local',
    status TEXT DEFAULT 'inactive', -- active, inactive, paused
    stats TEXT,                     -- JSON: total_runs, success_rate, etc.
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Execution runs (now called "sessions" to match Claude Console)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    automation_id TEXT,             -- nullable: can be from chat too
    agent_id TEXT,                  -- nullable: which agent ran this
    engine_session_id TEXT,         -- agent engine session ID
    environment_id TEXT,            -- which environment this ran in
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, aborted
    trigger TEXT DEFAULT 'manual',  -- manual, scheduled, event
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER,
    result_summary TEXT,
    error_message TEXT,
    metadata TEXT                   -- JSON: token usage, screenshots, etc.
);

-- Individual turns within a session (User / Agent / Tool)
CREATE TABLE session_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    role TEXT NOT NULL,             -- user, agent, tool
    tool_name TEXT,                 -- for tool turns
    content TEXT,
    token_input INTEGER,
    token_output INTEGER,
    duration_ms INTEGER,
    started_at TEXT,
    finished_at TEXT,
    metadata TEXT                   -- JSON: tool input/output, screenshots
);

-- Environments (isolated runtime configs)
CREATE TABLE environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,             -- e.g. "Development", "Production"
    description TEXT,
    variables TEXT NOT NULL DEFAULT '{}', -- JSON: env vars for this environment
    credential_ids TEXT DEFAULT '[]', -- JSON array of credential IDs available
    runner_type TEXT DEFAULT 'local', -- local, docker, cloud
    runner_config TEXT,             -- JSON: docker image, cloud region, etc.
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Credential vaults (secure secret storage)
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,             -- e.g. "Gmail IMAP", "Salesforce API"
    type TEXT NOT NULL,             -- api_key, oauth, login, certificate
    service TEXT,                   -- e.g. "gmail", "salesforce", "custom"
    encrypted_data TEXT NOT NULL,   -- encrypted JSON blob of actual secrets
    metadata TEXT,                  -- JSON: non-secret metadata (username, host, etc.)
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Memory stores (persistent knowledge across sessions)
CREATE TABLE memory_stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,             -- e.g. "Invoice Processing Knowledge"
    agent_id TEXT,                  -- nullable: agent-specific or shared
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Individual memory entries
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    key TEXT NOT NULL,              -- lookup key
    content TEXT NOT NULL,          -- the knowledge/fact
    source_session_id TEXT,         -- which session created this memory
    confidence REAL DEFAULT 1.0,    -- how confident the agent is
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Schedules
CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    automation_id TEXT,
    agent_id TEXT,
    cron_expression TEXT,
    timezone TEXT DEFAULT 'UTC',
    enabled INTEGER DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL
);

-- Connectors (configured external services)
CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,             -- email, browser, spreadsheet, api, etc.
    name TEXT NOT NULL,
    config TEXT NOT NULL,           -- JSON: encrypted credentials, settings
    status TEXT DEFAULT 'configured', -- configured, verified, error
    created_at TEXT NOT NULL
);
```

---

## Rust Module Plan

### New modules

```
src-tauri/src/
├── rpa/
│   ├── mod.rs                  # RPA module root
│   ├── screen.rs               # Screenshot capture (xcap crate)
│   ├── input.rs                # Mouse/keyboard simulation (enigo)
│   ├── browser.rs              # Browser automation coordinator
│   └── ocr.rs                  # Text extraction from screenshots
├── automation/
│   ├── mod.rs                  # Automation CRUD + management
│   ├── runner.rs               # Execute automations (local + Docker)
│   ├── scheduler.rs            # Cron-based scheduling (tokio-cron)
│   └── docker.rs               # Docker container management
├── agents/                     # Managed agent definitions
│   ├── mod.rs
│   ├── lifecycle.rs            # Start, stop, pause agents
│   └── deployment.rs           # Deploy to local/docker/cloud
├── connectors/
│   ├── mod.rs                  # Connector registry
│   ├── email.rs                # SMTP/IMAP (lettre)
│   ├── spreadsheet.rs          # CSV/Excel (calamine)
│   └── http.rs                 # REST API calls
└── domains/
    ├── mod.rs                  # Domain registry
    ├── coding.rs               # Existing coding tools packaged as a domain
    ├── rpa.rs                  # RPA tools packaged as a domain
    └── connector.rs            # Connector tools packaged as a domain
```

### Keep as-is
- `khadim_ai/` — LLM client, model management, streaming
- `khadim_agent/` — orchestrator, session management, tool loop
- `khadim_code/tools.rs` — `Tool` trait (rename to shared location)
- `plugins/` — WASM plugin system
- `db.rs` — SQLite (extend with new tables)
- `process.rs` — process management
- `error.rs` — error types

### Move / Refactor
- `khadim_code/tools.rs` → extract `Tool` trait to `khadim_agent/tools.rs`
- `khadim_code/` coding tools → `domains/coding.rs` (file read/write, shell, grep)
- `khadim_agent/modes.rs` → add `rpa_mode()` and `agent_mode()` alongside existing

### Phase out gradually
- `opencode.rs` — keep for now but deprioritize
- `claude_code.rs` — keep for now but deprioritize
- `git.rs`, `lsp.rs`, `syntax.rs` — keep as coding domain tools
- `terminal.rs` — keep, useful for run output
- `file_index.rs` — keep, useful for automation file management
- `github.rs` — keep as a connector

---

## New Rust Crate Dependencies

```toml
# Screen automation
xcap = "0.0.14"              # Cross-platform screen capture
enigo = "0.3"                # Cross-platform mouse/keyboard input

# OCR
tesseract = "0.15"           # OCR text extraction (optional, behind feature flag)

# Browser automation
chromiumoxide = "0.7"        # Chrome DevTools Protocol

# Connectors
lettre = "0.11"              # Email sending (SMTP)
calamine = "0.26"            # Excel/ODS reading
csv = "1"                    # CSV read/write

# Scheduling
tokio-cron-scheduler = "0.13" # Cron scheduling with tokio

# Docker
bollard = "0.18"             # Docker API client
```

---

## RPA Agent Mode

New mode alongside `build_mode()` and `chat_mode()`:

```rust
pub fn rpa_mode() -> AgentModeDefinition {
    AgentModeDefinition {
        id: AgentId::Rpa,
        name: "automate",
        kind: AgentKind::Primary,
        system_prompt_addition: r#"
You are an RPA (Robotic Process Automation) agent. Your job is to automate
tasks on the user's computer.

You have access to these capabilities:
- **Screen**: Take screenshots to see what's on screen. Use OCR to read text.
- **Browser**: Write and run Playwright/Puppeteer scripts for web automation.
- **Input**: Simulate mouse clicks and keyboard input.
- **Files**: Read, write, and manage files on the filesystem.
- **Shell**: Run commands and scripts.
- **Email**: Send and read emails.
- **Spreadsheet**: Read and write Excel/CSV files.
- **HTTP**: Make API requests.

Your workflow:
1. Understand what the user wants automated
2. Take a screenshot to see the current state if needed
3. Write a script to perform the automation
4. Run the script
5. Take another screenshot to verify it worked
6. If something went wrong, analyze the screenshot and fix the script
7. Report the result

Always prefer writing a script over raw mouse/keyboard simulation.
Scripts are more reliable and reproducible.

When the automation works, offer to save it for reuse with a schedule.
"#,
        temperature: 0.3,
    }
}
```

---

## Frontend Component Mapping

### Remove
- `WorkspaceView.tsx` → replaced by new screens
- `WorkspaceList.tsx` → replaced by Automations/Agents lists
- `WorkspaceContextRail.tsx` → not needed
- `NewAgentModal.tsx` → replaced by Agent configuration screen
- `AgentCard.tsx` → replaced by new agent/automation cards
- `GitChangesPanel.tsx` → not needed in primary nav
- `GitHubTab.tsx` + all GitHub components → move to connector config
- `ModifiedFilesPanel.tsx` → not needed
- `FileFinder.tsx` → not needed in primary nav
- `TerminalDock.tsx` → repurpose as run output panel
- `CreateWorkspaceModal.tsx` → replaced by create automation/agent flows

### Keep + Adapt
- `Sidebar.tsx` → keep Chat/Work mode switcher, replace Work mode content with Agents/Sessions/Environments/Credentials/Memory/Analytics nav
- `ChatInput.tsx` → keep as-is for Chat mode, change placeholder to "What would you like to automate?"
- `ChatMessage.tsx` → keep, add "Save as Automation" action on completion
- `chat/ChatView.tsx` → keep as-is for Chat mode, add post-completion actions
- `ApprovalOverlay.tsx` → keep as-is (critical for RPA safety)
- `QuestionOverlay.tsx` → keep as-is
- `SettingsPanel.tsx` → keep, add Connectors tab
- `ThinkingSteps.tsx` → adapt for session turn view (User/Agent/Tool turns)
- `MarkdownRenderer.tsx` → keep
- `GlassSelect.tsx` → keep
- `ModelSelector.tsx` → keep
- `StatusIndicator.tsx` → keep
- `WelcomeScreen.tsx` → redesign for RPA onboarding

### New Components (Work mode)
- `WorkDashboard.tsx` — Work mode landing page (agent status, recent sessions)
- `AgentList.tsx` — managed agents
- `AgentDetail.tsx` — agent config + stats
- `AgentEditor.tsx` — create/edit agent (instructions, tools, trigger, approval, runner)
- `SessionList.tsx` — execution history (transcript list)
- `SessionDetail.tsx` — full transcript view (User/Agent/Tool turns with token counts)
- `SessionTimeline.tsx` — event timeline bar (like Claude Console)
- `EnvironmentList.tsx` — environment management
- `EnvironmentEditor.tsx` — create/edit environment (variables, credentials, runner)
- `CredentialList.tsx` — credential vault
- `CredentialEditor.tsx` — add/edit credentials
- `MemoryStoreList.tsx` — memory store management
- `MemoryStoreDetail.tsx` — browse/edit memory entries
- `AnalyticsDashboard.tsx` — usage stats, costs, success rates
- `ConnectorConfig.tsx` — configure email, browser, etc.
- `ScheduleEditor.tsx` — cron/trigger configuration

---

## Vocabulary Change

The entire UI should use RPA vocabulary, not developer vocabulary:

| Developer Term | RPA/Platform Term |
|---------------|-------------------|
| Workspace | Project |
| Conversation | Chat / Draft |
| Agent (coding) | Agent (managed automation persona) |
| Worktree | — (remove) |
| Branch | — (remove from primary UI) |
| Commit | Session |
| Git status | Session status |
| Terminal | Output |
| File finder | — (background) |
| LSP | — (background, coding domain only) |
| Backend | Runner / Environment |
| OpenCode / Claude Code | AI Engine (abstract away) |
| Settings (API keys) | Credentials vault |
| — | Memory store |
| — | Environment |
| — | Analytics |

---

## Implementation Order

### Phase 1: Foundation (Week 1-2)
1. Extract `Tool` trait to shared location
2. Create `domains/` module structure
3. Move coding tools into `domains/coding.rs`
4. Add `rpa_mode()` to agent modes
5. Add screenshot tool (`xcap` crate)
6. Add new SQLite tables (automations, sessions, session_turns, environments, credentials, memory_stores, memory_entries, schedules, connectors)
7. Redesign sidebar navigation (Chat, Agents, Sessions, Environments, Credentials, Memory, Analytics, Settings)

### Phase 2: Core RPA (Week 3-4)
1. Add screen capture + OCR tools
2. Add browser automation coordinator
3. Add email connector
4. Add spreadsheet connector
5. Build SessionList + SessionDetail (with transcript view: User/Agent/Tool turns)
6. Build SessionTimeline (event timeline bar)
7. Build AutomationList + AutomationDetail
8. Add "Save as Automation" flow from chat

### Phase 3: Managed Agents + Infrastructure (Week 5-6)
1. Build agent definition CRUD
2. Build AgentEditor component
3. Add Environment management (CRUD + variable/credential binding)
4. Add Credential vault (encrypted storage, CRUD)
5. Add Memory store system (agent-scoped persistent knowledge)
6. Add scheduling system (tokio-cron-scheduler)
7. Add Docker runner support (bollard)
8. Add agent lifecycle management (start/stop/pause)

### Phase 4: Polish + Enterprise Prep (Week 7-8)
1. Session history with full audit trail
2. Screenshot gallery in session details
3. Analytics dashboard (success rates, token usage, cost tracking)
4. Connector verification + status
5. Export/import automations + agents
6. Agent templates (pre-built configs for common tasks)
7. Error recovery + retry logic
8. Desktop → Web app shared data model extraction

---

## Design Tokens

Keep the existing glass design system. It works well for both developer and RPA UIs. The aesthetic should feel:

- **Professional** — enterprise users need to trust it
- **Calm** — automations run in the background, no urgency
- **Clear** — status at a glance, no ambiguity about what's running
- **Approachable** — simple users shouldn't feel intimidated

The current dark glass aesthetic works. The status indicators (running/complete/failed) become the most important visual element in the RPA context.
