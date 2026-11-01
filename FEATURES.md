# Study Cards — FEATURE LIST (written 2026-10-31)

Goal (Paul): **work as close to Quizlet and Knowt as possible**, plus real
spaced repetition, mini quizzes, and progress tracking.
We copy *how they work* (study modes, quizzes, progress), not their names,
logos, or look — the app gets its own name and design.

Priority key: **[1]** first release · **[2]** second release · **[3]** later

---

## 1. Organizing material
| Feature | What it does | Pri |
|---|---|---|
| Courses → Sets | Each class is a course; each topic/chapter is a set of cards | [1] |
| Card editor | Term + definition, quick "tab to next card" entry like Quizlet | [1] |
| Images on cards | Add a photo/diagram to either side (camera on iPhone) | [1] |
| Star / flag cards | Mark hard cards; any mode can be run on "starred only" | [1] |
| Search | Find any card across all courses | [1] |
| Tags | e.g. "exam 2", "chapter 5" — study a tag across sets | [2] |
| Fill-in-the-blank cards | Hide part of a sentence ("The {{mitochondria}} makes ATP") | [2] |
| Formulas | Math/science notation (LaTeX) on cards | [1] |
| Archive old semesters | Hide finished courses without deleting them | [2] |
| Audio | Read cards aloud (built-in text-to-speech, incl. Japanese/Spanish voices) | [2] |

## 2. Adding material
| Feature | What it does | Pri |
|---|---|---|
| Type it in | Fast editor, works on phone and computer | [1] |
| Paste a list | Paste "term – definition" lines, choose the separator, preview, import | [1] |
| CSV import/export | Spreadsheet in, spreadsheet out (also your backup) | [1] |
| Import from Quizlet/Knowt | Paste copied term lists straight in. Quizlet has a text export. **Knowt: no official export found (2026-10-31)** → check the set's menu for export/print first; fallback = select-all on the set page and paste into the importer (the paste importer must handle that messy text) | [1] |
| AI cards from notes | Paste notes / upload PDF or slides → draft cards → you edit, then save. One "AI provider" setting: **local Mac model (preferred)** or **OpenRouter** (pay-per-use) — see PLAN.md | [2] |
| AI cards from a photo | Snap a textbook page or whiteboard → draft cards | [3] |
| AI explanations | **BUILT 2026-10-31.** On a wrong answer: what your pick actually means + the correct answer (instant), and "✨ Explain why" (AI, saved per card). Also on Review's answer side. | [2] |
| Anki import | `.apkg` files | [3] |

## 3. Study modes
| Mode | What it does | Pri |
|---|---|---|
| **Flashcards** | Tap to flip, swipe right = know it / left = still learning, shuffle, either side first | [1] |
| **Review (spaced repetition)** | Daily due cards; rate Again/Hard/Good/Easy; FSRS picks the next date | [1] |
| **Learn** | Guided rounds: starts with multiple choice, moves to typing as you get cards right; missed cards come back until mastered | [1] |
| **Match game** | Timed: tap matching term + definition tiles; best time saved | [2] |
| **Write** | Type every answer, with typo tolerance and an "I was right" override | [2] |
| **Speed round** | Fast-paced timed game with lives — falling/racing answers | [3] |
| **Study guide** | One printable page per set (all terms, starred first) | [3] |

## 4. Mini quizzes and practice tests ⭐
| Feature | What it does | Pri |
|---|---|---|
| **Quick quiz** | One tap: 10 mixed questions from a set (or a course, or starred cards) | [1] |
| Question types | Multiple choice, true/false, written answer, matching | [1] (matching [2]) |
| Smart wrong answers | Multiple-choice distractors come from similar cards in the same set | [1] |
| Quiz builder | Choose # of questions, types, which sets, answer with term or definition, timer on/off | [1] |
| Results screen | Score, time, every missed question with the right answer | [1] |
| Retry missed | Re-quiz only what you got wrong | [1] |
| Quiz feeds the schedule | A missed quiz question pulls that card's next review sooner | [1] |
| Exam practice test | Bigger test across a whole course, mixed types, timed like a real exam | [2] |
| AI open-ended questions | "Explain why…" questions graded by AI with feedback | [3] |

## 5. Progress tracking ⭐
| Feature | What it does | Pri |
|---|---|---|
| Card status | Each card: New → Learning → Familiar → Mastered (based on FSRS memory strength) | [1] |
| Set progress bar | % mastered / learning / not studied, on every set | [1] |
| Course progress | Same, rolled up per class | [1] |
| Quiz history | Every quiz saved; score-over-time chart per set and course | [1] |
| Streak + daily goal | Days in a row studied; goal like "20 reviews a day" | [1] |
| "Due today" home screen | What to review now, per course, with estimated minutes | [1] |
| Weakest cards | Cards you miss most, one tap to study just those | [2] |
| Upcoming reviews | Calendar/chart of how many cards are due the next 30 days | [2] |
| Time studied | Per day / week / course | [2] |
| Exam countdown + readiness | Set an exam date; shows % of that course you're likely to remember on the day, and front-loads reviews | [2] |
| Weekly summary | Short recap: cards learned, quizzes, streak, weak spots | [3] |

