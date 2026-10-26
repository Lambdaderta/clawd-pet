import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limits, ReactionKind } from '../types'

const reaction = atom({ plugin: 'prompt-pet', key: 'reaction' } as const, null)
const limits = atom({ plugin: 'prompt-pet', key: 'limits' } as const, {})

const REACTION_MS = 20_000
const TEST_COMMAND = /\b(pytest|unittest|test)\b/

type Mood = 'sleepy' | 'calm' | 'busy' | 'sweaty' | 'panic' | 'happy' | 'worried'

// What a mood says, whichever pet is shown: an accessory next to the head, a line and a color.
type Look = { extra: string; line: string; color: string }

const LOOKS: Record<Mood, Look> = {
  calm: { extra: '', line: 'all good, plenty of limit left', color: 'claude' },
  busy: { extra: ' …', line: 'thinking...', color: 'claude' },
  sleepy: { extra: ' zZ', line: 'no usage data yet', color: 'subtle' },
  sweaty: { extra: ' ;', line: 'past half of the 5h limit, pace yourself', color: 'warning' },
  panic: { extra: ' !!', line: '5h limit almost gone', color: 'error' },
  happy: { extra: ' ✦', line: 'tests passed!', color: 'success' },
  worried: { extra: ' ?', line: 'something failed, let us look', color: 'warning' },
}

// Rows of art per mood (pets may differ in height); the accessory goes right of the first row.
// Each row pairs its text with a mask of the same length: one PAINT key per cell.
type Row = [text: string, mask: string]
type Frame = Row[]
export type PetName = 'clawd' | 'capybara'
const DEFAULT_PET: PetName = 'clawd'
const PET_NAMES = ['clawd', 'capybara'] as const satisfies readonly PetName[]

const PAINT: Record<string, Color> = { c: 'claude', o: '#E8913A' }
const solid = (text: string, key: string): Row => [text, key.repeat(text.length)]

// Clawd, the Claude Code crab. Each mood swaps his top row (eyes) and arms.
const clawd = (eyes: string, arms: 'up' | 'down'): Frame => [
  solid(` ▐${eyes[0]}███${eyes[1]}▌ `, 'c'),
  solid(arms === 'up' ? '▗▟█████▙▖' : '▝▜█████▛▘', 'c'),
  solid('  ▘▘ ▝▝  ', 'c'),
]

// A sitting orange capybara facing right, with a box head.
// Each mood swaps its eye (a notch in the head) and front leg (resting or lifted).
const capybara = (eye: string, leg: 'rest' | 'up'): Frame => [
  solid('     ▄▄▄█▄▄▄', 'o'),
  solid(` ▄▄█████${eye}███`, 'o'),
  solid('▐███████▛▀▀▀', 'o'),
  solid(leg === 'up' ? '▝██▀▀▀▀▀▜▖  ' : '▝██▀▀▀█▜▌   ', 'o'),
]

// Splits a row into runs of one color, so each run is a single <Text>.
const runs = ([text, mask]: Row) => {
  const out: { text: string; color: Color }[] = []
  Array.from(text).forEach((ch, i) => {
    const color = PAINT[mask[i] ?? ''] ?? 'claude'
    const last = out[out.length - 1]
    if (last?.color === color) last.text += ch
    else out.push({ text: ch, color })
  })
  return out
}

const PETS: Record<PetName, Record<Mood, Frame>> = {
  clawd: {
    calm: clawd('▛▜', 'down'),
    busy: clawd('▛▜', 'down'),
    sleepy: clawd('▀▀', 'down'),
    sweaty: clawd('▛▜', 'down'),
    panic: clawd('▙▟', 'up'),
    happy: clawd('▛▜', 'up'),
    worried: clawd('▄▄', 'down'),
  },
  capybara: {
    calm: capybara('▟', 'rest'),
    busy: capybara('▟', 'rest'),
    sleepy: capybara('▄', 'rest'),
    sweaty: capybara('▟', 'rest'),
    panic: capybara('▐', 'up'),
    happy: capybara('▟', 'up'),
    worried: capybara('▙', 'rest'),
  },
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
      description: 'Claude pet: /pet task <text> | /pet task (clear) | /pet use <clawd|capybara> | /pet hide | /pet show',
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
    if (verb === 'use') {
      const name = text.toLowerCase()
      if (!PET_NAMES.includes(name as PetName)) {
        const current = ((await $.store.get('pet')) as PetName | undefined) ?? DEFAULT_PET
        return { text: `${name ? `No pet called "${text}". ` : ''}Current: ${current}. Pets: ${PET_NAMES.join(', ')}` }
      }
      await $.store.set('pet', name)
      return { text: `Pet is now ${name}.` }
    }
    return { text: 'Usage: /pet task <text> | /pet task | /pet use <name> | /pet hide | /pet show' }
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
    const pet = ((await $.store.get('pet')) as PetName | undefined) ?? DEFAULT_PET
    const [top, ...rest] = (PETS[pet] ?? PETS[DEFAULT_PET])[mood]

    const info = [
      task,
      fiveHour && `5h ${fiveHour.percent}%${untilReset(fiveHour.resetsAt, now)}`,
      week && `week ${week.percent}%`,
    ].filter(Boolean).join(' · ')

    return (
      <Box flexDirection="row">
        <Box flexDirection="column">
          <Text>
            {runs(top).map((run, i) => <Text key={i} color={run.color}>{run.text}</Text>)}
            <Text color={look.color} bold>{look.extra.padEnd(3)}</Text>
          </Text>
          {rest.map((row, i) => (
            <Text key={i}>
              {runs(row).map((run, j) => <Text key={j} color={run.color}>{run.text}</Text>)}
            </Text>
          ))}
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
