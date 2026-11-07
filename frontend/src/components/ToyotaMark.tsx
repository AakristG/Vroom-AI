/** Simplified three-ellipse mark for this HackUTD concept. Not an official Toyota asset. */
export function ToyotaMark({ className = "h-8 w-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 52" className={className} aria-hidden>
      <ellipse cx="40" cy="26" rx="36" ry="22" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <ellipse cx="40" cy="26" rx="16" ry="22" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <ellipse cx="40" cy="26" rx="36" ry="9" fill="none" stroke="currentColor" strokeWidth="3.5" />
    </svg>
  );
}
