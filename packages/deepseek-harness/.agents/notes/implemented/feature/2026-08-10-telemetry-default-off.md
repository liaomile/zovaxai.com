# Agent Note: SessionTelemetryBackend requires explicit opt-in

Status: implemented

English | [中文](2026-08-10-telemetry-default-off.zh.md)

## Problem

DeepSeek Harness has two outbound telemetry feeds. During internal testing, the shared base mounted telemetry with a baked-in production endpoint, and both feeds reported by default to help diagnose reported problems: the session OTel backend could export complete session content, tool data, prompts, and workspace paths when its mode was omitted, while the dsh-sdk launcher feed did so unconditionally. A fresh installation therefore permitted outbound reporting without a positive deployment choice.

## Decision

Both feeds use `DSH_TELEMETRY_MODE` as their positive consent setting when a composition mounts the OTel backend. Unset and empty values resolve to `DISABLED`. `@deepseek-ai/dsh-session-telemetry-otel` also resolves an omitted `mode` to `DISABLED`, which constructs no OTel provider, processor, or exporter and leaves feedback in the local session log. The shared dsh base no longer mounts that row; product composition is owned by the [default-product unmount Note](../simplification/2026-09-24-remove-default-telemetry-mount.md). A deployment that inserts the backend opts into Session Log sharing through `FULL` or `FEEDBACK_ONLY`. Any non-empty `DSH_TELEMETRY_DISABLED` remains an authoritative pre-load hard opt-out when the row is present. Cadence and exit-drain settings for an inserted uploading row remain those in the [mount-rulings Note](2026-07-31-web-telemetry-default-mount.md).

The dsh-sdk launcher and its feed were deleted by the [SDK project toolchain removal](../simplification/2026-08-11-remove-sdk-project-toolchain.md). The [CLI reference README](../../../../apps/cli/reference/README.md) documents the current stance: the shared base exports nothing; explicitly inserted uploading modes require a deployment-owned collector URL. The restored [testing-stage onboarding notice](2026-08-13-shared-modal-product-onboarding.md) contains no telemetry copy.

## Alternatives considered

**Keep opt-out defaults and improve disclosure.** Rejected because disclosure does not make a missing configuration a positive authorization to send data, especially when session telemetry can contain complete local content.

**Default session telemetry to `FEEDBACK_ONLY`.** Rejected because recording feedback would still trigger an upload without a deployment explicitly enabling outbound reporting. The default must keep both the session and its feedback local.

**Add project-level consent markers.** Rejected because `DSH_TELEMETRY_MODE` already expresses consent for both feeds; another configuration entry would create conflicting settings and require launcher-specific parsing.

**Remove both telemetry implementations.** Rejected because internal deployments still need explicit `FULL` and feedback-gated reporting, and the launcher feed remains useful under `FULL`.

## Consequences

Fresh profiles make no telemetry network request because the shared base does not mount the backend. Deployments that insert the row select `FEEDBACK_ONLY` or `FULL` with their own collector. The hard opt-out remains effective when the row is present, and uploading modes retain endpoint validation, redaction responsibility, batching, and shutdown behavior.
