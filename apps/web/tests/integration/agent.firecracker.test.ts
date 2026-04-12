import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirecrackerSandboxProvider } from "../../app/agent/firecracker";
import { resolveSandboxBackend } from "../../app/agent/sandbox";

describe("resolveSandboxBackend", () => {
  it("defaults to the remote provider", () => {
    expect(resolveSandboxBackend("remote")).toBe("remote");
    expect(resolveSandboxBackend("remote")).toBe("remote");
  });

  it("maps firecracker aliases to the vm backend", () => {
    expect(resolveSandboxBackend("firecracker")).toBe("firecracker");
    expect(resolveSandboxBackend("vm")).toBe("firecracker");
  });
});

describe("createFirecrackerSandboxProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("creates a sandbox with firecracker vm defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "vm-1", microvmId: "fc-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = createFirecrackerSandboxProvider({
      baseUrl: "http://sandbox.test/",
      token: "secret",
      vmDefaults: {
        vcpuCount: 2,
        memoryMib: 2048,
        kernelImage: "/var/lib/firecracker/vmlinux",
        rootfsImage: "/var/lib/firecracker/rootfs.ext4",
      },
    });

    const sandbox = await provider.create({ lifetime: "15m" });

    expect(sandbox.id).toBe("vm-1");
    expect(sandbox.containerId).toBe("fc-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://sandbox.test/v1/sandboxes",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      })
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toBe(
      JSON.stringify({
        lifetime: "15m",
        substrate: "firecracker",
        vm: {
          vcpuCount: 2,
          memoryMib: 2048,
          kernelImage: "/var/lib/firecracker/vmlinux",
          rootfsImage: "/var/lib/firecracker/rootfs.ext4",
        },
      })
    );
  });

  it("uses the guest-agent endpoints for file and command operations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "vm-1", vmId: "fc-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: "hello" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ exitCode: 0, stdout: "ok", stderr: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pid: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://preview.test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const provider = createFirecrackerSandboxProvider({ baseUrl: "http://sandbox.test" });
    const sandbox = await provider.connect({ id: "vm-1" });

    await sandbox.writeFile("src/index.ts", "console.log('hi')");
    await expect(sandbox.readFile("src/index.ts")).resolves.toBe("hello");
    await expect(sandbox.exec("pwd")).resolves.toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    await expect(sandbox.spawn?.(["bun", "run", "dev"], { cwd: "/workspace" })).resolves.toEqual({ pid: 42 });
    await expect(sandbox.exposeHttp?.({ port: 5173 })).resolves.toBe("https://preview.test");
    await expect(sandbox.kill?.()).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://sandbox.test/v1/sandboxes/vm-1",
      "http://sandbox.test/v1/sandboxes/vm-1/write-file",
      "http://sandbox.test/v1/sandboxes/vm-1/read-file",
      "http://sandbox.test/v1/sandboxes/vm-1/exec",
      "http://sandbox.test/v1/sandboxes/vm-1/processes",
      "http://sandbox.test/v1/sandboxes/vm-1/network/expose",
      "http://sandbox.test/v1/sandboxes/vm-1",
    ]);

    const writeRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(writeRequest.body).toBe(JSON.stringify({ path: "src/index.ts", content: "console.log('hi')", encoding: "utf-8" }));

    const execRequest = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(execRequest.body).toBe(JSON.stringify({ command: "pwd", workdir: "/root" }));
  });
});
