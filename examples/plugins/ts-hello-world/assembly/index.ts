// ─────────────────────────────────────────────────────────────────────
// Hello World Plugin — TypeScript (AssemblyScript)
//
// This is the TypeScript equivalent of `examples/plugins/hello-world`
// (which is written in Rust). It demonstrates:
//
//   ✓  Defining plugin info
//   ✓  Declaring tools with parameters
//   ✓  Executing tool logic
//   ✓  Returning results and errors
//   ✓  Using the host log API
//   ✓  Using the host HTTP API
//
// Build with:   npm run build       (or ./build.sh)
// Install with: npm run install     (or ./build.sh --install)
// ─────────────────────────────────────────────────────────────────────

import {
  log,
  httpGet,
  jsonEscapeString,
  jsonGetString,
  jsonGetInt,
  toolResultOk,
  toolResultError,
  returnString,
  readArgs,
  __alloc,
} from "./sdk";

// Re-export __alloc so the host can call it
export { __alloc };

// ── Plugin info ──────────────────────────────────────────────────────

export function khadim_info(): i64 {
  return returnString(
    '{"name":"TS Hello World","version":"0.1.0",' +
    '"description":"Example plugin written in TypeScript (AssemblyScript)",' +
    '"author":"Khadim","license":"MIT","homepage":null,"min_host_version":null}'
  );
}

// ── Initialization ───────────────────────────────────────────────────

let greetingPrefix: string = "Hello";

export function khadim_initialize(configPtr: i32, configLen: i32): i32 {
  // Read the config JSON that the host passes in
  const config = String.UTF8.decodeUnsafe(configPtr as usize, configLen, false);
  const prefix = jsonGetString(config, "greeting_prefix");
  if (prefix !== null) {
    greetingPrefix = prefix!;
  }
  log.info("ts-hello-world plugin initialized (prefix: " + greetingPrefix + ")");
  return 0; // success
}

// ── Tool definitions ─────────────────────────────────────────────────

export function khadim_list_tools(): i64 {
  const json =
    '[' +
    // Tool 1: greet
    '{"name":"greet",' +
    '"description":"Greet someone by name",' +
    '"params":[' +
      '{"name":"name","description":"The name to greet","param_type":"string","required":true,"default_value":null},' +
      '{"name":"style","description":"Greeting style: formal, casual, pirate","param_type":"string","required":false,"default_value":null}' +
    '],' +
    '"prompt_snippet":"- greet: Greet someone by name with an optional style"},' +
    // Tool 2: count_words
    '{"name":"count_words",' +
    '"description":"Count the number of words in a text",' +
    '"params":[' +
      '{"name":"text","description":"The text to count words in","param_type":"string","required":true,"default_value":null}' +
    '],' +
    '"prompt_snippet":"- count_words: Count words in a text string"},' +
    // Tool 3: reverse
    '{"name":"reverse",' +
    '"description":"Reverse a string",' +
    '"params":[' +
      '{"name":"text","description":"The text to reverse","param_type":"string","required":true,"default_value":null}' +
    '],' +
    '"prompt_snippet":"- reverse: Reverse a string"},' +
    // Tool 4: fetch_title (demonstrates HTTP)
    '{"name":"fetch_title",' +
    '"description":"Fetch the <title> of a web page",' +
    '"params":[' +
      '{"name":"url","description":"The URL to fetch","param_type":"string","required":true,"default_value":null}' +
    '],' +
    '"prompt_snippet":"- fetch_title: Fetch the title of a web page via HTTP"}' +
    ']';
  return returnString(json);
}

// ── Tool execution ───────────────────────────────────────────────────

export function khadim_execute_tool(
  namePtr: i32,
  nameLen: i32,
  argsPtr: i32,
  argsLen: i32,
): i64 {
  const parts = readArgs(namePtr, nameLen, argsPtr, argsLen);
  const toolName = parts[0];
  const argsJson = parts[1];

  if (toolName == "greet") return returnString(toolGreet(argsJson));
  if (toolName == "count_words") return returnString(toolCountWords(argsJson));
  if (toolName == "reverse") return returnString(toolReverse(argsJson));
  if (toolName == "fetch_title") return returnString(toolFetchTitle(argsJson));

  return returnString(toolResultError("Unknown tool: " + toolName));
}

// ── Tool implementations ─────────────────────────────────────────────

function toolGreet(argsJson: string): string {
  const name = jsonGetString(argsJson, "name");
  if (name === null) return toolResultError("Missing required parameter: name");

  const style = jsonGetString(argsJson, "style");
  const s = style !== null ? style! : "casual";

  let greeting: string;
  if (s == "formal") {
    greeting = "Good day, " + name! + ". It is a pleasure to make your acquaintance.";
  } else if (s == "pirate") {
    greeting = "Ahoy, " + name! + "! Welcome aboard, ye scallywag!";
  } else {
    greeting = greetingPrefix + ", " + name! + "!";
  }

  return toolResultOk(greeting);
}

function toolCountWords(argsJson: string): string {
  const text = jsonGetString(argsJson, "text");
  if (text === null) return toolResultError("Missing required parameter: text");

  // Split on whitespace and count non-empty parts
  const parts = text!.split(" ");
  let count: i32 = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) count++;
  }

  const metadata = '{"word_count":' + count.toString() + '}';
  return toolResultOk(
    "The text contains " + count.toString() + " word(s).",
    metadata,
  );
}

function toolReverse(argsJson: string): string {
  const text = jsonGetString(argsJson, "text");
  if (text === null) return toolResultError("Missing required parameter: text");

  let reversed = "";
  for (let i = text!.length - 1; i >= 0; i--) {
    reversed += text!.charAt(i);
  }

  return toolResultOk(reversed);
}

function toolFetchTitle(argsJson: string): string {
  const url = jsonGetString(argsJson, "url");
  if (url === null) return toolResultError("Missing required parameter: url");

  log.info("Fetching title from: " + url!);
  const resp = httpGet(url!);

  if (resp.status < 200 || resp.status >= 300) {
    return toolResultError("HTTP " + resp.status.toString() + ": " + resp.body);
  }

  // Extract <title>...</title> from the HTML body
  const body = resp.body;
  const titleStart = body.indexOf("<title>");
  const titleEnd = body.indexOf("</title>");

  if (titleStart < 0 || titleEnd < 0 || titleEnd <= titleStart) {
    return toolResultOk("No <title> found in the response.");
  }

  const title = body.substring(titleStart + 7, titleEnd).trim();
  return toolResultOk("Page title: " + title);
}
