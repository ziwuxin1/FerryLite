import { el } from "../dom";

/** Shared list icon; keep a stable placeholder while loading or on failure. */
export function domainLogo(domain: string): HTMLElement {
  const host = domain.trim().toLowerCase();
  const badge = el("span", { class: "site-badge", "aria-hidden": "true", style: "display:inline-grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:6px;overflow:hidden" });
  const fallback = el("span", { style: "grid-area:1/1" }, [host.slice(0, 1).toUpperCase() || "?"]);
  badge.append(fallback);
  // Accept only hostname data, never credentials, paths or arbitrary image URLs.
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return badge;
  const img = el("img", {
    src: `https://icon.horse/icon/${host}`, alt: "", width: "24", height: "24", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer",
    style: "grid-area:1/1;object-fit:contain;opacity:0",
  }) as HTMLImageElement;
  img.onload = () => { fallback.hidden = true; img.style.opacity = "1"; badge.style.background = "#fff"; };
  let alternate = false;
  img.onerror = () => {
    if (!alternate) {
      alternate = true;
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } else img.remove();
  };
  badge.append(img);
  return badge;
}
