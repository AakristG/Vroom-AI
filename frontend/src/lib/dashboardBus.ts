import { useEffect, useRef } from "react";
import { useDashboardState } from "../spacetime/client";

/**
 * Lets Vroom AI drive the Insights dashboards ("What if I paid a little more?" and
 * "Lower payment, longer term?"). The assistant applies a command; any mounted dashboard
 * reacts at once, and a dashboard that mounts later (the user opens Insights afterwards)
 * picks up the latest command for its part.
 */
export interface DashboardCommand {
  simulator?: { extra_monthly?: number; lump_sum?: number };
  scenario?: { extend_months?: number };
}

type Part = keyof DashboardCommand;
const EVENT = "vroom:dashboard";
const pending: Partial<DashboardCommand> = {};

export function applyDashboard(cmd: DashboardCommand) {
  if (cmd.simulator) pending.simulator = cmd.simulator;
  if (cmd.scenario) pending.scenario = cmd.scenario;
  window.dispatchEvent(new CustomEvent<DashboardCommand>(EVENT, { detail: cmd }));
}

/** Run `handler` for commands aimed at `part`, including one issued before this component mounted. */
export function useDashboardCommand<P extends Part>(part: P, handler: (value: NonNullable<DashboardCommand[P]>) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const queued = pending[part];
    if (queued) {
      delete pending[part];
      ref.current(queued as NonNullable<DashboardCommand[P]>);
    }
    const listener = (e: Event) => {
      const value = (e as CustomEvent<DashboardCommand>).detail?.[part];
      if (value) {
        delete pending[part];
        ref.current(value as NonNullable<DashboardCommand[P]>);
      }
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [part]);
}

const FRESH_MS = 15 * 60_000;
const appliedKey = (customerId: string) => `vroom-dashboard-rev:${customerId}`;

function readApplied(customerId: string): number {
  try {
    return Number(sessionStorage.getItem(appliedKey(customerId)) || 0);
  } catch {
    return 0;
  }
}

function writeApplied(customerId: string, revision: number) {
  try {
    sessionStorage.setItem(appliedKey(customerId), String(revision));
  } catch {
    /* storage unavailable: commands may re-apply once, which is harmless */
  }
}

function parse<T>(raw: string): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Applies the agent's dashboard commands from SpacetimeDB. A What-if change made in the chat or during
 * a voice call shows up on every open tab and device; each browser applies each revision once, and
 * ignores commands older than 15 minutes so a stale one never overrides what the customer set.
 */
export function DashboardSync({ customerId }: { customerId: string | null }) {
  const { row } = useDashboardState(customerId);
  const revision = row ? Number(row.revision) : 0;
  useEffect(() => {
    if (!customerId || !row || revision <= readApplied(customerId)) return;
    writeApplied(customerId, revision);
    if (Date.now() - Date.parse(row.updatedAt) > FRESH_MS) return;
    applyDashboard({
      simulator: parse<DashboardCommand["simulator"]>(row.simulatorJson),
      scenario: parse<DashboardCommand["scenario"]>(row.scenarioJson),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, revision]);
  return null;
}
