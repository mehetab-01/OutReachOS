const STATUS_MAP = {
  pending:  { label: "Pending",    className: "bg-gray-100 text-gray-500" },
  queued:   { label: "Queued",     className: "bg-indigo-50 text-indigo-600" },
  drafting: { label: "Drafting…",  className: "bg-amber-50 text-amber-700 animate-pulse" },
  drafted:  { label: "Drafted",    className: "bg-emerald-50 text-emerald-700" },
  approved: { label: "Approved",   className: "bg-green-100 text-green-800" },
  skipped:  { label: "Skipped",    className: "bg-gray-100 text-gray-500" },
  sent:     { label: "Sent",       className: "bg-blue-50 text-blue-700" },
  error:    { label: "Error",      className: "bg-red-50 text-red-700" },
};

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors duration-200 ${s.className}`}>
      {s.label}
    </span>
  );
}
