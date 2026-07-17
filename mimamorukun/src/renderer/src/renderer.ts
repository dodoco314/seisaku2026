import { showPage } from './utils/dom'
import { setupPage1 } from './pages/pagegit1'
import { setupPage2, loadRepoOptions, renderRegisteredRepos } from './pages/pagegit2'
import { setupPage3, renderCheckList } from './pages/pagegit3'
import { setupPage4 } from './pages/pagedis1'
import { setupPageDis2 } from './pages/pagedis2'
import { setupPage5 } from './pages/pageresult'

async function init(): Promise<void> {
  window.addEventListener('DOMContentLoaded', async () => {
    // 全ページのボタンイベントを初期化
    setupPage1()
    setupPage2()
    setupPage3()
    setupPage4()
    setupPageDis2()
    setupPage5()

    // 起動時に保存済みトークンを確認
    const token = await window.api.getToken()
    if (token) {
      await loadRepoOptions()
      await renderRegisteredRepos()
      await renderCheckList()
      showPage('pagegit2')
    } else {
      showPage('pagegit1')
    }
  })
}

init()
