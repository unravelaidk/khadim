import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { callCorePlugin, inspectCorePlugin } from "../../../src/main/plugins/core-runtime";

const harnesses = [
  { directory: "codex", file: "codex.wasm", id: "khadim.codex", name: "Codex", harnessId: "codex" },
  { directory: "cursor", file: "cursor.wasm", id: "khadim.cursor", name: "Cursor", harnessId: "cursor" },
  { directory: "grok", file: "grok.wasm", id: "khadim.grok", name: "Grok", harnessId: "grok" },
] as const;

describe("bundled CLI harness WebAssembly plugins", () => {
  for (const harness of harnesses) {
    it(`exposes ${harness.name} and maps its bridge protocol`, async () => {
      const modulePath = resolve(process.cwd(), `plugins/builtin/${harness.directory}/${harness.file}`);
      const inspected = await inspectCorePlugin(modulePath);
      expect(inspected.info).toMatchObject({ id: harness.id, name: harness.name, version: "0.1.0" });
      expect(inspected.capabilities.harnesses).toEqual([
        expect.objectContaining({ id: harness.harnessId, name: harness.name }),
      ]);

      const context = {
        remoteSessionId: "session/one",
        questionRequestId: "request/one",
        questionAnswers: { delivery: ["Now"] },
        prompt: "Ship it",
        systemPrompt: "Be concise.",
        model: { provider: harness.id, model: "model-one" },
        mode: "plan",
        config: { bridgeUrl: "http://127.0.0.1:43123/", bridgeToken: "secret" },
      };
      await expect(callCorePlugin(modulePath, "harness.prompt", context)).resolves.toEqual({
        method: "POST",
        path: "/session/session%2Fone/prompt",
        body: { prompt: "Ship it", systemPrompt: "Be concise.", model: "model-one", mode: "plan" },
      });
      await expect(callCorePlugin(modulePath, "harness.question.reply", context)).resolves.toEqual({
        method: "POST",
        path: "/session/session%2Fone/question/request%2Fone/reply",
        body: { answers: { delivery: ["Now"] } },
      });
      await expect(callCorePlugin(modulePath, "harness.event", {
        event: {
          type: "khadim.question",
          request_id: "request-one",
          questions: [{ id: "delivery", header: "Delivery", question: "Ship now?", options: [{ label: "Now" }] }],
        },
      })).resolves.toEqual({ events: [{
        event_type: "question",
        metadata: {
          requestId: "request-one",
          questions: [{ id: "delivery", header: "Delivery", question: "Ship now?", options: [{ label: "Now" }] }],
        },
      }] });
    });
  }
});