## 6. Everyday conveniences
| Feature | What it does | Pri |
|---|---|---|
| Works offline | Study anywhere; syncs when back online | [1] |
| iPhone home-screen app | Full screen, own icon | [1] |
| Dark mode | Follows the phone/computer setting | [1] |
| Keyboard shortcuts (computer) | Space = flip, 1–4 = rate, arrows = next | [1] |
| Daily reminder | Notification at a time you pick | [2] |
| Share a set | Send a link so a classmate can copy a set | [3] |
| Study Reader link | Send a highlight from Study Reader → new card | [3] |

---

## Deliberately left out (for now)
- Public library of other people's sets, classes/teacher features, ads,
  paywalls, social feeds. This is a personal study tool.

## Answered 2026-10-31
- **Subjects:** math/science, memorization, visual, and language → formulas and
  images are [1]; audio moved up to [2].
- **AI:** local model ideal, built-in button also good → app supports both
  (local first, OpenRouter fallback).
- **Existing sets:** Knowt sets to bring over on day one.
- **Name:** keep "Study Cards" for now.
- **Japanese + Spanish:** Paul wants these. Vocab sets work here (audio, typing,
  quizzes). A full Duolingo-style course (lessons, sentence building, kana
  practice) is a **separate future project** — see PLAN.md "Future ideas".

## Still open
- Any feature above you'd **move up or drop**?

---

## Roadmap (planned 2026-11-01 with Paul)

Context: NASM CPT attempt #1 on **2026-11-09**; retake voucher, window ends 2026-12-20.

### Batch 1: before Nov 9 (in this order) — DONE 2026-11-01
1. **Scenario questions (AI)**: exam-style application MC questions generated from
   cards ("client's knees cave in during the OHSA: which muscle is likely underactive?"),
   cached on the card, mixed into practice exams and quizzes. Extends the `explain`
   Edge Function with a `scenario` mode (Paul re-pastes the function once).
2. **Ordering + matching question types**: sequences (OPT phases, kill chain, NIST IR,
   GAS, plyo phases, motor learning stages) and pairs (OHSA compensation to over/
   underactive muscles, distortion patterns). Defined as small "sequence"/"pairs" items
   built from existing cards; usable in Quiz and practice exam.
3. **"I guessed" + quick fix**: mark a correct answer as a guess (counts as weak, rated
   Hard not Good); edit or flag a card from any study screen without leaving the session.
4. **Stats dashboard**: accuracy by chapter over time, 30-day review forecast, time
   studied per day, practice-exam score trend.

### Focus timer (Pomodoro), planned 2026-11-01 — DONE 2026-11-01
Goal: 4-hour study blocks without burning out. Paul's choices:
- **Rhythm:** default 50/10 (50 min focus, 10 min break) with a 30 min long break at the
  2-hour mark: 4 focus rounds, about 3h20m of study in 4 hours. Other presets to switch
  to: 25/5 (20 min long break every 4 rounds) and 90/20. Block length is adjustable
  (default 4 h); the last round shrinks to fit and the block never ends on a break.
- **Where:** a new Focus page (start a block, pick a preset, see the round plan, pause /
  skip / end) plus a small timer pill in the top bar on every page ("Focus 32:10 · 2/4").
- **Breaks = soft lock:** when a break starts, a break screen covers the study pages with
  the countdown and what to do (stand up, water, look 20 ft away, no phone scrolling).
  A small "Skip break" link stays available. Chime + banner when a phase ends while the
  app is open.
- **Fatigue check (accuracy drop):** during a block, if the last ~15 answers are 20+
  points below your accuracy earlier in the block (min. ~30 answers), the pill suggests
  "Accuracy dropping: take your break now?" (one tap starts the break early).
- **End-of-block summary:** cards answered, accuracy per round and minutes focused, so
  you can see where you started to fade. Shown when the block ends and kept in Stats.
- **Background alerts:** none for now. The timer uses start times, not a running counter,
  so it is correct when you reopen the app; real alerts with a locked phone come with
  push notifications (batch 3).
- **How it's built:** timer state = preset, block length, start time, pause/skip shift,
  saved on the device (per-device, like a remembered tab). The round plan and "where am I
  now" are plain functions with unit tests (pause, skip, last round trimmed, block end).
  Fatigue + summary read the existing review log for the block's time window.

### Batch 2: before the retake (Nov 10 → Dec 20)
5. **Score report → plan**: enter NASM domain results; the app re-weights Review and
   practice exams toward weak domains.
6. **Listen mode**: hands-free audio review (TTS; reuse Study Reader voices where possible).
7. **Stubborn-card help**: detect leeches (repeated lapses) and offer an AI mnemonic or
   a simpler rewrite.

### Batch 3: later
8. **Game modes**: Match game, Write (type every answer), Speed round.
9. **Real push notifications** (upgrade from the Calendar reminder) + weekly summary.
10. **CySA+ hands-on style practice**: questions built on log snippets, scan output, command flags.

### Parked (not chosen for now)
- AI cards from notes/PDF/photo (+ fill-in-the-blank). Revisit when new school courses start.
