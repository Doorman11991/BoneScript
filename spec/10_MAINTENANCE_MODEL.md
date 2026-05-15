# BoneScript Self-Maintenance Model Specification

## 1. Purpose

Every system compiled by BoneScript includes a **self-maintenance model** â€” a set
of rules that define how the system detects it is incorrect at runtime and
how it corrects itself deterministically.

This is NOT AI-based healing. It is NOT probabilistic. It is a **rule-based
remediation system** compiled from the program's constraints and invariants.

## 2. Components

Every compiled system includes:

| Component | Purpose |
|-----------|---------|
| Logging Schema | Structured log format for all operations |
| Telemetry Hooks | Metric emission points |
| Health Checks | Liveness and readiness probes |
| Failure Rules | Condition â†’ Detection â†’ Remediation |
| Regression Tests | Automatically derived from capabilities |
| Upgrade Strategy | How to deploy new versions safely |
| Rollback Plan | How to revert to previous version |

## 3. Logging Schema

Every generated service emits structured logs with this fixed schema:

```json
{
  "timestamp": "ISO-8601",
  "level": "debug | info | warn | error | fatal",
  "service": "string (module name)",
  "trace_id": "uuid (request correlation)",
  "span_id": "uuid (operation span)",
  "event": "string (what happened)",
  "duration_ms": "number (operation duration)",
  "status": "success | failure | timeout | rejected",
  "entity_id": "uuid | null (affected entity)",
  "actor_id": "uuid | null (who triggered this)",
  "error_code": "string | null (if status != success)",
  "metadata": "json (additional context)"
}
```

This schema is NOT configurable. It is fixed by the language spec.
All tooling (dashboards, alerts, queries) can rely on this structure.

### 3.1 Log Emission Rules

| Operation | Log Level | Required Fields |
|-----------|-----------|-----------------|
| Capability invoked | info | trace_id, actor_id, event |
| Precondition failed | warn | trace_id, error_code, entity_id |
| Effect applied | debug | trace_id, entity_id, event |
| Event emitted | debug | trace_id, event |
| State transition | info | trace_id, entity_id, from_state, to_state |
| Invalid transition attempted | error | trace_id, entity_id, current_state, trigger |
| External call failed | error | trace_id, service, duration_ms, error_code |
| Request completed | info | trace_id, duration_ms, status |

## 4. Telemetry Hooks

Metrics emitted at fixed points:

| Metric | Type | Emitted When |
|--------|------|-------------|
| `{service}.request.count` | counter | Every request received |
| `{service}.request.duration` | histogram | Every request completed |
| `{service}.request.error` | counter | Every failed request |
| `{service}.event.emitted` | counter | Every event published |
| `{service}.event.consumed` | counter | Every event processed |
| `{service}.state_transition` | counter | Every state change |
| `{service}.constraint.violated` | counter | Every constraint violation |
| `{service}.circuit_breaker.open` | gauge | Circuit breaker state |
| `{service}.connection.active` | gauge | Active connections (realtime) |
| `{service}.queue.depth` | gauge | Pending work items |

## 5. Health Checks

Every service exposes:

```
GET /health/live    â†’ 200 if process is running
GET /health/ready   â†’ 200 if service can accept requests
GET /health/startup â†’ 200 if initialization complete
```

Readiness depends on:
- All dependency connections established
- All state machines in valid states
- No unrecoverable errors in last N seconds

## 6. Failure Rules

Failure rules are derived from the program's constraints and invariants.
Each rule has the form:

```
RULE {id}:
  CONDITION: {what went wrong â€” a predicate over system state}
  DETECTION: {how it is detected â€” log pattern, metric threshold, health check}
  REMEDIATION: {what to do â€” a deterministic action}
  ESCALATION: {what to do if remediation fails}
```

### 6.1 Automatically Generated Rules

From the IR, the compiler generates these failure rules:

#### From Constraints:
```
RULE constraint_violation_{entity}_{field}:
  CONDITION: Entity instance violates declared constraint
  DETECTION: Validation failure logged with error_code = "CONSTRAINT_VIOLATION"
  REMEDIATION: Reject operation, return error to caller, log violation
  ESCALATION: If violation rate > threshold, alert + circuit break
```

#### From State Machines:
```
RULE invalid_transition_{entity}:
  CONDITION: Attempted state transition not in declared machine
  DETECTION: Log with error_code = "INVALID_TRANSITION"
  REMEDIATION: Reject transition, maintain current state, log attempt
  ESCALATION: If repeated from same actor, rate-limit actor
```

