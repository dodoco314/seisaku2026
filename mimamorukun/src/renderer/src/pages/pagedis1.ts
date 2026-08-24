import { showPage } from '../utils/dom'
import { selectedRepoName } from './pagegit3'

// 選択中のDiscordサーバー情報（pagedis2から参照できるようにexport）
export let selectedGuildId: string = ''
export let selectedGuildName: string = ''

// ─── Discord全体フロー開始（pagegit3から呼び出す） ───────────────────────
export async function initDiscordFlow(): Promise<void> {
  // まずDiscordログイン済みか確認
  const discordUser = await window.api.discord.getUser()
  if (!discordUser) {
    // 未ログイン → Discordログインページへ
    const statusEl = document.getElementById('discordLoginStatus')
    if (statusEl) statusEl.innerText = ''
    showPage('discordLogin')
    return
  }

  // ログイン済み → サーバー・Bot登録状況を確認してスキップ判定
  await proceedAfterLogin()
}

// ─── ログイン後のスキップ判定 ────────────────────────────────────────────
async function proceedAfterLogin(): Promise<void> {
  // リポジトリ単位でDiscord設定を確認する（別リポジトリなら必ずサーバー選択に戻る）
  const settings = await window.api.discord.getSettings(selectedRepoName)

  if (settings?.guild_id) {

    const myServers = await window.api.discord.getMyAvailableServers()
    const isMember = myServers.some((s) => s.guild_id === settings.guild_id)

    if (!isMember) {
      // メンバーでない → アクセス拒否。サーバー選択からやり直させる
      await renderServerList()
      showPage('pagedis1')
      const msgEl = document.getElementById('serverMessage')
      if (msgEl) {
        msgEl.innerHTML =
          `<span style="color:red;">「${settings.guild_name}」のメンバーではないため、` +
          `このサーバーの情報にはアクセスできません。参加しているサーバーから選び直してください。</span>`
      }
      return
    }

    selectedGuildId = settings.guild_id
    selectedGuildName = settings.guild_name

    if (settings.bot_registered) {
      // 全て登録済み → アカウント紐付けページへ
      await goToLinkingPage()
      return
    }

    // サーバーは登録済みだがBotが未確認 → Bot確認ページへ
    await renderBotConfirmPage()
    showPage('pagedis2')
    return
  }

  // 未登録 → サーバー選択ページへ
  await renderServerList()
  showPage('pagedis1')
}

// ─── サーバー一覧を描画（自分が参加 かつ Botがいるものだけ） ────────────
async function renderServerList(): Promise<void> {
  const list = document.getElementById('serverList')
  const selectBtn = document.getElementById('selectServerBtn') as HTMLButtonElement
  if (!list) return

  list.innerHTML = '<li>読み込み中...</li>'

  try {
    const servers = await window.api.discord.getMyAvailableServers()

    if (servers.length === 0) {
      list.innerHTML = '<li>参加しているサーバーの中にBotがいるサーバーが見つかりません。</li>'
      return
    }

    list.innerHTML = ''
    for (const server of servers) {
      const li = document.createElement('li')
      li.innerHTML = `
        <label class="server-item">
          <input type="radio" name="serverRadio" class="serverRadio"
              value="${server.guild_id}" data-name="${server.guild_name}" />
          <span><strong>${server.guild_name}</strong>（メッセージ数: ${server.message_count}）</span>
        </label>
      `
      list.appendChild(li)
    }

    // 1件なら自動選択
    const radios = list.querySelectorAll<HTMLInputElement>('.serverRadio')
    if (radios.length === 1) radios[0].checked = true
    if (selectBtn) selectBtn.style.display = 'inline-block'
  } catch (e) {
    list.innerHTML = '<li style="color:red;">サーバー一覧の取得に失敗しました</li>'
    console.error(e)
  }
}

