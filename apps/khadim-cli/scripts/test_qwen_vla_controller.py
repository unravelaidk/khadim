from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


MODULE_PATH = Path(__file__).with_name("qwen_vla_controller.py")
SPEC = importlib.util.spec_from_file_location("khadim_qwen_vla_controller", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
controller = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = controller
SPEC.loader.exec_module(controller)


class QwenVlaControllerTests(unittest.TestCase):
    def test_load_model_pins_processor_and_weights_to_the_same_revision(self) -> None:
        calls: list[tuple[str, str, dict[str, object]]] = []

        class FakeProcessor:
            @staticmethod
            def from_pretrained(model_id: str, **kwargs: object) -> object:
                calls.append(("processor", model_id, kwargs))
                return object()

        class FakeModel:
            @staticmethod
            def from_pretrained(model_id: str, **kwargs: object) -> object:
                calls.append(("model", model_id, kwargs))
                return object()

        transformers = SimpleNamespace(
            AutoProcessor=FakeProcessor,
            AutoModelForImageTextToText=FakeModel,
        )
        revision = "0123456789abcdef0123456789abcdef01234567"
        with mock.patch.dict(
            sys.modules,
            {"torch": SimpleNamespace(), "transformers": transformers},
        ):
            controller.load_model("Qwen/example", revision, "auto", "auto")

        self.assertEqual([call[0] for call in calls], ["processor", "model"])
        for _, model_id, kwargs in calls:
            self.assertEqual(model_id, "Qwen/example")
            self.assertEqual(kwargs["revision"], revision)
            self.assertFalse(kwargs["trust_remote_code"])
        self.assertTrue(calls[1][2]["use_safetensors"])

    def test_resolve_goal_reads_long_unicode_request_file(self) -> None:
        goal = "klik på café-knappen 🌍 " + ("x" * 40_000)
        with tempfile.TemporaryDirectory() as directory:
            request = Path(directory) / "forespørgsel med mellemrum.json"
            request.write_text(json.dumps({"goal": goal}), encoding="utf-8")

            self.assertEqual(controller.resolve_goal(None, str(request)), goal)

    def test_resolve_goal_rejects_ambiguous_or_invalid_requests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            request = Path(directory) / "request.json"
            request.write_text(json.dumps({"goal": 42}), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "either"):
                controller.resolve_goal("click", str(request))
            with self.assertRaisesRegex(ValueError, "string 'goal'"):
                controller.resolve_goal(None, str(request))

    def test_execute_action_calls_pyautogui_directly_without_khadim_subprocess(self) -> None:
        calls: list[tuple[object, ...]] = []
        pyautogui = SimpleNamespace(
            click=lambda *args, **kwargs: calls.append(("click", *args, kwargs)),
            moveTo=lambda *args: calls.append(("move", *args)),
            write=lambda *args, **kwargs: calls.append(("write", *args, kwargs)),
            press=lambda *args: calls.append(("press", *args)),
            hotkey=lambda *args: calls.append(("hotkey", *args)),
            scroll=lambda *args: calls.append(("scroll", *args)),
        )

        with mock.patch.dict(sys.modules, {"pyautogui": pyautogui}), mock.patch.object(
            controller.subprocess,
            "run",
            side_effect=AssertionError("execute_action must not invoke Khadim recursively"),
        ):
            controller.execute_action(
                controller.Action(action="click", x=10, y=20, button="right")
            )
            controller.execute_action(controller.Action(action="key", key="ctrl+l"))

        self.assertEqual(
            calls,
            [
                ("click", 10, 20, {"button": "right"}),
                ("hotkey", "ctrl", "l"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
