# Exchange list icons

Replaced the six exchange favicons with locally served transparent vector assets. OKX and Bybit use wider wordmarks; all six reserve the same 40 px column. Mono marks follow the light/dark theme. Color marks use CSS masks or the original SVG colors. Gate and Bitget use a CSS viewport to omit presentation padding / the adjacent wordmark without modifying the original artwork.

Sources inspected on 2026-11-21:

- Binance, OKX, KuCoin: Simple Icons SVG distributions, `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/{binance,okx,kucoin}.svg`. Copied into the repository; no runtime CDN dependency. Simple Icons distributes these under CC0; brand trademarks remain owned by their respective companies.
- Bybit: official inline header wordmark from https://www.bybit.com/en/press (SVG namespace added for standalone loading).
- Gate: https://www.gate.com/media-kit links to https://www.gate.com/cdn/fe/_next/static/media/gate-mark-color.01dd386a.svg . The retrieved official mark retains the blue circle and green square motif; do not infer a different mark from a rebranding headline alone.
- Bitget: official site structured data references https://www.bitget.com/micro-runtime/images/logo-light.svg . Symbol checked against https://brand.bitget.com/logo-system .

Validation: TypeScript check and complete web build passed. All six images decoded successfully in the real application. Inspected dark and light screenshots for transparent backgrounds, readable wordmarks, consistent spacing and correct symbol viewport. Routing rules, selected nodes and credentials are unaffected.
