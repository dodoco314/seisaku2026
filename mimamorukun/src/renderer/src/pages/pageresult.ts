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
    meterLabel.innerText = `崩壊度メーター`
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
    const scoresHTML = scoresEntries
      .sort((a, b) => b[1] - a[1])
      .map(
        ([user, score]) =>
          `<li style="margin: 8px 0; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #000;">
            <strong>${user}:</strong> ${score.toFixed(4)}%
          </li>`
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

export function setupPage5(): void {
  const backBtn = document.getElementById('toPage3Btn2')

  // 前へボタン
  backBtn?.addEventListener('click', () => {
    showPage('pagedis3')
  })

  setupChat()
}
