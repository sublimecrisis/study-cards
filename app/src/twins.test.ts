import { describe, expect, it } from 'vitest'
import { oncePerConcept, sameAnswer, sameConcept, twinGroups } from './twins'
import { makeQuestion } from './quizgen'
import type { Card } from './types'

const card = (id: string, term: string, definition: string): Card => ({
  id, setId: 's', position: 0, term, definition, notes: '', tags: [], starred: 0, needsCheck: 0,
  termImage: null, defImage: null, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0,
})

// Real examples from Paul's NASM deck.
const hms5 = card('a', 'Human movement system (HMS)', 'The muscular, skeletal and nervous systems working together to move the body')
const hmsX = card('b', 'Human movement system (kinetic chain)', 'Nervous + skeletal + muscular systems working together to produce, reduce, and stabilize force')
const adh2 = card('c', 'Adherence', 'The level of commitment to a behavior or plan of action')
const adh21 = card('d', 'Adherence', 'Level of commitment to a behavior or plan of action')
const integ = card('e', 'Integrated program design includes', 'Flexibility, cardiorespiratory, core, balance, plyometric, SAQ and resistance training')
const integ13 = card('f', 'Integrated training', 'Combines flexibility, cardiorespiratory, core, balance, plyometric, SAQ and resistance training')
const dyn = card('g', 'When to use dynamic stretching', 'As a warm-up before activity, for clients without muscle imbalances, in a sport-specific way')
const act = card('h', 'When to use active stretching', 'As a warm-up before activity, for clients with some flexibility training, in the Strength phase')

describe('twins', () => {
  it('same concept (shared schedule): same name ignoring brackets + overlapping answers', () => {
    expect(sameConcept(hms5, hmsX)).toBe(true)
    expect(sameConcept(adh2, adh21)).toBe(true)
    expect(sameConcept(integ, integ13)).toBe(false) // different names: not merged...
    expect(sameAnswer(integ, integ13)).toBe(true) // ...but never offered as each other's wrong option
  })
  it('does not merge the pairs that went wrong on the real deck', () => {
    const tendon = card('t', 'Tendon', 'Connective tissue that attaches muscle to bone')
    const ligament = card('l', 'Ligament', 'Connective tissue that connects bone to bone')
    const over = card('o', 'OHSA: low back arches (OVERactive)', 'Hip flexors, erector spinae, latissimus dorsi')
    const under = card('u', 'OHSA: low back arches (UNDERactive)', 'Gluteus maximus, hamstrings, intrinsic core stabilizers')
    const normal = card('n', 'Normal blood pressure (AHA)', 'Systolic less than 120 and diastolic less than 80 mm Hg')
    const elevated = card('e2', 'Elevated blood pressure', 'Systolic 120-129 and diastolic less than 80 mm Hg')
    const balance = card('b1', 'Balance training continuum', 'Stabilization, strength, power')
    const core = card('c1', 'Core training continuum', 'Stabilization, strength, power')
    for (const [x, y] of [[tendon, ligament], [over, under], [normal, elevated]]) {
      expect(sameConcept(x, y)).toBe(false)
      expect(sameAnswer(x, y)).toBe(false)
    }
    expect(sameConcept(balance, core)).toBe(false) // different concepts, separate schedules
    expect(sameAnswer(balance, core)).toBe(true) // but identical answers can't both be options
    expect(twinGroups([tendon, ligament, over, under, normal, elevated, balance, core]).size).toBe(0)
  })
  it('keeps deliberate contrasts apart', () => {
    expect(sameConcept(dyn, act)).toBe(false)
    expect(sameConcept(hms5, adh2)).toBe(false)
  })
  it('groups twins and keeps one per concept in a session', () => {
    const g = twinGroups([hms5, hmsX, adh2, adh21, integ, integ13, dyn, act])
    expect(g.get('a')).toBe(g.get('b'))
    expect(g.get('c')).toBe(g.get('d'))
    expect(g.has('e')).toBe(false)
    expect(g.has('g')).toBe(false)
    expect(oncePerConcept([hms5, adh2, hmsX, dyn, adh21], g).map((c) => c.id)).toEqual(['a', 'c', 'g'])
  })
  it('a twin is never offered as a wrong option', () => {
    const pool = [adh2, adh21, card('x', 'Self-efficacy', 'Belief in your ability to succeed at a behavior'), card('y', 'Motivation', 'The drive to begin or continue a behavior'), card('z', 'Social support', 'Help and encouragement from other people for a behavior'), card('w', 'Goal setting', 'Choosing a target behavior or plan and a deadline')]
    for (let k = 0; k < 40; k++) {
      const q = makeQuestion(adh2, pool, 'mc', 'definition')
      expect(q.options).not.toContain(adh21.definition)
    }
  })
})