// ─── Bot確認ページの内容を描画 ───────────────────────────────────────────
export async function renderBotConfirmPage(): Promise<void> {
  const guildNameEl = document.getElementById('botGuildName')
  const statusEl = document.getElementById('botStatus')
  const countEl = document.getElementById('botMessageCount')
  if (guildNameEl) guildNameEl.innerText = selectedGuildName

  try {
    const users = await window.api.discord.getDiscordUsers(selectedGuildId)
    const totalMessages = users.reduce((sum, u) => sum + u.message_count, 0)
    if (users.length > 0) {
      if (statusEl) statusEl.innerHTML = '<span class="status-ok">✓ Botが正常にデータを収集しています</span>'
      if (countEl) countEl.innerText = `収集済み: ${users.length}人、合計 ${totalMessages} 件のメッセージ`
    } else {
      if (statusEl) statusEl.innerHTML = '<span class="status-warn">⚠ このサーバーのメッセージがまだありません</span>'
      if (countEl) countEl.innerText = ''
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:red;">状態確認に失敗しました</span>'
  }
}

// ─── アカウント紐付けページへ遷移 ───────────────────────────────────────
export async function goToLinkingPage(): Promise<void> {
  try {
    // 最新のコントリビューター一覧を取得し、account_linksに無いユーザーだけ差分追加する
    const distortion = await window.api.calculateDistortion(selectedRepoName)
    const githubUsernames = Object.keys(distortion.scores)
    await window.api.discord.saveGithubUsers(selectedRepoName, githubUsernames)
  } catch (e) {
    console.error('GitHubユーザー登録失敗:', e)
  }

  const { renderLinkingPage } = await import('./pagedis2')
  await renderLinkingPage(selectedGuildId, selectedRepoName)
  showPage('pagedis3')
}

// ─── setupPage4: ボタンのイベント登録 ───────────────────────────────────
export function setupPage4(): void {
  // Discordログインボタン
  document.getElementById('discordLoginBtn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('discordLoginStatus')
    if (statusEl) statusEl.innerText = 'ブラウザで認証してください...'

    try {
      const user = await window.api.discord.login()
      if (statusEl) statusEl.innerText = `✓ ${user.username} としてログインしました`
      // ログイン成功 → スキップ判定へ
      await proceedAfterLogin()
    } catch (e) {
      if (statusEl) statusEl.innerText = '認証に失敗しました。再度お試しください。'
      console.error(e)
    }
  })

  document.getElementById('discordLoginBackBtn')?.addEventListener('click', () => {
    showPage('pagegit3')
  })

  // サーバー選択ページ
  document.getElementById('selectServerBtn')?.addEventListener('click', async () => {
    const selected = document.querySelector<HTMLInputElement>('.serverRadio:checked')
    const msgEl = document.getElementById('serverMessage')
    if (!selected) {
      if (msgEl) msgEl.innerText = 'サーバーを選択してください'
      return
    }

    selectedGuildId = selected.value
    selectedGuildName = selected.dataset.name || ''
    await window.api.discord.saveServer(selectedRepoName, selectedGuildId, selectedGuildName)
    await renderBotConfirmPage()
    showPage('pagedis2')
  })

  document.getElementById('disBackBtn')?.addEventListener('click', () => {
    showPage('discordLogin')
  })

  // Botをサーバーに招待する（ブラウザでDiscordの認可画面を開く）
  document.getElementById('botInviteBtn')?.addEventListener('click', async () => {
    await window.api.discord.openBotInvite()
    const msgEl = document.getElementById('serverMessage')
    if (msgEl) {
      msgEl.innerText = 'ブラウザでBotを追加したら、少し待ってから再度サーバー一覧を確認してください。'
    }
  })

  // Bot確認ページ
  document.getElementById('botRegisteredBtn')?.addEventListener('click', async () => {
    await window.api.discord.setBotRegistered(selectedRepoName, selectedGuildId)
    await goToLinkingPage()
  })

  // Bot確認ページの「ログアウト」→ Discordトークンを破棄してログイン画面に戻す
  document.getElementById('dis2LogoutBtn')?.addEventListener('click', async () => {
    await window.api.discord.logout()
    selectedGuildId = ''
    selectedGuildName = ''
    const statusEl = document.getElementById('discordLoginStatus')
    if (statusEl) statusEl.innerText = ''
    showPage('discordLogin')
  })
}
