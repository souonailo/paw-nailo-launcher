# PAW Nailo — Multi-Account Launcher

PokeIdle and Poke Ascended World companion launcher for Windows x64, with four account slots, a native Rust/Tauri v2 backend and WebView2.

[Português](README.md) · [Tutorial (PT)](TUTORIAL.md) · [Contributing (PT)](CONTRIBUTING.md)

## How to run

### 🎮 For Players (Recommended)
1. Download the latest `PAW-Nailo-vX.X.X.zip` from [Releases](https://github.com/souonailo/paw-nailo-launcher/releases).
2. Extract the ZIP to any folder.
3. Run **`Abrir PAW Nailo.bat`** (or `paw-nailo-rust.exe`). The launcher starts **immediately** with zero setup!

### 🛠️ For Developers (Build from source)
1. Clone this repository or your fork.
2. Ensure you have **Rust** ([rustup](https://rustup.rs/)) and **Microsoft C++ Build Tools** (MSVC) installed.
3. Run **`Abrir PAW Nailo.bat`** to build and run, or `empacotar-release.bat` to package a release zip.

## Updates and forks

The frontend lives in `ui` and is served locally by Tauri. Frontend edits do not need a new binary; simply restart through the batch file. Native Rust changes compile incrementally using Cargo.

Old standalone executables and shortcuts are not updated by this script. Point your shortcuts to the `Abrir PAW Nailo.bat` file.

## Local data

The native backend stores persistent data under `%APPDATA%/pawnailo`, with Windows DPAPI protecting local credential files. Preserve this directory during updates.

Do not commit credentials, tokens, cookies or binaries.

This startup flow supports Windows x64. [MIT license](LICENSE).
