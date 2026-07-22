import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as dotenv from 'dotenv'

// ビルド後はresources/.envを読み込む、開発時は.envを読み込む

  const envPath = app.isPackaged
  ? join(process.resourcesPath, '.env')
  : join(__dirname, '../../.env')

    console.log('[env] isPackaged:', app.isPackaged)
    console.log('[env] envPath:', envPath)
    console.log('[env] GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID)

    dotenv.config({ path: envPath })

    console.log('[env] after dotenv GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID)

import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'
import { startOAuthFlow, getSavedToken, deleteToken, pollForToken, getGithubAccessToken } from './auth'
import { getRepositories, fetchAndSaveData, getOutputPath, calculateDistortion } from './github'
import { loadRepos, addRepo, removeRepo } from './repos'
import { setupOllama } from './ollama'
import {
  initDiscordTables,
  getAvailableServers,
  getDiscordSettings,
  saveDiscordServer,
  setBotRegistered,
  getDiscordUsers,
  getAccountLinks,
  saveAccountLink,
  saveGithubUsersToDB,
  calcDiscordScores,
  openBotInviteUrl
} from './discord'
import {
  startDiscordOAuth,
  getSavedDiscordUser,
  deleteDiscordToken,
  getMyGuilds
} from './discord'

// ─── みまもるくん チャット系 ──────────────────────────

const chatHistories: Record<string, { role: string; content: string }[]> = {}

ipcMain.handle('chat:send', async (_, message: string, userId: string = 'default') => {
  if (!chatHistories[userId]) chatHistories[userId] = []
  chatHistories[userId].push({ role: 'user', content: message })

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mimamoru',
        messages: chatHistories[userId],
        stream: false
      })
    })

    if (!response.ok) {
      return 'AIに接続できませんでした。Ollamaがインストールされているか確認してください。'
    }

    const data = await response.json()
    const reply = data.message.content
    chatHistories[userId].push({ role: 'assistant', content: reply })
    return reply
  } catch {
    return 'AIに接続できませんでした。以下の手順でOllamaをインストールしてください：\n1. https://ollama.com からOllamaをインストール\n2. アプリを再起動'
  }
})


function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Discord用テーブルをアプリ起動時に初期化
  try {
    await initDiscordTables()
  } catch (e) {
    console.error('[discord] テーブル初期化失敗:', e)
  }

  // Ollamaの自動セットアップ
  try {
    const ollamaResult = await setupOllama()
    console.log('[ollama]', ollamaResult.message)
    if (ollamaResult.status === 'not_installed') {
      // Ollamaが未インストールの場合はインストールページを開く
      shell.openExternal('https://ollama.com/download')
    }
  } catch (e) {
    console.error('[ollama] セットアップ失敗:', e)
  }

  // ─── GitHub認証系 ──────────────────────────────────
  // 保存済みトークンを取得
  ipcMain.handle('auth:getToken', async () => await getSavedToken())
  // デバイスフロー開始（ユーザーコードを返す）
  ipcMain.handle('auth:login', async () => await startOAuthFlow())
  // ユーザーが認証するまでポーリング
  ipcMain.handle('auth:poll', async () => await pollForToken())
  // ログアウト
  ipcMain.handle('auth:logout', async () => await deleteToken())

  // ─── リポジトリ管理系 ──────────────────────────────
  // GitHubからリポジトリ一覧を取得
 ipcMain.handle('repos:getAll', async () => {
  const token = await getGithubAccessToken()
  if (!token) throw new Error('未認証です')
  return await getRepositories(token)
})
  // 登録済みリポジトリを取得
  ipcMain.handle('repos:load', () => loadRepos())
  // リポジトリを追加
  ipcMain.handle('repos:add', (_, repo: { name: string; full_name: string }) => addRepo(repo))
  // リポジトリを削除
  ipcMain.handle('repos:remove', (_, fullName: string) => removeRepo(fullName))

  // ─── データ取得系 ──────────────────────────────────
  // 選択したリポジトリのデータを取得してJSONに保存
  ipcMain.handle('github:fetch', async (_, selectedRepos: string[]) => {
  const token = await getGithubAccessToken()
  if (!token) throw new Error('未認証です')
  await fetchAndSaveData(token, selectedRepos)
  return getOutputPath()
})

  // ─── 締め切り日管理系 ──────────────────────────────

