import type { ProviderAttribution } from "@waylit/map-provider";

/**
 * Draws a provider's text credits into the credits strip as plain links. Used by the fallback,
 * whose credits are fixed text. Cesium draws its own live credits (including the Google and
 * Cesium ion logos) through its credit display, so this is not used for it.
 *
 * Returns a function that removes what it added.
 */
export function renderCredits(
  container: HTMLElement,
  attributions: readonly ProviderAttribution[],
): () => void {
  const list = container.ownerDocument.createElement("div");
  list.className = "wl-credit-list";
  list.dataset.testid = "map-credits";
  attributions.forEach((credit, index) => {
    const item = container.ownerDocument.createElement("span");
    item.className = "wl-credit";
    if (index > 0) item.append(" ");
    if (credit.prefix) item.append(`${credit.prefix} `);
    if (credit.url) {
      const link = container.ownerDocument.createElement("a");
      link.href = credit.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = credit.text;
      item.append(link);
    } else {
      item.append(credit.text);
    }
    list.append(item);
  });
  container.append(list);
  return () => {
    list.remove();
  };
}
