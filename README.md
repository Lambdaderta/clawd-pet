# clawd-pet

A little Clawd, the Claude Code crab, that lives above your prompt in Claude Code.

```
 ▐▛███▜▌
▝▜█████▛▘   all good, plenty of limit left
  ▘▘ ▝▝     Task 1: baselines · 5h 12% ↻2h40m · week 7%
```

## What it does

- **Mood follows your 5-hour plan limit:** calm below 50%, sweaty from 50%, panicking (arms up, `!!`) from 80%, sleepy before any usage data arrives, busy while Claude is working.
- **Reacts to what happens:** cheers (`✦`, arms up) after a successful test command (`pytest`, `test`), looks worried (`?`) after a failed tool call. Reactions last 20 seconds.
- **Shows your current task** and both usage windows (5-hour with time to reset, weekly).

Usage numbers come from a Claude subscription; without one the crab stays sleepy.

## Commands

- `/pet task <text>`: set the label under the crab (kept across sessions)
- `/pet task`: clear the label
- `/pet hide` / `/pet show`: hide or bring back the crab

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-pet --marketplace Lambdaderta/clawd-pet
```

From a shell:

```
claude plugin install prompt-pet --marketplace Lambdaderta/clawd-pet
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it appear in every session).

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Lambdaderta/clawd-pet`, then Add plugin.

## Development

`claude plugin test .` runs the tests in `hooks/register.test.tsx`.
