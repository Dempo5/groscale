// Shared SMS helpers: character/segment counting and {variable} filling.

// 160 chars for plain text, 70 if it has emoji or special characters.
// Longer messages are split into segments of 153 / 67.
export function smsInfo(text: string) {
  const plain = /^[\x20-\x7E\n\r]*$/.test(text);
  const single = plain ? 160 : 70;
  const multi = plain ? 153 : 67;
  const len = text.length;
  const segments = len === 0 ? 1 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, limit: segments === 1 ? single : multi * segments, segments };
}

export const VARIABLES = ["first_name", "last_name", "agent_name", "city"] as const;

export const SAMPLE_LEAD: Record<string, string> = {
  first_name: "Maria",
  last_name: "Delgado",
  agent_name: "Ethan",
  city: "Orlando",
};

export function fillVariables(text: string, values: Record<string, string> = SAMPLE_LEAD) {
  return text.replace(/\{(\w+)\}/g, (m, key) => values[key] ?? m);
}

// Split text into plain parts and {variable} parts for highlighting.
export function splitVariables(text: string) {
  return text.split(/(\{\w+\})/g).filter(Boolean).map((part) => ({
    text: part,
    isVar: /^\{\w+\}$/.test(part),
  }));
}
