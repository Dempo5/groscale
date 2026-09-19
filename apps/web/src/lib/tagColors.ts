// Soft background + readable text color for each named tag color.
// Your API stores colors as names ("red", "blue", ...), so this turns
// a name into the Attio-style chip colors used across the app.
import type { TagColor } from "./api";

const PALETTE: Record<TagColor, { bg: string; fg: string }> = {
  red: { bg: "#fde4e4", fg: "#9b1c1c" },
  orange: { bg: "#fcebd3", fg: "#8a4b08" },
  amber: { bg: "#fbf1d0", fg: "#7a5a07" },
  green: { bg: "#ddf3e4", fg: "#1c6b3c" },
  teal: { bg: "#d8f1ef", fg: "#11625c" },
  blue: { bg: "#e3ebfd", fg: "#173da6" },
  indigo: { bg: "#e5e7fc", fg: "#3730a3" },
  violet: { bg: "#eee7fb", fg: "#553c9a" },
  pink: { bg: "#fbe4ef", fg: "#9d174d" },
  gray: { bg: "#eceef1", fg: "#3a3e46" },
};

export function tagChipColors(color?: TagColor | null) {
  return (color && PALETTE[color]) || PALETTE.gray;
}
