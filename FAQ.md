# Perguntas frequentes — PAW Nailo Rust

## Qual arquivo abre o launcher?

Você pode abrir tanto pelo **`Abrir PAW Nailo.bat`** quanto diretamente pelo **`paw-nailo-rust.exe`**. O arquivo `.bat` tem a vantagem adicional de encerrar instâncias anteriores presas antes de iniciar.

## Preciso compilar ou instalar ferramentas de desenvolvimento para jogar?

**Não.** Jogadores não precisam compilar nada. Basta baixar a versão pronta na aba [Releases do GitHub](https://github.com/souonailo/paw-nailo-launcher/releases) (`PAW-Nailo-vX.X.X.zip`), descompactar e abrir o launcher. Ele já vem 100% compilado e abre imediatamente.

## O que fazer se aparecer o erro `linker link.exe not found`?

Esse erro acontece quando alguém baixa o código-fonte cru do GitHub (em vez da versão pronta em Releases) e tenta compilar sem ter o Visual Studio C++ instalado.
- Se você é jogador: baixe o arquivo ZIP pronto na aba **Releases**.
- Se você é desenvolvedor: instale o Visual Studio Build Tools com a opção "Desenvolvimento para desktop com C++" ou execute no PowerShell como Administrador:
  ```powershell
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --config https://aka.ms/vs/17/release/vs_buildtools.exe --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

## Preciso instalar Node.js ou Python?

Não. O launcher possui backend 100% nativo em Rust (Tauri v2) e interface WebView2. Não requer Node.js nem Python para ser executado.

## Onde ficam salvas minhas contas e senhas?

Os dados persistentes e as credenciais são criptografados com a DPAPI nativa do Windows e armazenados em `%APPDATA%/pawnailo`. Suas credenciais nunca são expostas em texto puro.

## Fechar a janela encerra o aplicativo?

Sim. Fechar a janela encerra os processos. Se a opção de minimizar para a bandeja estiver ativada, minimizar oculta o aplicativo na bandeja do sistema (tray).
