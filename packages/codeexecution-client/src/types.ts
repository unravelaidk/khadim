export interface CreateSandboxOptions {
  lifetime?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnResult {
  pid: number;
}

export interface CodeExecutionClientOptions {
  url: string;
  token?: string;
}

export interface RemoteSandbox {
  id: string;
  containerId: string;

  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  exec(script: string): Promise<ExecResult>;
  spawn(
    command: string[],
    options?: { cwd?: string; env?: Record<string, string> }
  ): Promise<SpawnResult>;
  exposeHttp?(options: { port: number }): Promise<string>;
  kill(): Promise<void>;

  writeTextFile?(path: string, content: string): Promise<void>;
  readTextFile?(path: string): Promise<string>;
}

export interface CodeExecutionClient {
  sandbox: {
    create(options?: CreateSandboxOptions): Promise<RemoteSandbox>;
    connect(id: string): Promise<RemoteSandbox>;
    list(): Promise<{ id: string }[]>;
  };
}
