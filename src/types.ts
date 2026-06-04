export type ViewKey = 'command' | 'strategy' | 'build' | 'analytics' | 'launch'

export type CriterionKey = 'thinking' | 'execution' | 'ambition' | 'shippedness'

export type FeatureStatus = 'planned' | 'building' | 'live'

export type TaskStatus = 'queued' | 'active' | 'done'

export type ExperimentStatus = 'draft' | 'running' | 'won'

export type RiskLevel = 'Low' | 'Medium' | 'High'

export type LaunchAssetStatus = 'draft' | 'ready' | 'sent'

export type IntegrationStatus = 'pass' | 'warn' | 'fail'

export interface ProductBrief {
  name: string
  tagline: string
  audience: string
  problem: string
  solution: string
  differentiator: string
  northStar: string
  deploymentUrl: string
}

export interface Persona {
  id: string
  name: string
  role: string
  need: string
  anxiety: string
}

export interface Feature {
  id: string
  title: string
  category: string
  description: string
  impact: number
  effort: number
  confidence: number
  status: FeatureStatus
}

export interface Task {
  id: string
  title: string
  lane: string
  owner: string
  due: string
  status: TaskStatus
}

export interface Experiment {
  id: string
  hypothesis: string
  metric: string
  audience: string
  status: ExperimentStatus
}

export interface Risk {
  id: string
  title: string
  level: RiskLevel
  mitigation: string
  resolved: boolean
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface EventTaxonomyItem {
  id: string
  event: string
  trigger: string
  why: string
  active: boolean
}

export interface ProductEvent {
  id: string
  event: string
  timestamp: string
  detail: string
  source: 'local' | 'queued' | 'novus-sent'
}

export interface Decision {
  id: string
  decision: string
  reason: string
  timestamp: string
}

export interface EvidenceItem {
  id: string
  title: string
  source: string
  insight: string
  strength: number
}

export interface Competitor {
  id: string
  name: string
  positioning: string
  weakness: string
  opportunity: string
}

export interface JourneyStep {
  id: string
  title: string
  goal: string
  event: string
  instrumented: boolean
}

export interface LaunchAsset {
  id: string
  title: string
  channel: string
  copy: string
  status: LaunchAssetStatus
}

export interface IntegrationCheck {
  id: string
  label: string
  detail: string
  status: IntegrationStatus
}

export interface WorkspaceState {
  brief: ProductBrief
  personas: Persona[]
  features: Feature[]
  tasks: Task[]
  experiments: Experiment[]
  risks: Risk[]
  evidence: EvidenceItem[]
  competitors: Competitor[]
  journey: JourneyStep[]
  launchAssets: LaunchAsset[]
  integrationChecks: IntegrationCheck[]
  checklist: ChecklistItem[]
  eventTaxonomy: EventTaxonomyItem[]
  events: ProductEvent[]
  decisions: Decision[]
  qaChecks: ChecklistItem[]
  darkMode: boolean
  activePersonaId: string
  lastSavedAt: string
}

export interface CriterionScore {
  key: CriterionKey
  label: string
  score: number
  weight: number
  reason: string
}

export interface ReadinessSummary {
  criteria: CriterionScore[]
  overall: number
  featureCompletion: number
  taskCompletion: number
  launchCompletion: number
  qaCompletion: number
  evidenceCompletion: number
  integrationCompletion: number
  assetCompletion: number
  journeyCompletion: number
  unresolvedHighRisks: number
  nextBestAction: string
}
