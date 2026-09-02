const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(input) {
  const slug = input
    .toString()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "story";
}
