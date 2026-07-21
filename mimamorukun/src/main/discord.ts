import { Pool } from 'pg'
import { createServer } from 'http'
import { shell } from 'electron'
import * as keytar from 'keytar'
import * as dotenv from 'dotenv'
dotenv.config()

// ─── DB接続（mainプロセスのみ。rendererには絶対に漏らさない） ────────────
// DATABASE_URLは.envから取得（本番はRailwayの環境変数に設定）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// ─── Discord OAuth2設定 ───────────────────────────────────────────────────
// DISCORD_CLIENT_SECRETはRailwayサーバー側に移行したため不要
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!
const KEYTAR_SERVICE = 'mimamorukun-discord'
const KEYTAR_ACCOUNT = 'discord_token'
const SERVER_URL = 'https://mimamorukuntokensaver-production-df1e.up.railway.app'

// ─── テーブル初期化 ───────────────────────────────────────────────────────
export async function initDiscordTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_settings (
      id             SERIAL PRIMARY KEY,
      repo_full_name TEXT NOT NULL DEFAULT '',
      guild_id       TEXT NOT NULL,
      guild_name     TEXT NOT NULL,
      bot_registered BOOLEAN NOT NULL DEFAULT FALSE,
      registered_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // ─── マイグレーション: 旧スキーマ（guild_id単体UNIQUE・repo_full_name無し）からの移行 ───
  // 既存テーブルに repo_full_name が無ければ追加
  await pool.query(`
    ALTER TABLE discord_settings ADD COLUMN IF NOT EXISTS repo_full_name TEXT NOT NULL DEFAULT ''
  `)
  // 旧: guild_id単体のUNIQUE制約が残っていれば外す（リポジトリごとに同じサーバーを使えるようにするため）
  await pool.query(`
    ALTER TABLE discord_settings DROP CONSTRAINT IF EXISTS discord_settings_guild_id_key
  `)
  // 新: (repo_full_name, guild_id) の組で一意にする
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'discord_settings_repo_guild_key'
      ) THEN
        ALTER TABLE discord_settings
          ADD CONSTRAINT discord_settings_repo_guild_key UNIQUE (repo_full_name, guild_id);
      END IF;
    END $$;
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_links (
      id                SERIAL PRIMARY KEY,
      github_username   TEXT NOT NULL,
      discord_user_id   TEXT,
      discord_user_name TEXT,
      repo_full_name    TEXT NOT NULL,
      linked_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(github_username, repo_full_name)
    )
  `)
  console.log('[discord] テーブル初期化完了')
}

// ─── Bot招待用URLを開く ────────────────────────────────────────────────────
// メッセージ収集Botをサーバーに追加してもらうためのリンク。
// BotはDiscord Developer Portal上でDISCORD_CLIENT_IDと同じアプリケーションに
// 紐付いている前提（OAuth2ログイン用アプリとBotが別アプリの場合はDISCORD_BOT_CLIENT_IDで上書き可）。
// 権限は「チャンネル閲覧(1024) + メッセージ履歴閲覧(65536)」の最小構成(=66560)をデフォルトにしている。
export function getBotInviteUrl(): string {
  const botClientId = process.env.DISCORD_BOT_CLIENT_ID || DISCORD_CLIENT_ID
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
// ・ランダムポートを使用（ポート固定による競合・横取りリスクを回避）
// ・stateパラメータでCSRF対策
// ・DISCORD_CLIENT_SECRETはRailwayサーバー側のみに持たせる（Electronには持たせない）
export async function startDiscordOAuth(): Promise<{ id: string; username: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/callback')) return

        const url = new URL(req.url!, `http://localhost`)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

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
        const addr = server.address() as { port: number }
        const redirectUri = `http://localhost:${addr.port}/callback`

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
        // codeとredirectUriをサーバーに送り、サーバー側でDISCORD_CLIENT_SECRETを使ってトークン交換
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

        // keytarに安全に保存（DB・rendererには渡さない）
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
        `?client_id=${DISCORD_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=identify%20guilds` +
        `&state=${state}`

      shell.openExternal(authUrl)
    })
    server.on('error', reject)
  })
}

