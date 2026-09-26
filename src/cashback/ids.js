let counter = 0;

// Unique enough for local-only records; avoids a native dependency so the
// logic stays testable in Node.
export const newId = (prefix = "id") => {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};

export const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
