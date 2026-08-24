import { showPage } from '../utils/dom'
import { renderCheckList } from './pagegit3'

// 登録済みリポジトリを表示
export async function renderRegisteredRepos(): Promise<void> {
  const list = document.getElementById('registeredList')
  const repos = await window.api.loadRepos()

  if (!list) return
  list.innerHTML = ''

  if (repos.length === 0) {
    list.innerHTML = '<li>登録されていません</li>'
    return
  }

  for (const repo of repos) {
    const li = document.createElement('li')
    li.innerHTML = `
      ${repo.full_name}
      <button data-repo="${repo.full_name}" class="removeBtn">削除</button>
    `
    list.appendChild(li)
  }

  document.querySelectorAll('.removeBtn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const fullName = (e.target as HTMLElement).dataset.repo!
      await window.api.removeRepo(fullName)
      await renderRegisteredRepos()
    })
  })
}

// GitHubからリポジトリ一覧をselectに読み込む
export async function loadRepoOptions(): Promise<void> {
  const select = document.getElementById('repoSelect') as HTMLSelectElement
  if (!select) return

  select.innerHTML = '<option value="">リポジトリを選択...</option>'
  const repos = await window.api.getAllRepos()
  for (const repo of repos) {
    const option = document.createElement('option')
    option.value = repo.full_name
    option.innerText = repo.full_name
    select.appendChild(option)
  }
}

export function setupPage2(): void {
  const addRepoBtn = document.getElementById('addRepoBtn')
  const logoutBtn = document.getElementById('logoutBtn')
  const toPage3Btn = document.getElementById('toPage3Btn')

  // 追加ボタン
  addRepoBtn?.addEventListener('click', async () => {
    const select = document.getElementById('repoSelect') as HTMLSelectElement
    const message = document.getElementById('repoMessage')
    const selected = select.value
    if (!selected) return

    const [_, name] = selected.split('/')
    const result = await window.api.addRepo({ name, full_name: selected })
    if (message) message.innerText = result.message
    await renderRegisteredRepos()
  })

  // ログアウトボタン
  logoutBtn?.addEventListener('click', async () => {
    await window.api.logout()
    showPage('pagegit1')
  })

  // 次へボタン
toPage3Btn?.addEventListener('click', async () => {
  await renderCheckList()
  showPage('pagegit3')
})
}