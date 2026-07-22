export const MEMBER_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#a855f7", "#14b8a6", "#f97316", "#6366f1",
];

export function colorForUser(id) {
  let hash = 0;
  for (let i = 0; i < (id || "").length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

export function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
