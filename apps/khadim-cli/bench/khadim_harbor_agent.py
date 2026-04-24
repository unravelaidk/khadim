import json
import os
import shlex
import shutil
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


PROVIDER_ENV_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "google": "GEMINI_API_KEY",
    "azure-openai-responses": "AZURE_OPENAI_API_KEY",
    "xai": "XAI_API_KEY",
    "cerebras": "CEREBRAS_API_KEY",
    "huggingface": "HF_TOKEN",
    "opencode": "OPENCODE_API_KEY",
    "opencode-go": "OPENCODE_API_KEY",
    "kimi-coding": "KIMI_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    "zai": "ZAI_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
}

# Single bootstrap script that handles both Debian and Ubuntu containers,
# installs all runtime deps, curl, uv, and sets up PATH — in one exec call
# to avoid failures when curl is missing.
BOOTSTRAP_SCRIPT = (
    "set -euo pipefail; "
    "export DEBIAN_FRONTEND=noninteractive; "
    # Install curl + runtime deps (works on both debian and ubuntu)
    "apt-get update -qq 2>/dev/null; "
    "apt-get install -y -qq curl ca-certificates libssl3 libdbus-1-3 2>/dev/null || "
    "apt-get install -y -qq curl ca-certificates libssl-dev libdbus-1-3 2>/dev/null || true; "
    # Install uv
    "if ! command -v uv >/dev/null 2>&1; then "
    "  curl -LsSf https://astral.sh/uv/install.sh | sh; "
    "fi; "
    # Ensure PATH is set for both interactive and non-interactive shells
    "export PATH=\"$HOME/.local/bin:$HOME/.cargo/bin:$PATH\"; "
    "uv --version; "
    "grep -q '.local/bin' ~/.bashrc 2>/dev/null || "
    "  echo 'export PATH=\"$HOME/.local/bin:$HOME/.cargo/bin:$PATH\"' >> ~/.bashrc"
)


