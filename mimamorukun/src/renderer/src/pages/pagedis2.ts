import { showPage } from '../utils/dom'
import { selectedGuildId } from './pagedis1'
import { selectedRepoName } from './pagegit3'
import { renderDistortionMeter } from './pageresult'

// 紐付け対象のGitHubユーザー一覧（renderLinkingPage実行時に格納）
let githubUsernames: string[] = []

// ─── 紐付けページを描画 ───────────────────────────────────────────────────
export async function renderLinkingPage(guildId: string, repoFullName: string): Promise<void> {
  const container = document.getElementById('linkingContainer')
  const msgEl = document.getElementById('linkMessage')
  if (!container) return

  container.innerHTML = '<p>読み込み中...</p>'
  if (msgEl) msgEl.innerText = ''

  try {
    // GitHub側のユーザー（紐付け対象）
    const links = await window.api.discord.getAccountLinks(repoFullName)
    githubUsernames = links.map((l) => l.github_username)

    // Discord側のユーザー（選択肢）
    const discordUsers = await window.api.discord.getDiscordUsers(guildId)

    if (githubUsernames.length === 0) {
      container.innerHTML = '<p>GitHubユーザーが見つかりません。先にデータ取得を行ってください。</p>'
      return
    }

    container.innerHTML = ''

    for (const link of links) {
      const div = document.createElement('div')
      div.className = 'link-row'

      // 既に紐付け済みかどうか
      const linkedStatus = link.discord_user_id
        ? `<span class="status-ok">✓ ${link.discord_user_name}</span>`
        : '<span class="status-warn">未紐付け</span>'

      // Discordユーザー選択プルダウン
      const options = discordUsers.map((u) => {
        const selected = u.author_id === link.discord_user_id ? 'selected' : ''
        return `<option value="${u.author_id}" data-name="${u.author_name}" ${selected}>${u.author_name}（${u.message_count}件）</option>`
      })

      div.innerHTML = `
        <span class="github-label">Git: ${link.github_username}</span>
        <span>${linkedStatus}</span>
        <select class="discordSelect" data-github="${link.github_username}">
          <option value="">Discordアカウントを選択...</option>
          ${options.join('')}
        </select>
      `
      container.appendChild(div)
    }
  } catch (e) {
    container.innerHTML = '<p style="color:red;">読み込みに失敗しました</p>'
    console.error(e)
  }
}

// ─── setupPageDis2: ボタンのイベント登録 ─────────────────────────────────
export function setupPageDis2(): void {
  // 紐付け保存ボタン
  document.getElementById('saveLinkBtn')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('linkMessage')
    const selects = document.querySelectorAll<HTMLSelectElement>('.discordSelect')

    let savedCount = 0
    const errors: string[] = []

    for (const select of selects) {
      const githubUsername = select.dataset.github || ''
      const discordUserId = select.value
      if (!discordUserId) continue // 未選択はスキップ

      const selectedOption = select.options[select.selectedIndex]
      const discordUserName = selectedOption.dataset.name || ''

      try {
        await window.api.discord.saveAccountLink(
          githubUsername,
          discordUserId,
          discordUserName,
          selectedRepoName
        )
        savedCount++
      } catch (e) {
        errors.push(githubUsername)
        console.error(`紐付け保存失敗: ${githubUsername}`, e)
      }
    }

    if (msgEl) {
      if (errors.length > 0) {
        msgEl.innerHTML = `<span style="color:red;">一部保存失敗: ${errors.join(', ')}</span>`
      } else {
        msgEl.innerText = `${savedCount}件の紐付けを保存しました`
      }
    }

    // 紐付け保存後に崩壊度メーター画面へ
    await renderDistortionMeter(selectedRepoName, selectedGuildId)
    showPage('pageresult')
  })

  document.getElementById('dis3BackBtn')?.addEventListener('click', () => {
    showPage('pagedis2')
  })
}
