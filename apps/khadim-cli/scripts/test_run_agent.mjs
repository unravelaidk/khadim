import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAgentStream } from "../dist/npm-api/run-agent.js";

const fakeAgentSource = String.raw`
import { appendFileSync, createReadStream, fstatSync, writeSync } from "node:fs";

const promptIndex = process.argv.indexOf("--prompt");
if (promptIndex < 0) throw new Error("missing --prompt");
const config = JSON.parse(process.argv[promptIndex + 1]);
appendFileSync(config.spawnMarker, String(process.pid) + "\n");

const watchArgs = process.argv
  .map((value, index) => value === "--parent-watch-fd" ? index : -1)
  .filter((index) => index >= 0);
if (watchArgs.length !== 1) throw new Error("expected exactly one --parent-watch-fd");
const parentWatchFd = Number(process.argv[watchArgs[0] + 1]);
fstatSync(parentWatchFd);
const parentWatch = createReadStream("", { fd: parentWatchFd, autoClose: false });
parentWatch.resume();
parentWatch.once("end", () => process.exit(0));
parentWatch.once("error", () => process.exit(97));

if (config.mode === "overlong") {
  process.stdout.write(Buffer.alloc(config.eventBytes, 0x78));
  setInterval(() => {}, 60_000);
} else if (config.mode === "huge-stderr") {
  const payload = Buffer.concat([
    Buffer.from("STDERR-HEAD-SHOULD-BE-DROPPED\n"),
    Buffer.alloc(config.stderrBytes, 0x65),
    Buffer.from("\nSTDERR-TAIL-MUST-REMAIN"),
  ]);
  writeSync(2, payload);
  process.exit(23);
} else {

let toolContent = null;
if (process.env.KHADIM_NATIVE_TOOL_RPC_URL) {
  const response = await fetch(process.env.KHADIM_NATIVE_TOOL_RPC_URL + "/tool/probe", {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.KHADIM_NATIVE_TOOL_RPC_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ input: { value: "from fake agent" } }),
  });
  if (!response.ok) throw new Error("native tool returned " + response.status);
  toolContent = (await response.json()).content;
}

process.stdout.write(JSON.stringify({
  event_type: "text_delta",
  content: "ready",
  metadata: {
    pid: process.pid,
    rpcUrl: process.env.KHADIM_NATIVE_TOOL_RPC_URL ?? null,
    rpcToken: process.env.KHADIM_NATIVE_TOOL_RPC_TOKEN ?? null,
    toolContent,
    parentWatchFd,
    parentWatchArgCount: watchArgs.length,
  },
}) + "\n");

setInterval(() => {}, 60_000);
}
`;

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "khadim agent boundary "));
  const unicodeDir = path.join(root, "unicode-æøå-測試");
  mkdirSync(unicodeDir, { recursive: true });
  const script = path.join(unicodeDir, "fake agent.mjs");
  const spawnMarker = path.join(unicodeDir, "spawned.txt");
  writeFileSync(script, fakeAgentSource);
  return { root, script, spawnMarker };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function spawnedPids(marker) {
  return readFileSync(marker, "utf8").trim().split("\n").map(Number);
}

function fakeOptions(fixture, extra = {}) {
  return {
    prompt: JSON.stringify({ spawnMarker: fixture.spawnMarker }),
    binaryPath: process.execPath,
    binaryArgs: [fixture.script],
    ...extra,
  };
}

