# みまもるくん

GitHubとDiscordのデータを組み合わせて、チームの活動状況を可視化するElectronアプリです。
コミット数や発言数をもとにチームの「崩壊度」を算出し、メンバーの貢献度をグラフで確認できます。
また、AIチャット機能でチームの悩みや課題を気軽に相談することができます。

---

## 主な機能

- **GitHubログイン** — デバイスフロー方式で安全にログイン
- **Discordログイン** — OAuth2でDiscordアカウントと連携
- **データ収集** — GitHubのコミット数・ブランチ数、Discordの発言数をメンバー別に集計
- **アカウント紐付け** — GitHubとDiscordのアカウントを紐付けて統合スコアを算出
- **崩壊度メーター** — チームの活動バランスをHPバー・グラフで可視化
- **貢献度表示** — メンバーの貢献度・コミット数・発言数をグラフとランキングで表示
- **締め切りカウントダウン** — 締め切り日を設定して残り日数を色付きで表示
- **AIチャット** — ローカルAI（Ollama）でチームの悩みを相談

---

## 必要なもの

- Windows PC
- GitHubアカウント
- Discordアカウント
- Ollama（AIチャット機能を使う場合）

---

## セットアップ

### STEP 1　Ollamaをインストール（AIチャットを使う場合）

以下のURLからOllamaをダウンロードしてインストールしてください：

```
https://ollama.com/download
```

> ⚠️ Ollamaがインストールされていない場合、AIチャット機能は使用できません
> ⚠️ モデルのダウンロードに数分かかる場合があります

---

### STEP 2　GitHub OAuth Appを作成

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. 以下を入力して **Register application**

| 項目 | 入力値 |
|---|---|
| Application name | `mimamorukun`（任意） |
| Homepage URL | `http://localhost` |
| Authorization callback URL | `http://localhost:8080/callback` |

3. **Enable Device Flow** にチェックを入れて **Update application**
4. **Client ID** をメモ
5. **Generate a new client secret** → **Client Secret** をメモ

---

### STEP 3　.envファイルを作成（開発者のみ）

> ℹ️ `.exe` インストーラーからアプリをインストールした場合はこの手順は不要です
> 開発者がソースコードから起動する場合のみ必要です

プロジェクトのルートフォルダに `.env` を作成して以下を記入：

```env
GITHUB_CLIENT_ID=開発者から共有されたClient IDを貼る
DISCORD_CLIENT_ID=開発者から共有されたDiscord Client IDを貼る
DATABASE_URL=開発者から共有されたDATABASE_URLを貼る
```

> ⚠️ Client IDとDATABASE_URLは開発者から直接受け取ってください
> ⚠️ `.env` ファイルは絶対にGitHubにプッシュしないでください

---

### STEP 4　依存ライブラリをインストール

```bash
npm install
```

---

### STEP 5　起動

```bash
npm run dev
```

---

## 使い方

### 画面1: GitHubにログイン
1. **GitHubでログイン** ボタンを押す
2. 画面に表示されたコードをコピーする
3. 自動で開くブラウザのGitHubページにコードを入力する
4. **Authorize** ボタンをクリックする

### 画面2: リポジトリ管理
1. セレクトボックスから登録したいリポジトリを選ぶ
2. **追加** ボタンを押す（最大5個まで登録可能）
3. 準備ができたら **次へ** ボタンで次の画面へ

### 画面3: データ取得
1. 取得したいリポジトリを選択する
2. **データを取得して保存** ボタンを押す

### 画面4: Discordにログイン
1. **Discordでログイン** ボタンを押す
2. ブラウザが開くのでDiscordアカウントで認証する

### 画面5: Discordサーバー選択
1. Botがデータを収集しているサーバーを選択する
2. **このサーバーを使用** ボタンを押す

### 画面6: アカウント紐付け
1. GitHubアカウントとDiscordアカウントを紐付ける
2. Botアカウントは **🤖 Botとして除外** を選択する
3. **紐付けを保存して次へ** ボタンを押す

### 画面7: 結果画面
- チームの崩壊度・貢献度・コミット数・発言数を確認する
- AIチャットでチームの悩みを相談する
- 締め切り日を設定してカウントダウンを表示する

---

## 崩壊度の計算式

| 状況 | 計算式 |
|---|---|
| GitHub + Discord両方 | GitHubスコア × 0.7 + Discordスコア × 0.3 |
| GitHubのみ | GitHubスコア × 0.1 |
| Discordのみ | Discordスコア × 0.1 |

---

## 注意事項

- `.env` ファイルは絶対にGitHubにプッシュしないでください
- アンインストール時にトークンとデータは自動で削除されます