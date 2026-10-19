# PAW Nailo — Multi-Account Launcher

PokeIdle and Poke Ascended World companion launcher for Windows x64, with four account slots, a native Rust/Tauri v2 backend and WebView2.

[Português](README.md) · [Tutorial (PT)](TUTORIAL.md) · [Contributing (PT)](CONTRIBUTING.md)

## Run from source

1. Clone this repository or your fork, or extract **Code → Download ZIP**.
2. Run **`Abrir PAW Nailo.bat`** from the repository root.
3. If already compiled, the launcher **starts immediately**. On the first run without the executable, the script compiles the native Rust backend automatically.

### Prerequisites

- Windows 10/11 x64
- Microsoft Edge WebView2 Runtime (pre-installed on most modern Windows systems)
- Rust stable and Microsoft C++ Build Tools (MSVC) for building the native backend

The application does not require Node.js, Python, or external browser wrappers.

## Updates and forks

The frontend lives in `ui` and is served locally by Tauri. Frontend edits do not need a new binary; simply restart through the batch file. Native Rust changes compile incrementally using Cargo.

Old standalone executables and shortcuts are not updated by this script. Point your shortcuts to the `Abrir PAW Nailo.bat` file.

## Local data

The native backend stores persistent data under `%APPDATA%/pawnailo`, with Windows DPAPI protecting local credential files. Preserve this directory during updates.

Do not commit credentials, tokens, cookies or binaries.

This startup flow supports Windows x64. [MIT license](LICENSE).
