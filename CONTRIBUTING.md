# Contributing to AskCricket

Thanks for your interest! AskCricket is a lean, hackathon-born project — contributions that keep it simple and fast are most welcome.

## What's in scope

- Bug fixes in the agent loop, tools, or Azure API wrapper
- New tools (pure JS, no async, no I/O — see `src/tools.js` pattern)
- UI improvements to `public/app.js` and `public/index.html`
- Data additions (new IPL seasons from Cricsheet)

## Getting started

```bash
git clone https://github.com/ayushium/AskCricket.git
cd AskCricket
npm install
```

Create `.dev.vars` with your Azure OpenAI credentials (see README), then:

```bash
npm run dev   # local Worker at http://localhost:8787
```

## Adding a new tool

1. Write a pure synchronous function in `src/tools.js` — no `async`, no `fetch`, no side effects.
2. Add it to the `TOOLS` export object.
3. Add an OpenAI function-calling schema to `TOOL_SCHEMAS`.
4. Test it by asking the agent a question that should invoke it.

## Rebuilding the dataset

```bash
# Download IPL JSON files from https://cricsheet.org/downloads/
# Place in ./raw_matches/
npm run flatten
```

The flattener (`scripts/flatten.js`) reads Cricsheet match JSONs and writes `src/data.json`. Schema changes require updating both the flattener and the tools that consume the data.

## Pull requests

- Keep PRs focused — one change per PR.
- No new dependencies unless strongly justified (this project intentionally has zero runtime deps).
- Don't commit `.dev.vars`, secrets, or your Azure endpoint/key.
