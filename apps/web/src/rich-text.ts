const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "SPAN", "FONT"]);

export function sanitizeRichText(value: string) {
  const parsed = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return "";
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    const color = element.getAttribute("color") ?? "";
    const size = element.getAttribute("size") ?? "";
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (element.tagName === "FONT" && /^#[0-9a-f]{6}$/i.test(color)) element.setAttribute("color", color);
    if (element.tagName === "FONT" && /^[1-7]$/.test(size)) element.setAttribute("size", size);
  }
  return root.innerHTML;
}
