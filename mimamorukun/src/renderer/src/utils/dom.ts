// 画面切り替え
export function showPage(pageId: string): void {
  document.querySelectorAll('.page').forEach((page) => {
    (page as HTMLElement).style.display = 'none'
  })
  const target = document.getElementById(pageId)
  if (target) target.style.display = 'block'
}

// XSS対策: 文字列をエスケープする
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}