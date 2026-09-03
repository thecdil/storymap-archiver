/**
 * Cascade's `titleStyle` → CSS classes, shared by the cover, title bands,
 * and the immersive global title (docs/polish.md §1.2).
 *
 * Returns two class lists: one for the wrapper box around the text
 * (`.text-background`, optionally tinted light/dark) and one for the text
 * itself (`.title-text` plus its color and shadow modifiers). The viewer's
 * default when no style was authored is white text with a shadow and no
 * box (`applyTitleStyle` → `addClass("text-shadow")`).
 */
export function titleStyleClasses(style) {
  const wrapper = ["text-background"];
  const text = ["title-text"];

  if (!style) {
    text.push("text-light", "text-shadow");
    return { wrapper: wrapper.join(" "), text: text.join(" ") };
  }

  if (style.background === "light" || style.background === "dark") {
    wrapper.push(`background-${style.background}`);
  }
  text.push(style.text === "dark" ? "text-dark" : "text-light");
  if (style.shadow) text.push("text-shadow");

  return { wrapper: wrapper.join(" "), text: text.join(" ") };
}
