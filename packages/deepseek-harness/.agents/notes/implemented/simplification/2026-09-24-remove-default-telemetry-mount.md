# Agent Note: Remove default session-telemetry mount and DeepSeek collector

Status: implemented

English | [中文](2026-09-24-remove-default-telemetry-mount.zh.md)

## Problem

The shared dsh base mounted `@deepseek-ai/dsh-session-telemetry-otel` with a baked-in `https://harness-telemetry.deepseeksvc.com/v1/logs` endpoint. Mode defaulted to `DISABLED`, so a fresh install made no network request, but the default product path still carried an outbound reporting capability and a DeepSeek collector URL. Privacy-conscious deployments that never opt in should not ship that pathway on the shared base.

## Decision

The shared base bundle does not mount `session-telemetry-otel` and does not declare `@deepseek-ai/dsh-session-telemetry-otel` as a dependency. There is no baked-in collector URL. A deployment that wants OTLP reporting inserts the package on a profile or overlay with an explicit `exporter.url` and `mode` (`FULL` or `FEEDBACK_ONLY`). The CLI still depends on the package so those patch layers can resolve it, matching the `dsh-mcp-client` pattern for optional patch-layer plugins.

When a composition does mount the row, omitted `mode` still resolves to `DISABLED`, and any non-empty `DSH_TELEMETRY_DISABLED` still disables the row before load. Cadence and exit-drain recommendations for an inserted uploading row remain those recorded in the [former default-mount Note](../feature/2026-07-31-web-telemetry-default-mount.md). The [mode opt-in Note](../feature/2026-08-10-telemetry-default-off.md) still owns consent semantics for a mounted backend.

## Verification

The base bundle test asserts the composition has no `session-telemetry-otel` row and that the base package does not depend on `@deepseek-ai/dsh-session-telemetry-otel`. Repository search finds no `harness-telemetry.deepseeksvc.com` string outside historical Agent Notes. Web e2e scaffolding inserts the row only when a scenario passes `telemetryUrl`.

## Alternatives considered

**Keep the disabled default mount and only delete the DeepSeek URL.** Rejected because a DISABLED row still constructs the plugin surface and implies a product-owned reporting seat; unmounting removes the pathway from every default profile.

**Delete the session-telemetry packages entirely.** Rejected because self-hosted deployments and real Loader composition tests still need the seam and OTel backend; the privacy goal is satisfied by removing the default product path.

**Leave the base mount and rely on `DISABLED` alone.** Rejected because a baked-in collector URL and mounted capability remain a standing opt-in hazard and contradict the privacy requirement that the default product not carry outbound reporting.

## Consequences

`dsh web` and other base-backed profiles export nothing unless an operator inserts telemetry. Self-hosted OTLP remains available through an explicit insert. `/feedback` without a mounted backend discloses that sharing is not configured. CI may keep `DSH_TELEMETRY_DISABLED=1` as defense in depth for compositions that still insert the row.
