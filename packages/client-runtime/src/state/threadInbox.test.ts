import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  createInboxReturnTracker,
  createWaitingQuestionThreadsAtom,
  sortWorkingThreadsBySend,
} from "./threadInbox.ts";
import { Atom, AtomRegistry } from "effect/reactivity";
import * as Option from "effect/Option";
import { presentThreadShell } from "./models.ts";
import { v2ThreadShell } from "./orchestrationV2TestFixtures.ts";
import type { EnvironmentShellState } from "./shell.ts";

const environmentId = EnvironmentId.make("environment-1");

describe("waiting questions", () => {
  it("tracks answers across clients, reconnects, and environments without relying on visits", () => {
    const remote = EnvironmentId.make("remote");
    const waiting = {
      ...presentThreadShell(environmentId, v2ThreadShell),
      hasPendingUserInput: true,
    };
    const remoteWaiting = { ...waiting, environmentId: remote };
    const threadsAtom = Atom.make([waiting, remoteWaiting]);
    const shellStateAtom = Atom.family((_id: EnvironmentId) =>
      Atom.make<EnvironmentShellState>({
        snapshot: Option.none(),
        status: "live",
        error: Option.none(),
      }),
    );
    const questions = createWaitingQuestionThreadsAtom({ threadsAtom, shellStateAtom });
    const firstClient = AtomRegistry.make();
    const secondClient = AtomRegistry.make();
    const disposeFirst = firstClient.mount(questions);
    const disposeSecond = secondClient.mount(questions);
    try {
      expect(firstClient.get(questions)).toHaveLength(2);
      expect(secondClient.get(questions)).toHaveLength(2);
      const before = firstClient.get(questions);
      firstClient.set(threadsAtom, [
        { ...waiting, lastVisitedAt: "2026-10-07T00:00:00Z", itemCount: 200 },
        remoteWaiting,
      ]);
      expect(firstClient.get(questions)).toBe(before);
      // Both clients receive the server's updated summary after an answer.
      const answered = [{ ...waiting, hasPendingUserInput: false }, remoteWaiting];
      firstClient.set(threadsAtom, answered);
      secondClient.set(threadsAtom, answered);
      expect(firstClient.get(questions).map((thread) => thread.environmentId)).toEqual([remote]);
      expect(secondClient.get(questions)).toEqual(firstClient.get(questions));
      firstClient.set(shellStateAtom(remote), {
        snapshot: Option.none(),
        status: "cached",
        error: Option.none(),
      });
      expect(firstClient.get(questions)).toEqual([]);
      firstClient.set(shellStateAtom(remote), {
        snapshot: Option.none(),
        status: "live",
        error: Option.none(),
      });
      expect(firstClient.get(questions)).toHaveLength(1);
    } finally {
      disposeFirst();
      disposeSecond();
      firstClient.dispose();
      secondClient.dispose();
    }
  });

  it("excludes archived, deleted, and approval-only threads but retains snoozed questions", () => {
    const waiting = {
      ...presentThreadShell(environmentId, v2ThreadShell),
      hasPendingUserInput: true,
    };
    const threadsAtom = Atom.make([
      { ...waiting, id: ThreadId.make("archived"), archivedAt: "2026-10-07T00:00:00Z" },
      { ...waiting, id: ThreadId.make("deleted"), deletedAt: "2026-10-07T00:00:00Z" },
      {
        ...waiting,
        id: ThreadId.make("approval"),
        hasPendingUserInput: false,
        hasPendingApprovals: true,
      },
      { ...waiting, id: ThreadId.make("snoozed"), snoozedUntil: "2099-01-01T00:00:00Z" },
    ]);
    const questions = createWaitingQuestionThreadsAtom({
      threadsAtom,
      shellStateAtom: () =>
        Atom.make<EnvironmentShellState>({
          snapshot: Option.none(),
          status: "live",
          error: Option.none(),
        }),
    });
    const registry = AtomRegistry.make();
    try {
      expect(registry.get(questions).map((thread) => thread.id)).toEqual(["snoozed"]);
    } finally {
      registry.dispose();
    }
  });
});

function thread(id: string, working: boolean) {
  return {
    id: ThreadId.make(id),
    environmentId,
    createdAt: "2026-06-01T00:00:00.000Z",
    unsettledAt: null,
    latestRun: null,
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    runtime: working
      ? {
          status: "running" as const,
          activeRunId: null,
          providerInstanceId: ProviderInstanceId.make("codex"),
          providerName: "Codex",
          lastError: null,
          updatedAt: "2026-06-01T00:00:00.000Z",
        }
      : null,
  };
}

describe("createInboxReturnTracker", () => {
  it("stamps a thread when it stops working, but never on the first observation", () => {
    const tracker = createInboxReturnTracker();
    tracker.observe([thread("a", true), thread("b", false)]);
    expect(tracker.returnedAt(thread("a", true))).toBeUndefined();
    expect(tracker.returnedAt(thread("b", false))).toBeUndefined();

    tracker.observe([thread("a", false), thread("b", false)]);
    expect(tracker.returnedAt(thread("a", false))).toBeDefined();
    expect(tracker.returnedAt(thread("b", false))).toBeUndefined();
  });

  it("forgets deleted threads and resets when the beta turns off", () => {
    const tracker = createInboxReturnTracker();
    tracker.observe([thread("a", true), thread("b", true)]);
    tracker.observe([thread("a", false), thread("b", false)]);
    tracker.observe([thread("b", false)]);
    expect(tracker.returnedAt(thread("a", false))).toBeUndefined();
    expect(tracker.returnedAt(thread("b", false))).toBeDefined();

    tracker.observe(null);
    expect(tracker.returnedAt(thread("b", false))).toBeUndefined();
    // After a reset the next call is a fresh baseline again.
    tracker.observe([thread("b", true)]);
    tracker.observe([thread("b", false)]);
    expect(tracker.returnedAt(thread("b", false))).toBeDefined();
  });
});

describe("sortWorkingThreadsBySend", () => {
  it("orders by the last message the user sent, not by later runs", () => {
    const sentFirst = {
      ...thread("sent-first", true),
      latestUserAuthoredMessageAt: "2026-06-01T01:00:00.000Z",
      // A wake run requested after the other thread's send.
      latestRun: {
        runId: RunId.make("run:wake"),
        status: "running" as const,
        requestedAt: "2026-06-01T04:00:00.000Z",
        startedAt: "2026-06-01T04:00:00.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    };
    const sentLast = {
      ...thread("sent-last", true),
      latestUserAuthoredMessageAt: "2026-06-01T02:00:00.000Z",
    };
    // Launched by an agent: no user message, so creation time is the send.
    const launched = { ...thread("launched", true), latestUserAuthoredMessageAt: null };
    expect(
      sortWorkingThreadsBySend([launched, sentFirst, sentLast]).map((thread) => thread.id),
    ).toEqual(["sent-last", "sent-first", "launched"]);
  });
});
