# src-tauri

Generate the Rust crate with:

```bash
cd packaging/client
npm create tauri-app@latest . -- --template vanilla
# or: cargo install create-tauri-app && create-tauri-app
```

Then merge `tauri.conf.json` from this folder and implement commands:

- `discover_servers()` — browse `_nkdentalsoft._tcp.local.` (mdns-sd / bonjour)
- `get_cert_fingerprint(url)` — SHA-256 of peer cert for TOFU
- `navigate_to_server(url)` — load clinic UI in the webview

See `packaging/README.md`.
