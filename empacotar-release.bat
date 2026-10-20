@echo off
title PAW Nailo - Empacotador de Release
cd /d "%~dp0"

echo ===================================================
echo  Empacotando versao Release para distribuicao
echo ===================================================
echo.

echo 1. Compilando binario em modo Release otimizado...
cd /d "%~dp0src-tauri"
cargo build --release
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao compilar release!
    pause
    exit /b %ERRORLEVEL%
)

cd /d "%~dp0"
set "DIST_DIR=%~dp0dist\PAW-Nailo"
set "VER=1.0.15"
for /f "tokens=3 delims= " %%v in ('findstr /r "^version = " "%~dp0src-tauri\Cargo.toml"') do set "VER=%%~v"
set "ZIP_FILE=%~dp0dist\PAW-Nailo-v%VER%.zip"
set "GENERIC_ZIP=%~dp0dist\PAW-Nailo.zip"

echo 2. Criando pasta de distribuicao em %DIST_DIR%...
if not exist "%~dp0dist" mkdir "%~dp0dist"
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\ui"

echo 3. Copiando executavel e arquivos essenciais...
copy /y "%~dp0src-tauri\target\release\paw-nailo-rust.exe" "%DIST_DIR%\paw-nailo-rust.exe" >nul
copy /y "%~dp0src-tauri\target\release\paw-nailo-rust.exe" "%DIST_DIR%\PAW-Nailo.exe" >nul
copy /y "%~dp0src-tauri\target\release\paw-nailo-rust.exe" "%~dp0PAW-Nailo.exe" >nul
copy /y "%~dp0Abrir PAW Nailo.bat" "%DIST_DIR%\" >nul
copy /y "%~dp0COMO USAR.txt" "%DIST_DIR%\" >nul
copy /y "%~dp0icon.ico" "%DIST_DIR%\" >nul
copy /y "%~dp0icon.png" "%DIST_DIR%\" >nul
copy /y "%~dp0README.md" "%DIST_DIR%\" >nul

echo 4. Copiando pasta ui...
xcopy "%~dp0ui" "%DIST_DIR%\ui" /e /i /y /q >nul

echo 5. Gerando arquivo ZIP portatil...
powershell -NoProfile -Command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force"
copy /y "%ZIP_FILE%" "%GENERIC_ZIP%" >nul

echo.
echo ===================================================
echo  SUCESSO! Release gerada em:
echo  %ZIP_FILE%
echo ===================================================
echo  Basta disponibilizar esse arquivo ZIP para os usuarios
echo  na aba Releases do GitHub ou enviar diretamente para eles!
echo  Eles so precisarao extrair o ZIP e rodar 'Abrir PAW Nailo.bat'
echo  sem precisar de Rust ou ferramentas de compilacao.
echo ===================================================
pause
