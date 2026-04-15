import React from "react";
import type { AgentEditorData } from "./AgentEditor";

/* ─── Template data ────────────────────────────────────────────────── */

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  data: AgentEditorData;
}

const TEMPLATES: AgentTemplate[] = [
  {
    id: "invoice-processor",
    name: "Invoice Processor",
    description: "Check email for invoices, extract amounts with OCR, log to spreadsheet",
    category: "Finance",
    data: {
      name: "Invoice Processor",
      description: "Checks email for invoices, extracts amounts, and logs them to a spreadsheet",
      instructions: "You are an invoice processing agent.\n\nWhen triggered:\n1. Connect to email and check for unread messages with PDF attachments\n2. Download any invoice PDFs\n3. Extract vendor name, invoice number, date, and total amount\n4. Append a row to the output spreadsheet\n5. Mark the email as read\n\nIf you can't extract a field, log it as \"UNKNOWN\" and flag for review.",
      tools: ["email", "spreadsheet", "files", "shell"],
      triggerType: "schedule",
      triggerConfig: "0 9 * * *",
      approvalMode: "ask",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 25,
      maxTokens: 100000,
      memoryStoreId: "auto",
    },
  },
  {
    id: "support-responder",
    name: "Support Responder",
    description: "Triage incoming support emails, draft responses using knowledge base",
    category: "Support",
    data: {
      name: "Support Responder",
      description: "Handles customer support tickets via email with knowledge base lookups",
      instructions: "You are a customer support agent.\n\nWhen a new support email arrives:\n1. Read the email and classify: billing, technical, account, or other\n2. Search the knowledge base for relevant answers\n3. Draft a helpful response\n4. If confidence is high (clear match in KB), send the response\n5. If unsure, flag for human review with your draft attached\n\nAlways be polite. Never make up information not in the knowledge base.",
      tools: ["email", "http", "files"],
      triggerType: "event",
      triggerConfig: "email:support@company.com",
      approvalMode: "ask",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 15,
      maxTokens: 50000,
      memoryStoreId: "auto",
    },
  },
  {
    id: "price-monitor",
    name: "Price Monitor",
    description: "Scrape competitor prices periodically, alert on significant changes",
    category: "Research",
    data: {
      name: "Price Monitor",
      description: "Scrapes competitor prices from websites and alerts on price drops",
      instructions: "You are a price monitoring agent.\n\nEvery run:\n1. Visit each URL in the target list\n2. Extract the current price for each product\n3. Compare to the last known price (from memory)\n4. If any price changed by more than 5%, send an alert email\n5. Update memory with the new prices\n\nTarget list:\n- {{competitor_url_1}}\n- {{competitor_url_2}}\n- {{competitor_url_3}}",
      tools: ["browser", "email", "files"],
      triggerType: "schedule",
      triggerConfig: "0 */6 * * *",
      approvalMode: "never",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 30,
      maxTokens: 80000,
      memoryStoreId: "auto",
    },
  },
  {
    id: "data-entry",
    name: "Data Entry",
    description: "Read data from one source and enter it into a web form or spreadsheet",
    category: "Operations",
    data: {
      name: "Data Entry",
      description: "Reads structured data and enters it into a target system",
      instructions: "You are a data entry agent.\n\n1. Read the input file at {{input_path}}\n2. For each row:\n   a. Open the target form at {{form_url}}\n   b. Fill in each field from the row data\n   c. Submit the form\n   d. Verify submission was successful\n   e. Log the result\n3. After all rows, send a summary email",
      tools: ["browser", "spreadsheet", "files", "email"],
      triggerType: "manual",
      triggerConfig: "",
      approvalMode: "ask",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 50,
      maxTokens: 150000,
      memoryStoreId: "auto",
    },
  },
  {
    id: "report-generator",
    name: "Weekly Report",
    description: "Pull data from APIs, compile into a formatted report, email to stakeholders",
    category: "Reporting",
    data: {
      name: "Weekly Report",
      description: "Compiles data from APIs into a formatted report and emails it",
      instructions: "You are a report generation agent.\n\nEvery Monday:\n1. Query the analytics API at {{api_endpoint}}\n2. Pull key metrics: revenue, signups, churn, support tickets\n3. Compare to last week's numbers (from memory)\n4. Write a concise summary with highlights and concerns\n5. Format as a clean email with sections\n6. Send to {{report_recipients}}",
      tools: ["http", "email", "files"],
      triggerType: "schedule",
      triggerConfig: "0 8 * * 1",
      approvalMode: "auto",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 20,
      maxTokens: 60000,
      memoryStoreId: "auto",
    },
  },
  {
    id: "web-scraper",
    name: "Web Scraper",
    description: "Extract structured data from websites and save to CSV",
    category: "Research",
    data: {
      name: "Web Scraper",
      description: "Scrapes structured data from websites",
      instructions: "You are a web scraping agent.\n\n1. Navigate to {{target_url}}\n2. Extract the following data from each item on the page:\n   - Title\n   - Price\n   - Description\n   - URL\n3. Handle pagination — continue until no more pages\n4. Save results to CSV at {{output_path}}\n5. Report total items scraped",
      tools: ["browser", "files", "shell"],
      triggerType: "manual",
      triggerConfig: "",
      approvalMode: "ask",
      runnerType: "local",
      harness: "khadim",
      modelId: "",
      environmentId: "",
      maxTurns: 40,
      maxTokens: 120000,
      memoryStoreId: "auto",
    },
  },
];

/* Group templates */
const CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

/* ─── Quickstart ───────────────────────────────────────────────────── */

interface QuickstartProps {
  onSelectTemplate: (data: AgentEditorData) => void;
  onSkip: () => void;
}

export function Quickstart({ onSelectTemplate, onSkip }: QuickstartProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="mx-auto w-full max-w-xl px-10 py-12">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Start with a template
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] max-w-md">
          Pick a template to pre-fill an agent configuration.
          You can customize everything after.
        </p>

        {CATEGORIES.map((cat) => {
          const items = TEMPLATES.filter((t) => t.category === cat);
          const catTint =
            cat === "Finance" ? "var(--tint-lime)" :
            cat === "Support" ? "var(--tint-violet)" :
            cat === "Research" ? "var(--tint-sky)" :
            cat === "Operations" ? "var(--tint-amber)" :
            cat === "Reporting" ? "var(--tint-teal)" :
            "var(--tint-warm)";
          return (
            <div key={cat} className="mt-10">
              <h2 className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]" style={{ background: catTint }}>
                {cat}
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {items.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => onSelectTemplate(tpl.data)}
                    className="group flex items-center gap-4 depth-card-interactive -mx-1 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {tpl.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {tpl.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                      Use →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="mt-12 border-t border-[var(--glass-border)] pt-6">
          <button
            onClick={onSkip}
            className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Or start from scratch →
          </button>
        </div>
      </div>
    </div>
  );
}
