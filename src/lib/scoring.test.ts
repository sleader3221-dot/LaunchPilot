import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../data'
import {
  calculateReadiness,
  checklistCompletion,
  evidenceCompletion,
  integrationCompletion,
  journeyCompletion,
  nextFeatureStatus,
  nextTaskStatus,
  priorityScore,
} from './scoring'

describe('scoring engine', () => {
  it('calculates a bounded weighted readiness score', () => {
    const readiness = calculateReadiness(defaultWorkspace)

    expect(readiness.overall).toBeGreaterThanOrEqual(0)
    expect(readiness.overall).toBeLessThanOrEqual(100)
    expect(readiness.criteria).toHaveLength(4)
    expect(readiness.criteria.map((criterion) => criterion.weight).reduce((sum, weight) => sum + weight, 0)).toBe(100)
  })

  it('rewards completed launch proof', () => {
    const baseline = calculateReadiness(defaultWorkspace).overall
    const completeWorkspace = {
      ...defaultWorkspace,
      checklist: defaultWorkspace.checklist.map((item) => ({ ...item, done: true })),
      qaChecks: defaultWorkspace.qaChecks.map((item) => ({ ...item, done: true })),
      tasks: defaultWorkspace.tasks.map((task) => ({ ...task, status: 'done' as const })),
      risks: defaultWorkspace.risks.map((risk) => ({ ...risk, resolved: true })),
    }

    expect(calculateReadiness(completeWorkspace).overall).toBeGreaterThan(baseline)
  })

  it('computes checklist completion accurately', () => {
    expect(checklistCompletion([])).toBe(0)
    expect(
      checklistCompletion([
        { id: 'a', label: 'A', done: true },
        { id: 'b', label: 'B', done: false },
      ]),
    ).toBe(50)
  })

  it('scores evidence, integrations, and journey coverage accurately', () => {
    expect(evidenceCompletion(defaultWorkspace.evidence)).toBeGreaterThan(80)
    expect(
      integrationCompletion([
        { id: 'a', label: 'A', detail: 'A', status: 'pass' },
        { id: 'b', label: 'B', detail: 'B', status: 'warn' },
        { id: 'c', label: 'C', detail: 'C', status: 'fail' },
      ]),
    ).toBeCloseTo(51.67, 1)
    expect(
      journeyCompletion([
        { id: 'a', title: 'A', goal: 'A', event: 'a', instrumented: true },
        { id: 'b', title: 'B', goal: 'B', event: 'b', instrumented: false },
      ]),
    ).toBe(50)
  })

  it('cycles task and feature states predictably', () => {
    expect(nextTaskStatus('queued')).toBe('active')
    expect(nextTaskStatus('active')).toBe('done')
    expect(nextTaskStatus('done')).toBe('queued')
    expect(nextFeatureStatus('planned')).toBe('building')
    expect(nextFeatureStatus('building')).toBe('live')
    expect(nextFeatureStatus('live')).toBe('planned')
  })

  it('prioritizes high impact low effort work', () => {
    const highLeverage = {
      ...defaultWorkspace.features[0],
      impact: 10,
      effort: 2,
      confidence: 10,
    }
    const lowLeverage = {
      ...defaultWorkspace.features[0],
      impact: 4,
      effort: 8,
      confidence: 5,
    }

    expect(priorityScore(highLeverage)).toBeGreaterThan(priorityScore(lowLeverage))
  })
})
