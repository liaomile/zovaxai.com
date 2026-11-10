# Agent Note: Default session-telemetry mount (OTel reporting) in the dsh web composition

Status: implemented

English | [中文](2026-07-31-web-telemetry-default-mount.zh.md)

## Problem

The telemetry seam and OTel backend ([revival Note](2026-07-23-session-telemetry-otel-revival.md)) had never been wired into any deployment composition since completion: no roster row, no switch, no cadence ruling, and zero observability over user sessions for the internal deployment. A deployment decision was needed: which surfaces report, to where, on what cadence, how to opt out, and how CI stays isolated.

## Decision

The shared dsh base no longer mounts `session-telemetry-otel` and carries no baked-in collector; that product composition is owned by the [default-product unmount Note](../simplification/2026-09-24-remove-default-telemetry-mount.md). This note retains the cadence, exit-drain, compression, and CI-isolation rulings that still apply when a deployment inserts the row itself.

| Ruling | Value | Rationale |
|---|---|---|
| Mount surface | deployment profile or overlay insert (not the shared base) | Privacy-first default; self-hosted reporting remains explicit |
| Sharing mode | explicit `mode: FULL` or `FEEDBACK_ONLY` on the inserted row; omitted mode is `DISABLED` | A fresh profile without the row exports nothing |
| Endpoint | required `exporter.url` on uploading modes; no product default URL | Collectors are deployment-owned |
| Hard opt-out | any non-empty `DSH_TELEMETRY_DISABLED` (including `0`/`false`) disables the row when present | The launcher patch takes effect before load-time transport validation |
| Cadence | `processor.scheduledDelayMillis: 10000` (10s/batch) in uploading modes | Streaming while the session runs, never exit-time-only; a crash loses at most the last unexported interval |
| Exit-drain bound | `exporter.timeoutMillis: 1000` + `maxExportBatchSize: 2048` (== maxQueueSize) + `exportTimeoutMillis: 1500` + `shutdownTimeoutMillis: 3000` | Ordinary unreachable-collector failure releases in ~1s; the DSH-owned 3s outer bound covers the SDK's preceding unbounded `forceFlush()` wait |
| Compression | `compression: gzip` | Event bodies carry full content; cross-datacenter bandwidth |
| CI isolation | top-level `env: DSH_TELEMETRY_DISABLED: '1'` in GitHub workflows | Defense in depth when a job or fixture still inserts an uploading row |

The [mode opt-in Note](2026-08-10-telemetry-default-off.md) owns consent semantics for a mounted backend. Real Loader composition suites that verify OTLP delivery insert the row and select each uploading mode explicitly.

## Alternatives considered

**No default mount; deployments add the row themselves.** Originally rejected in favor of a DISABLED base mount; later adopted by the [default-product unmount Note](../simplification/2026-09-24-remove-default-telemetry-mount.md) for privacy.

**A config field instead of an env patch for the switch.** Infeasible: cordis rows have no config-level disable semantic, and `exporter.url` validation fails loud at plugin construction, so the switch must take effect before the Loader — AppCLIEntry's patch layer is the only seat.

**A `Promise.race` timeout backstop around exit.** Originally deferred because the SDK parameters appeared to bound the backend's drain to ~1.5-3s (typically <100ms), with measured SIGINT-to-exit of 110ms-1.1s. A Linux sandbox reproduction later proved that `BatchLogRecordProcessor.shutdown()` can wait forever in `exporter.forceFlush()` before reaching its `exportTimeoutMillis`-bounded completion Promise. The [CLI shutdown fix](../bug-fix/2026-08-03-cli-signal-shutdown-escalation.md) therefore adds both a three-second backend bound for that specific gap and a five-second process-level bound plus repeated-signal escape for the whole plugin tree.

## Consequences

- `dsh web` without an inserted telemetry row makes no telemetry network request.
- **No redaction rule ships with an inserted row by default**: explicitly enabled exports are the raw captured copy. Crossing a trust boundary requires `session-telemetry/record` rules first. The anonymous user id ships through the [anonymous-user-id Note](2026-07-31-telemetry-anonymous-user-id.md).
- Test rigs insert telemetry only when they need a sharing disclosure or OTLP delivery proof.
