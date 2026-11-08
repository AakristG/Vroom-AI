/** Lightweight cross-component refresh for My Toyota appointments / pending actions. */
export const ACTIVITY_REFRESH_EVENT = "tfs-activity-refresh";

export function requestActivityRefresh() {
  window.dispatchEvent(new Event(ACTIVITY_REFRESH_EVENT));
}
