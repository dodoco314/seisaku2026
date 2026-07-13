import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // GitHub認証系
      getToken: () => Promise<string | null>
      login: () => Promise<{ userCode: string; verificationUri: string }>
      poll: () => Promise<string>
      logout: () => Promise<void>

      // リポジトリ管理系
      getAllRepos: () => Promise<{ name: string; full_name: string }[]>
      loadRepos: () => Promise<{ name: string; full_name: string; added_at: string }[]>
      addRepo: (repo: { name: string; full_name: string }) => Promise<{ success: boolean; message: string }>
      removeRepo: (fullName: string) => Promise<void>

      // データ取得系
      fetchData: (selectedRepos: string[]) => Promise<string>
      calculateDistortion: (repoName: string, guildId?: string) => Promise<{
        scores: Record<string, number>
        avgScore: number
        stdDev: number
        distortion: number
    
    
      }>

      // みまもるくん チャット系
      chat: (message: string, userId?: string) => Promise<string>


      // Discord系
      discord: {
        getUser: () => Promise<{ id: string; username: string } | null>
        login: () => Promise<{ id: string; username: string }>
        logout: () => Promise<void>
        getMyAvailableServers: () => Promise<{ guild_id: string; guild_name: string; message_count: number }[]>
        openBotInvite: () => Promise<void>
        getSettings: (repoFullName: string) => Promise<{ guild_id: string; guild_name: string; bot_registered: boolean } | null>
        saveServer: (repoFullName: string, guildId: string, guildName: string) => Promise<void>
        setBotRegistered: (repoFullName: string, guildId: string) => Promise<void>
        getDiscordUsers: (guildId: string) => Promise<{ author_id: string; author_name: string; message_count: number }[]>
        getAccountLinks: (repoFullName: string) => Promise<{ github_username: string; discord_user_id: string | null; discord_user_name: string | null }[]>
        saveAccountLink: (githubUsername: string, discordUserId: string, discordUserName: string, repoFullName: string) => Promise<void>
        saveGithubUsers: (repoFullName: string, githubUsernames: string[]) => Promise<void>
        calcScores: (guildId: string) => Promise<
          {
            author_id: string
            author_name: string
            score: number
            scoreX20: number
            percentage: number
            breakdown: {
              messageCount: number
              activeDays: number
              channelCount: number
              replyCount: number
              avgContentLength: number
            }
          }[]
        >
      }
    }
  }
}
