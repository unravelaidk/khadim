---
title: AssemblyScript SDK
description: Use the bundled `assembly/sdk.ts` helpers to implement plugin exports and host calls.
---

The AssemblyScript SDK wraps the low-level host boundary with helpers that make plugin authoring simpler.

## What it is for

Write plugin behavior in AssemblyScript and use the SDK helpers to:

- receive input from the host
- return structured tool results
- call supported host capabilities

Keep your plugin logic focused on tool behavior instead of runtime glue code.

## Where it appears

The SDK is included in the AssemblyScript examples under `assembly/sdk.ts`. In practice, you copy an example plugin and build from there rather than installing a separate SDK package.

## Typical plugin responsibilities

An AssemblyScript plugin usually implements logic for:

- metadata returned to the host
- initialization from config JSON
- tool registration
- tool execution from JSON arguments

The SDK exists to make those responsibilities easier to implement and less error-prone.
