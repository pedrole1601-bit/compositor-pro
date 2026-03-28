<div align="center">

<img src="docs/logo.png" alt="Compositor Pro" width="120" />

# Compositor Pro

**Sistema de composição visual em tempo real para o Holyrics**

Crie cenas com múltiplos frames (câmera, vídeo, imagem, texto, relógio, contador, cor, URL e feed do Holyrics), controle tudo pelo painel e exiba no telão da igreja — com transições suaves e gatilhos automáticos.

[![Licença MIT](https://img.shields.io/badge/licença-MIT-blue.svg)](#licença)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Holyrics 2.24.0+](https://img.shields.io/badge/Holyrics-2.24.0%2B-orange.svg)](https://holyrics.com.br/)

</div>

---

## Índice

- [Sobre](#sobre)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
  - [1. Baixar o projeto](#1-baixar-o-projeto)
  - [2. Instalar dependências](#2-instalar-dependências)
  - [3. Compilar o projeto](#3-compilar-o-projeto)
  - [4. Testar o servidor](#4-testar-o-servidor)
- [Configuração no Holyrics](#configuração-no-holyrics)
  - [Passo 1 — Criar o API Item](#passo-1--criar-o-api-item)
  - [Passo 2 — Criar o receptor do Compositor](#passo-2--criar-o-receptor-do-compositor)
  - [Passo 3 — Configurar o API Item](#passo-3--configurar-o-api-item)
  - [Passo 4 — Adicionar à barra de favoritos](#passo-4--adicionar-à-barra-de-favoritos)
  - [Passo 5 — Testar](#passo-5--testar)
- [Inicialização automática](#inicialização-automática)
  - [Opção A — Iniciar com o Windows (recomendado)](#opção-a--iniciar-com-o-windows-recomendado)
  - [Opção B — Iniciar manualmente](#opção-b--iniciar-manualmente)
- [Configuração de gatilhos](#configuração-de-gatilhos)
  - [Passo 1 — Criar o receptor de gatilho](#passo-1--criar-o-receptor-de-gatilho)
  - [Passo 2 — Criar o gatilho](#passo-2--criar-o-gatilho)
  - [Exemplos de gatilhos](#exemplos-de-gatilhos)
- [Guia de uso do Painel](#guia-de-uso-do-painel)
  - [Cenas](#cenas)
  - [Frames (camadas)](#frames-camadas)
  - [Tipos de frame](#tipos-de-frame)
  - [Transições](#transições)
  - [Biblioteca de mídia](#biblioteca-de-mídia)
  - [Atalhos de teclado](#atalhos-de-teclado)
  - [Salvar e carregar projetos](#salvar-e-carregar-projetos)
- [Exibição no telão](#exibição-no-telão)
- [API do servidor](#api-do-servidor)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Resolução de problemas](#resolução-de-problemas)
- [Contribuição](#contribuição)
- [Licença](#licença)
- [Créditos](#créditos)

---

## Sobre

O **Compositor Pro** é um sistema de composição visual em tempo real que se integra ao [Holyrics](https://holyrics.com.br/). Ele permite criar cenas complexas com múltiplas camadas (câmera ao vivo, vídeo, imagens, texto, letras do Holyrics, relógio, contador, cores e páginas web), organizá-las visualmente num painel de controle e exibi-las no telão da igreja.

O operador monta as cenas no painel, e pode trocar entre elas manualmente ou automaticamente através de gatilhos no Holyrics — por exemplo, ao iniciar uma música, trocar automaticamente para a cena "Louvor" com câmera + letras.

O Compositor Pro funciona como um servidor local. O Holyrics se comunica com ele via HTTP, e o painel e o telão são páginas web acessíveis em qualquer navegador da rede local.

---

## Funcionalidades

- **Múltiplas cenas** com troca instantânea ou com transições animadas
- **9 tipos de frame:** Câmera, Vídeo, Imagem, Texto, Cor, Relógio, Contador, URL e Holyrics
- **Câmera ao vivo** com seletor de dispositivo no painel
- **Transições suaves:** Fade, Slide (4 direções), Zoom, Blur, Wipe, com duração configurável
- **Arrastar e redimensionar** frames diretamente no canvas do painel
- **Sistema de camadas** com reordenação por drag-and-drop
- **Propriedades editáveis:** opacidade, borda, raio, cor, fonte, ajuste, etc.
- **Gatilhos automáticos** via Holyrics — troca de cena ao apresentar músicas, versículos, imagens, etc.
- **Biblioteca de mídia** com upload de imagens e vídeos
- **Salvar/carregar projetos** em arquivo JSON
- **Múltiplas resoluções** (1920×1080, 4K, vertical, quadrado, etc.)
- **Inicialização automática** com o Windows — servidor roda em segundo plano
- **Botão integrado** na barra de favoritos do Holyrics

---

## Arquitetura

```text
┌─────────────┐       HTTP/WS      ┌──────────────────┐
│  Holyrics   │  ◄──────────────────►  │  Compositor Pro  │
│ (programa)  │    API Items/Gatilhos   │    (servidor)    │
└─────────────┘                         └────────┬─────────┘
                                                 │
                                     ┌──────────┼──────────┐
                                     │          │          │
                               ┌─────▼────┐ ┌───▼────┐ ┌──▼───┐
                               │  Painel  │ │  Telão  │ │  API  │
                               │ (editor) │ │(público)│ │(REST)│
                               └──────────┘ └────────┘ └──────┘
                                  :3000/painel    :3000/      :3000/api
```

- **Servidor** — Node.js com Express (HTTP na porta 3000) e WebSocket (porta 3001)
- **Painel** — Interface web para o operador montar e controlar as cenas
- **Telão** — Página web que exibe a cena ativa em tempo real (tela pública)
- **Holyrics** — Se comunica via API Items e Gatilhos (requisições HTTP POST)

---

## Pré-requisitos

Antes de instalar o Compositor Pro, você precisa ter instalado:

**1. Node.js (versão 18 ou superior)**

Baixe e instale a versão LTS em: [https://nodejs.org/](https://nodejs.org/)

Para verificar se já está instalado, abra o PowerShell e digite:
```bash
node --version
```
Deve aparecer algo como `v18.x.x` ou superior.

**2. Holyrics (versão 2.24.0 ou superior)**

Baixe em: [https://holyrics.com.br/download.html](https://holyrics.com.br/download.html)

A versão 2.24.0+ é necessária para o suporte completo à API Server. Recomendamos a versão 2.27.0+ para a melhor experiência.

**3. Navegador baseado em Chromium**

Chrome, Edge, Brave, Opera, Comet, ou qualquer navegador Chromium. O Firefox não é totalmente suportado.

---

## Instalação

### 1. Baixar o projeto

**Opção A — Via Git (recomendado):**
```bash
git clone https://github.com/pedrole1601-bit/compositor-pro.git
cd compositor-pro
```

**Opção B — Download direto:**

Baixe o ZIP do repositório, extraia numa pasta de sua preferência e abra o PowerShell nessa pasta.

### 2. Instalar dependências

No PowerShell, dentro da pasta do projeto:
```bash
npm install
```
Aguarde a instalação finalizar (pode levar 1-2 minutos).

### 3. Compilar o projeto

```bash
npm run build
```
Deve aparecer a mensagem de build do servidor (tsc) e do cliente (vite) sem erros.

### 4. Testar o servidor

```bash
node dist/server/server/index.js
```

Se tudo estiver certo, aparecerá:

```text
╔══════════════════════════════════════════════╗
║        COMPOSITOR PRO v2 — Servidor          ║
╠══════════════════════════════════════════════╣
║  HTTP:      http://xxx.xxx.xxx.xxx:3000      ║
║  Painel:    http://xxx.xxx.xxx.xxx:3000/painel║
║  Telão:     http://xxx.xxx.xxx.xxx:3000/      ║
║  WebSocket: ws://xxx.xxx.xxx.xxx:3001         ║
╚══════════════════════════════════════════════╝
```

Abra o endereço do Painel no navegador para verificar. Depois pare o servidor com `Ctrl+C`.

---

## Configuração no Holyrics

Após instalar e compilar o projeto, configure o Holyrics para se comunicar com o Compositor Pro.

### Passo 1 — Criar o API Item

1. No Holyrics, vá em **Ferramentas → Diversos → API**
2. Clique no botão **"Adicionar"**
3. Defina o nome: `Compositor Pro`
4. Marque a opção **"Criar um receptor"**

### Passo 2 — Criar o receptor do Compositor

Na janela de criação de receptor:

1. Escolha o tipo **"URL"**
2. Configure:
   - **Nome:** `Compositor`
   - **URL/Host/ip:port:** `http://localhost:3000/api/compositor/launch`
   - **Tipo:** `POST`
3. Clique **"Ok"** para salvar o receptor

> [!NOTE]
> Se o Compositor Pro estiver rodando em outro computador da rede, substitua `localhost` pelo IP daquela máquina (ex: `http://192.168.1.100:3000/api/compositor/launch`).

### Passo 3 — Configurar o API Item

De volta à janela do API Item:

1. No campo **"Receptor"**, selecione **"Compositor"**
2. Clique em **"Raw Data (body)"**
3. Digite: `action=launch`
4. Clique em **"Salvar"**
5. Clique em **"Ok"** para fechar

### Passo 4 — Adicionar à barra de favoritos

1. Na tela principal do Holyrics, clique com o botão direito na barra de favoritos (parte inferior da tela)
2. Selecione **"Adicionar" → "API"** (ou "API Item")
3. Escolha **"Compositor Pro"**

Agora o botão **"Compositor Pro"** aparecerá na barra de favoritos.

### Passo 5 — Testar

1. Certifique-se de que o servidor do Compositor está rodando
2. Clique no botão **"Compositor Pro"** na barra de favoritos
3. O painel de controle deve abrir no navegador

---

## Inicialização automática

Para que o operador não precise iniciar o servidor manualmente, configure a inicialização automática.

### Opção A — Iniciar com o Windows (recomendado)

Essa opção faz o servidor iniciar automaticamente e silenciosamente quando o Windows ligar. O operador só precisa abrir o Holyrics e clicar no botão.

#### 1. Crie o arquivo de inicialização silenciosa

No PowerShell, dentro da pasta do projeto, execute o comando abaixo (é uma única linha):

```powershell
Set-Content -Path "start-compositor-silent.vbs" -Value "Set ws = CreateObject(""WScript.Shell"")`r`nws.Run ""cmd /c cd /d """"CAMINHO_DO_PROJETO"""" && node dist/server/server/index.js"", 0, False"
```

> [!IMPORTANT]
> Substitua `CAMINHO_DO_PROJETO` pelo caminho completo da pasta do projeto. Exemplo: `C:\Users\SeuUsuario\compositor-pro`

#### 2. Copie para a pasta de inicialização do Windows

```powershell
Copy-Item "start-compositor-silent.vbs" "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\"
```

#### 3. Teste

Dê duplo clique no arquivo `start-compositor-silent.vbs`. Nenhuma janela vai aparecer, mas o servidor estará rodando. Confirme acessando [http://localhost:3000/api/health](http://localhost:3000/api/health) no navegador — deve retornar `{"status":"ok"}`.

A partir de agora, toda vez que o Windows iniciar, o servidor estará pronto automaticamente.

### Opção B — Iniciar manualmente

Se preferir iniciar o servidor manualmente antes de usar:

1. Dê duplo clique no arquivo `start-compositor.bat` na pasta do projeto
2. Ou abra o PowerShell na pasta do projeto e execute:
   ```bash
   node dist/server/server/index.js
   ```

---

## Configuração de gatilhos

Os gatilhos permitem que o Holyrics troque automaticamente a cena do Compositor quando algo é apresentado (uma música, versículo, imagem, etc.).

### Passo 1 — Criar o receptor de gatilho

> [!IMPORTANT]
> Os receptores dos gatilhos são independentes dos receptores dos API Items. Você precisa criar um receptor separado para os gatilhos.

1. No Holyrics, vá em **Ferramentas → Diversos → API**
2. Abra a janela de **Receptores**
3. Clique na aba **"Gatilhos"**
4. Clique em **"Criar"**, escolha tipo **"POST"**
5. Configure:
   - **Nome:** `Compositor - Cena`
   - **URL/Host/ip:port:** `http://localhost:3000/api/compositor/scene`
   - **Tipo:** `POST`
6. Salve

### Passo 2 — Criar o gatilho

1. No Holyrics, acesse os **Gatilhos** da mídia desejada (por exemplo, abra uma música e clique no ícone de gatilho)
2. Clique em **"Adicionar"**
3. Configure:
   - **Ação:** Ao exibir (ou "Ao executar", dependendo do tipo)
   - **Receptor:** `Compositor - Cena`
   - **Parâmetros (Raw Data body):** `scene=NomeDaCena`
4. Salve

> [!IMPORTANT]
> No campo Raw Data, digite apenas `scene=` seguido do nome exato da cena como ela aparece no painel do Compositor. Exemplos: `scene=Louvor`, `scene=Pregação`, `scene=Apresentador 1`

### Exemplos de gatilhos

Aqui estão alguns exemplos comuns de configuração:

**Trocar para cena "Louvor" ao iniciar uma música:**
- **Ação:** Ao exibir
- **Item:** (selecione a música)
- **Receptor:** `Compositor - Cena`
- **Raw Data:** `scene=Louvor`

**Trocar para cena "Pregação" ao exibir um versículo:**
- **Ação:** Ao exibir
- **Item:** Versículo
- **Receptor:** `Compositor - Cena`
- **Raw Data:** `scene=Pregação`

**Trocar para cena "Oferta" ao exibir uma imagem específica:**
- **Ação:** Ao exibir
- **Item:** (selecione a imagem)
- **Receptor:** `Compositor - Cena`
- **Raw Data:** `scene=Oferta`

**Voltar para cena padrão ao remover a apresentação:**
- **Ação:** Ao finalizar
- **Receptor:** `Compositor - Cena`
- **Raw Data:** `scene=Padrão`

> [!TIP]
> Crie uma cena "Padrão" no Compositor para usar como fallback quando nenhuma mídia específica estiver sendo apresentada.

---

## Guia de uso do Painel

O painel de controle é onde o operador cria e gerencia todas as cenas e frames.

### Cenas

As cenas são os layouts completos que aparecem no telão. Cada cena contém um conjunto de frames (camadas).

- **Criar cena:** Clique no botão **"+"** na barra de cenas (topo do canvas)
- **Trocar cena:** Clique na aba da cena desejada
- **Renomear cena:** Dê duplo clique na aba da cena
- Ao trocar de cena, a transição configurada é aplicada automaticamente

### Frames (camadas)

Frames são as camadas individuais dentro de uma cena. Cada frame pode ser de um tipo diferente (câmera, vídeo, imagem, etc.).

- **Adicionar frame:** Clique num dos cards de tipo no painel lateral esquerdo (Câmera, Vídeo, Imagem, etc.)
- **Selecionar frame:** Clique no frame no canvas ou na lista de camadas
- **Mover frame:** Arraste o frame no canvas
- **Redimensionar frame:** Arraste os cantos do frame selecionado
- **Reordenar camadas:** Arraste os frames na lista de camadas (painel lateral direito)
- **Bloquear frame:** Clique no ícone de cadeado na lista de camadas ou pressione **L**
- **Ocultar/mostrar frame:** Clique no ícone de olho na lista de camadas
- **Editar propriedades:** Selecione o frame e edite no painel de propriedades (lateral direito)

### Tipos de frame

| Tipo | Descrição |
| :--- | :--- |
| **Câmera** | Feed ao vivo de uma webcam ou câmera conectada. O painel oferece um seletor para escolher qual câmera usar. |
| **Vídeo** | Reproduz um arquivo de vídeo (MP4, WebM, MOV). Suporta loop e mudo. |
| **Imagem** | Exibe uma imagem (JPG, PNG, GIF, WebP). |
| **Texto** | Texto personalizado com fonte, cor, tamanho e alinhamento configuráveis. |
| **Cor** | Bloco de cor sólida. Útil como fundo ou separador. |
| **Relógio** | Relógio em tempo real. Formato 12h ou 24h. |
| **Contador** | Contagem regressiva até uma hora específica. |
| **URL** | Exibe uma página web dentro do frame (iframe). |
| **Holyrics** | Exibe o conteúdo projetado pelo Holyrics (letras, versículos). |

### Transições

A barra de transição fica abaixo do canvas e permite configurar o efeito usado ao trocar de cena.

| Transição | Descrição |
| :--- | :--- |
| **Fade** | Dissolução suave (recomendado) |
| **Slide ←→↑↓** | Desliza em 4 direções |
| **Zoom** | Efeito de zoom in/out |
| **Blur** | Desfoque durante a troca |
| **Wipe** | Cortina lateral |
| **Nenhuma** | Troca instantânea (corte seco) |

A duração é configurável em milissegundos (padrão: `500ms`).

### Biblioteca de mídia

O painel lateral possui uma área de upload de mídia.

- **Upload:** Arraste arquivos para a área de drop ou clique para selecionar
- **Formatos aceitos:** JPG, PNG, GIF, WebP, MP4, WebM, MOV
- **Usar mídia:** Clique no item da biblioteca para criar um frame com ele
- **Excluir mídia:** Clique no ícone de lixeira no item

### Atalhos de teclado

| Atalho | Ação |
| :--- | :--- |
| **Delete / Backspace** | Excluir frame selecionado |
| **Ctrl + D** | Duplicar frame selecionado |
| **Ctrl + S** | Salvar projeto |
| **L** | Bloquear/desbloquear frame |
| **Escape** | Deselecionar tudo |
| **Setas** | Mover frame (1px) |
| **Shift + Setas** | Mover frame (10px) |

### Salvar e carregar projetos

- **Salvar:** Clique no botão de salvar (ou **Ctrl+S**). Um arquivo `.json` será baixado com todas as cenas, frames e configurações.
- **Carregar:** Clique no botão de carregar e selecione um arquivo `.json` previamente salvo.

> [!TIP]
> Salve o projeto regularmente. Ao recarregar a página, o estado é mantido via WebSocket, mas um backup em JSON é sempre recomendado.

---

## Exibição no telão

O telão é a página que deve ser exibida na tela pública da igreja.

1. Acesse `http://localhost:3000/` (ou o IP do servidor) no navegador do computador conectado ao projetor/TV.
2. Pressione **F11** para entrar em tela cheia.
3. O telão exibirá automaticamente a cena ativa e acompanhará todas as mudanças feitas no painel.

> [!TIP]
> Se o computador do operador e o computador do telão são diferentes, use o IP da rede local em vez de `localhost`. Exemplo: `http://192.168.1.100:3000/`
>
> Para abrir o telão diretamente pelo painel, clique no botão **"Abrir Telão"** no cabeçalho do painel.

---

## API do servidor

O Compositor Pro expõe uma API REST para integração com outros sistemas.

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| **GET** | `/api/health` | Verificar se o servidor está rodando |
| **GET** | `/api/compositor/status` | Status atual (cena ativa, frames, resolução) |
| **GET** | `/api/compositor/scenes` | Lista de cenas disponíveis |
| **POST** | `/api/compositor/launch` | Sinaliza início do Compositor |
| **POST** | `/api/compositor/scene` | Trocar cena (body: `scene=NomeDaCena`) |
| **POST** | `/api/compositor/scene/:nome` | Trocar cena pela URL |
| **POST** | `/api/compositor/visibility` | Mostrar/ocultar telão |
| **POST** | `/api/upload` | Upload de mídia |
| **GET** | `/api/midias` | Lista de mídias |
| **DELETE** | `/api/midias/:nome` | Excluir mídia |

**Exemplo — Trocar cena via curl:**
```bash
curl -X POST http://localhost:3000/api/compositor/scene -d "scene=Louvor"
```

**Exemplo — Listar cenas:**
```bash
curl http://localhost:3000/api/compositor/scenes
```

---

## Estrutura do projeto

```text
compositor-pro/
├── src/
│   ├── server/
│   │   └── index.ts          # Servidor Express + WebSocket
│   ├── painel/
│   │   ├── painel.html        # Interface do painel de controle
│   │   └── main.ts            # Engine do painel
│   ├── telao/
│   │   ├── index.html         # Página do telão
│   │   └── main.ts            # Engine do telão
│   └── shared/
│       └── types.ts           # Tipos TypeScript compartilhados
├── dist/                      # Arquivos compilados (gerado pelo build)
├── uploads/                   # Mídias enviadas pelo painel
├── start-compositor.bat       # Iniciar servidor (com janela)
├── start-compositor-silent.vbs # Iniciar servidor (silencioso)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Resolução de problemas

### O botão no Holyrics não abre o painel
- Verifique se o servidor está rodando: acesse `http://localhost:3000/api/health` no navegador.
- Verifique se o receptor no Holyrics aponta para `http://localhost:3000/api/compositor/launch`.
- Se o servidor não está rodando, dê duplo clique em `start-compositor-silent.vbs`.

### Erro "EADDRINUSE" ao iniciar o servidor
A porta já está em uso. Abra o PowerShell e execute:
```powershell
Stop-Process -Name "node" -Force
```
Tente iniciar novamente.

### O gatilho não troca a cena
- Verifique se o nome da cena no Raw Data (`scene=NomeDaCena`) é exatamente igual ao nome no painel do Compositor (incluindo maiúsculas, minúsculas, acentos e espaços).
- Verifique se o receptor do gatilho aponta para `http://localhost:3000/api/compositor/scene` com tipo `POST`.
- Verifique se o servidor está rodando.

### O telão não atualiza
- Recarregue a página do telão (`Ctrl+Shift+R`).
- Verifique o console do navegador (**F12**) por erros de WebSocket.
- Certifique-se de que o painel e o telão estão conectados ao mesmo servidor.

### As transições não funcionam
- Verifique se está usando um navegador Chromium (Chrome, Edge, Brave, etc.).
- Verifique o console do telão (**F12**) por erros.
- Tente recarregar o telão.

### O servidor não inicia com o Windows
- Verifique se o arquivo `start-compositor-silent.vbs` está na pasta `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`.
- Verifique se o caminho dentro do VBS está correto.
- Teste dando duplo clique no VBS manualmente.

### A câmera não aparece no painel
- O navegador precisa de permissão para acessar a câmera. Verifique se permitiu quando solicitado.
- Certifique-se de que a câmera não está sendo usada por outro programa.

---

## Contribuição

Contribuições são muito bem-vindas! Se você quer ajudar a melhorar o Compositor Pro:

1. Faça um **fork** do repositório
2. Crie uma branch para sua feature: `git checkout -b minha-feature`
3. Faça commit das alterações: `git commit -m 'Adiciona minha feature'`
4. Envie para o repositório: `git push origin minha-feature`
5. Abra um **Pull Request**

Se encontrar um bug ou tiver uma sugestão, abra uma **Issue** no repositório.

---

## Licença

Este projeto está licenciado sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## Créditos

Desenvolvido por **Pedro Leandro**

Feito com dedicação para a comunidade das igrejas que utilizam o Holyrics.

**Compositor Pro** — Composição visual em tempo real para o Holyrics