test("breaking the stream terminates and reaps the agent and closes its native-tool server", async () => {
  const fixture = createFixture();
  let toolCalls = 0;
  try {
    let event;
    for await (const next of runAgentStream(fakeOptions(fixture, {
      nativeTools: [{
        name: "probe",
        description: "deterministic native tool probe",
        parameters: { type: "object" },
        execute: async (input) => {
          toolCalls += 1;
          return { content: `probe:${input.value}` };
        },
      }],
    }))) {
      event = next;
      break;
    }

    assert.equal(toolCalls, 1);
    assert.equal(event?.metadata?.toolContent, "probe:from fake agent");
    assert.equal(event?.metadata?.parentWatchFd, 3);
    assert.equal(event?.metadata?.parentWatchArgCount, 1);
    const pid = Number(event?.metadata?.pid);
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.deepEqual(spawnedPids(fixture.spawnMarker), [pid]);
    assert.equal(processIsAlive(pid), false, "the abandoned native process must already be reaped");

    await assert.rejects(fetch(`${event.metadata.rpcUrl}/tool/probe`, {
      method: "POST",
      headers: { authorization: `Bearer ${event.metadata.rpcToken}` },
      signal: AbortSignal.timeout(1_000),
    }));
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("a consumer error still closes the generator and reaps the agent", async () => {
  const fixture = createFixture();
  let pid;
  const consumerError = new Error("consumer failed");
  try {
    await assert.rejects(async () => {
      for await (const event of runAgentStream(fakeOptions(fixture))) {
        pid = Number(event.metadata?.pid);
        throw consumerError;
      }
    }, (error) => error === consumerError);

    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.deepEqual(spawnedPids(fixture.spawnMarker), [pid]);
    assert.equal(processIsAlive(pid), false, "the consumer failure must not leak the native process");
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("a pre-aborted signal rejects before starting the native server or binary", async () => {
  const fixture = createFixture();
  const controller = new AbortController();
  controller.abort();
  let toolCalls = 0;
  try {
    const stream = runAgentStream(fakeOptions(fixture, {
      signal: controller.signal,
      nativeTools: [{
        name: "probe",
        description: "must not run",
        parameters: { type: "object" },
        execute: async () => {
          toolCalls += 1;
          return { content: "unexpected" };
        },
      }],
    }));

    await assert.rejects(stream.next(), (error) => error?.name === "AbortError");
    assert.equal(toolCalls, 0);
    assert.equal(existsSync(fixture.spawnMarker), false);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("a spawn error unwinds the same cleanup path without starting a process", async () => {
  const fixture = createFixture();
  try {
    const missingBinary = path.join(fixture.root, "missing", "khadim-cli");
    await assert.rejects(async () => {
      for await (const _event of runAgentStream({
        ...fakeOptions(fixture),
        binaryPath: missingBinary,
        binaryArgs: [],
        nativeTools: [{
          name: "probe",
          description: "server must be closed after spawn failure",
          parameters: { type: "object" },
          execute: async () => ({ content: "unexpected" }),
        }],
      })) {
        assert.fail("a missing binary must not emit an event");
      }
    }, (error) => error?.code === "ENOENT");
    assert.equal(existsSync(fixture.spawnMarker), false);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("newline-free stdout over the NDJSON limit is rejected and the child is reaped", async () => {
  const fixture = createFixture();
  try {
    const prompt = JSON.stringify({
      spawnMarker: fixture.spawnMarker,
      mode: "overlong",
      eventBytes: 8 * 1024 * 1024 + 1,
    });
    await assert.rejects(async () => {
      for await (const _event of runAgentStream(fakeOptions(fixture, { prompt }))) {
        assert.fail("an overlong unterminated event must not be emitted");
      }
    }, /NDJSON event larger than 8388608 bytes without a newline/);

    const [pid] = spawnedPids(fixture.spawnMarker);
    assert.equal(processIsAlive(pid), false, "the framing failure must reap the child");
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("stderr retains a bounded diagnostic tail and marks truncation", async () => {
  const fixture = createFixture();
  let failure;
  try {
    const prompt = JSON.stringify({
      spawnMarker: fixture.spawnMarker,
      mode: "huge-stderr",
      stderrBytes: 512 * 1024,
    });
    await assert.rejects(async () => {
      for await (const _event of runAgentStream(fakeOptions(fixture, { prompt }))) {
        assert.fail("the failing child must not emit an event");
      }
    }, (error) => {
      failure = error;
      return /khadim exited with code 23/.test(error?.message);
    });

    assert.match(failure.message, /stderr truncated to final 131072 bytes/);
    assert.match(failure.message, /STDERR-TAIL-MUST-REMAIN/);
    assert.doesNotMatch(failure.message, /STDERR-HEAD-SHOULD-BE-DROPPED/);
    assert.ok(Buffer.byteLength(failure.message) < 132 * 1024);
    assert.equal(spawnedPids(fixture.spawnMarker).length, 1);
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});
