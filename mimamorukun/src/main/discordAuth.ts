import { shell } from 'electron'
import * as http from 'http'
import * as keytar from 'keytar'
import * as dotenv from 'dotenv'
dotenv.config()

const CLIENT_ID = process.env.DISCORD_CLIENT_ID!
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!
const REDIRECT_URI = 'http://localhost:31415/callback'
const SCOPE = 'identify guilds'
const SERVICE_NAME = 'mimamorukun'
const DISCORD_ACCOUNT = 'discord_token'

// ─── 保存済みトークンを取得 ───────────────────────────────────────────────
export async function getSavedDiscordToken(): Promise<string | null> {
  const saved = await keytar.getPassword(SERVICE_NAME, DISCORD_ACCOUNT)
  if (!saved) return null
  return JSON.parse(saved).access_token
}

// ─── 保存済みのDiscordユーザー情報を取得 ─────────────────────────────────
export async function getSavedDiscordUser(): Promise<{ id: string; username: string } | null> {
  const saved = await keytar.getPassword(SERVICE_NAME, DISCORD_ACCOUNT)
  if (!saved) return null
  const data = JSON.parse(saved)
  return { id: data.user_id, username: data.username }
}

// ─── Discordトークンを削除（ログアウト用） ────────────────────────────────
export async function deleteDiscordToken(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, DISCORD_ACCOUNT)
}

// ─── Discord OAuth2フローを開始 ───────────────────────────────────────────
// ブラウザを開いてlocalhost:31415でコールバックを受け取り、トークンを保存する
export async function startDiscordOAuth(): Promise<{ id: string; username: string }> {
  const authUrl =
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}`

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) return

      const url = new URL(req.url, 'http://localhost:31415')
      const code = url.searchParams.get('code')

      // ブラウザに完了メッセージを返す
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>認証完了</title>
<style>
  body {
    margin: 0;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
    font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif;
  }
  .box {
    text-align: center;
    padding: 40px 48px;
    background: #15151c;
    border: 0.5px solid #2a2a35;
    border-radius: 12px;
    color: #E5E4F0;
  }
  .check {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    border-radius: 50%;
    background: #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #ffffff;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  p {
    margin: 0;
    font-size: 13px;
    color: #8a8a99;
  }
</style>
</head>
<body>
  <div class="box">
    <div class="check">✓</div>
    <h2>認証完了！</h2>
    <p>このタブを閉じてアプリに戻ってください。</p>
  </div>
</body>
</html>`)
      server.close()

      if (!code) {
        reject(new Error('認証コードが取得できませんでした'))
        return
      }

      try {
        // コード → トークンに交換
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
          })
        })
        const tokenData = await tokenRes.json()
        if (!tokenData.access_token) throw new Error('トークン取得失敗: ' + JSON.stringify(tokenData))

        // ユーザー情報を取得
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        })
        const user = await userRes.json()

        // keytarに保存（rendererには渡さない）
        await keytar.setPassword(
          SERVICE_NAME,
          DISCORD_ACCOUNT,
          JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            user_id: user.id,
            username: user.username,
            saved_at: new Date().toISOString()
          })
        )

        console.log('[discordAuth] 認証成功:', user.username)
        resolve({ id: user.id, username: user.username })
      } catch (e) {
        reject(e)
      }
    })

    server.listen(31415, () => {
      shell.openExternal(authUrl)
    })

    server.on('error', reject)

    // 5分でタイムアウト
    setTimeout(() => {
      server.close()
      reject(new Error('認証タイムアウト（5分）'))
    }, 5 * 60 * 1000)
  })
}

// ─── ログインユーザーが参加しているサーバー一覧を取得 ────────────────────
export async function getMyGuilds(): Promise<{ id: string; name: string }[]> {
  const token = await getSavedDiscordToken()
  if (!token) throw new Error('Discordにログインしていません')

  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const guilds = await res.json()
  if (!Array.isArray(guilds)) throw new Error('サーバー一覧の取得に失敗しました')

  return guilds.map((g: any) => ({ id: g.id, name: g.name }))
}