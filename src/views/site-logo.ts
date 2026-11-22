import { el } from "../dom";
import assets from "../site-icon-assets.json";

/** Shared list icon; keep a stable placeholder while loading or on failure. */
export function domainLogo(domain: string): HTMLElement {
  const host = domain.trim().toLowerCase();
  const asset = (assets as Record<string, {src: string; tone: string; color?: string; width?: number; badgeWidth?: number; crop?: {width: number; height: number; left: number; top: number}}>)[host];
  const badgeWidth = asset?.badgeWidth ?? 28;
  const badge = el("span", { class: `site-badge site-logo ${asset ? `site-logo--${asset.tone}` : ""}`, "aria-hidden": "true", style: `display:inline-grid;place-items:center;width:${badgeWidth}px;height:28px;flex:0 0 ${badgeWidth}px;background:transparent;border:0;box-shadow:none` });
  const fallback = el("span", { style: "grid-area:1/1" }, [host === "sls.net" ? "SLS" : host.slice(0, 1).toUpperCase() || "?"]);
  badge.append(fallback);
  if (host === "sls.net") return badge;
  // Accept only hostname data, never credentials, paths or arbitrary image URLs.
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return badge;
  const src = asset ? `${/^https?:$/.test(location.protocol) ? "" : "https://ferrylite.cc"}${asset.src}` : `https://icon.horse/icon/${host}`;
  // Local transparent SVG masks retain brand colors without tinting backgrounds.
  const crop = asset?.crop;
  const maskPosition = crop ? `${crop.left}px ${crop.top}px/${crop.width}px ${crop.height}px` : "center/contain";
  const mark = asset?.color ? el("span", { hidden: "", style: `grid-area:1/1;width:${asset.width ?? 24}px;height:24px;background:${asset.color};mask:url("${src}") ${maskPosition} no-repeat;-webkit-mask:url("${src}") ${maskPosition} no-repeat` }) : null;
  if (mark) badge.append(mark);
  const img = el("img", {
    src, alt: "", width: String(asset?.width ?? 24), height: "24", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer",
    style: "grid-area:1/1;object-fit:contain;opacity:0",
  }) as HTMLImageElement;
  img.onload = () => { fallback.hidden = true; if (mark && !alternate) mark.hidden = false; else img.style.opacity = "1"; };
  let alternate = false;
  img.onerror = () => {
    if (!alternate) {
      alternate = true;
      badge.classList.remove("site-logo--paper", "site-logo--mono");
      if (crop && !mark) img.style.cssText = "grid-area:1/1;object-fit:contain;opacity:0;width:24px;height:24px";
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } else img.remove();
  };
  if (crop && !mark) {
    // Viewport only: keep the official asset intact, omit its presentation padding.
    const viewport = el("span", { style: "grid-area:1/1;position:relative;width:24px;height:24px;overflow:hidden" });
    img.style.cssText += `;position:absolute;width:${crop.width}px;height:${crop.height}px;max-width:none;left:${crop.left}px;top:${crop.top}px`;
    viewport.append(img);
    badge.append(viewport);
  } else badge.append(img);
  return badge;
}
