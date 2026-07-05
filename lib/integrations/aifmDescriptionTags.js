/** Parse `[TAG:value]` markers from AIFM job descriptions. */
export function extractTag(description, tag) {
  if (!description) return null;
  const m = description.match(new RegExp(`\\[${tag}:([^\\]]+)\\]`));
  return m ? m[1].trim() : null;
}
