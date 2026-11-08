import { useEffect, useRef } from "react";

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
