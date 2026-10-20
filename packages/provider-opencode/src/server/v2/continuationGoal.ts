import type { OrchestrationV2ProviderGoal } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

// Display-only contract of the optional mimi.continuation plugin. T3 never
// takes ownership of its continuation loop or receives agent report tokens.
export const RPC_ID = "mimi.continuation";
export const CHANGED_EVENT = "rpc.mimi.continuation.changed";
export const READY_EVENT = "rpc.mimi.continuation.ready";
export const Snapshot = Schema.Struct({
  sessionID: Schema.NonEmptyString,
  goal: Schema.NullOr(
    Schema.Struct({
      goalID: Schema.NonEmptyString,
      objective: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(16000)),
      state: Schema.Literals(["active", "waiting", "paused", "blocked", "complete"]),
      detail: Schema.String.check(Schema.isMaxLength(4000)),
    }),
  ),
});
export const decodeSnapshot = Schema.decodeUnknownEffect(Snapshot);

export const providerGoal = (
  snapshot: typeof Snapshot.Type,
): OrchestrationV2ProviderGoal | null => {
  const goal = snapshot.goal;
  if (goal === null) return null;
  return {
    objective: goal.objective,
    // Waiting for a background notification is still an active objective, not
    // an operator pause. Do not offer Resume or invent usage/check accounting.
    status: goal.state === "waiting" ? "active" : goal.state,
    ...(goal.detail.length === 0 ? {} : { lastCheck: goal.detail }),
  };
};
