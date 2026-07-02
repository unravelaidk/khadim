# khadim-rpa-harness

RPA and computer-use harness tools for Khadim.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

This crate keeps desktop automation capabilities separate from the coding agent
runtime. The initial version registers stable tool boundaries for:

- `rpa_capabilities`
- `screen_capture`
- `computer_input`
- `audio_listen`

The platform implementations are intentionally behind future feature flags:

- `screen` for screen capture and OCR backends
- `input` for mouse and keyboard simulation
- `rustautogui-backend` for X11-oriented capture/input plus visual template
  matching through RustAutoGUI
- `rustautogui-opencl` for RustAutoGUI's OpenCL template matching modes
- `audio` for microphone/system-audio capture and transcription

`screen_capture` and `computer_input` default to the `xcap`/`enigo` path. Pass
`"backend": "rustautogui"` to test RustAutoGUI on X11 sessions. The
`visual_find` tool is registered when `rustautogui-backend` is enabled.
