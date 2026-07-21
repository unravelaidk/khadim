# Browser journeys

This directory is intentionally limited to true end-to-end coverage: a browser talks to a built React Router/Express application using isolated Postgres and Redis services.

The first parity journeys should cover chat creation and deletion, run start/stream/reconnect/stop, questions and approvals, and settings/credential redaction. Handler tests with mocked repositories live under `../integration/`.