// ─── 保存済みDiscordトークンを取得 ───────────────────────────────────────
export async function getSavedDiscordToken(): Promise<string | null> {
  const saved = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!saved) return null
  return JSON.parse(saved).discordAccessToken ?? null
}

// ─── Discordトークンを削除（ログアウト用） ────────────────────────────────
export async function deleteDiscordToken(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
}

// ─── 保存済みDiscordユーザー情報を取得 ───────────────────────────────────
export async function getSavedDiscordUser(): Promise<{ id: string; username: string } | null> {
  const saved = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT)
  if (!saved) return null
  const data = JSON.parse(saved)
  return data.user ?? null
}

// ─── ユーザーが参加しているGuild一覧を取得 ───────────────────────────────
export async function getMyGuilds(): Promise<{ id: string; name: string }[]> {
  const token = await getSavedDiscordToken()
  if (!token) throw new Error('Discordトークンがありません')
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Discordトークンが無効または期限切れです')
  return await res.json()
}

// ─── Botが収集済みのサーバー一覧（messagesテーブル、読み取りのみ） ──────
export async function getAvailableServers(): Promise<
  { guild_id: string; guild_name: string; message_count: number }[]
> {
  const result = await pool.query(`
    SELECT guild_id, guild_name, COUNT(*) AS message_count
    FROM messages
    GROUP BY guild_id, guild_name
    ORDER BY message_count DESC
  `)
  return result.rows.map((r) => ({ ...r, message_count: Number(r.message_count) }))
}

// ─── 登録済みDiscord設定を取得（リポジトリ単位） ─────────────────────────
// 同じリポジトリで過去に選んだサーバーがあればそれを返す（無ければnull→サーバー選択へ）
export async function getDiscordSettings(repoFullName: string): Promise<{
  guild_id: string
  guild_name: string
  bot_registered: boolean
} | null> {
  const result = await pool.query(
    `SELECT guild_id, guild_name, bot_registered
     FROM discord_settings
     WHERE repo_full_name = $1
     ORDER BY registered_at DESC
     LIMIT 1`,
    [repoFullName]
  )
  return result.rows[0] || null
}

// ─── サーバーを登録（リポジトリ×サーバーの組で保存。同じ組み合わせなら既存のbot_registeredを維持） ───
export async function saveDiscordServer(
  repoFullName: string,
  guildId: string,
  guildName: string
): Promise<void> {
  await pool.query(
    `INSERT INTO discord_settings (repo_full_name, guild_id, guild_name, bot_registered)
     VALUES ($1, $2, $3, false)
     ON CONFLICT (repo_full_name, guild_id) DO UPDATE SET guild_name = $3`,
    [repoFullName, guildId, guildName]
  )
}

// ─── Bot登録フラグをtrueに更新（リポジトリ×サーバーの組を指定） ─────────
export async function setBotRegistered(repoFullName: string, guildId: string): Promise<void> {
  await pool.query(
    'UPDATE discord_settings SET bot_registered = true WHERE repo_full_name = $1 AND guild_id = $2',
    [repoFullName, guildId]
  )
}

// ─── 指定サーバーのDiscordユーザー一覧（読み取りのみ） ──────────────────
export async function getDiscordUsers(
  guildId: string
): Promise<{ author_id: string; author_name: string; message_count: number }[]> {
  const result = await pool.query(
    `SELECT author_id, author_name, COUNT(*) AS message_count
     FROM messages
     WHERE guild_id = $1
     GROUP BY author_id, author_name
     ORDER BY message_count DESC`,
    [guildId]
  )
  return result.rows.map((r) => ({ ...r, message_count: Number(r.message_count) }))
}

// ─── アカウント紐付けを取得 ───────────────────────────────────────────────
export async function getAccountLinks(
  repoFullName: string
): Promise<{ github_username: string; discord_user_id: string | null; discord_user_name: string | null }[]> {
  const result = await pool.query(
    'SELECT github_username, discord_user_id, discord_user_name FROM account_links WHERE repo_full_name = $1',
    [repoFullName]
  )
  return result.rows
}

