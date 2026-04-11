---
title: AssemblyScript SDK
description: Use the bundled `assembly/sdk.ts` helpers to implement plugin exports and host calls.
---

The AssemblyScript SDK wraps the low-level host boundary with helpers that make plugin authoring simpler.

## Core idea

Write plugin behavior in AssemblyScript and use the SDK helpers to:

- receive input from the host
- return structured tool results
- call supported host capabilities

Keep your plugin logic focused on tool behavior instead of runtime glue code.
