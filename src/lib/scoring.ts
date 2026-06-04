import type {
  ChecklistItem,
  CriterionScore,
  EvidenceItem,
  Feature,
  FeatureStatus,
  IntegrationCheck,
  JourneyStep,
  LaunchAsset,
  ReadinessSummary,
  Task,
  WorkspaceState,
} from '../types'

const criterionWeights = {
  thinking: 25,
  execution: 25,
  ambition: 25,
  shippedness: 25,
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function checklistCompletion(items: ChecklistItem[]): number {
  if (items.length === 0) {
    return 0
  }
  return (items.filter((item) => item.done).length / items.length) * 100
}

export function taskCompletion(tasks: Task[]): number {
  if (tasks.length === 0) {
    return 0
  }

  const statusValue = {
    queued: 15,
    active: 60,
    done: 100,
  }

  return average(tasks.map((task) => statusValue[task.status]))
}

export function featureCompletion(features: Feature[]): number {
  if (features.length === 0) {
    return 0
  }

  const statusValue: Record<FeatureStatus, number> = {
    planned: 20,
    building: 62,
    live: 100,
  }

  return average(features.map((feature) => statusValue[feature.status]))
}

export function evidenceCompletion(evidence: EvidenceItem[]): number {
  if (evidence.length === 0) {
    return 0
  }

  return average(evidence.map((item) => item.strength))
}

export function integrationCompletion(checks: IntegrationCheck[]): number {
  if (checks.length === 0) {
    return 0
  }

  const statusValue = {
    fail: 0,
    warn: 55,
    pass: 100,
  }

  return average(checks.map((check) => statusValue[check.status]))
}

export function journeyCompletion(journey: JourneyStep[]): number {
  if (journey.length === 0) {
    return 0
  }

  return (journey.filter((step) => step.instrumented).length / journey.length) * 100
}

export function assetCompletion(assets: LaunchAsset[]): number {
  if (assets.length === 0) {
    return 0
  }

  const statusValue = {
    draft: 25,
    ready: 75,
    sent: 100,
  }

  return average(assets.map((asset) => statusValue[asset.status]))
}

export function priorityScore(feature: Feature): number {
  const effort = Math.max(1, feature.effort)
  return Math.round(((feature.impact * feature.confidence) / effort) * 10)
}

export function getNextBestAction(criteria: CriterionScore[]): string {
  const lowest = criteria.slice().sort((a, b) => a.score - b.score)[0]

  if (!lowest) {
    return 'Open the command center and complete the launch workspace.'
  }

  if (lowest.key === 'thinking') {
    return 'Strengthen the product thesis with sharper evidence, persona pain, and a clearer competitive wedge.'
  }
  if (lowest.key === 'execution') {
    return 'Move the highest-priority feature or active task to live, then re-run QA.'
  }
  if (lowest.key === 'ambition') {
    return 'Improve the instrumented journey and add proof that the product is more than a checklist.'
  }

  return 'Complete Novus proof, public URL, demo video, and submission assets.'
}

export function calculateReadiness(workspace: WorkspaceState): ReadinessSummary {
  const briefFields = Object.values(workspace.brief)
  const briefCompletion =
    (briefFields.filter((value) => value.trim().length > 0).length / briefFields.length) * 100
  const personaScore = Math.min(100, workspace.personas.length * 34)
  const experimentScore = Math.min(100, workspace.experiments.length * 28)
  const evidenceScore = evidenceCompletion(workspace.evidence)
  const competitorScore = Math.min(100, workspace.competitors.length * 30)
  const featureScore = featureCompletion(workspace.features)
  const taskScore = taskCompletion(workspace.tasks)
  const launchScore = checklistCompletion(workspace.checklist)
  const qaScore = checklistCompletion(workspace.qaChecks)
  const integrationScore = integrationCompletion(workspace.integrationChecks)
  const assetScore = assetCompletion(workspace.launchAssets)
  const journeyScore = journeyCompletion(workspace.journey)
  const unresolvedHighRisks = workspace.risks.filter(
    (risk) => risk.level === 'High' && !risk.resolved,
  ).length
  const riskScore = Math.max(0, 100 - unresolvedHighRisks * 18)
  const liveFeatureCount = workspace.features.filter((feature) => feature.status === 'live').length
  const advancedFeatureScore = Math.min(100, liveFeatureCount * 4)
  const analyticsScore = Math.min(
    100,
    workspace.eventTaxonomy.filter((event) => event.active).length * 12 +
      workspace.events.length * 2 +
      journeyScore * 0.35,
  )
  const novusChecklistItem = workspace.checklist.find((item) => item.id === 'novus-installed')
  const novusScore = novusChecklistItem?.done ? 100 : integrationScore

  const criteria: CriterionScore[] = [
    {
      key: 'thinking',
      label: 'Product Thinking',
      score: clampScore(
        average([briefCompletion, personaScore, experimentScore, riskScore, evidenceScore, competitorScore]),
      ),
      weight: criterionWeights.thinking,
      reason: 'Clear user, problem, thesis, evidence, competitive wedge, measurable bets, and managed risks.',
    },
    {
      key: 'execution',
      label: 'Craft and Execution',
      score: clampScore(average([featureScore, taskScore, qaScore, journeyScore])),
      weight: criterionWeights.execution,
      reason: 'Working capabilities, visible progress, QA discipline, coherent UX, and instrumented flow.',
    },
    {
      key: 'ambition',
      label: 'Originality and Ambition',
      score: clampScore(average([advancedFeatureScore, analyticsScore, experimentScore, evidenceScore])),
      weight: criterionWeights.ambition,
      reason: 'Advanced workflow coverage, measurement depth, proof strength, and product learning loops.',
    },
    {
      key: 'shippedness',
      label: 'Shippedness',
      score: clampScore(average([launchScore, qaScore, taskScore, novusScore, assetScore])),
      weight: criterionWeights.shippedness,
      reason: 'Public access, launch assets, Novus readiness, QA, and final submission evidence.',
    },
  ]

  const overall = clampScore(
    criteria.reduce((total, criterion) => total + criterion.score * (criterion.weight / 100), 0),
  )

  return {
    criteria,
    overall,
    featureCompletion: clampScore(featureScore),
    taskCompletion: clampScore(taskScore),
    launchCompletion: clampScore(launchScore),
    qaCompletion: clampScore(qaScore),
    evidenceCompletion: clampScore(evidenceScore),
    integrationCompletion: clampScore(integrationScore),
    assetCompletion: clampScore(assetScore),
    journeyCompletion: clampScore(journeyScore),
    unresolvedHighRisks,
    nextBestAction: getNextBestAction(criteria),
  }
}

export function nextTaskStatus(status: Task['status']): Task['status'] {
  if (status === 'queued') {
    return 'active'
  }
  if (status === 'active') {
    return 'done'
  }
  return 'queued'
}

export function nextFeatureStatus(status: FeatureStatus): FeatureStatus {
  if (status === 'planned') {
    return 'building'
  }
  if (status === 'building') {
    return 'live'
  }
  return 'planned'
}
