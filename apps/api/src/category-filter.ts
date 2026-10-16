type CategoryKey = { slug: string; name: string; sectionKey?: string };

export function categoryFilmFilter(category: CategoryKey) {
  const terms = new Set([category.slug, category.name]);
  if (category.sectionKey === "genre") {
    category.name.split(/\s*&\s*/).forEach(term => terms.add(term));
  }
  const patterns = [...terms].filter(Boolean).map(term => new RegExp(`^${term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
  return {
    status: "published",
    visibility: "public",
    $or: [{ categories: { $in: patterns } }, { genres: { $in: patterns } }],
  };
}
