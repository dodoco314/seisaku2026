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

//htmlの要素をjavascriptで取得する
export async function renderDistortionMeter(repoName: string, guildId?: string): Promise<void> {
  // カウントダウン表示
  await renderCountdown()

  const meter = document.getElementById('distortionMeter')
  const meterFill = document.getElementById('meterFill')
  const meterLabel = document.getElementById('meterLabel')
  const meterPercent = document.getElementById('meterPercent')
  const statsContainer = document.getElementById('statsContainer')

  // 要素が存在しない場合は処理を中断
  if (!meterFill || !meterLabel || !meterPercent || !statsContainer) {
    console.error('必要なHTML要素が見つかりません')
    return
  }

  try {
    const data = await window.api.calculateDistortion(repoName, guildId)
    currentDistortionData = data
    currentRepoName = repoName

    console.log('取得したデータ:', data)

    // メーターの進捗状況を更新（0-100%でクリップ）
    const distortionPercent = Math.min(data.distortion, 100)
    meterFill.style.width = `${distortionPercent}%`

    // ラベルとパーセンテージを更新
    meterLabel.innerText = `チームの崩壊度`
    meterPercent.innerText = `${distortionPercent.toFixed(1)}%`

    // 背景色を崩壊度に応じて変更（緑→黄→赤）
    if (distortionPercent < 33) {
      meterFill.style.backgroundColor = '#22c55e' // 緑
    } else if (distortionPercent < 66) {
      meterFill.style.backgroundColor = '#eab308' // 黄
    } else {
      meterFill.style.backgroundColor = '#ef4444' // 赤
    }

    // スコアデータをログ出力
    const scoresEntries = Object.entries(data.scores)
    console.log('スコアエントリ:', scoresEntries)

    // 統計情報を表示
    const totalScore = scoresEntries.reduce((sum, [, score]) => sum + score, 0)

    const medals = ['🥇', '🥈', '🥉']

    const scoresHTML = scoresEntries
      .sort((a, b) => b[1] - a[1])
      .map(
        ([user, score], index) => {
          const contribution = totalScore > 0 ? (score / totalScore) * 100 : 0
          const medal = medals[index] ?? ''
          return `<li style="margin: 8px 0; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #000;">
            <strong>${user}:</strong> ${contribution.toFixed(1)}% ${medal}
          </li>`
        }
      )
      .join('')
    console.log('生成されたHTML:', scoresHTML)

   statsContainer.innerHTML = `
    <div style="margin: 16px 0;">
      <h3 style="color: inherit;">統計情報</h3>
      <p style="color: inherit;"><strong>総コミット数:</strong> ${data.totalCommits}件</p>
      <p style="color: inherit;"><strong>総発言数:</strong> ${data.totalMessages}件</p>
      <h3 style="color: inherit;">メンバーのスコア</h3>
      <ul style="list-style: none; padding: 0;">
        ${scoresHTML}
      </ul>
    </div>
    `
  } catch (error) {
    console.error('崩壊度の計算に失敗しました:', error)
    meterLabel.innerText = 'エラー: 計算に失敗しました'
    meterPercent.innerText = '-'
    statsContainer.innerHTML = '<p style="color: red;">データの計算に失敗しました。</p>'
  }
}

// 締め切りカウントダウンを表示
async function renderCountdown(): Promise<void> {
  const countdownEl = document.getElementById('countdown')
  if (!countdownEl) return

  let deadline = await window.api.loadDeadline()

  if (!deadline) {
    // 初回は日付入力を表示
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

  // カウントダウン計算
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

  // 前へボタン
  backBtn?.addEventListener('click', () => {
    showPage('pagedis3')
  })

  setupChat()
}
