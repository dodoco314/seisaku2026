import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { app } from 'electron'
import * as fs from 'fs'


const execAsync = promisify(exec)

// Ollamaがインストールされているか確認
async function isOllamaInstalled(): Promise<boolean> {
  try {
    await execAsync('ollama --version')
    return true
  } catch {
    return false
  }
}

// mimamoru モデルが存在するか確認
async function isMimamoruModelInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ollama list')
    return stdout.includes('mimamoru')
  } catch {
    return false
  }
}

// Ollamaサービスが起動しているか確認
async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    return res.ok
  } catch {
    return false
  }
}

// モデルをセットアップ（pull + create）
async function setupModel(): Promise<void> {
  const modelfilePath = join(app.getAppPath(), 'Modelfile')

  if (!fs.existsSync(modelfilePath)) {
    console.warn('[ollama] Modelfileが見つかりません:', modelfilePath)
    return
  }

  console.log('[ollama] qwen2.5をダウンロード中...')
  await execAsync('ollama pull qwen2.5')

  console.log('[ollama] mimamoruモデルを作成中...')
  await execAsync(`ollama create mimamoru -f "${modelfilePath}"`)

  console.log('[ollama] モデルのセットアップ完了')
}

// Ollamaをバックグラウンドで起動
function startOllama(): void {
  const process = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore'
  })
  process.unref()
  console.log('[ollama] サービスを起動しました')
}

// メインのセットアップ関数
export async function setupOllama(): Promise<{
  status: 'ok' | 'not_installed' | 'error'
  message: string
}> {
  try {
    // Ollamaがインストールされているか確認
    const installed = await isOllamaInstalled()
    if (!installed) {
      console.warn('[ollama] Ollamaがインストールされていません')
      return {
        status: 'not_installed',
        message: 'Ollamaがインストールされていません。https://ollama.com からインストールしてください。'
      }
    }

    // Ollamaが起動していなければ起動
    const running = await isOllamaRunning()
    if (!running) {
      console.log('[ollama] サービスを起動します...')
      startOllama()
      // 起動を少し待つ
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    // mimamoru モデルが存在しなければセットアップ
    const modelInstalled = await isMimamoruModelInstalled()
    if (!modelInstalled) {
      console.log('[ollama] mimamoruモデルをセットアップします...')
      await setupModel()
    } else {
      console.log('[ollama] mimamoruモデルは既にインストール済みです')
    }

    return { status: 'ok', message: 'Ollamaのセットアップが完了しました' }
  } catch (e) {
    console.error('[ollama] セットアップエラー:', e)
    return { status: 'error', message: `セットアップに失敗しました: ${e}` }
  }
}