// ─────────────────────────────────────────────────────────────────────
// Khadim Plugin SDK for AssemblyScript
//
// This file mirrors the Rust `khadim-plugin-sdk` so you can write
// Khadim plugins in TypeScript-like syntax via AssemblyScript.
//
// AssemblyScript compiles to wasm32 — no Rust toolchain needed.
// ─────────────────────────────────────────────────────────────────────

// ── Host imports ─────────────────────────────────────────────────────
// These are provided by the Khadim WASM host at runtime.

// Logging — always available
@external("host-log", "info")
declare function __log_info(ptr: i32, len: i32): void;

@external("host-log", "warn")
declare function __log_warn(ptr: i32, len: i32): void;

@external("host-log", "error")
declare function __log_error(ptr: i32, len: i32): void;

@external("host-log", "debug")
declare function __log_debug(ptr: i32, len: i32): void;

// HTTP — requires `http = true` in plugin.toml
@external("host-http", "fetch")
declare function __http_fetch(reqPtr: i32, reqLen: i32): i32;

@external("host-http", "read_body")
declare function __http_read_body(bufPtr: i32, bufCap: i32): i32;

@external("host-http", "status")
declare function __http_status(): i32;

// ── Arena allocator ──────────────────────────────────────────────────
// The host calls __alloc to write data into guest memory.
// We use a simple bump allocator backed by a static buffer.

const ARENA_SIZE: i32 = 512 * 1024; // 512 KiB
let arenaBuffer: ArrayBuffer = new ArrayBuffer(ARENA_SIZE);
let arenaOffset: i32 = 0;

/** Exported allocator the host calls to reserve guest memory. */
export function __alloc(size: i32): i32 {
  const align = 8;
  const aligned = (arenaOffset + align - 1) & ~(align - 1);
  const end = aligned + size;
  if (end > ARENA_SIZE) return 0; // OOM
  arenaOffset = end;
  return changetype<i32>(arenaBuffer) + aligned;
}

/** Reset the arena (call at the start of each export). */
function arenaReset(): void {
  arenaOffset = 0;
}

// ── String helpers ───────────────────────────────────────────────────

/** Write a string into the arena, return [ptr, len]. */
function arenaWriteString(s: string): i32[] {
  const buf = String.UTF8.encode(s, false); // no null terminator
  const len = buf.byteLength;
  const ptr = __alloc(len);
  if (ptr == 0) return [0, 0];
  memory.copy(ptr, changetype<usize>(buf), len);
  return [ptr, len];
}

/** Pack (ptr, len) into a single i64 for the host ABI. */
function pack(ptr: i32, len: i32): i64 {
  return (i64(ptr) << 32) | i64(len & 0xFFFFFFFF);
}

/** Read a UTF-8 string from a raw pointer + length. */
function readString(ptr: usize, len: i32): string {
  return String.UTF8.decodeUnsafe(ptr, len, false);
}

// ── Logging ──────────────────────────────────────────────────────────

export namespace log {
  export function info(msg: string): void {
    const buf = String.UTF8.encode(msg, false);
    __log_info(changetype<i32>(buf), buf.byteLength);
  }
  export function warn(msg: string): void {
    const buf = String.UTF8.encode(msg, false);
    __log_warn(changetype<i32>(buf), buf.byteLength);
  }
  export function error(msg: string): void {
    const buf = String.UTF8.encode(msg, false);
    __log_error(changetype<i32>(buf), buf.byteLength);
  }
  export function debug(msg: string): void {
    const buf = String.UTF8.encode(msg, false);
    __log_debug(changetype<i32>(buf), buf.byteLength);
  }
}

// ── HTTP client ──────────────────────────────────────────────────────

export class HttpResponse {
  status: i32;
  body: string;

  constructor(status: i32, body: string) {
    this.status = status;
    this.body = body;
  }
}

/**
 * Make an HTTP GET request.
 * Requires `http = true` and the host in `allowed_hosts` in plugin.toml.
 */
export function httpGet(url: string): HttpResponse {
  // Build request JSON: {"url":"...","method":"GET"}
  const reqJson = '{"url":"' + jsonEscapeString(url) + '","method":"GET"}';
  const reqBuf = String.UTF8.encode(reqJson, false);
  const bodyLen = __http_fetch(changetype<i32>(reqBuf), reqBuf.byteLength);
  const statusCode = __http_status();

  if (bodyLen < 0) {
    // Try to read error message
    const errBuf = new ArrayBuffer(256);
    const n = __http_read_body(changetype<i32>(errBuf), 256);
    if (n > 0) {
      const errMsg = String.UTF8.decodeUnsafe(changetype<usize>(errBuf), n, false);
      return new HttpResponse(statusCode, errMsg);
    }
    return new HttpResponse(statusCode, "HTTP fetch failed");
  }

  const respBuf = new ArrayBuffer(bodyLen);
  const n = __http_read_body(changetype<i32>(respBuf), bodyLen);
  const body = String.UTF8.decodeUnsafe(changetype<usize>(respBuf), n, false);
  return new HttpResponse(statusCode, body);
}

/**
 * Make an HTTP POST request with a body.
 * Requires `http = true` and the host in `allowed_hosts` in plugin.toml.
 */
