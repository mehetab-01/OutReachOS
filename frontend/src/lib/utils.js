import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function categoryLabel(cat = "") {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function exportSendLogCSV(rows) {
  const header = "Business,Email,Subject,Sent At,Response\n";
  const body = rows
    .map(
      (r) =>
        `"${r.lead_name}","${r.lead_email}","${r.subject}","${r.sent_at}","${r.smtp_response}"`
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "outreachos-send-log.csv";
  a.click();
  URL.revokeObjectURL(url);
}
