import { shell } from 'electron'
import * as keytar from 'keytar'

const SCOPE = 'read:org,repo'
const SERVICE_NAME = 'mimamorukun'
const ACCOUNT_NAME = 'github_token'
const SERVER_URL = 'https://mimamorukuntokensaver-production-df1e.up.railway.app'

// dotenv.config()より後に実行されるよう関数で取得
function getClientId(): string {
  return process.env.GITHUB_CLIENT_ID!
}

// 保存済みトークンを取得
export async function getSavedToken(): Promise<string | null> {
  const saved = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
  if (!saved) return null
  return JSON.parse(saved).sessionToken
}

// トークンを削除（ログアウト用）
export async function deleteToken(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
}

// デバイスフローを開始
export async function startOAuthFlow(): Promise<{ userCode: string; verificationUri: string }> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ client_id: getClientId(), scope: SCOPE })
  })

  const data = await res.json()
  console.log('デバイスフロー開始:', data)

  _deviceCode = data.device_code
  _interval = data.interval || 5

  shell.openExternal(data.verification_uri)

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri
  }
}

// device_codeを一時保存
let _deviceCode = ''
let _interval = 5

// ユーザーが認証するまでポーリング
export async function pollForToken(): Promise<string> {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, _interval * 1000))

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: getClientId(),
        device_code: _deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })

    const data = await res.json()

    if (data.access_token) {
      // ユーザー情報を取得
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      })
      const user = await userRes.json()

      // Railwayサーバーにアクセストークンを送ってJWTを取得
      const serverRes = await fetch(`${SERVER_URL}/auth/github/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: data.access_token })
      })
      const serverData = await serverRes.json()
      console.log('Railwayサーバーレスポンス:', JSON.stringify(serverData))

      // keytarに保存
      await keytar.setPassword(
        SERVICE_NAME,
        ACCOUNT_NAME,
        JSON.stringify({
          sessionToken: serverData.sessionToken,
          accessToken: data.access_token,
          user: user.login,
          saved_at: new Date().toISOString()
        })
      )

      console.log('認証成功:', user.login)
      return serverData.sessionToken
    }

    if (data.error && data.error !== 'authorization_pending') {
      throw new Error(data.error)
    }
  }
}

// GitHub APIアクセス用のトークンを取得
export async function getGithubAccessToken(): Promise<string | null> {
  const saved = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
  if (!saved) return null
  return JSON.parse(saved).accessToken ?? null
}