---
title: AssemblyScript SDK
description: Use the bundled `assembly/sdk.ts` helpers to implement plugin exports and host calls.
---

## What the SDK gives you

The AssemblyScript SDK wraps the low-level WASM ABI used by the Khadim host.

It includes helpers for:

- logging
- HTTP requests
- filesystem access
- simple JSON field extraction
- tool result construction
- string return packing for the host ABI

## Logging

```ts
import { log } from './sdk';

log.info('message');
log.warn('message');
log.error('message');
log.debug('message');
```

## HTTP

HTTP access requires `http = true` in `plugin.toml` and the target host in `allowed_hosts`.

```ts
import { httpGet, httpPost } from './sdk';

const page = httpGet('https://api.example.com/data');
const created = httpPost('https://api.example.com/items', '{"name":"demo"}');
```

Response objects expose:

- `status`
- `body`

## Filesystem

Filesystem access requires `fs = true`.

```ts
import { fsAppendFile, fsListDir, fsPathExists, fsReadFile, fsWriteFile } from './sdk';

const current = fsReadFile('notes/todo.md');
const writeError = fsWriteFile('notes/todo.md', '# Updated');
const appendError = fsAppendFile('notes/log.md', '\n- changed');
const exists = fsPathExists('notes');
const entries = fsListDir('.');
```

The write helpers return `null` on success and an error string on failure.

## JSON helpers

AssemblyScript does not ship with the usual JavaScript JSON runtime ergonomics, so the SDK provides lightweight extraction helpers.

```ts
import { jsonEscapeString, jsonGetInt, jsonGetString } from './sdk';

const name = jsonGetString(argsJson, 'name');
const count = jsonGetInt(argsJson, 'count', 10);
const safeValue = jsonEscapeString(userInput);
```

## Tool results

```ts
import { toolResultError, toolResultOk } from './sdk';

return toolResultOk('It worked');
return toolResultOk('It worked', '{"count": 3}');
return toolResultError('Something went wrong');
```

## ABI helpers

The SDK also owns the less friendly parts of the ABI:

- `__alloc()` memory reservation for host writes
- arena reset logic between exports
- `returnString()` for packed `ptr|len` returns
- `readArgs()` for decoding host-provided tool names and JSON args

That means your plugin code can stay focused on tool behavior instead of pointer math.
