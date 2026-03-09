# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Medical AI Assistant for cardiology clinical decision support at Biocardio clinic. Transforms informal clinical notes into formal medical documentation (SOAP format) and provides AI-powered clinical analysis.

**Stack**: Vanilla JavaScript + HTML/CSS frontend, Node.js serverless backend (Firebase Cloud Functions v2), OpenAI GPT-4o API.

## Development Commands

```bash
npm install              # Install frontend dependencies
cd functions && npm install  # Install Cloud Functions dependencies
npm run dev              # Local dev at http://localhost:8888
firebase deploy          # Deploy to production
```

**Environment**: Requires `.env` file with `OPENAI_API_KEY` for local development. In production, set via Firebase Functions environment config.

## Architecture

```
Frontend (index.html + script.js + style.css)
    |
    | 1. POST /api/processMedicalNotes  {notes}
    |    -> returns {evolution, analysis, analysisStatus}
    |
    | 2. POST /api/chatCase  {caseContext, chatHistory}
    |    -> returns {response}
    |
    | 3. POST /api/transcribeAudio  {audio, mimeType}
    |    -> returns {text}
    |
    v
Firebase Cloud Functions v2 (functions/index.js)
    |-- processMedicalNotes  -> GPT-4o (2 calls: evolution + analysis)
    |-- chatCase             -> GPT-4o (multi-turn discussion)
    |-- transcribeAudio      -> Whisper (voice-to-text)
    |
    v
OpenAI API (GPT-4o + Whisper)
```

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Main UI - two input modes (Quick/Structured form) |
| `script.js` | All frontend logic: form handling, API calls, state management |
| `style.css` | Responsive styles - breakpoints at 480px, 768px, 1024px |
| `functions/index.js` | Firebase Cloud Functions: evolution + analysis + chat + transcription |

## State Management

- `currentCaseContext`: Global object holding current case data (notes, evolution, analysis, chat history)
- LocalStorage: Saves draft input for recovery
- No server-side persistence - all case data lives in browser memory only

## Key Patterns

**AI Response Processing**: Backend makes two sequential GPT-4o calls - first for formal evolution, then for critical analysis. Analysis includes a STATUS flag extracted for UI color-coding (green=ADEQUADO, yellow=ATENÇÃO).

**Mobile-First Design**: CSS uses mobile-first approach with progressive enhancement. Touch targets minimum 48px. Mobile detection in JS for viewport/input optimizations.

**Security**: API keys only in serverless functions (never exposed to client). robots.txt blocks all indexing for medical privacy.

## Modification Guide

- **Change AI prompts**: Edit `SYSTEM_PROMPT` constants in `functions/index.js`
- **Add form fields**: Update HTML in `index.html`, collect in `collectStructuredData()` in `script.js`
- **Add new serverless function**: Add export in `functions/index.js`, add fetch call in `script.js`
- **Adjust responsiveness**: Check breakpoint media queries in `style.css`
