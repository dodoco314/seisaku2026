import { showPage } from '../utils/dom'
import { initDiscordFlow } from './pagedis1'

// グローバル変数でリポジトリ名を保持
export let selectedRepoName: string = ''

// 画面3のラジオボタンを更新
export async function renderCheckList(): Promise<void> {
  const checkList = document.getElementById('checkList')
  if (!checkList) return

  const repos = await window.api.loadRepos()
  checkList.innerHTML = ''

  if (repos.length === 0) {
    checkList.innerHTML = '<li>登録されていません</li>'
    return
  }

  for (const repo of repos) {
    const li = document.createElement('li')
    li.innerHTML = `
      <label>
        <input type="radio" name="repoRadio" class="repoRadio" value="${repo.full_name}" />
        ${repo.full_name}
      </label>
    `
    checkList.appendChild(li)
  }

  // 最初の項目をデフォルト選択
  const first = checkList.querySelector<HTMLInputElement>('.repoRadio')
  if (first) first.checked = true
}

export function setupPage3(): void {
  const fetchBtn = document.getElementById('fetchBtn')
  const toPage2Btn = document.getElementById('toPage2Btn')

  // 前へボタン
  toPage2Btn?.addEventListener('click', () => {
    showPage('pagegit2')
  })

  // データ取得ボタン
  fetchBtn?.addEventListener('click', async () => {
    const fetchStatus = document.getElementById('fetchStatus')
    const selected = document.querySelector<HTMLInputElement>('.repoRadio:checked')

    if (!selected) {
      if (fetchStatus) fetchStatus.innerText = 'リポジトリを選択してください'
      return
    }

    if (fetchStatus) fetchStatus.innerText = '取得中...'
    const outputPath = await window.api.fetchData([selected.value])
    if (fetchStatus) fetchStatus.innerText = `保存完了: ${outputPath}`

    // リポジトリ名を保存
    selectedRepoName = selected.value

    // Discordフロー開始（登録済みならスキップ判定も含む）
    await initDiscordFlow()
  })
}