# sdp

Requirements, decisions, architecture and the delivery plan as **one graph of Gherkin files**: run
as tests, read as data — by people and by AI agents alike. A spec's tags say what it is and what it
links to, its rules what must hold and why, and its scenarios are the examples that run.

Node.js 24 or later; the sources run as they are, with no build step.

```sh
npm install
npm run verify                    # typecheck, sdp check, and every scenario of this repository
node src/cli/main.ts --help       # every command, one line each (`sdp` is this, or `npm link` once)
```

- sdp shown by running it: [specs/GUIDE.feature](specs/GUIDE.feature)
- why it exists: [specs/VISION.feature](specs/VISION.feature)
- what every command promises: [specs/features/REQ-cli.feature](specs/features/REQ-cli.feature)
- how to work with it, for agents and people: [the skill](.claude/skills/sdp/SKILL.md)
