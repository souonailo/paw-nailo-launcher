# Como Usar o PAW Nailo no Windows

O PAW Nailo pode ser utilizado de duas formas: **como jogador** (usando a versão pronta compilada, sem precisar instalar ferramentas de desenvolvimento) ou **como desenvolvedor** (compilando a partir do código-fonte).

---

## 🎮 Método Recomendado (Para Jogadores)

Se você quer apenas jogar com suas 4 contas sem configurar ambiente de programação:

### 1. Baixe a versão pronta (Release)
1. Acesse a aba de **[Releases no GitHub](https://github.com/souonailo/paw-nailo-launcher/releases)**.
2. Baixe o arquivo **`PAW-Nailo-vX.X.X.zip`** da versão mais recente.
3. Clique com o botão direito no arquivo baixado e selecione **Extrair Tudo** para uma pasta de sua preferência.
   > ⚠️ **Atenção**: Nunca execute o launcher de dentro do arquivo ZIP sem extrair antes.

### 2. Inicie o launcher
- Dê dois cliques em **`Abrir PAW Nailo.bat`** (ou diretamente no executável **`paw-nailo-rust.exe`**).
- O launcher abrirá **instantaneamente em menos de 1 segundo**.
- Você **não** precisa instalar Rust, Visual Studio, Node.js nem Python! O único requisito é o Microsoft Edge WebView2, que já vem instalado de fábrica no Windows 10 e 11.

### 3. Crie um atalho
- Clique com o botão direito em `Abrir PAW Nailo.bat` (ou em `paw-nailo-rust.exe`) e selecione **Enviar para → Área de trabalho (criar atalho)**.

---

## 🛠️ Método para Desenvolvedores (Compilar do Código-Fonte)

Se você for modificar o código ou contribuir com o projeto:

### 1. Obtenha o código
- Clone o repositório ou seu fork:
  ```bash
  git clone https://github.com/souonailo/paw-nailo-launcher.git
  ```

### 2. Pré-requisitos de Compilação
Para compilar projetos nativos em Rust no Windows, você precisa de:
- **Rust**: [rustup](https://rustup.rs/) (toolchain `stable-x86_64-pc-windows-msvc`).
- **Microsoft C++ Build Tools**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), selecionando a carga **Desenvolvimento para desktop com C++** (ferramentas MSVC e Windows SDK).
  - *Dica via terminal*: Você pode instalar diretamente executando no PowerShell como Administrador:
    ```powershell
    winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --config https://aka.ms/vs/17/release/vs_buildtools.exe --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    ```

### 3. Compilação e Execução
- Execute **`Abrir PAW Nailo.bat`** na raiz da pasta. Se o executável ainda não existir, o script invocará o `cargo build` e compilará o backend nativo.
- Para compilar a versão final otimizada e gerar o arquivo ZIP de distribuição, execute **`empacotar-release.bat`**.

---

## 🔐 Segurança e Dados Locais

- O aplicativo armazena suas credenciais criptografadas via **DPAPI nativa do Windows** no diretório `%APPDATA%/pawnailo`.
- Suas senhas nunca ficam em texto puro no disco.
- Ao atualizar de versão, **não apague** a pasta `%APPDATA%/pawnailo` para preservar suas contas salvas.
