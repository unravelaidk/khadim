import React, { useState } from "react";
import type { Credential } from "../../lib/types";

/* ─── Credential Editor ────────────────────────────────────────────── */

export interface CredentialEditorData {
  name: string;
  type: "api_key" | "oauth" | "login" | "certificate";
  service: string;
  /** Non-secret metadata (shown in UI) */
  fields: Record<string, string>;
  /** Secret value — only sent on save, never shown back */
  secretValue: string;
}

interface CredentialEditorProps {
  credential: Credential | null;
  onSave: (data: CredentialEditorData) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const CRED_TYPES: { id: Credential["type"]; label: string; hint: string }[] = [
  { id: "api_key",     label: "API Key",     hint: "A secret key for an API service" },
  { id: "login",       label: "Login",       hint: "Username + password for a website or service" },
  { id: "oauth",       label: "OAuth",       hint: "OAuth token for a connected service" },
  { id: "certificate", label: "Certificate", hint: "TLS/SSL client certificate" },
];

const FIELD_TEMPLATES: Record<Credential["type"], { key: string; placeholder: string }[]> = {
  api_key: [
    { key: "service", placeholder: "e.g. openai, stripe, sendgrid" },
  ],
  login: [
    { key: "user", placeholder: "Username or email" },
    { key: "host", placeholder: "e.g. imap.gmail.com (optional)" },
  ],
  oauth: [
    { key: "provider", placeholder: "e.g. google, github, salesforce" },
  ],
  certificate: [
    { key: "cn", placeholder: "Common name (optional)" },
  ],
};

export function CredentialEditor({
  credential,
  onSave,
  onCancel,
  onDelete,
}: CredentialEditorProps) {
  const [name, setName] = useState(credential?.name ?? "");
  const [type, setType] = useState<Credential["type"]>(credential?.type ?? "api_key");
  const [service, setService] = useState(credential?.service ?? "");
  const [fields, setFields] = useState<Record<string, string>>(credential?.metadata ?? {});
  const [secretValue, setSecretValue] = useState("");

  const canSave = name.trim().length > 0 && (credential != null || secretValue.trim().length > 0);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave({
      name: name.trim(),
      type,
      service: service.trim(),
      fields,
      secretValue: secretValue.trim(),
    });
  };

  // Get fields template for the current type
  const templateFields = FIELD_TEMPLATES[type];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-8 py-4">
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
        >
          <i className="ri-arrow-left-s-line text-[16px] leading-none" />
        </button>
        <h1 className="flex-1 font-display text-[18px] font-semibold tracking-tight text-[var(--text-primary)]">
          {credential ? "Edit credential" : "Add credential"}
        </h1>
        <div className="flex items-center gap-2">
          {onDelete && credential && (
            <button
              onClick={onDelete}
              className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="btn-ink inline-flex h-8 items-center rounded-full px-5 text-[11px] font-semibold disabled:opacity-40"
          >
            {credential ? "Save" : "Add"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-xl px-8 py-6">

          {/* Name */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gmail IMAP, Stripe API"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
            />
          </div>

          {/* Type */}
          <div className="mt-6">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Type</label>
            <div className="mt-2 flex flex-col gap-1">
              {CRED_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => {
                    setType(ct.id);
                    setFields({});
                  }}
                  className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                    type === ct.id ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    type === ct.id ? "border-[var(--text-primary)]" : "border-[var(--glass-border-strong)]"
                  }`}>
                    {type === ct.id && <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />}
                  </span>
                  <span>
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">{ct.label}</span>
                    <span className="ml-2 text-[11px] text-[var(--text-muted)]">{ct.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Type-specific fields */}
          <div className="mt-6">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Details</label>
            <div className="mt-2 flex flex-col gap-3">
              {templateFields.map((tf) => (
                <div key={tf.key}>
                  <label className="block text-[11px] text-[var(--text-muted)] capitalize">{tf.key}</label>
                  <input
                    value={fields[tf.key] ?? ""}
                    onChange={(e) => updateField(tf.key, e.target.value)}
                    placeholder={tf.placeholder}
                    className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-8 w-full rounded-[var(--radius-sm)] px-3 text-[12px]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Secret value */}
          <div className="mt-6">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">
              {type === "login" ? "Password" : type === "api_key" ? "API Key" : type === "oauth" ? "Token" : "Certificate PEM"}
            </label>
            {credential && (
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Leave blank to keep the existing value.
              </p>
            )}
            {type === "certificate" ? (
              <textarea
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                rows={4}
                className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 w-full resize-y rounded-[var(--radius-sm)] px-3 py-2 font-mono text-[11px]"
              />
            ) : (
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder={credential ? "••••••••" : "Enter secret value"}
                className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[13px]"
              />
            )}
          </div>

          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}