#### From Dependencies:
```
RULE dependency_failure_{service}_{dependency}:
  CONDITION: Dependency is unreachable or returning errors
  DETECTION: Error rate on dependency calls > 50% in 30s window
  REMEDIATION: Open circuit breaker, serve degraded response, retry with backoff
  ESCALATION: If circuit open > 5 minutes, alert operations team
```

#### From Events:
```
RULE event_delivery_failure_{event}:
  CONDITION: Event not acknowledged by consumer within TTL
  DETECTION: Event age in queue > declared TTL
  REMEDIATION: Retry delivery (if at_least_once), dead-letter (if max retries exceeded)
  ESCALATION: If dead-letter queue depth > threshold, alert
```

#### From Flows:
```
RULE flow_step_failure_{flow}_{step}:
  CONDITION: Flow step failed after max retries
  DETECTION: Step returns error after retry policy exhausted
  REMEDIATION: Execute compensation for this step and all prior steps (reverse order)
  ESCALATION: If compensation fails, mark flow as FAILED, alert, require manual resolution
```

### 6.2 Rule Execution Model

Rules are evaluated continuously (event-driven, not polling):
1. Every log entry is checked against rule conditions
2. Every metric update is checked against thresholds
3. Health check failures trigger immediate rule evaluation

Rule execution is:
- **Deterministic**: Same condition always triggers same remediation
- **Idempotent**: Applying remediation twice has same effect as once
- **Bounded**: Remediation has a max execution time (from timeout config)
- **Logged**: Every rule trigger and remediation is itself logged

## 7. Regression Tests

The compiler generates test cases from capabilities:

### 7.1 For Each Capability:
```
TEST {capability}_happy_path:
  GIVEN: State satisfying all preconditions
  WHEN: Capability invoked with valid parameters
  THEN: All effects applied, all events emitted, no errors

TEST {capability}_precondition_failure:
  GIVEN: State violating at least one precondition
  WHEN: Capability invoked
  THEN: Operation rejected, state unchanged, error returned

TEST {capability}_idempotency (if idempotent: true):
  GIVEN: State satisfying preconditions
  WHEN: Capability invoked twice with same parameters
  THEN: State after second call equals state after first call
```

### 7.2 For Each State Machine:
```
TEST {entity}_valid_transitions:
  FOR EACH transition in machine:
    GIVEN: Entity in transition.from state
    WHEN: transition.trigger occurs (and guard passes)
    THEN: Entity moves to transition.to state

TEST {entity}_invalid_transitions:
  FOR EACH (state, trigger) NOT in machine:
    GIVEN: Entity in state
    WHEN: trigger occurs
    THEN: Transition rejected, state unchanged
```

### 7.3 For Each Invariant:
```
TEST invariant_{id}_holds:
  FOR EACH capability that modifies relevant state:
    GIVEN: State satisfying invariant
    WHEN: Capability executed
    THEN: Invariant still holds
```

## 8. Upgrade Strategy

Generated systems use **blue-green deployment** by default:

```
1. Deploy new version alongside old (green)
2. Run health checks on green
3. Run regression tests on green (against test data)
4. If all pass: switch traffic to green
5. Monitor error rate for 5 minutes
6. If error rate acceptable: decommission old (blue)
7. If error rate elevated: rollback (switch traffic back to blue)
```

For schema changes (SQL migrations):
```
1. Apply backward-compatible migration (add columns, not remove)
2. Deploy new code that uses new schema
3. Verify stability
4. Apply cleanup migration (remove old columns) in next release
```

## 9. Rollback Plan

```
ROLLBACK TRIGGER:
  - Error rate > 5x baseline within 5 minutes of deploy
  - Any health check failing within 2 minutes of deploy
  - Any invariant violation not present in previous version

ROLLBACK PROCEDURE:
  1. Switch traffic to previous version (instant, load balancer)
  2. Log rollback event with reason
  3. Alert operations team
  4. Preserve new version logs for diagnosis
  5. Do NOT rollback database migrations (they are backward-compatible)

ROLLBACK VERIFICATION:
  - Error rate returns to baseline within 2 minutes
  - All health checks pass
  - All regression tests pass
```

## 10. What This Is NOT

- NOT machine learning-based anomaly detection
- NOT probabilistic failure prediction
- NOT self-modifying code
- NOT AI-driven remediation

Every rule is:
- Derived from the source program's declarations
- Deterministic in its trigger condition
- Deterministic in its remediation action
- Verifiable by inspection
- Testable in isolation
