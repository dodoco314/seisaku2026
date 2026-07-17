import { escapeHtml } from '../utils/dom'

export function setupChat(): void {
    const sendBtn = document.getElementById('chat-send-btn')
    const input = document.getElementById('chat-input') as HTMLTextAreaElement
    const chat = document.getElementById('chat')

    if (chat) {
        chat.style.background = '#0f0f14'
        chat.style.border = '0.5px solid #2a2a35'
        chat.style.borderRadius = '10px'
        chat.style.padding = '14px'
        chat.style.display = 'flex'
        chat.style.flexDirection = 'column'
        chat.style.gap = '10px'
        chat.style.overflowY = 'auto'
    }

    sendBtn?.addEventListener('click', () => sendMessage())

    input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
    }
    })

    // 少し遅らせて挨拶を表示
    setTimeout(() => {
        addMessage('みまもるくん', 'こんにちは！\n困っている課題や、改善したい点はありますか？')
    }, 500)
}

async function sendMessage(): Promise<void> {
    const input = document.getElementById('chat-input') as HTMLTextAreaElement
    const msg = input.value.trim()
    if (!msg) return

    addMessage('あなた', msg)
    input.value = ''

    try {
        const reply = await window.api.chat(msg)
        addMessage('みまもるくん', reply)
    } catch (error) {
        console.error('チャットエラー:', error)
        addMessage('みまもるくん', 'エラーが発生しました。もう一度お試しください。')
    }
}

function addMessage(sender: string, text: string): void {
    const chat = document.getElementById('chat')
    if (!chat) return

    const isUser = sender === 'あなた'

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.justifyContent = isUser ? 'flex-end' : 'flex-start'

    const bubble = document.createElement('div')
    bubble.style.maxWidth = '75%'
    bubble.style.padding = '8px 12px'
    bubble.style.borderRadius = '10px'
    bubble.style.fontSize = '13px'
    bubble.style.lineHeight = '1.5'
    bubble.style.color = isUser ? '#ffffff' : '#E5E4F0'
    bubble.style.background = isUser ? '#3b82f6' : '#1c1c25'
    bubble.style.border = isUser ? 'none' : '0.5px solid #2a2a35'

    // XSS対策: sender/text ともにエスケープしてから、こちらで生成した<br>だけ後付けする
    const senderLabel = isUser
        ? ''
        : `<div style="font-size:11px;color:#8a8a99;margin-bottom:2px;">${escapeHtml(sender)}</div>`
    const formatted = escapeHtml(text).replace(/\n/g, '<br>')
    bubble.innerHTML = `${senderLabel}${formatted}`

    row.appendChild(bubble)
    chat.appendChild(row)
    chat.scrollTop = chat.scrollHeight
}