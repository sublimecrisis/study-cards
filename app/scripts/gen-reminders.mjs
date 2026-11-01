// Generates public/reminders/study-HHMM.ics: a repeating daily calendar event with an alert,
// one file per half hour. iPhone web apps can't schedule notifications themselves, so the app
// links to these and the phone's Calendar does the reminding.
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'https://sublimecrisis.github.io/study-cards/'
const dir = new URL('../public/reminders/', import.meta.url)
mkdirSync(dir, { recursive: true })
const today = new Date()
const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
for (let h = 0; h < 24; h++)
  for (const m of [0, 30]) {
    const hhmm = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Study Cards//Daily reminder//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:study-cards-daily-${hhmm}@sublimecrisis.github.io`,
      `DTSTAMP:${ymd}T000000Z`,
      `DTSTART:${ymd}T${hhmm}00`, // floating local time: fires at this clock time wherever you are
      'DURATION:PT20M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:📚 Study Cards: daily review',
      `DESCRIPTION:Time for today's reviews. Open Study Cards: ${APP}`,
      `URL:${APP}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Time to study',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    writeFileSync(new URL(`study-${hhmm}.ics`, dir), ics)
  }
console.log('reminders: 48 calendar files written')
