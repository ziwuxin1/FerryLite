<div align="center">

<img src="assets/logo.png" alt="FerryLite" width="116" />

# FerryLite · YAML configuration generator

</div>

**FerryLite** provides browser and desktop editions in this repository. Generate and edit Clash YAML profiles for Windows / macOS / Linux clients and routers running Mihomo / Clash Meta, including OpenClash and Nikki.

**Use the website: [ferrylite.cc](https://ferrylite.cc/)** · [Web build guide](web/README.md)

The browser edition processes subscriptions and proxy credentials locally using WASM. The desktop app opens directly to the generation form.

[中文](README.zh-CN.md) · [Usage guide](doc/Ferry-1.4.3-使用说明.md)

## Features

- Separate desktop and router TUN, DNS and listener settings.
- US upstream to US residential proxy; Taiwan upstream to Taiwan residential proxy for selected exchanges.
- Built-in ofiii routing and per-app proxy groups.
- SOCKS share-link import.
- Browser YAML import, source preview/editing, validation and safe corrections.
- Custom groups, per-site domain management, service-specific domain completion and logos.
- Browser routing drafts and Reset; credentials and subscription URLs are not saved in drafts.
- Generation and export only: no dashboard, health checks, Claude process controls or background tray.

Import output into your client and verify overrides and routing. Taiwan residential profiles require selecting a Taiwan upstream on first use.

## Build

Requires Node.js 22 and Rust; desktop builds require Windows. Web builds also require wasm-pack and the wasm32-unknown-unknown target. See the web build guide for setup.

- npm ci
- npm run tauri build
- npm run build:web
- npm run test:editor
- cargo test --manifest-path ferry-core/Cargo.toml

Desktop releases are portable EXE only; installer generation is disabled. Desktop output: src-tauri/target/release/; web output: dist-web/.

Both versions share ferry-core. Exported YAML contains credentials and should be stored privately.

Repository layout: `web/` contains the website, `src/` the shared forms and YAML editing code, `ferry-core/` the Rust generation engine, `ferry-wasm/` its browser binding, and `src-tauri/` the desktop shell. GitHub Actions builds a static `ferrylite-web` artifact; publishing the production site is a separate step.

[MIT](LICENSE) © ziwuxin1
