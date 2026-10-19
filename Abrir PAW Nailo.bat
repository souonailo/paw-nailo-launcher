@echo off
title PAW Nailo - Launcher
cd /d "%~dp0"

echo Fechando instancia anterior (se houver)...
taskkill /F /IM paw-nailo-rust.exe >nul 2>&1

set "EXE=%~dp0src-tauri\target\debug\paw-nailo-rust.exe"

if "%1"=="--build" goto do_build
if "%1"=="-b" goto do_build

if exist "%EXE%" (
    echo Iniciando PAW Nailo imediatamente...
    start "" "%EXE%"
    exit /b 0
)

:do_build
echo Executavel nao encontrado. Compilando PAW Nailo Rust...
cd /d "%~dp0src-tauri"
cargo build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Erro ao compilar.
    pause
    exit /b %ERRORLEVEL%
)

start "" "%EXE%"
exit /b 0
