# mimamorukun

A minimal Electron application with TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### セットアップ

1. https://ollama.com/ からOllamaをインストール
2. .envファイルを作成し、宮澤様から共有された.envファイルの中身をコピペする
3. コマンドプロンプトで以下を実行

```bash
$ ollama pull qwen2.5
$ ollama create mimamoru -f Modelfile
```

4. アプリを起動

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
