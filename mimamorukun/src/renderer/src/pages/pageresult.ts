import { showPage } from '../utils/dom'
import { setupChat } from './pagechat'

export interface DistortionData {
  scores: Record<string, number>
  avgScore: number
  stdDev: number
  distortion: number
}

let currentDistortionData: DistortionData | null = null
let currentRepoName: string | null = null

export async function renderDistortionMeter(repoName: string, guildId?: string): Promise<void> {
  await renderCountdown()

  const meterFill = document.getElementById('meterFill')
  const meterLabel = document.getElementById('meterLabel')
  const meterPercent = document.getElementById('meterPercent')
  const statsContainer = document.getElementById('statsContainer')

  if (!meterFill || !meterLabel || !meterPercent || !statsContainer) {
    console.error('必要なHTML要素が見つかりません')
    return
  }

  try {
    const data = await window.api.calculateDistortion(repoName, guildId)
    currentDistortionData = data
    currentRepoName = repoName

    const distortionPercent = Math.min(data.distortion, 100)
    meterFill.style.width = `${distortionPercent}%`
    meterLabel.innerText = `チームの崩壊度`
    meterPercent.innerText = `${distortionPercent.toFixed(1)}%`

    if (distortionPercent < 33) {
      meterFill.style.backgroundColor = '#22c55e'
    } else if (distortionPercent < 66) {
      meterFill.style.backgroundColor = '#eab308'
    } else {
      meterFill.style.backgroundColor = '#ef4444'
    }

    // スコアを降順に並べておく（一度だけ）
    const sortedEntries = Object.entries(data.scores).sort((a, b) => b[1] - a[1])
    const totalScore = sortedEntries.reduce((sum, [, score]) => sum + score, 0)
    const medals = ['🥇', '🥈', '🥉']

    // 初期表示（貢献度）
    const initialHTML = sortedEntries
      .map(([user, score], index) => {
        const contribution = totalScore > 0 ? (score / totalScore) * 100 : 0
        const medal = medals[index] ?? ''
        return `<li style="margin: 8px 0; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #000;">
          <strong>${user}:</strong> ${contribution.toFixed(1)}% ${medal}
        </li>`
      })
      .join('')

    statsContainer.innerHTML = `
      <div style="margin: 16px 0;">
        <h3 style="color: inherit;">統計情報</h3>
        <p style="color: inherit;"><strong>総コミット数:</strong> ${data.totalCommits}件</p>
        <p style="color: inherit;"><strong>総発言数:</strong> ${data.totalMessages}件</p>
        <h3 style="color: inherit;">メンバーのスコア</h3>
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <button id="tabContribution" style="padding: 6px 16px; border-radius: 4px; border: none; background: #3b82f6; color: white; cursor: pointer;">貢献度</button>
          <button id="tabCommits" style="padding: 6px 16px; border-radius: 4px; border: none; background: #475569; color: white; cursor: pointer;">コミット数</button>
          <button id="tabMessages" style="padding: 6px 16px; border-radius: 4px; border: none; background: #475569; color: white; cursor: pointer;">発言数</button>
        </div>
        <ul id="scoreList" style="list-style: none; padding: 0;">
          ${initialHTML}
        </ul>
      </div>
    `

    const renderTab = (type: 'contribution' | 'commits' | 'messages') => {
  const list = document.getElementById('scoreList')
  if (!list) return

  document.getElementById('tabContribution')!.style.background = type === 'contribution' ? '#3b82f6' : '#475569'
  document.getElementById('tabCommits')!.style.background = type === 'commits' ? '#3b82f6' : '#475569'
  document.getElementById('tabMessages')!.style.background = type === 'messages' ? '#3b82f6' : '#475569'

  // タブに応じて並び替え
  const tabSorted = [...sortedEntries].sort((a, b) => {
    if (type === 'commits') return (data.commitsByUser[b[0]] ?? 0) - (data.commitsByUser[a[0]] ?? 0)
    if (type === 'messages') return (data.messagesByUser[b[0]] ?? 0) - (data.messagesByUser[a[0]] ?? 0)
    return b[1] - a[1]
  })

  list.innerHTML = tabSorted.map(([user, score], index) => {
        const medal = medals[index] ?? ''
        let value = ''

        if (type === 'contribution') {
          const contribution = totalScore > 0 ? (score / totalScore) * 100 : 0
          value = `${contribution.toFixed(1)}%`
        } else if (type === 'commits') {
          value = `${data.commitsByUser[user] ?? 0}回`
        } else {
          value = `${data.messagesByUser[user] ?? 0}件`
        }

        return `<li style="margin: 8px 0; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #000;">
          <strong>${user}:</strong> ${value} ${medal}
        </li>`
      }).join('')
    }

    document.getElementById('tabContribution')?.addEventListener('click', () => renderTab('contribution'))
    document.getElementById('tabCommits')?.addEventListener('click', () => renderTab('commits'))
    document.getElementById('tabMessages')?.addEventListener('click', () => renderTab('messages'))

  } catch (error) {
    console.error('崩壊度の計算に失敗しました:', error)
    meterLabel.innerText = 'エラー: 計算に失敗しました'
    meterPercent.innerText = '-'
    statsContainer.innerHTML = '<p style="color: red;">データの計算に失敗しました。</p>'
  }
}

async function renderCountdown(): Promise<void> {
  const countdownEl = document.getElementById('countdown')
  if (!countdownEl) return

  const deadline = await window.api.loadDeadline()

  if (!deadline) {
    countdownEl.innerHTML = `
      <div style="margin-bottom: 16px; padding: 12px; background: #1e293b; border-radius: 8px;">
        <p style="margin: 0 0 8px 0;">📅 締め切り日を設定してください</p>
        <input type="date" id="deadlineInput" style="padding: 6px; border-radius: 4px; border: none;" />
        <button id="deadlineSaveBtn" style="margin-left: 8px; padding: 6px 12px; border-radius: 4px; border: none; background: #3b82f6; color: white; cursor: pointer;">
          設定
        </button>
      </div>
    `
    document.getElementById('deadlineSaveBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('deadlineInput') as HTMLInputElement
      if (!input.value) return
      await window.api.saveDeadline(input.value)
      await renderCountdown()
    })
    return
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline)
  deadlineDate.setHours(0, 0, 0, 0)
  const diffMs = deadlineDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const color = diffDays <= 3 ? '#ef4444' : diffDays <= 7 ? '#eab308' : '#22c55e'
  const message = diffDays < 0 ? '締め切りを過ぎています！' : diffDays === 0 ? '今日が締め切りです！' : `締め切りまで：${diffDays}日`

  countdownEl.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: #1e293b; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
      <span style="font-size: 20px; font-weight: bold; color: ${color};">📅 ${message}</span>
      <button id="deadlineChangeBtn" style="padding: 4px 10px; border-radius: 4px; border: none; background: #475569; color: white; cursor: pointer; font-size: 12px;">
        変更
      </button>
    </div>
  `

  document.getElementById('deadlineChangeBtn')?.addEventListener('click', async () => {
    await window.api.saveDeadline('')
    await renderCountdown()
  })
}

export function setupPage5(): void {
  const backBtn = document.getElementById('toPage3Btn2')

  backBtn?.addEventListener('click', () => {
    showPage('pagedis3')
  })

  setupChat()
}