import { createServer } from 'http'
import { shell } from 'electron'
import * as keytar from 'keytar'


// ─── 設定 ────────────────────────────────────────────────────────────────────
function getDiscordClientId(): string {
  return process.env.DISCORD_CLIENT_ID!
}
const KEYTAR_SERVICE = 'mimamorukun-discord'
const KEYTAR_ACCOUNT = 'discord_token'
const SERVER_URL = 'https://mimamorukuntokensaver-production-df1e.up.railway.app'

// ─── テーブル初期化（サーバー側で管理するため不要になったが互換性のために残す） ──
export async function initDiscordTables(): Promise<void> {
  console.log('[discord] テーブル初期化はRailwayサーバー側で管理')
}

// ─── Bot招待用URLを開く ────────────────────────────────────────────────────────
export function getBotInviteUrl(): string {
  const botClientId = process.env.DISCORD_BOT_CLIENT_ID || getDiscordClientId()
  const permissions = process.env.DISCORD_BOT_PERMISSIONS || '66560'
  return (
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${botClientId}` +
    `&scope=bot` +
    `&permissions=${permissions}`
  )
}

export function openBotInviteUrl(): void {
  shell.openExternal(getBotInviteUrl())
}

// ─── OAuth2: ログイン開始＋コールバック待機→Railwayサーバー経由でトークン取得 ───
// ・ポート31415で待機（Discord OAuth Appの設定と合わせる）
// ・stateパラメータでCSRF対策
// ・DISCORD_CLIENT_SECRETはRailwayサーバー側のみに持たせる
export async function startDiscordOAuth(): Promise<{ id: string; username: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/callback')) return

        const url = new URL(req.url!, `http://localhost`)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        // アドレスをサーバーを閉じる前に取得
        const addr = server.address() as { port: number }
        const redirectUri = `http://localhost:${addr.port}/callback`

        // stateの検証（CSRF対策）
        const savedState = await keytar.getPassword(KEYTAR_SERVICE, 'oauth_state')
        if (!state || state !== savedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body><h2>❌ 不正なリクエストです。</h2></body></html>')
          server.close()
          reject(new Error('不正なstateパラメータ'))
          return
        }

        // 認証完了をブラウザに表示してサーバーを閉じる
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ 認証完了！アプリに戻ってください。</h2></body></html>')
        server.close()

        if (!code) {
          reject(new Error('認証コードが取得できませんでした'))
          return
        }

        // GitHubのセッショントークンを取得（Discord紐付けに使用）
        const githubToken = await keytar.getPassword('mimamorukun', 'github_token')
        const sessionToken = githubToken ? JSON.parse(githubToken).sessionToken : null

        // Railwayサーバー経由でDiscord認証
        const serverRes = await fetch(`${SERVER_URL}/auth/discord`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri, sessionToken })
        })

        const serverData = await serverRes.json()
        console.log('[discord] serverData:', JSON.stringify(serverData))

        if (serverData.error) {
          reject(new Error(serverData.error))
          return
        }

        // keytarに安全に保存
        await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, JSON.stringify({
          discordAccessToken: serverData.discordAccessToken,
          user: serverData.user,
          saved_at: new Date().toISOString()
        }))

        console.log('[discord] OAuth2認証成功')
        resolve({ id: serverData.user.id, username: serverData.user.username })
      } catch (e) {
        reject(e)
      }
    })

    // ポート31415で待機（Discord OAuth Appの設定と合わせる）
    server.listen(31415, async () => {
      const addr = server.address() as { port: number }
      const redirectUri = `http://localhost:${addr.port}/callback`
      console.log(`[discord] コールバック待機中: port ${addr.port}`)

      // stateを生成して保存（CSRF対策）
      const state = crypto.randomUUID()
      await keytar.setPassword(KEYTAR_SERVICE, 'oauth_state', state)

      const authUrl =
        `https://discord.com/api/oauth2/authorize` +
        `?client_id=${getDiscordClientId()}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=identify%20guilds` +
        `&state=${state}`

      shell.openExternal(authUrl)
    })
    server.on('error', reject)
  })
}

// ─── 保存済みDiscordトークンを取得 ────────────────────────────────────────────
export async function getSavedDiscordToken(): Promise<string | null> {
  const saved = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!saved) return null
  return JSON.parse(saved).discordAccessToken ?? null
}

