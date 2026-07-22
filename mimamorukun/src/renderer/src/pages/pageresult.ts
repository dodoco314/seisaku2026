import { showPage, escapeHtml } from '../utils/dom'
import { setupChat } from './pagechat'

export interface DistortionData {
  scores: Record<string, number>
  avgScore: number
  stdDev: number
  distortion: number
}

// let currentDistortionData: DistortionData | null = null
// let currentRepoName: string | null = null

const CHART_COL_WIDTH = 500

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
    // currentDistortionData = data
    // currentRepoName = repoName

    const distortionPercent = Math.min(data.distortion, 100)

    const track = meterFill.parentElement as HTMLElement | null
    meterFill.style.width = `${distortionPercent}%`
    meterLabel.innerText = `スコア`
    meterLabel.style.fontSize = '12px'
    meterLabel.style.color = '#8a8a99'
    meterLabel.style.fontWeight = '400'
    meterPercent.innerText = `${distortionPercent.toFixed(1)}%`

    if (track) {
      // 33% / 66% の閾値目盛りを描画（再描画のたびに重複しないよう一度クリアする）
      track.querySelectorAll('.meter-tick').forEach((el) => el.remove())
      ;[33, 66].forEach((pos) => {
        const tick = document.createElement('div')
        tick.className = 'meter-tick'
        tick.style.position = 'absolute'
        tick.style.left = `${pos}%`
        tick.style.top = '0'
        tick.style.bottom = '0'
        tick.style.width = '1px'
        tick.style.background = 'rgba(255,255,255,0.25)'
        track.appendChild(tick)
      })
    }

    if (distortionPercent < 33) {
      meterFill.style.backgroundColor = '#22c55e'
    } else if (distortionPercent < 66) {
      meterFill.style.backgroundColor = '#eab308'
    } else {
      meterFill.style.backgroundColor = '#ef4444'
    }

    const sortedEntries = Object.entries(data.scores).sort((a, b) => b[1] - a[1])
    const totalScore = sortedEntries.reduce((sum, [, score]) => sum + score, 0)
    const medals = ['🥇', '🥈', '🥉']
    const colors = ['#3b82f6', '#0ea5e9', '#06b6d4', '#6366f1', '#8b5cf6', '#38bdf8']

    // 初期表示（貢献度・円グラフ）
    const initialHTML = buildPieChart(sortedEntries, totalScore, medals, colors, data)

    statsContainer.innerHTML = `
      <div style="margin: 12px 0;">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1; padding: 8px 12px; background: #15151c; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; color: #8a8a99;">総コミット数</span>
            <span style="font-size: 14px; font-weight: 700; color: inherit;">${data.totalCommits}件</span>
          </div>
          <div style="flex: 1; padding: 8px 12px; background: #15151c; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; color: #8a8a99;">総発言数</span>
            <span style="font-size: 14px; font-weight: 700; color: inherit;">${data.totalMessages}件</span>
          </div>
        </div>
        <h3 style="color: inherit; font-size: 15px; margin: 8px 0;">メンバーのスコア</h3>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <button id="tabContribution" style="padding: 4px 14px; border-radius: 4px; border: none; background: #3b82f6; color: white; cursor: pointer; font-size: 12px;">貢献度</button>
          <button id="tabCommits" style="padding: 4px 14px; border-radius: 4px; border: none; background: #475569; color: white; cursor: pointer; font-size: 12px;">コミット数</button>
          <button id="tabMessages" style="padding: 4px 14px; border-radius: 4px; border: none; background: #475569; color: white; cursor: pointer; font-size: 12px;">発言数</button>
        </div>
        <div id="scoreList">${initialHTML}</div>
      </div>
    `

    const renderTab = (type: 'contribution' | 'commits' | 'messages') => {
      const list = document.getElementById('scoreList')
      if (!list) return

      document.getElementById('tabContribution')!.style.background = type === 'contribution' ? '#3b82f6' : '#475569'
      document.getElementById('tabCommits')!.style.background = type === 'commits' ? '#3b82f6' : '#475569'
      document.getElementById('tabMessages')!.style.background = type === 'messages' ? '#3b82f6' : '#475569'

      const tabSorted = [...sortedEntries].sort((a, b) => {
        if (type === 'commits') return (data.commitsByUser[b[0]] ?? 0) - (data.commitsByUser[a[0]] ?? 0)
        if (type === 'messages') return (data.messagesByUser[b[0]] ?? 0) - (data.messagesByUser[a[0]] ?? 0)
        return b[1] - a[1]
      })

      if (type === 'contribution') {
        list.innerHTML = buildPieChart(tabSorted, totalScore, medals, colors, data)
      } else {
        list.innerHTML = buildBarChart(tabSorted, type, medals, colors, data)
      }
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

function buildPieChart(
  entries: [string, number][],
  totalScore: number,
  medals: string[],
  colors: string[],
  data: any
): string {
  const size = 150
  const cx = size / 2
  const cy = size / 2
  const r = 60
  let startAngle = -Math.PI / 2
  let slices = ''

  entries.forEach(([, score], index) => {
    const contribution = totalScore > 0 ? score / totalScore : 0
    const angle = contribution * 2 * Math.PI
    const endAngle = startAngle + angle
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const color = colors[index % colors.length]

    slices += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="white" stroke-width="2"/>`

    const midAngle = startAngle + angle / 2
    const lx = cx + (r * 0.65) * Math.cos(midAngle)
    const ly = cy + (r * 0.65) * Math.sin(midAngle)
    slices += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9" font-weight="bold">${(contribution * 100).toFixed(1)}%</text>`

    startAngle = endAngle
  })

  const tableRows = entries.map(([user, score], index) => {
    const contribution = totalScore > 0 ? (score / totalScore) * 100 : 0
    const medal = medals[index] ?? `${index + 1}位`
    const color = colors[index % colors.length]
    return `<tr style="border-bottom:1px solid #2a2a35;">
      <td style="padding:5px 8px;">${medal}</td>
      <td style="padding:5px 8px;"><span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:50%;margin-right:6px;"></span>${escapeHtml(user)}</td>
      <td style="padding:5px 8px;text-align:right;">${contribution.toFixed(1)}%</td>
    </tr>`
  }).join('')

  return `
    <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
      <div style="width:${CHART_COL_WIDTH}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${slices}</svg>
      </div>
      <table style="width:300px;flex-shrink:0;border-collapse:collapse;color:#E5E4F0;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #3a3a48;">
            <th style="padding:5px 8px;text-align:left;color:#8a8a99;font-weight:400;">順位</th>
            <th style="padding:5px 8px;text-align:left;color:#8a8a99;font-weight:400;">名前</th>
            <th style="padding:5px 8px;text-align:right;color:#8a8a99;font-weight:400;">貢献度</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `
}

function buildBarChart(
  entries: [string, number][],
  type: 'commits' | 'messages',
  medals: string[],
  colors: string[],
  data: any
): string {
  const values = entries.map(([user]) =>
    type === 'commits' ? (data.commitsByUser[user] ?? 0) : (data.messagesByUser[user] ?? 0)
  )
  const maxVal = Math.max(...values, 1)
  const barWidth = 56
  const gap = 22
  const chartH = 120
  const topPad = 22
  const chartW = entries.length * (barWidth + gap) + gap
  const unit = type === 'commits' ? '回' : '件'

  let bars = ''
  entries.forEach(([user], index) => {
    const val = values[index]
    const barH = (val / maxVal) * chartH
    const x = gap + index * (barWidth + gap)
    const y = topPad + (chartH - barH)
    const color = colors[index % colors.length]
    const medal = medals[index] ?? ''

    const label = `${medal}${user}`
    const maxChars = Math.max(4, Math.floor((barWidth + gap - 6) / 6))
    const displayLabel = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label

    bars += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${color}" rx="4"/>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">${val}</text>
      <text x="${x + barWidth / 2}" y="${topPad + chartH + 16}" text-anchor="middle" fill="#fff" font-size="10">${escapeHtml(displayLabel)}</text>
    `
  })

  const tableRows = entries.map(([user], index) => {
    const val = values[index]
    const medal = medals[index] ?? `${index + 1}位`
    const color = colors[index % colors.length]
    return `<tr style="border-bottom:1px solid #2a2a35;">
      <td style="padding:5px 8px;">${medal}</td>
      <td style="padding:5px 8px;"><span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:50%;margin-right:6px;"></span>${escapeHtml(user)}</td>
      <td style="padding:5px 8px;text-align:right;">${val}${unit}</td>
    </tr>`
  }).join('')

  return `
    <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
      <div style="width:${CHART_COL_WIDTH}px;flex-shrink:0;display:flex;align-items:center;">
        <svg width="${chartW}" height="${topPad + chartH + 32}" viewBox="0 0 ${chartW} ${topPad + chartH + 32}" style="overflow:visible;">
          <line x1="0" y1="${topPad + chartH}" x2="${chartW}" y2="${topPad + chartH}" stroke="#4a4a58" stroke-width="1"/>
          ${bars}
        </svg>
      </div>
      <table style="width:300px;flex-shrink:0;border-collapse:collapse;color:#E5E4F0;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #3a3a48;">
            <th style="padding:5px 8px;text-align:left;color:#8a8a99;font-weight:400;">順位</th>
            <th style="padding:5px 8px;text-align:left;color:#8a8a99;font-weight:400;">名前</th>
            <th style="padding:5px 8px;text-align:right;color:#8a8a99;font-weight:400;">${type === 'commits' ? 'コミット数' : '発言数'}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `
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