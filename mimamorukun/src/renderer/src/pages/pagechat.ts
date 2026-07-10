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

    const p = document.createElement('p')
    p.style.color = '#000000'
    const formatted = text.replace(/\n/g, '<br>')
    p.innerHTML = `<strong>${sender}:</strong> ${formatted}`
    chat.appendChild(p)
    chat.scrollTop = chat.scrollHeight
}