class KhadimHarborAgent(BaseInstalledAgent):
    @staticmethod
    def name() -> str:
        return "khadim-cli"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._repo_root = Path(__file__).resolve().parents[3]
        self._cli_app_dir = self._repo_root / "apps" / "khadim-cli"
        self._prebuilt_binary_path = self._cli_app_dir / "target-debian" / "khadim-cli"
        self._ai_core_dir = self._repo_root / "crates" / "khadim-ai-core"
        self._coding_agent_dir = self._repo_root / "crates" / "khadim-coding-agent"

    def _load_saved_settings(self) -> dict[str, str]:
        path = Path.home() / ".config" / "khadim" / "cli-settings.json"
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text())
        except Exception:
            return {}
        return {
            key: value
            for key, value in data.items()
            if isinstance(value, str) and value.strip()
        }

    def _resolve_model_config(self) -> tuple[str, str]:
        saved = self._load_saved_settings()
        if self.model_name and "/" in self.model_name:
            provider, model = self.model_name.split("/", 1)
            return provider, model

        provider = os.environ.get("KHADIM_PROVIDER") or saved.get("provider") or "openai"
        model = os.environ.get("KHADIM_MODEL") or saved.get("model_id") or "gpt-5.4"
        return provider, model

    def _resolve_runtime_env(self) -> dict[str, str]:
        saved = self._load_saved_settings()
        provider, model = self._resolve_model_config()
        env_key = PROVIDER_ENV_KEYS.get(provider, "KHADIM_API_KEY")
        api_key = (
            os.environ.get(env_key)
            or os.environ.get("KHADIM_API_KEY")
            or saved.get("api_key")
        )

        if not api_key:
            raise ValueError(
                f"Missing API key for provider '{provider}'. Set {env_key}, KHADIM_API_KEY, or save it in khadim-cli settings."
            )

        env = {
            env_key: api_key,
            "KHADIM_PROVIDER": provider,
            "KHADIM_MODEL": model,
        }

        if provider == "openai" and "OPENAI_BASE_URL" in os.environ:
            env["OPENAI_BASE_URL"] = os.environ["OPENAI_BASE_URL"]

        return env

    def _stage_dir(self, source: Path, destination: Path) -> Path:
        if destination.exists():
            shutil.rmtree(destination)

        shutil.copytree(
            source,
            destination,
            ignore=shutil.ignore_patterns(
                "target",
                ".git",
                ".direnv",
                ".devenv",
                "node_modules",
                "dist",
                ".next",
            ),
        )
        return destination

    async def install(self, environment: BaseEnvironment) -> None:
        if not self._cli_app_dir.exists():
            raise FileNotFoundError(
                f"khadim-cli source directory not found at {self._cli_app_dir}"
            )

        if self._prebuilt_binary_path.exists():
            await self.exec_as_root(
                environment,
                command="mkdir -p /installed-agent/bin",
            )
            await environment.upload_file(
                source_path=self._prebuilt_binary_path,
                target_path="/installed-agent/bin/khadim-cli",
            )
            await self.exec_as_root(
                environment,
                command="chmod +x /installed-agent/bin/khadim-cli",
            )
            # Single bootstrap: install curl + libssl3 + libdbus + uv in one shot
            await self.exec_as_root(
                environment,
                command=BOOTSTRAP_SCRIPT,
                timeout_sec=180,
            )
            return

        if not self._ai_core_dir.exists() or not self._coding_agent_dir.exists():
            raise FileNotFoundError("Required shared Khadim crates are missing")

        staged_root = self.logs_dir / "khadim-src"
        staged_apps = staged_root / "apps"
        staged_crates = staged_root / "crates"
        staged_apps.mkdir(parents=True, exist_ok=True)
        staged_crates.mkdir(parents=True, exist_ok=True)

        staged_cli = self._stage_dir(
            self._cli_app_dir,
            staged_apps / "khadim-cli",
        )
        staged_ai_core = self._stage_dir(
            self._ai_core_dir,
            staged_crates / "khadim-ai-core",
        )
        staged_coding_agent = self._stage_dir(
            self._coding_agent_dir,
            staged_crates / "khadim-coding-agent",
        )

        await self.exec_as_root(
            environment,
            command="mkdir -p /installed-agent/khadim-src/apps /installed-agent/khadim-src/crates",
        )

        await environment.upload_dir(
            source_dir=staged_cli,
            target_dir="/installed-agent/khadim-src/apps/khadim-cli",
        )
        await environment.upload_dir(
            source_dir=staged_ai_core,
            target_dir="/installed-agent/khadim-src/crates/khadim-ai-core",
        )
        await environment.upload_dir(
            source_dir=staged_coding_agent,
            target_dir="/installed-agent/khadim-src/crates/khadim-coding-agent",
        )

        await self.exec_as_root(
            environment,
            command=(
                "set -euo pipefail; "
                "export DEBIAN_FRONTEND=noninteractive; "
                "apt-get update; "
                "apt-get install -y curl ca-certificates build-essential pkg-config libssl-dev libdbus-1-dev; "
                "if ! command -v cargo >/dev/null 2>&1; then "
                "  curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal; "
                "fi; "
                "export PATH=\"$HOME/.cargo/bin:$PATH\"; "
                "cargo build --manifest-path /installed-agent/khadim-src/apps/khadim-cli/Cargo.toml"
            ),
            timeout_sec=None,
        )

        # Bootstrap uv + PATH
        await self.exec_as_root(
            environment,
            command=BOOTSTRAP_SCRIPT,
            timeout_sec=180,
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        context.metadata = {
            "agent": "khadim-cli",
            "version": self.version() or "dev",
        }

    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        provider, model = self._resolve_model_config()
        env = self._resolve_runtime_env()
        env["RUST_LOG"] = os.environ.get("RUST_LOG", "info")

        self.logger.info(
            "Running khadim-cli",
            extra={
                "provider": provider,
                "model": model,
                "cwd": "/app",
            },
        )

        context.metadata = {
            **(context.metadata or {}),
            "agent": "khadim-cli",
            "version": self.version() or "dev",
            "provider": provider,
            "model": model,
        }

        log_file = "/installed-agent/khadim-run.log"
        command = (
            f"printf '%s\n' 'KHADIM_PROVIDER={provider}' 'KHADIM_MODEL={model}'; "
            f"{shlex.quote(self._remote_binary_path())} "
            f"--cwd /app --build --provider {shlex.quote(provider)} "
            f"--model {shlex.quote(model)} --prompt {shlex.quote(instruction)} "
            f"2>&1 | tee {shlex.quote(log_file)}"
        )

        try:
            await self.exec_as_agent(
                environment,
                command=command,
                env=env,
                cwd="/app",
                timeout_sec=None,
            )
        except Exception as e:
            self.logger.warning(
                "khadim-cli exited with error (allowing verifier to score partial work)",
                extra={"error": str(e)},
            )

    def _remote_binary_path(self) -> str:
        if self._prebuilt_binary_path.exists():
            return "/installed-agent/bin/khadim-cli"
        return "/installed-agent/khadim-src/apps/khadim-cli/target/debug/khadim-cli"