// ─── Discordトークンを削除（ログアウト用） ────────────────────────────────────
export async function deleteDiscordToken(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
}

// ─── 保存済みDiscordユーザー情報を取得 ───────────────────────────────────────
export async function getSavedDiscordUser(): Promise<{ id: string; username: string } | null> {
  const saved = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!saved) return null
  const data = JSON.parse(saved)
  return data.user ?? null
}

// ─── ユーザーが参加しているGuild一覧を取得 ───────────────────────────────────
export async function getMyGuilds(): Promise<{ id: string; name: string }[]> {
  const token = await getSavedDiscordToken()
  if (!token) throw new Error('Discordトークンがありません')
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Discordトークンが無効または期限切れです')
  return await res.json()
}

// ─── Botが収集済みのサーバー一覧（Railwayサーバー経由） ──────────────────────
export async function getAvailableServers(): Promise<
  { guild_id: string; guild_name: string; message_count: number }[]
> {
  const res = await fetch(`${SERVER_URL}/discord/servers`)
  if (!res.ok) throw new Error('サーバーエラー')
  return await res.json()
}

// ─── 登録済みDiscord設定を取得（Railwayサーバー経由） ────────────────────────
export async function getDiscordSettings(repoFullName: string): Promise<{
  guild_id: string
  guild_name: string
  bot_registered: boolean
} | null> {
  const res = await fetch(`${SERVER_URL}/discord/settings/${encodeURIComponent(repoFullName)}`)
  if (!res.ok) throw new Error('サーバーエラー')
  return await res.json()
}

// ─── サーバーを登録（Railwayサーバー経由） ────────────────────────────────────
export async function saveDiscordServer(
  repoFullName: string,
  guildId: string,
  guildName: string
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/discord/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoFullName, guildId, guildName })
  })
  if (!res.ok) throw new Error('サーバーエラー')
}

// ─── Bot登録フラグをtrueに更新（Railwayサーバー経由） ────────────────────────
export async function setBotRegistered(repoFullName: string, guildId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/discord/settings/bot-registered`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoFullName, guildId })
  })
  if (!res.ok) throw new Error('サーバーエラー')
}

// ─── 指定サーバーのDiscordユーザー一覧（Railwayサーバー経由） ────────────────
export async function getDiscordUsers(
  guildId: string
): Promise<{ author_id: string; author_name: string; message_count: number }[]> {
  const res = await fetch(`${SERVER_URL}/discord/users/${guildId}`)
  if (!res.ok) throw new Error('サーバーエラー')
  return await res.json()
}

// ─── アカウント紐付けを取得（Railwayサーバー経由） ───────────────────────────
export async function getAccountLinks(
  repoFullName: string
): Promise<{ github_username: string; discord_user_id: string | null; discord_user_name: string | null }[]> {
  const res = await fetch(`${SERVER_URL}/discord/account-links/${encodeURIComponent(repoFullName)}`)
  if (!res.ok) throw new Error('サーバーエラー')
  return await res.json()
}

// ─── アカウント紐付けを保存（Railwayサーバー経由） ───────────────────────────
export async function saveAccountLink(
  githubUsername: string,
  discordUserId: string,
  discordUserName: string,
  repoFullName: string
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/discord/account-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubUsername, discordUserId, discordUserName, repoFullName })
  })
  if (!res.ok) throw new Error('サーバーエラー')
}

// ─── GitHubユーザー名をaccount_linksに登録（Railwayサーバー経由） ────────────
export async function saveGithubUsersToDB(
  repoFullName: string,
  githubUsernames: string[]
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/discord/github-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoFullName, githubUsernames })
  })
  if (!res.ok) throw new Error('サーバーエラー')
}

// ─── Discordスコアを算出（Railwayサーバー経由） ──────────────────────────────
export async function calcDiscordScores(
  guildId: string
): Promise<
  {
    author_id: string
    author_name: string
    score: number
    scoreX20: number
    percentage: number
    breakdown: {
      messageCount: number
      activeDays: number
      channelCount: number
      replyCount: number
      avgContentLength: number
    }
  }[]
> {
  const res = await fetch(`${SERVER_URL}/discord/scores/${guildId}`)
  if (!res.ok) throw new Error('サーバーエラー')
  return await res.json()
}