import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const OUTPUT_PATH = join(app.getAppPath(), 'github-data.json')

// リポジトリ一覧を取得
export async function getRepositories(token: string): Promise<{ name: string; full_name: string }[]> {
  const repos: { name: string; full_name: string }[] = []
  let page = 1

  while (true) {
    const res = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break
    repos.push(...data.map((r: any) => ({ name: r.name, full_name: r.full_name })))
    page++
  }

  return repos
}

// コミット数をユーザーごとに集計
async function getCommitStats(
  token: string,
  fullName: string
): Promise<{ total: number; byUser: Record<string, number> }> {
  const byUser: Record<string, number> = {}
  let page = 1

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/commits?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break

    for (const commit of data) {
      const author = commit.author?.login || commit.commit?.author?.name || 'unknown'
      byUser[author] = (byUser[author] || 0) + 1
    }
    page++
  }

  const total = Object.values(byUser).reduce((a, b) => a + b, 0)
  return { total, byUser }
}

// ブランチ作成回数をユーザーごとに集計
async function getBranchStats(
  token: string,
  fullName: string
): Promise<{ total: number; byUser: Record<string, number> }> {
  const byUser: Record<string, number> = {}
  let page = 1

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/branches?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break

    for (const branch of data) {
      // ブランチの最初のコミットの作者を取得
      const commitRes = await fetch(
        `https://api.github.com/repos/${fullName}/commits/${branch.commit.sha}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const commitData = await commitRes.json()
      const author = commitData.author?.login || commitData.commit?.author?.name || 'unknown'
      byUser[author] = (byUser[author] || 0) + 1
    }
    page++
  }

  const total = Object.values(byUser).reduce((a, b) => a + b, 0)
  return { total, byUser }
}

// 選択されたリポジトリのデータを取得してJSONに保存
export async function fetchAndSaveData(token: string, selectedRepos: string[]): Promise<void> {
  const result: Record<string, any> = {}

  for (const fullName of selectedRepos) {
    console.log(`取得中: ${fullName}`)

    const [commits, branches] = await Promise.all([
      getCommitStats(token, fullName),
      getBranchStats(token, fullName)
    ])

    result[fullName] = {
      commits,
      branches,
      fetched_at: new Date().toISOString()
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8')
  console.log('保存完了:', OUTPUT_PATH)
}

// 保存先のパスを返す
export function getOutputPath(): string {
  return OUTPUT_PATH
}

// 崩壊度を計算（GitHub・Discord両対応）
export function calculateDistortion(
  commits: Record<string, number>,
  branches: Record<string, number>,
  discordScores?: Record<string, number>
): { scores: Record<string, number>; avgScore: number; stdDev: number; distortion: number } {

  const scores: Record<string, number> = {}
  const users = new Set([...Object.keys(commits), ...Object.keys(branches)])

  for (const user of users) {
    const commitCount = commits[user] || 0
    const branchCount = branches[user] || 0
    const githubScore = Math.log(commitCount + 1) * 0.7 + Math.log(branchCount + 1) * 0.3
    const discordScore = discordScores?.[user] ?? null

    if (discordScore !== null) {
      // GitHubとDiscord両方ある場合
      scores[user] = githubScore * 0.5 + discordScore * 0.5
    } else {
      // GitHubのみの場合
      scores[user] = githubScore * 0.5
    }
  }

  // Discordのみのユーザーを追加
  if (discordScores) {
    for (const user of Object.keys(discordScores)) {
      if (!scores[user]) {
        scores[user] = discordScores[user] * 0.5
      }
    }
  }

  // 平均スコア
  const scoreValues = Object.values(scores)
  const avgScore = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length

  // 標準偏差
  const variance =
    scoreValues.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scoreValues.length
  const stdDev = Math.sqrt(variance)

  // 崩壊度
  const distortion = avgScore > 0 ? (stdDev / avgScore) * 100 : 0

  return { scores, avgScore, stdDev, distortion }
}