Demo: https://adapt-ui.vercel.app/

# Adapt UI

Adapt UI is a prompt-to-app sandbox that generates React components and mini-games, validates them, renders them in an isolated iframe, and auto-repairs when errors occur.

## Tech Stack
- Next.js (App Router)
- React + TypeScript
- OpenAI API

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Create your env file:
```bash
cp .env.example .env
```
3. Set `OPENAI_API_KEY` in `.env`.
4. Run locally:
```bash
npm run dev
```

## Deploy (Vercel)
1. Import this repo into Vercel.
2. Add `OPENAI_API_KEY` in Project Settings -> Environment Variables.
3. Deploy.

## Main Endpoints
- `/api/generate-component`
- `/api/validate-component`
- `/api/debug-component`
