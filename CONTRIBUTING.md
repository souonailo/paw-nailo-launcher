# Guia de Contribuição — PAW Nailo

Agradecemos o interesse em contribuir com o projeto!

## Estrutura do Projeto

- `src-tauri/`: backend nativo em Rust, lógica de IPC, multi-janelas, integração com Tauri v2 e segurança DPAPI.
- `src-tauri/capabilities/`: definições de segurança e permissões do Tauri v2.
- `ui/`: interface frontend (HTML5, CSS3, JavaScript vanilla, assets e ícones).
- `Abrir PAW Nailo.bat`: script de inicialização e compilação rápida para Windows.

O projeto não depende de Node.js, Webpack, Vite ou Python. A interface é estática e consumida diretamente pelo WebView2 em tempo de execução.

## Configuração do Ambiente de Desenvolvimento

1. Instale o [Rust (rustup)](https://rustup.rs/) e as [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com a carga C++ para Windows.
2. Clone o repositório ou seu fork.
3. Para compilar e rodar em modo de desenvolvimento com hot-reload do Tauri:
   ```bash
   cd src-tauri
   cargo tauri dev
   ```
   Ou simplesmente execute:
   ```cmd
   Abrir PAW Nailo.bat
   ```

## Regras de Versionamento e Changelog

Sempre que houver uma atualização, correção de bug ou nova funcionalidade:
1. Mantenha sincronizadas as versões em:
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - `ui/tauri-bridge.js` (`appVersion`)
2. Documente as alterações no topo do [CHANGELOG.md](CHANGELOG.md) seguindo o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## Compilando o Binário Final de Release

Para compilar o binário otimizado para distribuição:
```bash
cd src-tauri
cargo build --release
```
O executável final compilado será gerado em `src-tauri/target/release/paw-nailo-rust.exe`.

## Boas Práticas

- **Segurança**: Nunca faça commit de senhas, credenciais, arquivos `accounts.enc`, cookies ou tokens de sessão.
- **Limpeza**: Respeite o `.gitignore` e não inclua arquivos de depuração temporária ou dumps do jogo.
