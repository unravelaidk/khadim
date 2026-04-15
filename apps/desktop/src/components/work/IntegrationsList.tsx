import React, { useState, useMemo } from "react";
import type {
  IntegrationMeta,
  IntegrationConnectionRecord,
  IntegrationCredentialField,
} from "../../lib/bindings";
import { commands } from "../../lib/bindings";
import {
  useIntegrationsQuery,
  useIntegrationConnectionsQuery,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
} from "../../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { desktopQueryKeys } from "../../lib/queries";

/* ═══════════════════════════════════════════════════════════════════════
   Category config — each category gets a tint for personality
   ═══════════════════════════════════════════════════════════════════════ */

const CATEGORY_META: Record<string, { label: string; icon: string; tint: string }> = {
  messaging:          { label: "Messaging",          icon: "ri-chat-smile-2-line", tint: "var(--tint-sky)" },
  email:              { label: "Email",              icon: "ri-mail-send-line",    tint: "var(--tint-violet)" },
  cloud_storage:      { label: "Cloud Storage",      icon: "ri-cloud-line",        tint: "var(--tint-sky)" },
  spreadsheet:        { label: "Spreadsheets",       icon: "ri-table-line",        tint: "var(--tint-lime)" },
  project_management: { label: "Project Management", icon: "ri-kanban-view-2",     tint: "var(--tint-amber)" },
  calendar:           { label: "Calendar",           icon: "ri-calendar-line",     tint: "var(--tint-rose)" },
  documents:          { label: "Documents",          icon: "ri-file-text-line",    tint: "var(--tint-warm)" },
  crm:                { label: "CRM & Marketing",    icon: "ri-contacts-book-line",tint: "var(--tint-violet)" },
  ecommerce:          { label: "E-Commerce",         icon: "ri-shopping-bag-line", tint: "var(--tint-amber)" },
  finance:            { label: "Finance",            icon: "ri-money-dollar-circle-line", tint: "var(--tint-lime)" },
  database:           { label: "Databases",          icon: "ri-database-2-line",   tint: "var(--tint-teal)" },
  dev_ops:            { label: "Developer Tools",    icon: "ri-code-s-slash-line", tint: "var(--tint-sky)" },
  notifications:      { label: "Notifications",      icon: "ri-notification-3-line", tint: "var(--tint-rose)" },
  generic:            { label: "General",            icon: "ri-apps-line",         tint: "var(--tint-warm)" },
};

const CATEGORY_ORDER = [
  "generic", "messaging", "email", "cloud_storage", "spreadsheet",
  "project_management", "calendar", "documents", "crm", "ecommerce",
  "finance", "database", "dev_ops", "notifications",
];

/* ═══════════════════════════════════════════════════════════════════════
   Connect Sheet — slides up, feels like a real physical panel
   ═══════════════════════════════════════════════════════════════════════ */

