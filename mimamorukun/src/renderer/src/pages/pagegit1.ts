import { showPage } from '../utils/dom'
import { loadRepoOptions, renderRegisteredRepos } from './pagegit2'
import { renderCheckList } from './pagegit3'

export function setupPage1(): void {
  const loginBtn = document.getElementById('loginBtn')
  const userCodeText = document.getElementById('userCode')
  const statusText = document.getElementById('authStatus')
  const copyBtn = document.getElementById('copyBtn')

  loginBtn?.addEventListener('click', async () => {
    if (statusText) {
      statusText.className = 'status-loading'
      statusText.innerHTML = '<span class="spinner"></span>認証中...'
    }

    const { userCode } = await window.api.login()
    if (userCodeText) {
      userCodeText.innerText = userCode
    }

    // コピーボタンを表示
    if (copyBtn) {
      copyBtn.style.display = 'inline-block'
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(userCode)
        copyBtn.innerText = 'コピーしました！'
        setTimeout(() => {
          copyBtn.innerText = 'コードをコピー'
        }, 2000)
      })
    }

    // ここからはユーザーがブラウザ側で認証を完了するのを待つフェーズ
    if (statusText) {
      statusText.className = 'status-loading'
      statusText.innerHTML = '<span class="spinner"></span>ブラウザでの認証を待っています...'
    }

    const token = await window.api.poll()
    if (token) {
      if (userCodeText) userCodeText.innerText = ''
      if (statusText) {
        statusText.className = ''
        statusText.innerText = ''
      }
      if (copyBtn) copyBtn.style.display = 'none'
      await loadRepoOptions()
      await renderRegisteredRepos()
      await renderCheckList()
      showPage('pagegit2')
    }
  })
}