// ─── アカウント紐付けを保存 ───────────────────────────────────────────────
export async function saveAccountLink(
  githubUsername: string,
  discordUserId: string,
  discordUserName: string,
  repoFullName: string
): Promise<void> {
  await pool.query(
    `INSERT INTO account_links (github_username, discord_user_id, discord_user_name, repo_full_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (github_username, repo_full_name) DO UPDATE
       SET discord_user_id = $2, discord_user_name = $3, linked_at = NOW()`,
    [githubUsername, discordUserId, discordUserName, repoFullName]
  )
}

// ─── GitHubユーザー名をaccount_linksに登録（紐付け前の雛形） ─────────────
export async function saveGithubUsersToDB(
  repoFullName: string,
  githubUsernames: string[]
): Promise<void> {
  for (const username of githubUsernames) {
    await pool.query(
      `INSERT INTO account_links (github_username, repo_full_name)
       VALUES ($1, $2)
       ON CONFLICT (github_username, repo_full_name) DO NOTHING`,
      [username, repoFullName]
    )
  }
}

// ─── Discordスコアを算出 ──────────────────────────────────────────────────
// 単純な発言数ではなく、以下5指標をlog減衰させた上で重み付け合成する
// （GitHub側 calculateDistortion と同様に「連投すれば勝てる」を避ける設計）
//   ・メッセージ数        : 発言量そのもの（連投の伸びをlogで鈍らせる）
//   ・アクティブ日数      : 何日にまたがって発言したか（一気食い連投を無効化）
//   ・チャンネル数        : 何チャンネルで発言したか（1チャンネル荒らし対策）
//   ・返信数(reply_to)    : 会話への参加度（独り言連投より会話関与を評価）
//   ・平均文字数          : 中身のある発言か（EMPTY・空文字は除外、極端に長い1通の影響は200文字で頭打ち）
//
// scoreはlog合成のため上限が無く単体では0〜100%のような直感的な値にならない。
// グラフ表示用に、同じサーバー内でのmin-max正規化した percentage（0〜100）も別途返す
// （最下位=0%、最上位=100%。全員同点の場合は全員100%とする）
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
  const result = await pool.query(
    `
    SELECT
      author_id,
      MAX(author_name) AS author_name,
      COUNT(*) AS message_count,
      COUNT(DISTINCT channel_id) AS channel_count,
      COUNT(DISTINCT DATE(message_created_at)) AS active_days,
      COUNT(*) FILTER (WHERE reply_to IS NOT NULL) AS reply_count,
      COALESCE(
        AVG(LEAST(LENGTH(content), 200))
          FILTER (WHERE content IS NOT NULL AND content <> 'EMPTY' AND LENGTH(TRIM(content)) > 0),
        0
      ) AS avg_content_length
    FROM messages
    WHERE guild_id = $1
    GROUP BY author_id
    `,
    [guildId]
  )

  const WEIGHTS = {
    messageCount: 0.3,
    activeDays: 0.25,
    channelCount: 0.15,
    replyCount: 0.15,
    avgContentLength: 0.15
  }

  const scored = result.rows.map((r) => {
    const messageCount = Number(r.message_count)
    const activeDays = Number(r.active_days)
    const channelCount = Number(r.channel_count)
    const replyCount = Number(r.reply_count)
    const avgContentLength = Number(r.avg_content_length)

    const score =
      Math.log(messageCount + 1) * WEIGHTS.messageCount +
      Math.log(activeDays + 1) * WEIGHTS.activeDays +
      Math.log(channelCount + 1) * WEIGHTS.channelCount +
      Math.log(replyCount + 1) * WEIGHTS.replyCount +
      Math.log(avgContentLength + 1) * WEIGHTS.avgContentLength

    return {
      author_id: r.author_id,
      author_name: r.author_name,
      score,
      breakdown: { messageCount, activeDays, channelCount, replyCount, avgContentLength }
    }
  })

  // ─── グラフ表示用: サーバー内でのmin-max正規化(0〜100%) ───
  const scoreValues = scored.map((s) => s.score)
  const min = Math.min(...scoreValues)
  const max = Math.max(...scoreValues)
  const range = max - min

  return scored.map((s) => ({
    ...s,
    scoreX20: Number((s.score * 20).toFixed(2)),
    percentage: range === 0 ? 100 : Number((((s.score - min) / range) * 100).toFixed(1))
  }))
}