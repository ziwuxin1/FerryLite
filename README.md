<div align="center">

<img src="assets/logo.png" alt="Ferry" width="116" />

# Ferry

**Smart split‑routing built for going back to China — handle urgent US matters with ease.**

专为回国设计的智能分流，稳稳处理美国急事

![version](https://img.shields.io/badge/version-1.1.2-ff5c8a)
![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6)
![framework](https://img.shields.io/badge/framework-Tauri%202-24C8DB)
![stack](https://img.shields.io/badge/stack-Rust%20%2B%20TS-f74c00)
![license](https://img.shields.io/badge/license-MIT-22c55e)

English · [中文](README.zh-CN.md)

</div>

---

**Ferry** helps people back in China reliably reach **Claude** and US‑only services (banks, brokerages, insurance, government portals…) with low ban risk — by chaining your traffic through a clean US **residential** IP.

```text
Your PC → ClashMi (local proxy, TUN) → airport US node → US residential static IP (clean exit) → target
Before launch, Ferry measures the real exit IP through the Claude‑group path and only proceeds when it matches your baseline IP.
```

## ✨ Features

- **Per‑app split routing** — every app (Claude, banks, brokerages, streaming, dev tools, Parsec…) becomes its own selectable proxy group; switch each exit independently in zashboard.
- **One‑click health check** — verifies the Clash API, that the real exit IP == your baseline, and link latency / stability.
- **Exit‑IP calibration** — residential gateways often have a domain ≠ the real exit IP; one click sets the echoed IP as the baseline.
- **Share‑link import** — paste a `socks://` link and it auto‑fills server / port / username / password.
- **Launch & safe‑stop Claude** — CLI, desktop app, or web, with a clean shutdown that only kills Claude (never your browser or ClashMi).

## ⬇️ Download

Grab the latest build from [**Releases**](../../releases/latest):

| File | Use |
|---|---|
| `Ferry-x.y.z.exe` | **Single‑file portable** — just double‑click (needs WebView2, built into Windows 10/11). |
| `Ferry-x.y.z-setup.exe` | Installer with a Start‑menu shortcut. |

## 🔧 Build from source

Requirements: Node 18+, Rust (stable), Windows.

```powershell
npm install
npm run tauri build   # → src-tauri/target/release/  (portable exe + NSIS installer)
```

## 🧱 How it works

A single Tauri `.exe` (Rust backend + vanilla TypeScript frontend):

- **Config generator** injects your airport subscription + residential‑IP node into a Clash template via text anchors (never `load→dump`, so comments & anchors survive), producing a ready‑to‑import `yaml`.
- **Dashboard** runs the pre‑launch health check, then starts / safely stops Claude.
- Routing is rule‑based with one selectable group per app, so you choose each exit (US residential / airport US / HK / TW / …) in zashboard.

## 📄 License

[MIT](LICENSE) © ziwuxin1