// 締め切り日を保存
ipcMain.handle('deadline:save', async (_, dateStr: string) => {
  const path = await import('path')
  const fs = await import('fs')
  const deadlinePath = path.join(app.getPath('userData'), 'deadline.json')
  fs.writeFileSync(deadlinePath, JSON.stringify({ deadline: dateStr }), 'utf-8')
})

// 締め切り日を取得
ipcMain.handle('deadline:load', async () => {
  const path = await import('path')
  const fs = await import('fs')
  const deadlinePath = path.join(app.getPath('userData'), 'deadline.json')
  if (!fs.existsSync(deadlinePath)) return null
  const data = JSON.parse(fs.readFileSync(deadlinePath, 'utf-8'))
  return data.deadline
})


  // リポジトリのデータから崩壊度を計算
  ipcMain.handle('github:calculateDistortion', async (_, repoName: string, guildId?: string) => {
  const outputPath = getOutputPath()
  const data = JSON.parse(readFileSync(outputPath, 'utf-8'))

  if (!data[repoName]) {
    throw new Error(`データが見つかりません: ${repoName}`)
  }

  const repoData = data[repoName]

  let discordScores: Record<string, number> | undefined = undefined
  const excludedUsers: string[] = []

if (guildId) {
  try {
    const links = await getAccountLinks(repoName)
    const discordData = await calcDiscordScores(guildId)

    discordScores = {}

    // 紐付け済みユーザーの処理
    for (const link of links) {
      if (link.discord_user_id === 'BOT_EXCLUDED') {
        console.log(`[Bot除外] ${link.github_username} をスコア計算から除外します`)
        excludedUsers.push(link.github_username)
        continue
      }
      if (link.discord_user_id) {
        const discordUser = discordData.find((d) => d.author_id === link.discord_user_id)
        if (discordUser) {
          discordScores[link.github_username] = discordUser.score
        }
      }
    }

    // Discordのみのユーザーを追加（GitHubと紐付けされていないユーザー）
    const linkedDiscordIds = new Set(
      links
        .filter((l) => l.discord_user_id && l.discord_user_id !== 'BOT_EXCLUDED')
        .map((l) => l.discord_user_id)
    )

    for (const discordUser of discordData) {
      if (!linkedDiscordIds.has(discordUser.author_id)) {
        // 紐付けされていないDiscordユーザーをDiscord名でそのまま追加
        discordScores[discordUser.author_name] = discordUser.score
      }
    }

  } catch (e) {
    console.warn('Discordスコア取得失敗、GitHubのみで計算します:', e)
  }
}

  const result = calculateDistortion(
  repoData.commits.byUser,
  repoData.branches.byUser,
  discordScores,
  excludedUsers
  )

  // 総コミット数（github-data.jsonから）
  const totalCommits = repoData.commits.total

  // 総発言数（DiscordのmessageCountの合計）
  let totalMessages = 0
  if (guildId) {
    try {
      const discordData = await calcDiscordScores(guildId)
      totalMessages = discordData.reduce((sum, u) => sum + u.breakdown.messageCount, 0)
    } catch (e) {
      console.warn('総発言数の取得に失敗しました:', e)
    }
  }

  // 個人別発言数を取得
const messagesByUser: Record<string, number> = {}
if (guildId) {
  try {
    const links = await getAccountLinks(repoName)
    const discordData = await calcDiscordScores(guildId)

    // 紐付け済みユーザーの発言数
    const linkedDiscordIds = new Set(
      links
        .filter((l) => l.discord_user_id && l.discord_user_id !== 'BOT_EXCLUDED')
        .map((l) => l.discord_user_id)
    )
    for (const link of links) {
      if (link.discord_user_id && link.discord_user_id !== 'BOT_EXCLUDED') {
        const discordUser = discordData.find((d) => d.author_id === link.discord_user_id)
        if (discordUser) {
          messagesByUser[link.github_username] = discordUser.breakdown.messageCount
        }
      }
    }

    // 未紐付けDiscordユーザーの発言数
    for (const discordUser of discordData) {
      if (!linkedDiscordIds.has(discordUser.author_id)) {
        messagesByUser[discordUser.author_name] = discordUser.breakdown.messageCount
      }
    }
  } catch (e) {
    console.warn('個人別発言数の取得に失敗しました:', e)
  }
}

return {
  ...result,
  totalCommits,
  totalMessages,
  commitsByUser: repoData.commits.byUser,
  messagesByUser
}

})
  // ─── Discord OAuth認証系 ───────────────────────────
  // 保存済みDiscordトークン確認（ユーザー情報のみ返す。トークン自体はrendererに渡さない）
  ipcMain.handle('discord:getUser', async () => await getSavedDiscordUser())

  // OAuth2フロー開始（ブラウザを開いてコールバックを待つ）
  ipcMain.handle('discord:login', async () => await startDiscordOAuth())

  // Discordログアウト
  ipcMain.handle('discord:logout', async () => await deleteDiscordToken())

  // ログインユーザーが参加しているサーバー一覧を取得
  // → messagesテーブルのサーバーと照合して「Botが入っていてかつ自分が参加しているサーバー」だけ返す
  ipcMain.handle('discord:getMyAvailableServers', async () => {
    const myGuilds = await getMyGuilds()
    const myGuildIds = new Set(myGuilds.map((g) => g.id))
    const allServers = await getAvailableServers()
    // Botが収集していて、かつ自分も参加しているサーバーに絞る
    return allServers.filter((s) => myGuildIds.has(s.guild_id))
  })

  // 目的のサーバーが一覧に無い場合、Bot招待ページをブラウザで開く
  ipcMain.handle('discord:openBotInvite', () => {
    openBotInviteUrl()
  })

  // ─── Discord DBアクセス系 ──────────────────────────
  // リポジトリ単位でサーバー設定を管理する（repoFullNameで絞り込む）
  ipcMain.handle('discord:getSettings', async (_, repoFullName: string) => {
    return await getDiscordSettings(repoFullName)
  })
  ipcMain.handle(
    'discord:saveServer',
    async (_, repoFullName: string, guildId: string, guildName: string) => {
      await saveDiscordServer(repoFullName, guildId, guildName)
    }
  )
  ipcMain.handle('discord:setBotRegistered', async (_, repoFullName: string, guildId: string) => {
    await setBotRegistered(repoFullName, guildId)
  })
  ipcMain.handle('discord:getDiscordUsers', async (_, guildId: string) => {
    return await getDiscordUsers(guildId)
  })
  ipcMain.handle('discord:getAccountLinks', async (_, repoFullName: string) => {
    return await getAccountLinks(repoFullName)
  })
  ipcMain.handle(
    'discord:saveAccountLink',
    async (_, githubUsername: string, discordUserId: string, discordUserName: string, repoFullName: string) => {
      await saveAccountLink(githubUsername, discordUserId, discordUserName, repoFullName)
    }
  )
  ipcMain.handle('discord:saveGithubUsers', async (_, repoFullName: string, githubUsernames: string[]) => {
    await saveGithubUsersToDB(repoFullName, githubUsernames)
  })
  ipcMain.handle('discord:calcScores', async (_, guildId: string) => {
    return await calcDiscordScores(guildId)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})