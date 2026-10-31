# Study Cards

A personal flashcard and spaced-repetition app (Quizlet/Knowt-style) that works
offline on iPhone and desktop and syncs through Supabase.

- **Study modes:** Review (FSRS spaced repetition), Learn, Flashcards, Quiz
- **Progress:** per-card memory status, set/course progress, quiz history, streaks
- **Cards:** images, LaTeX formulas, CSV / pasted-text import, backups
- **Stack:** React + TypeScript + Vite, IndexedDB (Dexie), ts-fsrs, Supabase (Postgres + row-level security), installable PWA

```bash
cd app && npm install
npm run dev        # http://localhost:5174
npx vitest run     # tests
npm run build      # static site in app/dist
```

Cloud setup: run `supabase/setup.sql` in the Supabase SQL Editor.
