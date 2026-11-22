# Routing audit repair

Corporate providers previously shadowed per-service groups: Microsoft captured GitHub/npm, Google captured YouTube, and Amazon captured unrelated AWS resources. Catalog domains displayed by the editor were not always emitted by the core.

The core and editor now share `ferry-core/data/site-catalog.json`. Reviewed service fallbacks precede corporate providers; company-wide Google/Apple/Microsoft rules are ordered last among app rules. Amazon shopping uses the catalog rather than the AWS family provider. Gemini and Meta AI use reviewed service boundaries instead of broad third-party lists. Fixed-output domain/provider rules now have UDP fall-through guards; custom domain groups receive the same protection. Empty provider groups reject, and country matching accepts numeric suffixes without treating AUS/RUS as US or 🇨🇳 as Taiwan.

Overseas mode retains the owner's V77 rule data and defaults, with a separately maintained overlay for Binance, Gate, KuCoin, Bahamut, LiTV, ABEMA, TVer and Niconico. The FC2 substring matcher is replaced with bounded domains. Disabled categories remove overlay routes and guards too.

The owner's actual V77 OKX rules were compared locally without exposing credentials: all 16 existing OKX-related rules and the provider URL are retained. Seven inline roots plus the current MetaCubeX provider already covered the reviewed upstream list. `oklink.com`, `xlayer.tech`, and `okx.com.cdn.cloudflare.net` now also have inline fallbacks, preserving the tested overseas UDP rejection and selected exit.

Validation:
- 47 Rust tests and 56 JavaScript tests pass.
- Four generated PC/Nikki domestic/overseas configurations pass native Mihomo v1.19.34 parsing.
- 2,086 isolated TCP routing probes have zero target mismatches; the previous 70 catalog mismatches are resolved.
- Seven TCP-only-exit UDP probes reject rather than fall through; an empty region chooses REJECT.
- Browser-generated domestic/overseas downloads retain TUN, corrected routes, and the actual V77 OKX baseline.

Runtime probes use localhost mock exits with test TUN disabled. No real financial accounts, Parsec sessions or student endpoints were exercised. Community differences that are merely advertisements, old brands or unrelated third-party domains were not indiscriminately imported. Upstream lists and niche-service dependencies still need maintenance; this is not a claim of permanent domain completeness.

Sources: [MetaCubeX](https://github.com/MetaCubeX/meta-rules-dat), [blackmatrix7](https://github.com/blackmatrix7/ios_rule_script), [v2fly](https://github.com/v2fly/domain-list-community), [Mihomo routing semantics](https://wiki.metacubex.one/config/rules/).
