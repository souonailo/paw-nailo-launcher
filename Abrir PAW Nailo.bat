@echo off
title PAW Nailo - Launcher
cd /d "%~dp0"

echo Fechando instancia anterior (se houver)...
taskkill /F /IM paw-nailo-rust.exe >nul 2>&1
taskkill /F /IM PAW-Nailo.exe >nul 2>&1

set "EXE="
if exist "%~dp0PAW-Nailo.exe" set "EXE=%~dp0PAW-Nailo.exe"
if not defined EXE if exist "%~dp0paw-nailo-rust.exe" set "EXE=%~dp0paw-nailo-rust.exe"
if not defined EXE if exist "%~dp0bin\paw-nailo-rust.exe" set "EXE=%~dp0bin\paw-nailo-rust.exe"
if not defined EXE if exist "%~dp0src-tauri\target\release\paw-nailo-rust.exe" set "EXE=%~dp0src-tauri\target\release\paw-nailo-rust.exe"
if not defined EXE if exist "%~dp0src-tauri\target\debug\paw-nailo-rust.exe" set "EXE=%~dp0src-tauri\target\debug\paw-nailo-rust.exe"

if "%1"=="--build" goto do_build
if "%1"=="-b" goto do_build

if defined EXE (
    if exist "%EXE%" (
        echo Iniciando PAW Nailo imediatamente...
        start "" "%EXE%"
        exit /b 0
    )
)

:do_build
echo Executavel nao encontrado. Verificando ferramentas de compilacao...

where cargo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================================
    echo  [AVISO] Executavel do PAW Nailo nao encontrado e o Rust nao esta instalado!
    echo ========================================================================
    echo.
    echo  Voce baixou a versao em codigo-fonte do projeto.
    echo.
    echo  - Se voce e um jogador e quer apenas usar o launcher:
    echo    Baixe a versao pronta (Release com executavel compilado) no GitHub:
    echo    https://github.com/souonailo/paw-nailo-launcher/releases
    echo.
    echo  - Se voce e desenvolvedor e quer compilar manualmente:
    echo    1. Instale o Rust: https://rustup.rs/
    echo    2. Instale o Visual Studio C++ Build Tools (com a carga C++):
    echo       https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo ========================================================================
    echo.
    pause
    exit /b 1
)

echo Compilando PAW Nailo Rust...
cd /d "%~dp0src-tauri"
cargo build --release
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Tentando compilacao em modo debug...
    cargo build
)
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================================
    echo  [ERRO NA COMPILACAO] Ocorreu uma falha ao compilar o PAW Nailo.
    echo ========================================================================
    echo.
    echo  Se a mensagem de erro acima citar:
    echo  "error: linker 'link.exe' not found"
    echo.
    echo  Causa: O compilador Rust no Windows depende das Ferramentas de Build C++ (MSVC).
    echo.
    echo  Como resolver:
    echo  1. Baixe o instalador do Visual Studio Build Tools:
    echo     https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo     (Marque a opcao "Desenvolvimento para desktop com C++" e instale)
    echo.
    echo  OU via terminal (PowerShell como Administrador):
    echo     winget install Microsoft.VisualStudio.2022.BuildTools
    echo.
    echo  DICA: Voce tambem pode simplesmente baixar a versao pronta compilada (.zip)
    echo  na aba Releases do GitHub sem precisar compilar nada.
    echo ========================================================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)

set "EXE=%~dp0src-tauri\target\release\paw-nailo-rust.exe"
if not exist "%EXE%" set "EXE=%~dp0src-tauri\target\debug\paw-nailo-rust.exe"

start "" "%EXE%"
exit /b 0
