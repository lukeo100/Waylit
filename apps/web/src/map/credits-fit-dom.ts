import { nextCreditsMode, type CreditsMode } from "./credits-fit";

/**
 * Watches the Cesium credits in the credits strip and asks for a mode change when the credit
 * text no longer fits on one line (see `nextCreditsMode`). The logos are never touched. Returns
 * a function that stops watching.
 *
 * `apply("link")` should move the text behind Cesium's "Data attribution" link and
 * `apply("inline")` should show it inline again.
 */
export function watchCreditsFit(
  strip: HTMLElement,
  apply: (mode: CreditsMode) => void,
): () => void {
  let mode: CreditsMode = "inline";
  let collapsedAtWidthPx: number | undefined;
  let frame = 0;

  const check = (): void => {
    frame = 0;
    const text = strip.querySelector<HTMLElement>(".cesium-credit-textContainer");
    const widthPx = strip.clientWidth;
    const textOverflows = text !== null && text.scrollWidth > text.clientWidth + 1;
    const next = nextCreditsMode({ mode, textOverflows, widthPx, collapsedAtWidthPx });
    if (next === mode) return;
    mode = next;
    collapsedAtWidthPx = next === "link" ? widthPx : undefined;
    apply(next);
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(check);
  };

  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  resize?.observe(strip);
  // Credits arrive and change as tiles load.
  const mutations = new MutationObserver(schedule);
  mutations.observe(strip, { childList: true, subtree: true, characterData: true });
  schedule();

  return () => {
    resize?.disconnect();
    mutations.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
  };
}
