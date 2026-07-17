import { escapeHtml } from '../utils/dom'

export function setupChat(): void {
    const sendBtn = document.getElementById('chat-send-btn')
    const input = document.getElementById('chat-input') as HTMLTextAreaElement

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
    row.className = `chat-row ${isUser ? 'chat-row-user' : 'chat-row-bot'}`

    const bubble = document.createElement('div')
    bubble.className = `chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-bot'}`

    // XSS対策: sender/text ともにエスケープしてから、こちらで生成した<br>だけ後付けする
    const senderLabel = isUser
        ? ''
        : `<div class="chat-sender-label">${escapeHtml(sender)}</div>`
    const formatted = escapeHtml(text).replace(/\n/g, '<br>')
    bubble.innerHTML = `${senderLabel}${formatted}`

    row.appendChild(bubble)
    chat.appendChild(row)
    chat.scrollTop = chat.scrollHeight
}