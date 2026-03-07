# Adapt UI

Prompt-to-React sandbox that generates, validates, renders, and auto-repairs components/games using OpenAI.

## Requirements
- Node.js `20.11+`
- npm `10+`
- OpenAI API key

## Local run
1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env
```
3. Add `OPENAI_API_KEY` in `.env`.
4. Start dev server:
```bash
npm run dev
```

## Vercel deployment
1. Push this repo to GitHub.
2. In Vercel, `Add New Project` and import the repo.
3. Framework preset: `Next.js` (auto-detected).
4. In Vercel project settings, add environment variable:
- `OPENAI_API_KEY` (required)
5. Deploy.

## Post-deploy checks
1. Open `/sandbox`.
2. Run prompts like:
- `Build a polished snake game with keyboard controls and restart.`
- `Create 2048 with smooth tile animations and score tracking.`
3. Confirm API routes return 200:
- `/api/generate-component`
- `/api/validate-component`
- `/api/debug-component`

## Notes
- API route handlers are pinned to Node runtime and include `maxDuration` limits for Vercel.
- Optional tuning variables are documented in `.env.example`.
