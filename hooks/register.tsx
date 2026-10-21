import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limits, ReactionKind } from '../types'

const reaction = atom({ plugin: 'prompt-pet', key: 'reaction' } as const, null)
const limits = atom({ plugin: 'prompt-pet', key: 'limits' } as const, {})

const REACTION_MS = 20_000
const TEST_COMMAND = /\b(pytest|unittest|test)\b/

type Mood = 'sleepy' | 'calm' | 'busy' | 'sweaty' | 'panic' | 'happy' | 'worried'

// Clawd, the Claude Code crab. Each mood swaps his top row (eyes), arms and an accessory.
type Look = { top: string; body: string; extra: string; line: string; color: string }

const LEGS = '  ▘▘ ▝▝  '
const ARMS_DOWN = '▝▜█████▛▘'
const ARMS_UP = '▗▟█████▙▖'

const LOOKS: Record<Mood, Look> = {
  calm: { top: ' ▐▛███▜▌ ', body: ARMS_DOWN, extra: '', line: 'all good, plenty of limit left', color: 'claude' },
  busy: { top: ' ▐▛███▜▌ ', body: ARMS_DOWN, extra: ' …', line: 'thinking...', color: 'claude' },
  sleepy: { top: ' ▐▀███▀▌ ', body: ARMS_DOWN, extra: ' zZ', line: 'no usage data yet', color: 'subtle' },
  sweaty: { top: ' ▐▛███▜▌ ', body: ARMS_DOWN, extra: ' ;', line: 'past half of the 5h limit, pace yourself', color: 'warning' },
  panic: { top: ' ▐▙███▟▌ ', body: ARMS_UP, extra: ' !!', line: '5h limit almost gone', color: 'error' },
  happy: { top: ' ▐▛███▜▌ ', body: ARMS_UP, extra: ' ✦', line: 'tests passed!', color: 'success' },
  worried: { top: ' ▐▄███▄▌ ', body: ARMS_DOWN, extra: ' ?', line: 'something failed, let us look', color: 'warning' },
}

const toLimits = (windows: SessionRateLimit[]): Limits => {
  const pick = (kind: string) => {
    const w = windows.find(one => one.kind === kind)
    return w && { percent: w.percentUsed, resetsAt: w.resetsAt }
  }
  return { fiveHour: pick('five_hour'), week: pick('seven_day') }
}

const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  const h = Math.floor(minutes / 60)
  return h > 0 ? ` ↻${h}h${minutes % 60}m` : ` ↻${minutes}m`
}

async function react($: EngineInterface, kind: ReactionKind) {
  const until = (await $.clock.now()) + REACTION_MS
  await update($, reaction, () => ({ kind, until }))
  void $.clock.sleep(REACTION_MS).then(() =>
    update($, reaction, r => (r !== null && r.until <= until ? null : r)),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Claude pet: /pet task <text> | /pet task (clear) | /pet hide | /pet show',
    })
    await update($, limits, () => ({}))
    const usage = await $.session.usage()
    await update($, limits, () => toLimits(usage.rateLimits))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, limits, () => toLimits(e.rateLimits))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true) {
      await react($, 'worried')
    } else if (ran.deny === undefined && e.tool === 'Bash' && TEST_COMMAND.test(e.command)) {
      await react($, 'happy')
    }

    return ran
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const text = rest.join(' ')

    if (verb === 'task') {
      await (text ? $.store.set('task', text) : $.store.delete('task'))
      return { text: text ? `Pet now shows: ${text}` : 'Task label cleared.' }
    }
    if (verb === 'hide' || verb === 'show') {
      await $.store.set('hidden', verb === 'hide')
      return { text: verb === 'hide' ? 'Pet hidden. /pet show brings it back.' : 'Pet is back.' }
    }
    return { text: 'Usage: /pet task <text> | /pet task | /pet hide | /pet show' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await $.store.get('hidden')) === true) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const r = await read($, reaction)
    const { fiveHour, week } = await read($, limits)
    const task = (await $.store.get('task')) as string | undefined

    const mood: Mood =
      r !== null && r.until > now ? r.kind
      : fiveHour === undefined ? (e.props.isWorking ? 'busy' : 'sleepy')
      : fiveHour.percent >= 80 ? 'panic'
      : fiveHour.percent >= 50 ? 'sweaty'
      : e.props.isWorking ? 'busy'
      : 'calm'
    const look = LOOKS[mood]

    const info = [
      task,
      fiveHour && `5h ${fiveHour.percent}%${untilReset(fiveHour.resetsAt, now)}`,
      week && `week ${week.percent}%`,
    ].filter(Boolean).join(' · ')

    return (
      <Box flexDirection="row">
        <Box flexDirection="column">
          <Text>
            <Text color="claude">{look.top}</Text>
            <Text color={look.color} bold>{look.extra.padEnd(3)}</Text>
          </Text>
          <Text color="claude">{look.body}</Text>
          <Text color="claude">{LEGS}</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          <Text> </Text>
          <Text color={look.color}>{look.line}</Text>
          {info !== '' && <Text dimColor>{info}</Text>}
        </Box>
      </Box>
    )
  })
}
