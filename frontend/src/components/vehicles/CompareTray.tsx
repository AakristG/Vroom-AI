import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { Link } from "react-router-dom";
import { parseVehicleId } from "../../api/vehicles";
import { vehicleName } from "../../lib/spec";
import { COMPARE_LIMIT, useCompare } from "../../state/compare";

export function CompareTray() {
  const { ids, remove } = useCompare();
  const href = `/compare?${ids.map((id) => `v=${encodeURIComponent(id)}`).join("&")}`;
  return (
    <AnimatePresence>
      {ids.length > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(44rem,calc(100%-6.5rem))] items-center gap-3 rounded-full border border-white/10 bg-charcoal/90 p-2 pl-4 text-white shadow-[var(--shadow-lift)] backdrop-blur-xl max-sm:ml-4"
          role="region"
          aria-label="Vehicles selected for comparison"
        >
          <span className="hidden text-xs text-white/60 sm:inline">
            {ids.length}/{COMPARE_LIMIT}
          </span>
          <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {ids.map((id) => (
              <li key={id} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-xs">
                {vehicleName(parseVehicleId(id))}
                <button onClick={() => remove(id)} aria-label={`Remove ${id}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <Link to={href} className="btn-primary shrink-0 px-4 py-2">
            Compare <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
