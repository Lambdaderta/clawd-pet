import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-pet',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: false, maxRows: 10 },
} as const

const start = async ($: any, on: any, percent: number | null) => {
  const store = new Map<string, unknown>()
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_: unknown, e: { key: string }) => (store.delete(e.key), { value: undefined }))
  on('clock.now', () => ({ value: 1_000 }))
  on('clock.sleep', () => new Promise(() => {}))
  on('tool.call', (_: unknown, e: { command?: string }) =>
    e.command === 'false' ? { result: {}, isError: true } : { result: {} },
  )
  on('command.register', () => ({ value: { command: 'pet' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {},
      rateLimits: percent === null ? [] : [
        { kind: 'five_hour', percentUsed: percent },
        { kind: 'seven_day', percentUsed: 7 },
      ],
    },
  }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('calm below half of the 5h limit, with both windows shown', async ($, on) => {
  await start($, on, 12)
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /plenty of limit/ }))?.text).toContain('plenty')
  expect((await ui.find({ type: 'Text', text: /5h 12%/ }))?.text).toContain('week 7%')
  await ui.unmount()
})

test('panics at 80% of the 5h limit', async ($, on) => {
  await start($, on, 85)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /almost gone/ })).toBeTruthy()
  await ui.unmount()
})

test('sleeps without usage data', async ($, on) => {
  await start($, on, null)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /no usage data/ })).toBeTruthy()
  await ui.unmount()
})

test('worried after a failed tool, happy after a passing test run', async ($, on) => {
  await start($, on, 12)

  await $.tool.call({ tool: 'Bash', command: 'false' })
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /something failed/ })).toBeTruthy()
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'uv run pytest -q' })
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /tests passed/ })).toBeTruthy()
  await ui.unmount()
})

test('/pet task sets the label shown under the pet', async ($, on) => {
  await start($, on, 12)
  await $.command.run({ command: 'pet', args: 'task Task 1: baselines' })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /Task 1: baselines/ }))?.text).toContain('5h 12%')
  await ui.unmount()
})
