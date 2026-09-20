// Pipeline stages: labels and colors used across the app.
export const STAGES = [
  "NEW",
  "CONTACTED",
  "POSITIVE_RESPONSE",
  "QUOTED",
  "APPOINTMENT",
  "SOLD",
  "NOT_INTERESTED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; bg: string; fg: string; dot: string }> = {
  NEW: { label: "New", bg: "#eef2fd", fg: "#173da6", dot: "#1f4fd1" },
  CONTACTED: { label: "Contacted", bg: "#eceef1", fg: "#3a3e46", dot: "#80858e" },
  POSITIVE_RESPONSE: { label: "Positive response", bg: "#e3effb", fg: "#1d4f8c", dot: "#2f6fb8" },
  QUOTED: { label: "Quoted", bg: "#fbf1de", fg: "#7a4e0e", dot: "#b7791f" },
  APPOINTMENT: { label: "Appointment", bg: "#f1ecfb", fg: "#553c9a", dot: "#7c5cc4" },
  SOLD: { label: "Sold", bg: "#e7f5ec", fg: "#1c6b3c", dot: "#2e9e5b" },
  NOT_INTERESTED: { label: "Not interested", bg: "#f5eeee", fg: "#7a3b3b", dot: "#b25c5c" },
};

export function stageMeta(s?: string | null) {
  return STAGE_META[(s as Stage) || "NEW"] || STAGE_META.NEW;
}
