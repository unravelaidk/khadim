import json
import os
import shlex
from pathlib import Path

from terminal_bench.agents.base_agent import AgentResult, BaseAgent
from terminal_bench.agents.failure_mode import FailureMode
from terminal_bench.terminal.tmux_session import TmuxSession


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
}


class KhadimCliTerminalBenchAgent(BaseAgent):
    @staticmethod
    def name() -> str:
        return "khadim-cli"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._repo_root = Path(__file__).resolve().parents[3]
        # Prefer pre-built debian binary (GLIBC-compatible with bookworm containers)
        self._debian_binary = self._repo_root / "apps" / "khadim-cli" / "target-debian" / "khadim-cli"
        self._debug_binary = self._repo_root / "apps" / "khadim-cli" / "target" / "debug" / "khadim-cli"
        self._binary_path = self._debian_binary if self._debian_binary.exists() else self._debug_binary

    def _load_saved_settings(self) -> dict[str, str]:
        config_home = Path.home() / ".config" / "khadim" / "cli-settings.json"
        if not config_home.exists():
            return {}
        try:
            data = json.loads(config_home.read_text())
        except Exception:
            return {}
        return {
            key: value
            for key, value in data.items()
            if isinstance(value, str) and value.strip()
        }

    def _resolve_config(self) -> tuple[str, str, str, str]:
        saved = self._load_saved_settings()
        provider = os.environ.get("KHADIM_PROVIDER") or saved.get("provider") or "openai"
        model = os.environ.get("KHADIM_MODEL") or saved.get("model_id") or "gpt-5.4"
        env_key = PROVIDER_ENV_KEYS.get(provider, "KHADIM_API_KEY")
        api_key = os.environ.get(env_key) or saved.get("api_key") or os.environ.get("KHADIM_API_KEY")

        if not api_key:
            raise RuntimeError(
                f"Missing API key for provider '{provider}'. Set {env_key}, KHADIM_API_KEY, or save it in khadim-cli settings."
            )

        return provider, model, env_key, api_key

    def perform_task(
        self,
        instruction: str,
        session: TmuxSession,
        logging_dir: Path | None = None,
    ) -> AgentResult:
        if not self._binary_path.exists():
            raise RuntimeError(
                f"khadim-cli binary not found at {self._binary_path}. Build it first with cargo build --manifest-path apps/khadim-cli/Cargo.toml"
            )

        provider, model, env_key, api_key = self._resolve_config()
        session.copy_to_container(self._binary_path, container_dir="/installed-agent")
        session.container.exec_run(["chmod", "+x", "/installed-agent/khadim-cli"])

        env_setup_content = "\n".join(
            [
                f"export {env_key}={shlex.quote(api_key)}",
                f"export KHADIM_PROVIDER={shlex.quote(provider)}",
                f"export KHADIM_MODEL={shlex.quote(model)}",
            ]
        )
        session.container.exec_run(
            [
                "sh",
                "-c",
                f"echo {shlex.quote(env_setup_content)} > /installed-agent/setup-env.sh",
            ]
        )

        session.send_keys(["source /installed-agent/setup-env.sh", "Enter"], block=True, max_timeout_sec=float("inf"))

        escaped_instruction = shlex.quote(self._render_instruction(instruction))
        command = (
            "/installed-agent/khadim-cli "
            f"--cwd /app --build --provider {shlex.quote(provider)} --model {shlex.quote(model)} --prompt {escaped_instruction}"
        )

        if logging_dir is not None:
            (logging_dir / "khadim-cli-command.txt").write_text(f"{command}\n")

        try:
            session.send_keys([command, "Enter"], block=True, max_timeout_sec=float("inf"))
        except TimeoutError:
            return AgentResult(failure_mode=FailureMode.AGENT_TIMEOUT)
        except Exception:
            return AgentResult(failure_mode=FailureMode.UNKNOWN_AGENT_ERROR)

        return AgentResult(failure_mode=FailureMode.NONE)
