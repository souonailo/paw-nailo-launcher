# Abrir o PAW Nailo Rust no Windows

## 1. Baixe o código

Para contribuir, crie um fork no GitHub e clone o **seu fork** com Git. Para apenas utilizar, use **Code → Download ZIP** e **Extrair Tudo**. Não execute o `.bat` de dentro do arquivo ZIP compactado.

Escolha uma pasta em que seu usuário tenha permissão de gravação. Mantenha a estrutura completa do projeto, incluindo `src-tauri` e `ui`.

## 2. Abra o inicializador

Execute **`Abrir PAW Nailo.bat`** na raiz da pasta.

- Se o executável já tiver sido compilado (`src-tauri/target/debug/paw-nailo-rust.exe`), o launcher **abre instantaneamente**.
- Na primeira execução a partir do código puro (sem o executável presente), o script invoca o `cargo build` e compila o backend nativo automaticamente.

O launcher não requer Node.js nem Python.

## 3. Pré-requisitos para compilação a partir do código

Se for a primeira vez que você compila um projeto Rust no Windows, você precisará dos seguintes componentes oficiais:

- **Microsoft Edge WebView2**: [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (já pré-instalado na maioria dos sistemas Windows 10 e 11).
- **Rust**: [rustup](https://rustup.rs/), com a toolchain `stable-x86_64-pc-windows-msvc`.
- **Microsoft C++ Build Tools**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), selecionando a carga **Desenvolvimento para desktop com C++** (ferramentas MSVC e Windows SDK).

Os pré-requisitos seguem a [documentação oficial do Tauri v2](https://v2.tauri.app/start/prerequisites/).

## 4. Use suas contas

Na interface do launcher, configure suas contas e clique em **Logar equipe**. 

O aplicativo armazena as credenciais criptografadas via DPAPI nativa do Windows no diretório `%APPDATA%/pawnailo`. Preserve essa pasta durante atualizações para não perder a configuração de suas contas.

## 5. Crie um atalho

Para praticidade no dia a dia, crie um atalho na sua Área de Trabalho apontando diretamente para o arquivo **`Abrir PAW Nailo.bat`**.

## 6. Desenvolvimento e edições

- **Interface visual**: Edite os arquivos dentro da pasta `ui/`. Ao salvar, basta fechar e reabrir o launcher pelo `.bat` para carregar as alterações.
- **Backend nativo**: Ao alterar arquivos em `src-tauri/src/`, reabra pelo `.bat` com o parâmetro `--build` (ou execute `cargo build` na pasta `src-tauri`). A compilação é incremental e reaproveita o cache em `src-tauri/target`.