export function httpPost(url: string, body: string, contentType: string = "application/json"): HttpResponse {
  const reqJson =
    '{"url":"' + jsonEscapeString(url) +
    '","method":"POST","headers":{"Content-Type":"' + jsonEscapeString(contentType) +
    '"},"body":"' + jsonEscapeString(body) + '"}';
  const reqBuf = String.UTF8.encode(reqJson, false);
  const bodyLen = __http_fetch(changetype<i32>(reqBuf), reqBuf.byteLength);
  const statusCode = __http_status();

  if (bodyLen < 0) {
    const errBuf = new ArrayBuffer(256);
    const n = __http_read_body(changetype<i32>(errBuf), 256);
    if (n > 0) {
      const errMsg = String.UTF8.decodeUnsafe(changetype<usize>(errBuf), n, false);
      return new HttpResponse(statusCode, errMsg);
    }
    return new HttpResponse(statusCode, "HTTP fetch failed");
  }

  const respBuf = new ArrayBuffer(bodyLen);
  const n = __http_read_body(changetype<i32>(respBuf), bodyLen);
  const respBody = String.UTF8.decodeUnsafe(changetype<usize>(respBuf), n, false);
  return new HttpResponse(statusCode, respBody);
}

// ── JSON helpers ─────────────────────────────────────────────────────
// AssemblyScript doesn't have a built-in JSON parser, so we provide
// lightweight helpers for the most common operations.

/** Escape a string for inclusion in a JSON string value. */
export function jsonEscapeString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c == 0x22) out += '\\"';       // "
    else if (c == 0x5C) out += "\\\\"; // backslash
    else if (c == 0x0A) out += "\\n";
    else if (c == 0x0D) out += "\\r";
    else if (c == 0x09) out += "\\t";
    else if (c < 0x20) {
      // Control character — \u00XX
      out += "\\u00";
      out += (c >> 4).toString(16);
      out += (c & 0xF).toString(16);
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out;
}

/**
 * Extract a string value from a JSON object by key.
 * Only handles flat `"key": "value"` — no nesting.
 */
export function jsonGetString(json: string, key: string): string | null {
  const needle = '"' + key + '"';
  const pos = json.indexOf(needle);
  if (pos < 0) return null;

  let i = pos + needle.length;
  // skip whitespace and colon
  while (i < json.length && (json.charCodeAt(i) == 0x20 || json.charCodeAt(i) == 0x3A || json.charCodeAt(i) == 0x09)) i++;
  if (i >= json.length || json.charCodeAt(i) != 0x22) return null; // expect opening quote
  i++; // skip opening quote

  let value = "";
  while (i < json.length) {
    const c = json.charCodeAt(i);
    if (c == 0x5C && i + 1 < json.length) { // backslash
      const next = json.charCodeAt(i + 1);
      if (next == 0x22) { value += '"'; i += 2; continue; }
      if (next == 0x5C) { value += "\\"; i += 2; continue; }
      if (next == 0x6E) { value += "\n"; i += 2; continue; }
      if (next == 0x72) { value += "\r"; i += 2; continue; }
      if (next == 0x74) { value += "\t"; i += 2; continue; }
      value += String.fromCharCode(next);
      i += 2;
      continue;
    }
    if (c == 0x22) break; // closing quote
    value += String.fromCharCode(c);
    i++;
  }
  return value;
}

/**
 * Extract an integer value from a JSON object by key.
 * Returns the default if the key is missing or not a number.
 */
export function jsonGetInt(json: string, key: string, defaultVal: i32 = 0): i32 {
  const needle = '"' + key + '"';
  const pos = json.indexOf(needle);
  if (pos < 0) return defaultVal;

  let i = pos + needle.length;
  while (i < json.length && (json.charCodeAt(i) == 0x20 || json.charCodeAt(i) == 0x3A || json.charCodeAt(i) == 0x09)) i++;

  // Check if it's a quoted number or bare number
  if (i < json.length && json.charCodeAt(i) == 0x22) i++; // skip quote

  let numStr = "";
  while (i < json.length) {
    const c = json.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) { // 0-9
      numStr += String.fromCharCode(c);
      i++;
    } else {
      break;
    }
  }
  if (numStr.length == 0) return defaultVal;
  const parsed = parseInt(numStr) as i32;
  return isNaN(parsed) ? defaultVal : parsed;
}

// ── Tool result builders ─────────────────────────────────────────────

/** Build a successful JSON tool result. */
export function toolResultOk(content: string, metadata: string | null = null): string {
  let json = '{"content":"' + jsonEscapeString(content) + '","is_error":false';
  if (metadata !== null) {
    json += ',"metadata":"' + jsonEscapeString(metadata!) + '"';
  } else {
    json += ',"metadata":null';
  }
  json += "}";
  return json;
}

/** Build an error JSON tool result. */
export function toolResultError(content: string): string {
  return '{"content":"' + jsonEscapeString(content) + '","is_error":true,"metadata":null}';
}

// ── Export helpers ────────────────────────────────────────────────────
// These are used by the main plugin file to return data to the host.

/** Prepare a string for return to the host (arena write + pack). */
export function returnString(s: string): i64 {
  arenaReset();
  const result = arenaWriteString(s);
  return pack(result[0], result[1]);
}

/** Read args passed by the host from raw pointers. */
export function readArgs(namePtr: i32, nameLen: i32, argsPtr: i32, argsLen: i32): string[] {
  const name = readString(namePtr as usize, nameLen);
  const args = readString(argsPtr as usize, argsLen);
  return [name, args];
}
