# iii — Quick Start

One-page reference for running everything in this repo after a fresh install.

---

## Prerequisites (already installed)

| Tool | Version | How you got it |
|------|---------|----------------|
| Rust | 1.95.0 | `rustup` (pre-existing) |
| Node.js | v22.16.0 | pre-existing |
| pnpm | 10.19.0 | pre-existing |
| Python | 3.13.3 | pre-existing |
| uv | 0.11.17 | installed via `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Mintlify CLI | latest | installed via `npm install -g mintlify` |

---

## One-Time Setup

```bash
# JS/TS dependencies
pnpm install --frozen-lockfile

# Python SDK dependencies
cd sdk/packages/python/iii && uv sync --extra dev

# Pre-commit hooks (optional)
make install-hooks
```

---

## Build Everything

```bash
# JS/TS packages (SDKs, console frontend, docs, website, blog)
pnpm build

# Rust engine + console binary
cargo build --release -p iii
cargo build --release -p iii-console

# Or build all Rust targets (macOS-compatible crates only)
cargo check -p iii -p iii-sdk -p iii-shell-proto -p scaffolder-core -p motia-tools
```

**Note:** The full workspace includes Linux-only crates (`iii-worker`, `msb_krun_utils`) with KVM sandbox code. These intentionally fail on macOS — only the engine and core SDKs are expected to build on macOS.

---

## Run the Engine

```bash
# Start with built-in defaults (no config.yaml needed)
./target/release/iii --use-default-config
```

| Port | Service |
|------|---------|
| 49134 | WebSocket (worker connections) |
| 3111  | HTTP API |
| 3112  | Stream API |
| 9464  | Prometheus metrics |

---

## Run the Console

In a **second terminal** while the engine is running:

```bash
./target/release/iii-console
```

Then open [http://localhost:3113](http://localhost:3113) in your browser.

---

## Dev Servers (Hot Reload)

```bash
# Console frontend
pnpm dev:console

# Documentation site
pnpm dev:docs

# Website
pnpm dev:website
```

---

## Tests

```bash
# Engine tests
cargo test -p iii --all-features

# Rust SDK tests (requires running engine)
cargo test -p iii-sdk --all-features

# Node.js SDK tests (requires running engine)
pnpm test:sdk-node

# Python SDK tests (requires running engine)
cd sdk/packages/python/iii && uv run pytest
```

---

## Key Files

| File | Purpose |
|------|---------|
| `engine/iii-config.yaml` | Example engine configuration |
| `engine/config.yaml` | Default config path the engine reads |
| `target/release/iii` | Engine + CLI binary (34 MB) |
| `target/release/iii-console` | Console server binary (12 MB) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `No space left on device` during `cargo build` | Free disk space. `cargo clean` in the repo, or delete old `target/` dirs in other projects. |
| `cannot find module kvm_bindings` | Normal on macOS — skip those crates with `cargo build -p iii` instead of `cargo build --workspace`. |
| `mint: command not found` | We updated `docs/package.json` to use `mintlify`. Run `npm install -g mintlify` if needed. |
| `pnpm` not found in shell | `export PATH="/Users/kirtissiemens/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"` |

---

## Project Structure Reminder

```
engine/          — Rust engine (ELv2)
sdk/             — SDKs for Node.js, Python, Rust (Apache-2.0)
console/         — Developer console (React + Rust)
skills/          — Agent-readable skill references
docs/            — Documentation (Mintlify)
website/         — iii.dev website
blog/            — Blog site
```

---

*Generated on May 29, 2026*
