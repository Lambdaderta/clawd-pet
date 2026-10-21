export type ReactionKind = 'happy' | 'worried'
export type Reaction = { kind: ReactionKind; until: number }
export type Limit = { percent: number; resetsAt?: string }
export type Limits = { fiveHour?: Limit; week?: Limit }

declare module 'claude-code' {
  interface PluginState {
    'prompt-pet': { reaction: Reaction | null; limits: Limits }
  }
}