function ConnectSheet({
  integration,
  onClose,
  onConnectApiKey,
  onConnectOAuth,
  onConnectCredentials,
  connecting,
  error,
}: {
  integration: IntegrationMeta;
  onClose: () => void;
  onConnectApiKey: (label: string, key: string) => void;
  onConnectOAuth: (label: string) => void;
  onConnectCredentials: (label: string, creds: Record<string, string>) => void;
  connecting: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState(integration.name);
  const auth = integration.auth_type;
  const [apiKey, setApiKey] = useState("");
  const categoryMeta = CATEGORY_META[integration.category] ?? CATEGORY_META.generic;

  const fields: IntegrationCredentialField[] =
    auth.type === "credentials" ? auth.fields : [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = "";
    return init;
  });

  const canSubmit = (() => {
    if (!label.trim()) return false;
    if (auth.type === "api_key") return apiKey.trim().length > 0;
    if (auth.type === "credentials")
      return fields.filter((f) => f.required).every((f) => values[f.key]?.trim());
    return true;
  })();

  const handleSubmit = () => {
    if (auth.type === "oauth2") onConnectOAuth(label.trim());
    else if (auth.type === "api_key") onConnectApiKey(label.trim(), apiKey.trim());
    else if (auth.type === "credentials") onConnectCredentials(label.trim(), values);
    else onConnectCredentials(label.trim(), {});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative w-full max-w-md depth-card overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
        style={{ animationTimingFunction: "var(--ease-out-expo)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tinted header strip — gives identity to the sheet */}
        <div
          className="px-7 pt-7 pb-5"
          style={{ background: categoryMeta.tint }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "var(--depth-card-bg, var(--surface-elevated))" }}
            >
              <i className={`${integration.icon} text-[22px] text-[var(--text-primary)]`} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="font-display text-[18px] font-semibold text-[var(--text-primary)] leading-tight">
                {integration.name}
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-[36ch]">
                {integration.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              style={{ background: "var(--depth-card-bg, var(--surface-elevated))" }}
            >
              <i className="ri-close-line text-[15px]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 pt-5 pb-7">
          {/* OAuth */}
          {auth.type === "oauth2" && (
            <div className="mb-5">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                You'll be redirected to {integration.name} to approve access.
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Your credentials stay with {integration.name}.
              </p>
            </div>
          )}

          {/* No auth */}
          {auth.type === "none" && (
            <div className="depth-inset flex items-center gap-3 px-4 py-3 mb-5">
              <i className="ri-check-double-line text-[16px] text-[var(--color-success-text)]" />
              <p className="text-[13px] text-[var(--text-secondary)]">
                No credentials needed — works immediately.
              </p>
            </div>
          )}

          {/* Name (skip for OAuth) */}
          {auth.type !== "oauth2" && (
            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                Connection name
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Work account"
                className="depth-inset w-full h-11 px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
            </div>
          )}

          {/* API key */}
          {auth.type === "api_key" && (
            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                {auth.label}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={auth.placeholder ?? "Paste your key here"}
                className="depth-inset w-full h-11 px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-mono"
                autoFocus
              />
              {integration.docs_url && (
                <a
                  href={integration.docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <i className="ri-external-link-line text-[12px]" />
                  Where do I find this?
                </a>
              )}
            </div>
          )}

          {/* Multi-field credentials */}
          {auth.type === "credentials" &&
            fields.map((field) => (
              <div key={field.key} className="mb-5">
                <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                  {field.label}
                  {field.required && (
                    <span className="text-[var(--color-pop)] ml-0.5">*</span>
                  )}
                </label>
                <input
                  type={field.secret ? "password" : "text"}
                  value={values[field.key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder ?? ""}
                  className="depth-inset w-full h-11 px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-mono"
                />
              </div>
            ))}

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-xl px-4 py-3 text-[12px] text-[var(--color-danger-text)]" style={{ background: "var(--tint-rose)" }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onClose}
              className="text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || connecting}
              className="btn-ink h-11 rounded-full px-7 text-[14px] font-semibold disabled:opacity-40 transition-all"
            >
              {connecting ? (
                <span className="flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin text-[14px]" />
                  {auth.type === "oauth2" ? "Waiting…" : "Connecting…"}
                </span>
              ) : auth.type === "oauth2" ? (
                <span className="flex items-center gap-2">
                  Sign in with {integration.name}
                  <i className="ri-arrow-right-line text-[14px]" />
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Connected card — raised, tactile, actions reveal on hover
   ═══════════════════════════════════════════════════════════════════════ */

function ConnectedCard({
  connection,
  integration,
  onDisconnect,
}: {
  connection: IntegrationConnectionRecord;
  integration?: IntegrationMeta;
  onDisconnect: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const status = await commands.testIntegrationConnection(connection.id);
      setTestResult(status.connected ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="depth-card-sm p-4 flex items-center gap-4 group">
      {/* Icon with tinted background */}
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: integration
            ? (CATEGORY_META[integration.category] ?? CATEGORY_META.generic).tint
            : "var(--tint-warm)",
        }}
      >
        <i className={`${integration?.icon ?? "ri-plug-line"} text-[18px] text-[var(--text-primary)]`} />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
            {connection.label}
          </span>
          {/* Live dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-[var(--color-success)] animate-ping opacity-30" />
            <span className="relative h-2 w-2 rounded-full bg-[var(--color-success-text)]" />
          </span>
          {testResult === "ok" && (
            <span className="text-[10px] font-semibold text-[var(--color-success-text)] uppercase tracking-wide">
              Verified
            </span>
          )}
          {testResult === "fail" && (
            <span className="text-[10px] font-semibold text-[var(--color-danger-text)] uppercase tracking-wide">
              Unreachable
            </span>
          )}
        </div>
        <span className="text-[12px] text-[var(--text-muted)] mt-0.5 block">
          {connection.account_label ?? integration?.name ?? connection.integration_id}
        </span>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Test connection"
        >
          <i className={`ri-pulse-line text-[15px] ${testing ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={onDisconnect}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--color-danger-text)] transition-colors"
          title="Disconnect"
        >
          <i className="ri-link-unlink-m text-[15px]" />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Catalog card — tinted pill-style, each integration has character
   ═══════════════════════════════════════════════════════════════════════ */

function CatalogCard({
  integration,
  isConnected,
  categoryTint,
  onConnect,
}: {
  integration: IntegrationMeta;
  isConnected: boolean;
  categoryTint: string;
  onConnect: () => void;
}) {
  const authHint =
    integration.auth_type.type === "oauth2" ? "1-click" :
    integration.auth_type.type === "none" ? "No setup" :
    integration.auth_type.type === "api_key" ? "API key" :
    "Credentials";

  return (
    <button
      onClick={isConnected ? undefined : onConnect}
      disabled={isConnected}
      className="depth-card-interactive group flex items-center gap-4 w-full text-left p-4 disabled:opacity-40 disabled:cursor-default"
    >
      {/* Tinted icon container */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
        style={{ background: categoryTint }}
      >
        <i className={`${integration.icon} text-[17px] text-[var(--text-primary)]`} />
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate block">
          {integration.name}
        </span>
        <span className="text-[12px] text-[var(--text-muted)] truncate block leading-snug mt-0.5">
          {integration.description}
        </span>
      </div>

      {/* Right — auth badge or connected */}
      {isConnected ? (
        <span className="text-[11px] font-semibold text-[var(--color-success-text)] shrink-0 flex items-center gap-1.5">
          <i className="ri-check-line text-[13px]" />
          Connected
        </span>
      ) : (
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-all duration-200 group-hover:scale-[1.03]"
          style={{ background: categoryTint }}
        >
          {authHint}
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main view — depth-driven layout with warm personality
   ═══════════════════════════════════════════════════════════════════════ */

export function IntegrationsList() {
  const queryClient = useQueryClient();
  const integrationsQ = useIntegrationsQuery();
  const connectionsQ = useIntegrationConnectionsQuery();
  const connectMutation = useConnectIntegrationMutation();
  const disconnectMutation = useDisconnectIntegrationMutation();

  const [connectingTo, setConnectingTo] = useState<IntegrationMeta | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [search, setSearch] = useState("");

  const integrations = integrationsQ.data ?? [];
  const connections = connectionsQ.data ?? [];
  const connectedIds = new Set(connections.map((c) => c.integration_id));

  // Group catalog by category
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? integrations.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q) ||
            (CATEGORY_META[i.category]?.label ?? "").toLowerCase().includes(q),
        )
      : integrations;

    const map = new Map<string, IntegrationMeta[]>();
    for (const i of filtered) {
      const list = map.get(i.category) ?? [];
      list.push(i);
      map.set(i.category, list);
    }
    return [...map.entries()].sort(
      (a, b) =>
        (CATEGORY_ORDER.indexOf(a[0]) ?? 99) -
        (CATEGORY_ORDER.indexOf(b[0]) ?? 99),
    );
  }, [integrations, search]);

  /* ── Connect handlers ────────────────────────────────────────── */

  const handleConnectApiKey = async (label: string, key: string) => {
    if (!connectingTo) return;
    setConnectError(null);
    try {
      await connectMutation.mutateAsync({
        integration_id: connectingTo.id,
        label,
        credentials: { api_key: key },
      });
      setConnectingTo(null);
    } catch (err: any) {
      setConnectError(err?.message ?? "Connection failed");
    }
  };

  const handleConnectOAuth = async (label: string) => {
    if (!connectingTo) return;
    setConnectError(null);
    setOauthConnecting(true);
    try {
      await commands.connectIntegrationOauth(connectingTo.id, label);
      queryClient.invalidateQueries({
        queryKey: desktopQueryKeys.integrationConnections,
      });
      setConnectingTo(null);
    } catch (err: any) {
      setConnectError(err?.message ?? "OAuth flow failed");
    } finally {
      setOauthConnecting(false);
    }
  };

  const handleConnectCredentials = async (
    label: string,
    creds: Record<string, string>,
  ) => {
    if (!connectingTo) return;
    setConnectError(null);
    try {
      await connectMutation.mutateAsync({
        integration_id: connectingTo.id,
        label,
        credentials: creds,
      });
      setConnectingTo(null);
    } catch (err: any) {
      setConnectError(err?.message ?? "Connection failed");
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectMutation.mutateAsync(id);
    } catch {
      // ignore
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-10 pt-9 pb-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Integrations
        </h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-2 leading-relaxed max-w-[48ch]">
          Connect your services once — every agent uses them automatically.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-10 pt-6 pb-12">

          {/* ─── Connected section ────────────────────────────────── */}
          {connections.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.12em]">
                  Active connections
                </h2>
                <span
                  className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                  style={{ background: "var(--tint-lime)", color: "var(--color-success-text)" }}
                >
                  {connections.length}
                </span>
              </div>

              <div className="grid gap-3">
                {connections.map((conn) => (
                  <ConnectedCard
                    key={conn.id}
                    connection={conn}
                    integration={integrations.find((i) => i.id === conn.integration_id)}
                    onDisconnect={() => handleDisconnect(conn.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── Search — recessed well ───────────────────────────── */}
          <div className="mb-8">
            <div className="depth-well flex items-center gap-3 px-4 py-2.5">
              <i className="ri-search-line text-[15px] text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search integrations…"
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <i className="ri-close-line text-[14px]" />
                </button>
              )}
            </div>
          </div>

          {/* ─── Catalog ──────────────────────────────────────────── */}
          {grouped.map(([category, items]) => {
            const meta = CATEGORY_META[category] ?? CATEGORY_META.generic;
            return (
              <section key={category} className="mb-8 last:mb-0">
                {/* Category header — tinted pill label */}
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                    style={{ background: meta.tint }}
                  >
                    <i className={`${meta.icon} text-[13px] text-[var(--text-primary)]`} />
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {meta.label}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {items.length}
                  </span>
                </div>

                {/* Cards grid — 2-up on wide screens */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {items.map((integration) => (
                    <CatalogCard
                      key={integration.id}
                      integration={integration}
                      isConnected={connectedIds.has(integration.id)}
                      categoryTint={meta.tint}
                      onConnect={() => {
                        setConnectError(null);
                        setConnectingTo(integration);
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Empty states */}
          {grouped.length === 0 && search && (
            <div className="depth-well py-14 text-center">
              <p className="text-[14px] text-[var(--text-muted)]">
                No integrations match "<span className="font-medium text-[var(--text-secondary)]">{search}</span>"
              </p>
            </div>
          )}

          {grouped.length === 0 && !search && integrations.length === 0 && (
            <div className="depth-well py-16 text-center">
              <div
                className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                style={{ background: "var(--tint-warm)" }}
              >
                <i className="ri-plug-line text-[24px] text-[var(--text-secondary)]" />
              </div>
              <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                No integrations yet
              </p>
              <p className="text-[13px] text-[var(--text-muted)] max-w-[32ch] mx-auto">
                Integrations will appear here as they're added to the platform.
              </p>
            </div>
          )}

          {grouped.length === 0 && !search && integrations.length > 0 && connections.length === integrations.length && (
            <div className="depth-well py-14 text-center">
              <div
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-3"
                style={{ background: "var(--tint-lime)" }}
              >
                <i className="ri-check-double-line text-[22px] text-[var(--color-success-text)]" />
              </div>
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">
                All integrations connected
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Connect sheet */}
      {connectingTo && (
        <ConnectSheet
          integration={connectingTo}
          onClose={() => {
            setConnectingTo(null);
            setConnectError(null);
          }}
          onConnectApiKey={handleConnectApiKey}
          onConnectOAuth={handleConnectOAuth}
          onConnectCredentials={handleConnectCredentials}
          connecting={connectMutation.isPending || oauthConnecting}
          error={connectError}
        />
      )}
    </div>
  );
}
