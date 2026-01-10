# Custom Sandbox Environment Interface

This document outlines the functions and interface that a custom sandbox
environment must implement to be compatible with Khadim's agent tooling.

## Core Interface

```typescript
interface SandboxProvider {
    create(options: { lifetime: string }): Promise<SandboxInstance>;
    connect(options: { id: string }): Promise<SandboxInstance>;
}

interface SandboxInstance {
    id: string;

    // File Operations
    writeTextFile(path: string, content: string): Promise<void>;

    // Process Spawning
    spawn(command: string, options: SpawnOptions): Promise<ChildProcess>;

    // Shell Execution (Tagged Template)
    sh: ShellFunction;

    // HTTP Exposure
    exposeHttp(options: { port: number }): Promise<string>;

    // Lifecycle Management (Optional)
    extendLifetime?(duration: string): Promise<void>;
    kill?(): Promise<void>;
    shutdown?(): Promise<void>;
    setLifetime?(ms: number): Promise<void>;
}
```

---

## Required Functions

### 1. `create(options)`

Creates a new sandbox instance.

| Parameter          | Type     | Description                              |
| ------------------ | -------- | ---------------------------------------- |
| `options.lifetime` | `string` | Duration string (e.g., `"15m"`, `"30m"`) |

**Returns:** `Promise<SandboxInstance>`

---

### 2. `connect(options)`

Reconnects to an existing sandbox by ID.

| Parameter    | Type     | Description           |
| ------------ | -------- | --------------------- |
| `options.id` | `string` | The unique sandbox ID |

**Returns:** `Promise<SandboxInstance>`

**Throws:** Error if sandbox no longer exists or has expired.

---

### 3. `writeTextFile(path, content)`

Writes text content to a file in the sandbox filesystem.

| Parameter | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `path`    | `string` | Relative or absolute path in sandbox |
| `content` | `string` | Text content to write                |

**Returns:** `Promise<void>`

---

### 4. `spawn(command, options)`

Spawns a child process inside the sandbox.

| Parameter        | Type                | Description                                          |
| ---------------- | ------------------- | ---------------------------------------------------- |
| `command`        | `string`            | The command to run (e.g., `"deno"`, `"sh"`, `"npm"`) |
| `options.args`   | `string[]`          | Arguments to pass to the command                     |
| `options.stdout` | `"piped" \| "null"` | How to handle stdout                                 |
| `options.stderr` | `"piped" \| "null"` | How to handle stderr                                 |

**Returns:** `Promise<ChildProcess>`

```typescript
interface ChildProcess {
    stdout?: ReadableStream<Uint8Array>;
    stderr?: ReadableStream<Uint8Array>;
    status: Promise<{ code: number }>;
}
```

---

### 5. `sh` (Tagged Template Literal)

Executes shell commands using template literal syntax.

**Usage:**

```typescript
const result = await sandbox.sh`cat ${filepath}`.text();
const output = await sandbox.sh`ls -la ${directory}`.text();
```

**Returns:** Object with `.text()` method that returns `Promise<string>`

---

### 6. `exposeHttp(options)`

Exposes an HTTP port from the sandbox to a public URL.

| Parameter      | Type     | Description                               |
| -------------- | -------- | ----------------------------------------- |
| `options.port` | `number` | The port to expose (e.g., `8000`, `5173`) |

**Returns:** `Promise<string>` - The public URL for accessing the exposed port.

---

## Optional Lifecycle Functions

These functions are used for sandbox lifecycle management but are not strictly
required.

### 7. `extendLifetime(duration)`

Extends the sandbox's remaining lifetime.

| Parameter  | Type     | Description                                |
| ---------- | -------- | ------------------------------------------ |
| `duration` | `string` | Duration to extend (e.g., `"5m"`, `"30m"`) |

---

### 8. `kill()`

Immediately terminates the sandbox.

---

### 9. `shutdown()`

Gracefully shuts down the sandbox.

---

### 10. `setLifetime(ms)`

Sets the sandbox lifetime to a specific duration in milliseconds.

---

## Usage Patterns

### Creating and Using a Sandbox

```typescript
const sandbox = await Sandbox.create({ lifetime: "15m" });

// Write a file
await sandbox.writeTextFile("index.html", "<h1>Hello</h1>");

// Run a command
const child = await sandbox.spawn("deno", {
    args: ["run", "-A", "script.ts"],
    stdout: "piped",
    stderr: "piped",
});

// Read output
const reader = child.stdout.getReader();
let output = "";
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += new TextDecoder().decode(value);
}

// Get exit status
const status = await child.status;
console.log(`Exit code: ${status.code}`);
```

### Reconnecting to an Existing Sandbox

```typescript
try {
    const sandbox = await Sandbox.connect({ id: existingSandboxId });
    if (sandbox.extendLifetime) {
        await sandbox.extendLifetime("5m");
    }
} catch (error) {
    // Sandbox expired or not found, create new one
    const sandbox = await Sandbox.create({ lifetime: "15m" });
}
```

### Exposing a Web Server

```typescript
// Start a static file server
await sandbox.writeTextFile(
    "_server.ts",
    `
  import { serveDir } from "jsr:@std/http/file-server";
  Deno.serve({ port: 8000 }, (req) => serveDir(req, { fsRoot: "." }));
`,
);

sandbox.spawn("deno", {
    args: ["run", "-A", "_server.ts"],
    stdout: "null",
    stderr: "null",
});

// Wait for server to start
await new Promise((r) => setTimeout(r, 1000));

// Expose and get public URL
const publicUrl = await sandbox.exposeHttp({ port: 8000 });
console.log(`Preview at: ${publicUrl}`);
```

---

## Implementation Notes

1. **Isolation**: The sandbox should provide filesystem and process isolation.
2. **Network**: The sandbox needs outbound network access for `npm install`,
   etc.
3. **Deno Runtime**: The current implementation assumes Deno is available inside
   the sandbox.
4. **Persistence**: Files exist only for the sandbox lifetime unless explicitly
   saved externally.
5. **Concurrency**: Multiple spawned processes should be able to run
   concurrently.
