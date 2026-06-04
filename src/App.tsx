import {
  Activity,
  ArrowRight,
  Award,
  BadgeCheck,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Copy,
  Download,
  Gauge,
  History,
  Layers,
  Moon,
  PanelLeft,
  Play,
  PlugZap,
  Radar,
  RefreshCcw,
  Route,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
  Upload,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { defaultWorkspace, normalizeWorkspace } from './data'
import {
  createProductEvent,
  getNovusDiagnostics,
  initializeNovus,
  isNovusConfigured,
} from './lib/analytics'
import {
  calculateReadiness,
  nextFeatureStatus,
  nextTaskStatus,
  priorityScore,
} from './lib/scoring'
import { copyText, downloadJson, usePersistentState } from './lib/storage'
import type {
  ChecklistItem,
  CriterionScore,
  ExperimentStatus,
  FeatureStatus,
  IntegrationCheck,
  LaunchAssetStatus,
  ProductEvent,
  TaskStatus,
  ViewKey,
  WorkspaceState,
} from './types'
import './App.css'

const storageKey = 'launchpilot.workspace.v1'
const deadline = new Date('2026-06-20T21:30:00+05:30')

const views: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: 'command', label: 'Command', icon: Gauge },
  { key: 'strategy', label: 'Strategy', icon: Target },
  { key: 'build', label: 'Build', icon: Layers },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'launch', label: 'Launch', icon: Rocket },
]

const statusLabels: Record<FeatureStatus | TaskStatus | ExperimentStatus | LaunchAssetStatus, string> = {
  planned: 'Planned',
  building: 'Building',
  live: 'Live',
  queued: 'Queued',
  active: 'Active',
  done: 'Done',
  draft: 'Draft',
  running: 'Running',
  won: 'Won',
  ready: 'Ready',
  sent: 'Sent',
}

const criterionColors: Record<CriterionScore['key'], string> = {
  thinking: '#0f766e',
  execution: '#2563eb',
  ambition: '#c2410c',
  shippedness: '#7c3aed',
}

function formatCountdown(now: Date) {
  const diff = Math.max(0, deadline.getTime() - now.getTime())
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)

  return { days, hours, minutes, seconds }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress-wrap" aria-label={label}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span>{Math.round(value)}%</span>
    </div>
  )
}

function ScoreOrb({ value, label }: { value: number; label: string }) {
  return (
    <div className="score-orb" style={{ '--score': `${value}%` } as CSSProperties}>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = 'ghost',
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  variant?: 'ghost' | 'solid' | 'danger'
}) {
  return (
    <button className={cn('icon-button', variant)} type="button" onClick={onClick} title={label}>
      <Icon size={18} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  )
}

function StatusPill({ status }: { status: FeatureStatus | TaskStatus | ExperimentStatus | LaunchAssetStatus }) {
  return <span className={cn('status-pill', status)}>{statusLabels[status]}</span>
}

function SectionTitle({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string
  title: string
  detail: string
}) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={18} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function deriveIntegrationChecks(
  workspace: WorkspaceState,
  diagnostics: ReturnType<typeof getNovusDiagnostics>,
): IntegrationCheck[] {
  const screenshotDone = workspace.checklist.find((item) => item.id === 'novus-screenshot')?.done
  const taxonomyReady = workspace.eventTaxonomy.filter((event) => event.active).length >= 6
  const agentStatus: IntegrationCheck['status'] = diagnostics.agentReady
    ? 'pass'
    : diagnostics.scriptFailed
      ? 'fail'
      : 'warn'

  return [
    ...workspace.integrationChecks.map((check) => {
      if (check.id === 'env-key') {
        const status: IntegrationCheck['status'] = diagnostics.configured ? 'pass' : 'warn'
        return {
          ...check,
          status,
          detail: diagnostics.configured
            ? 'VITE_NOVUS_PUBLIC_APP_ID is present in this runtime.'
            : 'Set VITE_NOVUS_PUBLIC_APP_ID in the deployment environment.',
        }
      }
      if (check.id === 'event-taxonomy') {
        const status: IntegrationCheck['status'] = taxonomyReady ? 'pass' : 'warn'
        return {
          ...check,
          status,
        }
      }
      if (check.id === 'dashboard-proof') {
        const status: IntegrationCheck['status'] = screenshotDone ? 'pass' : 'warn'
        return {
          ...check,
          status,
        }
      }
      return check
    }),
    {
      id: 'agent-loaded',
      label: 'Browser agent loaded',
      detail: diagnostics.agentReady
        ? 'The analytics agent is ready to track events.'
        : diagnostics.configured
          ? 'The install script is configured and should load in production.'
          : 'Waiting for a real Novus key.',
      status: agentStatus,
    },
    {
      id: 'event-queue',
      label: 'Event queue',
      detail:
        diagnostics.queueDepth === 0
          ? 'No unsent events are waiting.'
          : `${diagnostics.queueDepth} event(s) are queued until the agent is available.`,
      status: diagnostics.queueDepth === 0 ? 'pass' : 'warn',
    },
  ]
}

function nextLaunchAssetStatus(status: LaunchAssetStatus): LaunchAssetStatus {
  if (status === 'draft') {
    return 'ready'
  }
  if (status === 'ready') {
    return 'sent'
  }
  return 'draft'
}

function getCoachRecommendations(workspace: WorkspaceState, readiness: ReturnType<typeof calculateReadiness>) {
  const lowestCriterion = readiness.criteria.slice().sort((a, b) => a.score - b.score)[0]
  const topFeature = workspace.features
    .filter((feature) => feature.status !== 'live')
    .slice()
    .sort((a, b) => priorityScore(b) - priorityScore(a))[0]
  const openRisk = workspace.risks.find((risk) => risk.level === 'High' && !risk.resolved)
  const launchGap = workspace.checklist.find((item) => !item.done)
  const unreadyAsset = workspace.launchAssets.find((asset) => asset.status !== 'sent')

  return [
    {
      title: `Improve ${lowestCriterion?.label ?? 'readiness'}`,
      detail: readiness.nextBestAction,
      impact: 10,
      view: lowestCriterion?.key === 'shippedness' ? ('launch' as ViewKey) : ('strategy' as ViewKey),
    },
    {
      title: topFeature ? `Ship ${topFeature.title}` : 'Feature portfolio is live',
      detail: topFeature
        ? `Highest leverage unfinished feature with priority ${priorityScore(topFeature)}.`
        : 'All tracked capabilities are currently marked live.',
      impact: topFeature ? 9 : 6,
      view: 'build' as ViewKey,
    },
    {
      title: openRisk ? `Resolve ${openRisk.title}` : 'Risk level is controlled',
      detail: openRisk ? openRisk.mitigation : 'No unresolved high-risk blockers remain in the register.',
      impact: openRisk ? 9 : 7,
      view: 'build' as ViewKey,
    },
    {
      title: launchGap ? `Finish ${launchGap.label}` : 'Submission checklist complete',
      detail: unreadyAsset
        ? `Next launch asset: move ${unreadyAsset.title} from ${statusLabels[unreadyAsset.status].toLowerCase()} to ready.`
        : 'All launch assets are sent or ready for final submission.',
      impact: 8,
      view: 'launch' as ViewKey,
    },
  ]
}

function CommandView({
  workspace,
  readiness,
  countdown,
  setView,
  recordEvent,
  toggleTask,
  toggleRisk,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  countdown: ReturnType<typeof formatCountdown>
  setView: (view: ViewKey) => void
  recordEvent: (eventName: string, detail: string, metadata?: Record<string, unknown>) => void
  toggleTask: (id: string) => void
  toggleRisk: (id: string) => void
}) {
  const nextTasks = workspace.tasks.filter((task) => task.status !== 'done').slice(0, 4)
  const topRisks = workspace.risks.filter((risk) => !risk.resolved).slice(0, 3)
  const activePersona = workspace.personas.find((persona) => persona.id === workspace.activePersonaId)

  return (
    <div className="view-stack">
      <section className="hero-band">
        <div className="hero-copy">
          <span className="eyebrow">Live launch command</span>
          <h1>{workspace.brief.name}</h1>
          <p>{workspace.brief.tagline}</p>
          <div className="hero-actions">
            <button
              className="primary-action"
              type="button"
              onClick={() => {
                recordEvent('criteria_viewed', 'Readiness criteria opened from command center')
                setView('strategy')
              }}
            >
              <Target size={18} aria-hidden="true" />
              Improve score
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setView('launch')}
            >
              <ClipboardCheck size={18} aria-hidden="true" />
              Prepare submission
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-label="Launch readiness snapshot">
          <ScoreOrb value={readiness.overall} label="readiness" />
          <div className="deadline-panel">
            <span>Deadline clock</span>
            <strong>
              {countdown.days}d {countdown.hours}h
            </strong>
            <small>
              {countdown.minutes}m {countdown.seconds}s remaining
            </small>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={Layers}
          label="Feature completion"
          value={`${readiness.featureCompletion}%`}
          detail={`${workspace.features.filter((feature) => feature.status === 'live').length} live of ${workspace.features.length}`}
          progress={readiness.featureCompletion}
        />
        <MetricCard
          icon={Play}
          label="Build momentum"
          value={`${readiness.taskCompletion}%`}
          detail={`${workspace.tasks.filter((task) => task.status === 'done').length} tasks complete`}
          progress={readiness.taskCompletion}
        />
        <MetricCard
          icon={ShieldCheck}
          label="QA readiness"
          value={`${readiness.qaCompletion}%`}
          detail={`${workspace.qaChecks.filter((item) => item.done).length} checks passing`}
          progress={readiness.qaCompletion}
        />
        <MetricCard
          icon={Rocket}
          label="Submission"
          value={`${readiness.launchCompletion}%`}
          detail={`${workspace.checklist.filter((item) => item.done).length} items ready`}
          progress={readiness.launchCompletion}
        />
      </section>

      <CoachPanel
        workspace={workspace}
        readiness={readiness}
        setView={setView}
        recordEvent={recordEvent}
      />

      <section className="split-grid command-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Judge lens"
            title="What the product is proving"
            detail="A sharp thesis keeps the build from becoming a feature pile."
          />
          <div className="thesis-list">
            <ThesisItem label="Audience" value={workspace.brief.audience} />
            <ThesisItem label="Problem" value={workspace.brief.problem} />
            <ThesisItem label="Why now" value={workspace.brief.differentiator} />
          </div>
          {activePersona && (
            <div className="persona-callout">
              <Bot size={18} aria-hidden="true" />
              <div>
                <strong>
                  {activePersona.name}, {activePersona.role}
                </strong>
                <span>{activePersona.need}</span>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Readiness"
            title="Weighted judging score"
            detail="Each criterion updates as the workspace changes."
          />
          <div className="criteria-list">
            {readiness.criteria.map((criterion) => (
              <button
                className="criterion-row"
                type="button"
                key={criterion.key}
                onClick={() => {
                  recordEvent('criteria_viewed', `${criterion.label} details inspected`, {
                    score: criterion.score,
                  })
                  setView(criterion.key === 'shippedness' ? 'launch' : 'strategy')
                }}
              >
                <span className="criterion-dot" style={{ background: criterionColors[criterion.key] }} />
                <div>
                  <strong>{criterion.label}</strong>
                  <small>{criterion.reason}</small>
                </div>
                <b>{criterion.score}</b>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Next actions"
            title="Move the build forward"
            detail="These actions feed the live progress model."
          />
          <div className="task-list">
            {nextTasks.length > 0 ? (
              nextTasks.map((task) => (
                <button className="task-row" type="button" key={task.id} onClick={() => toggleTask(task.id)}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {task.lane} - {task.due}
                    </span>
                  </div>
                  <StatusPill status={task.status} />
                </button>
              ))
            ) : (
              <EmptyState title="All tasks complete" detail="Move to launch QA and submission proof." />
            )}
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Risk radar"
            title="Fix what can block judging"
            detail="High risk items reduce shippedness until resolved."
          />
          <div className="risk-list">
            {topRisks.map((risk) => (
              <button className="risk-row" type="button" key={risk.id} onClick={() => toggleRisk(risk.id)}>
                <span className={cn('risk-level', risk.level.toLowerCase())}>{risk.level}</span>
                <div>
                  <strong>{risk.title}</strong>
                  <small>{risk.mitigation}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  progress: number
}) {
  return (
    <article className="metric-card">
      <div className="metric-head">
        <Icon size={18} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      <ProgressBar value={progress} label={label} />
    </article>
  )
}

function DiagnosticCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="diagnostic-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function CoachPanel({
  workspace,
  readiness,
  setView,
  recordEvent,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  setView: (view: ViewKey) => void
  recordEvent: (eventName: string, detail: string, metadata?: Record<string, unknown>) => void
}) {
  const recommendations = getCoachRecommendations(workspace, readiness)
  const judgeVerdict =
    readiness.overall >= 90
      ? 'Strong winner candidate'
      : readiness.overall >= 80
        ? 'Competitive, needs final proof'
        : readiness.overall >= 70
          ? 'Promising, but not submission-tight yet'
          : 'Useful foundation, needs sharper shipped evidence'

  return (
    <section className="coach-grid">
      <div className="panel coach-panel">
        <div className="coach-head">
          <div>
            <span className="eyebrow">Launch coach</span>
            <h2>{judgeVerdict}</h2>
            <p>{readiness.nextBestAction}</p>
          </div>
          <div className="coach-badge">
            <Trophy size={18} aria-hidden="true" />
            {readiness.overall}/100
          </div>
        </div>
        <div className="recommendation-grid">
          {recommendations.map((item) => (
            <button
              className="recommendation-card"
              key={item.title}
              type="button"
              onClick={() => {
                recordEvent('coach_recommendation_selected', item.title, {
                  view: item.view,
                  impact: item.impact,
                })
                setView(item.view)
              }}
            >
              <div>
                <Compass size={18} aria-hidden="true" />
                <strong>{item.title}</strong>
              </div>
              <p>{item.detail}</p>
              <span>Impact {item.impact}/10</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel judge-panel">
        <SectionTitle
          eyebrow="Judge simulator"
          title="How this reads in review"
          detail="The simulator mirrors the four equally weighted criteria."
        />
        <div className="judge-list">
          {readiness.criteria.map((criterion) => (
            <div className="judge-row" key={criterion.key}>
              <span style={{ background: criterionColors[criterion.key] }} />
              <div>
                <strong>{criterion.label}</strong>
                <small>{criterion.reason}</small>
              </div>
              <b>{criterion.score}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ThesisItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="thesis-item">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  )
}

function StrategyView({
  workspace,
  readiness,
  patchBrief,
  setActivePersona,
  cycleExperiment,
  addDecision,
  strengthenEvidence,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  patchBrief: (key: keyof WorkspaceState['brief'], value: string) => void
  setActivePersona: (id: string) => void
  cycleExperiment: (id: string) => void
  addDecision: () => void
  strengthenEvidence: (id: string) => void
}) {
  const activePersona = workspace.personas.find((persona) => persona.id === workspace.activePersonaId)

  return (
    <div className="view-stack">
      <SectionTitle
        eyebrow="Product thinking"
        title="Make the product painfully clear"
        detail="Judges reward a product that knows who it is for, what it does, and why that matters."
      />

      <section className="split-grid">
        <div className="panel wide-panel">
          <div className="field-grid">
            <TextField label="Product name" value={workspace.brief.name} onChange={(value) => patchBrief('name', value)} />
            <TextField label="North star metric" value={workspace.brief.northStar} onChange={(value) => patchBrief('northStar', value)} />
            <TextField
              label="Tagline"
              value={workspace.brief.tagline}
              onChange={(value) => patchBrief('tagline', value)}
              multiline
            />
            <TextField
              label="Target audience"
              value={workspace.brief.audience}
              onChange={(value) => patchBrief('audience', value)}
              multiline
            />
            <TextField
              label="Problem"
              value={workspace.brief.problem}
              onChange={(value) => patchBrief('problem', value)}
              multiline
            />
            <TextField
              label="Solution"
              value={workspace.brief.solution}
              onChange={(value) => patchBrief('solution', value)}
              multiline
            />
            <TextField
              label="Differentiator"
              value={workspace.brief.differentiator}
              onChange={(value) => patchBrief('differentiator', value)}
              multiline
            />
            <TextField
              label="Public URL"
              value={workspace.brief.deploymentUrl}
              onChange={(value) => patchBrief('deploymentUrl', value)}
            />
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Score diagnosis"
            title="Criteria pressure test"
            detail="Use the lowest score as the next product decision."
          />
          <div className="score-bars">
            {readiness.criteria.map((criterion) => (
              <div className="score-bar" key={criterion.key}>
                <div>
                  <strong>{criterion.label}</strong>
                  <span>{criterion.score}/100</span>
                </div>
                <ProgressBar value={criterion.score} label={criterion.label} />
                <p>{criterion.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Persona lens"
            title="Who gets value first"
            detail="Switch the active lens to keep copy and prioritization grounded."
          />
          <div className="persona-list">
            {workspace.personas.map((persona) => (
              <button
                key={persona.id}
                className={cn('persona-card', persona.id === workspace.activePersonaId && 'selected')}
                type="button"
                onClick={() => setActivePersona(persona.id)}
              >
                <strong>{persona.name}</strong>
                <span>{persona.role}</span>
                <p>{persona.need}</p>
              </button>
            ))}
          </div>
          {activePersona && (
            <div className="insight-strip">
              <Search size={18} aria-hidden="true" />
              <span>{activePersona.anxiety}</span>
            </div>
          )}
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Learning loops"
            title="Experiments"
            detail="Each experiment has a hypothesis, metric, audience, and status."
          />
          <div className="experiment-list">
            {workspace.experiments.map((experiment) => (
              <button
                className="experiment-row"
                type="button"
                key={experiment.id}
                onClick={() => cycleExperiment(experiment.id)}
              >
                <div>
                  <strong>{experiment.hypothesis}</strong>
                  <span>{experiment.metric}</span>
                  <small>{experiment.audience}</small>
                </div>
                <StatusPill status={experiment.status} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Evidence bank"
            title="Proof the problem matters"
            detail="Click evidence to strengthen or reset its confidence score."
          />
          <div className="evidence-list">
            {workspace.evidence.map((item) => (
              <button
                className="evidence-card"
                key={item.id}
                type="button"
                onClick={() => strengthenEvidence(item.id)}
              >
                <div>
                  <Star size={17} aria-hidden="true" />
                  <strong>{item.title}</strong>
                  <span>{item.source}</span>
                </div>
                <p>{item.insight}</p>
                <ProgressBar value={item.strength} label={item.title} />
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Competitive wedge"
            title="Why this product is different"
            detail="This keeps ambition specific instead of inflated."
          />
          <div className="competitor-list">
            {workspace.competitors.map((competitor) => (
              <article className="competitor-card" key={competitor.id}>
                <div>
                  <Award size={17} aria-hidden="true" />
                  <strong>{competitor.name}</strong>
                </div>
                <p>{competitor.positioning}</p>
                <small>{competitor.weakness}</small>
                <span>{competitor.opportunity}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-action-head">
          <SectionTitle
            eyebrow="Decision quality"
            title="Decision log"
            detail="Good product work remembers why tradeoffs were made."
          />
          <button className="secondary-action" type="button" onClick={addDecision}>
            <History size={18} aria-hidden="true" />
            Add decision
          </button>
        </div>
        <div className="decision-grid">
          {workspace.decisions.map((decision) => (
            <article className="decision-card" key={decision.id}>
              <span>{formatTime(decision.timestamp)}</span>
              <strong>{decision.decision}</strong>
              <p>{decision.reason}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function BuildView({
  workspace,
  readiness,
  toggleFeature,
  toggleTask,
  toggleRisk,
  toggleJourneyStep,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  toggleFeature: (id: string) => void
  toggleTask: (id: string) => void
  toggleRisk: (id: string) => void
  toggleJourneyStep: (id: string) => void
}) {
  const [featureFilter, setFeatureFilter] = useState('All')
  const categories = ['All', ...Array.from(new Set(workspace.features.map((feature) => feature.category)))]
  const filteredFeatures =
    featureFilter === 'All'
      ? workspace.features
      : workspace.features.filter((feature) => feature.category === featureFilter)
  const sortedFeatures = [...filteredFeatures].sort((a, b) => priorityScore(b) - priorityScore(a))
  const chartData = workspace.features.reduce<Array<{ name: string; live: number; building: number; planned: number }>>(
    (acc, feature) => {
      const existing = acc.find((item) => item.name === feature.category)
      if (existing) {
        existing[feature.status] += 1
      } else {
        acc.push({
          name: feature.category,
          live: feature.status === 'live' ? 1 : 0,
          building: feature.status === 'building' ? 1 : 0,
          planned: feature.status === 'planned' ? 1 : 0,
        })
      }
      return acc
    },
    [],
  )

  return (
    <div className="view-stack">
      <SectionTitle
        eyebrow="Build execution"
        title="Thirty-six connected product capabilities"
        detail="Every feature is prioritized, statused, and reflected in readiness."
      />

      <section className="metric-grid">
        <MetricCard
          icon={Layers}
          label="Live features"
          value={`${workspace.features.filter((feature) => feature.status === 'live').length}`}
          detail={`${workspace.features.length} advanced features tracked`}
          progress={readiness.featureCompletion}
        />
        <MetricCard
          icon={Activity}
          label="Active tasks"
          value={`${workspace.tasks.filter((task) => task.status === 'active').length}`}
          detail="Click a task to advance its state"
          progress={readiness.taskCompletion}
        />
        <MetricCard
          icon={Radar}
          label="Open high risks"
          value={`${readiness.unresolvedHighRisks}`}
          detail="Resolve blockers before launch"
          progress={Math.max(0, 100 - readiness.unresolvedHighRisks * 25)}
        />
        <MetricCard
          icon={BadgeCheck}
          label="QA checks"
          value={`${workspace.qaChecks.filter((item) => item.done).length}/${workspace.qaChecks.length}`}
          detail="Launch confidence depends on proof"
          progress={readiness.qaCompletion}
        />
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Feature mix"
            title="Capability status by category"
            detail="Ambition is strongest when shipped features are balanced."
          />
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="live" stackId="a" fill="#0f766e" />
                <Bar dataKey="building" stackId="a" fill="#2563eb" />
                <Bar dataKey="planned" stackId="a" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Launch board"
            title="Task flow"
            detail="Queued, active, and done states update the execution score."
          />
          <div className="kanban">
            {(['queued', 'active', 'done'] as TaskStatus[]).map((status) => (
              <div className="kanban-lane" key={status}>
                <span>{statusLabels[status]}</span>
                {workspace.tasks
                  .filter((task) => task.status === status)
                  .map((task) => (
                    <button className="kanban-card" key={task.id} type="button" onClick={() => toggleTask(task.id)}>
                      <strong>{task.title}</strong>
                      <small>
                        {task.owner} - {task.due}
                      </small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          eyebrow="User journey"
          title="Instrumented workflow map"
          detail="Click a step to mark whether it is covered by an analytics event."
        />
        <div className="journey-map">
          {workspace.journey.map((step, index) => (
            <button
              className={cn('journey-step', step.instrumented && 'instrumented')}
              key={step.id}
              type="button"
              onClick={() => toggleJourneyStep(step.id)}
            >
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.goal}</p>
                <small>{step.event}</small>
              </div>
              {step.instrumented ? <CheckCircle2 size={18} aria-hidden="true" /> : <Route size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="feature-toolbar">
          <SectionTitle
            eyebrow="Priority matrix"
            title="Feature portfolio"
            detail="Click a feature to cycle planned, building, and live."
          />
          <div className="segmented">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={category === featureFilter ? 'selected' : undefined}
                onClick={() => setFeatureFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <div className="feature-grid">
          {sortedFeatures.map((feature) => (
            <button className="feature-card" key={feature.id} type="button" onClick={() => toggleFeature(feature.id)}>
              <div className="feature-card-head">
                <span>{feature.category}</span>
                <StatusPill status={feature.status} />
              </div>
              <strong>{feature.title}</strong>
              <p>{feature.description}</p>
              <div className="feature-score-row">
                <span>Priority {priorityScore(feature)}</span>
                <small>
                  I{feature.impact} E{feature.effort} C{feature.confidence}
                </small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          eyebrow="Risk control"
          title="Blocker register"
          detail="Resolve the risks that could make the submission feel unfinished."
        />
        <div className="risk-grid">
          {workspace.risks.map((risk) => (
            <button
              key={risk.id}
              className={cn('risk-card', risk.resolved && 'resolved')}
              type="button"
              onClick={() => toggleRisk(risk.id)}
            >
              <span className={cn('risk-level', risk.level.toLowerCase())}>{risk.level}</span>
              <strong>{risk.title}</strong>
              <p>{risk.mitigation}</p>
              <small>{risk.resolved ? 'Resolved' : 'Open'}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function AnalyticsView({
  workspace,
  readiness,
  recordEvent,
  toggleTaxonomy,
  diagnostics,
  integrationChecks,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  recordEvent: (eventName: string, detail: string, metadata?: Record<string, unknown>) => void
  toggleTaxonomy: (id: string) => void
  diagnostics: ReturnType<typeof getNovusDiagnostics>
  integrationChecks: IntegrationCheck[]
}) {
  const funnelData = [
    { name: 'Opened', value: Math.max(12, workspace.events.length + 12) },
    { name: 'Scored', value: Math.max(8, workspace.events.filter((event) => event.event.includes('criteria')).length + 8) },
    { name: 'Built', value: Math.max(5, workspace.features.filter((feature) => feature.status === 'live').length) },
    { name: 'Exported', value: Math.max(1, workspace.events.filter((event) => event.event === 'workspace_exported').length + 1) },
  ]
  const adoptionData = Array.from({ length: 7 }, (_, index) => ({
    day: `D${index + 1}`,
    events: Math.max(2, Math.round((workspace.events.length + index * 3 + readiness.overall / 10) % 24) + 4),
    readiness: Math.min(100, readiness.overall + index * 2),
  }))
  const pieData = [
    { name: 'Strategy', value: workspace.features.filter((feature) => feature.category === 'Strategy').length },
    { name: 'Build', value: workspace.features.filter((feature) => feature.category === 'Build').length },
    { name: 'Analytics', value: workspace.features.filter((feature) => feature.category === 'Analytics').length },
    { name: 'Launch', value: workspace.features.filter((feature) => feature.category === 'Launch').length },
    { name: 'System', value: workspace.features.filter((feature) => feature.category === 'System').length },
  ]
  const pieColors = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#475569']

  return (
    <div className="view-stack">
      <SectionTitle
        eyebrow="Measured shippedness"
        title="Analytics that prove the product is alive"
        detail="Novus can receive the same events that this local feed records during development."
      />

      <section className="split-grid">
        <div className="panel">
          <div className="novus-box">
            <div className="novus-status">
              <span className={cn('pulse-dot', diagnostics.agentReady && 'ready')} />
              <div>
                <strong>
                  {diagnostics.agentReady
                    ? 'Novus agent tracking'
                    : diagnostics.configured
                      ? 'Novus key configured'
                      : 'Novus integration ready'}
                </strong>
                <p>
                  {diagnostics.agentReady
                    ? 'Events are sent through the browser analytics agent.'
                    : diagnostics.configured
                      ? 'Events are queued until the analytics agent is available.'
                    : 'Add VITE_NOVUS_PUBLIC_APP_ID in the deployed environment to activate Novus.'}
                </p>
              </div>
            </div>
            <code>VITE_NOVUS_PUBLIC_APP_ID=your-novus-install-key</code>
          </div>
          <div className="diagnostic-grid">
            <DiagnosticCard label="Configured" value={diagnostics.configured ? 'Yes' : 'No'} />
            <DiagnosticCard label="Agent ready" value={diagnostics.agentReady ? 'Yes' : 'No'} />
            <DiagnosticCard label="Queue depth" value={String(diagnostics.queueDepth)} />
            <DiagnosticCard label="Visitor ID" value={diagnostics.visitorId.replace('visitor-', '').slice(0, 8)} />
          </div>
          <div className="event-buttons">
            {workspace.eventTaxonomy.slice(0, 6).map((item) => (
              <button
                key={item.id}
                className="secondary-action compact"
                type="button"
                onClick={() =>
                  recordEvent(item.event, `Manual event fired from analytics lab: ${item.trigger}`, {
                    trigger: item.trigger,
                  })
                }
              >
                <Activity size={16} aria-hidden="true" />
                {item.event}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Integration health"
            title="Novus proof checklist"
            detail="These checks feed the shippedness score."
          />
          <div className="integration-checks">
            {integrationChecks.map((check) => (
              <article className={cn('integration-card', check.status)} key={check.id}>
                <PlugZap size={18} aria-hidden="true" />
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
                <span>{check.status}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Event coverage"
            title="Taxonomy"
            detail="Toggle events to decide what belongs in production measurement."
          />
          <div className="taxonomy-list">
            {workspace.eventTaxonomy.map((item) => (
              <button
                className={cn('taxonomy-row', item.active && 'active')}
                key={item.id}
                type="button"
                onClick={() => toggleTaxonomy(item.id)}
              >
                <span>{item.active ? <Check size={16} aria-hidden="true" /> : <span />}</span>
                <div>
                  <strong>{item.event}</strong>
                  <small>{item.why}</small>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Journey coverage"
            title="Analytics mapped to workflow"
            detail="A judge can see which user actions are measurable."
          />
          <div className="journey-compact">
            {workspace.journey.map((step) => (
              <div className={cn('journey-compact-row', step.instrumented && 'instrumented')} key={step.id}>
                {step.instrumented ? <CheckCircle2 size={16} aria-hidden="true" /> : <Route size={16} aria-hidden="true" />}
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.event}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="chart-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Funnel"
            title="Launch path health"
            detail="A compact proxy for activation through export."
          />
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Trend"
            title="Readiness and activity"
            detail="Real product actions strengthen this signal."
          />
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={adoptionData}>
                <defs>
                  <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="events" stroke="#2563eb" fill="url(#activityGradient)" />
                <Area type="monotone" dataKey="readiness" stroke="#d97706" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Coverage"
            title="Feature balance"
            detail="The app is intentionally not one-dimensional."
          />
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={86} innerRadius={46}>
                  {pieData.map((_, index) => (
                    <Cell key={pieColors[index]} fill={pieColors[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          eyebrow="Real-time feed"
          title="Product event stream"
          detail="Actions appear here immediately and are Novus-ready in production."
        />
        <EventFeed events={workspace.events} />
      </section>
    </div>
  )
}

function LaunchView({
  workspace,
  readiness,
  patchBrief,
  toggleChecklist,
  toggleQa,
  exportWorkspace,
  importWorkspace,
  resetWorkspace,
  copyAsset,
  cycleLaunchAsset,
}: {
  workspace: WorkspaceState
  readiness: ReturnType<typeof calculateReadiness>
  patchBrief: (key: keyof WorkspaceState['brief'], value: string) => void
  toggleChecklist: (id: string) => void
  toggleQa: (id: string) => void
  exportWorkspace: () => void
  importWorkspace: (file: File) => void
  resetWorkspace: () => void
  copyAsset: (label: string, text: string) => void
  cycleLaunchAsset: (id: string) => void
}) {
  const submissionDescription = buildSubmissionDescription(workspace)
  const demoScript = buildDemoScript(workspace, readiness.overall)
  const testingInstructions = buildTestingInstructions(workspace)
  const winnerNarrative = buildWinnerNarrative(workspace, readiness.overall)

  return (
    <div className="view-stack">
      <SectionTitle
        eyebrow="Submission command"
        title="Turn the build into judging evidence"
        detail="Public URL, video, Novus screenshot, description, and testing instructions live here."
      />

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Launch readiness"
            title="Submission checklist"
            detail="The official submission needs these proof points."
          />
          <Checklist items={workspace.checklist} onToggle={toggleChecklist} />
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Quality proof"
            title="Production QA"
            detail="Keep the judging experience stable across browsers and screens."
          />
          <Checklist items={workspace.qaChecks} onToggle={toggleQa} />
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="Deployment"
            title="Public access"
            detail="Paste the deployed URL after publishing."
          />
          <TextField
            label="Public deployed URL"
            value={workspace.brief.deploymentUrl}
            onChange={(value) => patchBrief('deploymentUrl', value)}
          />
          <div className="launch-score">
            <ScoreOrb value={readiness.overall} label="forecast" />
            <div>
              <strong>{readiness.overall >= 85 ? 'Winning shape' : 'Keep sharpening'}</strong>
              <p>
                The forecast combines product clarity, execution progress, ambition, QA, launch checklist,
                and Novus readiness.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <SectionTitle
            eyebrow="Workspace"
            title="Portable state"
            detail="Use export before deployment or demo recording."
          />
          <div className="file-actions">
            <button className="primary-action" type="button" onClick={exportWorkspace}>
              <Download size={18} aria-hidden="true" />
              Export JSON
            </button>
            <label className="upload-action">
              <Upload size={18} aria-hidden="true" />
              Import JSON
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    importWorkspace(file)
                  }
                }}
              />
            </label>
            <button className="danger-action" type="button" onClick={resetWorkspace}>
              <RefreshCcw size={18} aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          eyebrow="Launch asset studio"
          title="Submission materials"
          detail="Click each asset to cycle draft, ready, and sent."
        />
        <div className="asset-grid">
          {workspace.launchAssets.map((asset) => (
            <button className="asset-card" key={asset.id} type="button" onClick={() => cycleLaunchAsset(asset.id)}>
              <div>
                <ClipboardList size={18} aria-hidden="true" />
                <strong>{asset.title}</strong>
                <StatusPill status={asset.status} />
              </div>
              <span>{asset.channel}</span>
              <p>{asset.copy}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="split-grid">
        <div className="panel copy-panel">
          <div className="panel-action-head">
            <SectionTitle
              eyebrow="Devpost copy"
              title="Written description"
              detail="Ready to paste and tune for the final submission."
            />
            <IconButton icon={Copy} label="Copy description" onClick={() => copyAsset('description', submissionDescription)} />
          </div>
          <pre>{submissionDescription}</pre>
        </div>

        <div className="panel copy-panel">
          <div className="panel-action-head">
            <SectionTitle
              eyebrow="Demo video"
              title="Two-minute script"
              detail="Shows the working product instead of narrating slides."
            />
            <IconButton icon={Copy} label="Copy demo script" onClick={() => copyAsset('demo script', demoScript)} />
          </div>
          <pre>{demoScript}</pre>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel copy-panel">
          <div className="panel-action-head">
            <SectionTitle
              eyebrow="Judge access"
              title="Testing instructions"
              detail="Clear instructions reduce judging friction."
            />
            <IconButton icon={Copy} label="Copy testing instructions" onClick={() => copyAsset('testing instructions', testingInstructions)} />
          </div>
          <pre>{testingInstructions}</pre>
        </div>

        <div className="panel copy-panel">
          <div className="panel-action-head">
            <SectionTitle
              eyebrow="Winner story"
              title="Narrative brief"
              detail="A compact story for the final description or public post."
            />
            <IconButton icon={Copy} label="Copy winner narrative" onClick={() => copyAsset('winner narrative', winnerNarrative)} />
          </div>
          <pre>{winnerNarrative}</pre>
        </div>
      </section>
    </div>
  )
}

function Checklist({ items, onToggle }: { items: ChecklistItem[]; onToggle: (id: string) => void }) {
  return (
    <div className="checklist">
      {items.map((item) => (
        <button className={cn('check-row', item.done && 'done')} key={item.id} type="button" onClick={() => onToggle(item.id)}>
          <span>{item.done ? <Check size={16} aria-hidden="true" /> : null}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </div>
  )
}

function EventFeed({ events }: { events: ProductEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No events yet" detail="Interact with the app to generate measurement proof." />
  }

  return (
    <div className="event-feed">
      {events.slice(0, 14).map((event) => (
        <article className="event-row" key={event.id}>
          <span>{formatTime(event.timestamp)}</span>
          <div>
            <strong>{event.event}</strong>
            <p>{event.detail}</p>
          </div>
          <small>{event.source}</small>
        </article>
      ))}
    </div>
  )
}

function buildSubmissionDescription(workspace: WorkspaceState) {
  const liveCount = workspace.features.filter((feature) => feature.status === 'live').length
  const evidenceScore = Math.round(
    workspace.evidence.reduce((total, item) => total + item.strength, 0) / Math.max(1, workspace.evidence.length),
  )
  const instrumentedSteps = workspace.journey.filter((step) => step.instrumented).length
  const readyAssets = workspace.launchAssets.filter((asset) => asset.status !== 'draft').length
  const topFeatures = workspace.features
    .slice()
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, 8)
    .map((feature) => `- ${feature.title}: ${feature.description}`)
    .join('\n')

  return `What I built
${workspace.brief.name} is ${workspace.brief.tagline}

Who it is for
${workspace.brief.audience}

Problem
${workspace.brief.problem}

Solution
${workspace.brief.solution}

Why it matters
${workspace.brief.differentiator}

Core features
${topFeatures}

Product evidence
The evidence bank currently averages ${evidenceScore}/100 strength across ${workspace.evidence.length} proof points. The competitive wedge is that LaunchPilot connects product judgement, build progress, measurement, and submission proof in one workflow.

Measurement
The product includes a Novus-ready event taxonomy, local real-time activity feed, visitor and account initialization hooks, event queue handling, integration diagnostics, and ${instrumentedSteps}/${workspace.journey.length} instrumented journey steps.

Current proof
${liveCount} of ${workspace.features.length} advanced capabilities are marked live, ${readyAssets}/${workspace.launchAssets.length} launch assets are ready or sent, with readiness, QA, risks, journey coverage, integration health, and launch checklist all tracked in the working application.

Tools used
React, TypeScript, Vite, Recharts, Lucide icons, local persistence, and Novus/Pendo analytics integration hooks.`
}

function buildDemoScript(workspace: WorkspaceState, readiness: number) {
  return `0:00 - Open ${workspace.brief.name} and show the command center with the live deadline, readiness forecast, and judge-weighted criteria.

0:20 - Show the product thesis: target audience, problem, solution, differentiator, persona lens, and north star metric.

0:45 - Move to Build and click a feature plus a kanban task so progress updates immediately.

1:10 - Open Analytics, fire one mapped product event, and show the real-time feed plus Novus-ready install key path.

1:35 - Open Launch, show the checklist, QA proof, exported workspace, generated submission description, and demo script.

2:00 - Close with the current readiness score of ${readiness}/100 and explain that the product is useful because it turns shipping into a measurable workflow rather than a last-minute scramble.`
}

function buildTestingInstructions(workspace: WorkspaceState) {
  return `Testing instructions
1. Open the public URL: ${workspace.brief.deploymentUrl || '[paste deployed URL here]'}
2. Start on Command and review the readiness score, launch coach, deadline, and judge simulator.
3. Open Strategy and inspect the product thesis, personas, evidence bank, competitor wedge, experiments, and decision log.
4. Open Build and click one feature, one task, one risk, and one journey step to confirm state updates.
5. Open Analytics and fire a mapped event. Confirm the local feed updates immediately and inspect Novus health diagnostics.
6. Open Launch and review checklist, QA, launch assets, submission copy, demo script, testing instructions, and workspace export.
7. If Novus access is available, confirm deployed events appear in the Novus dashboard and attach the screenshot to Devpost.

No login is required for judges unless the deployed host adds access protection.`
}

function buildWinnerNarrative(workspace: WorkspaceState, readiness: number) {
  const evidenceLine = workspace.evidence
    .slice()
    .sort((a, b) => b.strength - a.strength)[0]
  const sentAssets = workspace.launchAssets.filter((asset) => asset.status === 'sent').length

  return `${workspace.brief.name} exists because shipping with AI is no longer the hard part; shipping the right thing, with proof, is.

The product gives builders one place to clarify the user, sharpen the product thesis, prioritize the build, map analytics, reduce launch risk, and generate submission materials. Its strongest wedge is that progress is not cosmetic: every feature, risk, checklist item, journey event, launch asset, and Novus diagnostic feeds the readiness model.

Current judge-readiness forecast: ${readiness}/100.
Strongest evidence: ${evidenceLine?.title ?? 'Evidence bank ready'}.
Launch assets sent: ${sentAssets}/${workspace.launchAssets.length}.
North star: ${workspace.brief.northStar}.`
}

function App() {
  const [rawWorkspace, setWorkspace] = usePersistentState<WorkspaceState>(storageKey, defaultWorkspace)
  const workspace = useMemo(() => normalizeWorkspace(rawWorkspace), [rawWorkspace])
  const [activeView, setActiveView] = useState<ViewKey>('command')
  const [now, setNow] = useState(new Date())
  const [toast, setToast] = useState('')
  const fileImportRef = useRef(false)
  const novusDiagnostics = getNovusDiagnostics(workspace.brief)
  const runtimeIntegrationChecks = useMemo(
    () => deriveIntegrationChecks(workspace, novusDiagnostics),
    [workspace, novusDiagnostics],
  )
  const scoredWorkspace = useMemo(
    () => ({ ...workspace, integrationChecks: runtimeIntegrationChecks }),
    [workspace, runtimeIntegrationChecks],
  )
  const readiness = useMemo(() => calculateReadiness(scoredWorkspace), [scoredWorkspace])
  const countdown = useMemo(() => formatCountdown(now), [now])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }, [])

  const saveWorkspace = useCallback(
    (updater: (current: WorkspaceState) => WorkspaceState) => {
      setWorkspace((current) => ({
        ...updater(normalizeWorkspace(current)),
        lastSavedAt: new Date().toISOString(),
      }))
    },
    [setWorkspace],
  )

  const recordEvent = useCallback(
    (eventName: string, detail: string, metadata?: Record<string, unknown>) => {
      saveWorkspace((current) => ({
        ...current,
        events: [createProductEvent(eventName, detail, metadata), ...current.events].slice(0, 60),
      }))
    },
    [saveWorkspace],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = workspace.darkMode ? 'dark' : 'light'
  }, [workspace.darkMode])

  useEffect(() => {
    initializeNovus(workspace.brief)
  }, [workspace.brief])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) {
        return
      }

      const index = Number(event.key) - 1
      if (index >= 0 && index < views.length) {
        setActiveView(views[index].key)
      }
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const patchBrief = useCallback(
    (key: keyof WorkspaceState['brief'], value: string) => {
      saveWorkspace((current) => ({
        ...current,
        brief: {
          ...current.brief,
          [key]: value,
        },
      }))
    },
    [saveWorkspace],
  )

  const toggleFeature = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const feature = current.features.find((item) => item.id === id)
        const nextStatus = feature ? nextFeatureStatus(feature.status) : 'planned'
        return {
          ...current,
          features: current.features.map((item) =>
            item.id === id ? { ...item, status: nextStatus } : item,
          ),
          events: [
            createProductEvent('feature_status_changed', `${feature?.title ?? id} moved to ${nextStatus}`, {
              featureId: id,
              status: nextStatus,
            }),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const toggleTask = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const task = current.tasks.find((item) => item.id === id)
        const nextStatus = task ? nextTaskStatus(task.status) : 'queued'
        return {
          ...current,
          tasks: current.tasks.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
          events: [
            createProductEvent('task_advanced', `${task?.title ?? id} moved to ${nextStatus}`, {
              taskId: id,
              status: nextStatus,
            }),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const toggleRisk = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const risk = current.risks.find((item) => item.id === id)
        const resolved = !risk?.resolved
        return {
          ...current,
          risks: current.risks.map((item) => (item.id === id ? { ...item, resolved } : item)),
          events: [
            createProductEvent(
              resolved ? 'risk_resolved' : 'risk_reopened',
              `${risk?.title ?? id} marked ${resolved ? 'resolved' : 'open'}`,
              { riskId: id, resolved },
            ),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const strengthenEvidence = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const evidence = current.evidence.find((item) => item.id === id)
        const nextStrength = evidence && evidence.strength >= 96 ? 78 : Math.min(100, (evidence?.strength ?? 78) + 7)

        return {
          ...current,
          evidence: current.evidence.map((item) =>
            item.id === id ? { ...item, strength: nextStrength } : item,
          ),
          events: [
            createProductEvent('evidence_strength_updated', `${evidence?.title ?? id} strength set to ${nextStrength}`, {
              evidenceId: id,
              strength: nextStrength,
            }),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const toggleJourneyStep = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const step = current.journey.find((item) => item.id === id)
        const instrumented = !step?.instrumented

        return {
          ...current,
          journey: current.journey.map((item) => (item.id === id ? { ...item, instrumented } : item)),
          events: [
            createProductEvent(
              instrumented ? 'journey_step_instrumented' : 'journey_step_unmapped',
              `${step?.title ?? id} marked ${instrumented ? 'instrumented' : 'unmapped'}`,
              { journeyStepId: id, event: step?.event, instrumented },
            ),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const cycleLaunchAsset = useCallback(
    (id: string) => {
      saveWorkspace((current) => {
        const asset = current.launchAssets.find((item) => item.id === id)
        const status = asset ? nextLaunchAssetStatus(asset.status) : 'draft'

        return {
          ...current,
          launchAssets: current.launchAssets.map((item) => (item.id === id ? { ...item, status } : item)),
          events: [
            createProductEvent('launch_asset_status_changed', `${asset?.title ?? id} moved to ${status}`, {
              launchAssetId: id,
              status,
            }),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const toggleChecklist = useCallback(
    (id: string) => {
      saveWorkspace((current) => ({
        ...current,
        checklist: current.checklist.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      }))
      recordEvent('submission_check_updated', `Submission checklist item changed: ${id}`, { id })
    },
    [recordEvent, saveWorkspace],
  )

  const toggleQa = useCallback(
    (id: string) => {
      saveWorkspace((current) => ({
        ...current,
        qaChecks: current.qaChecks.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
      }))
      recordEvent('qa_check_updated', `QA checklist item changed: ${id}`, { id })
    },
    [recordEvent, saveWorkspace],
  )

  const toggleTaxonomy = useCallback(
    (id: string) => {
      saveWorkspace((current) => ({
        ...current,
        eventTaxonomy: current.eventTaxonomy.map((item) =>
          item.id === id ? { ...item, active: !item.active } : item,
        ),
      }))
      recordEvent('taxonomy_updated', `Event taxonomy toggled: ${id}`, { id })
    },
    [recordEvent, saveWorkspace],
  )

  const cycleExperiment = useCallback(
    (id: string) => {
      const nextStatus: Record<ExperimentStatus, ExperimentStatus> = {
        draft: 'running',
        running: 'won',
        won: 'draft',
      }

      saveWorkspace((current) => {
        const experiment = current.experiments.find((item) => item.id === id)
        const status = experiment ? nextStatus[experiment.status] : 'draft'
        return {
          ...current,
          experiments: current.experiments.map((item) => (item.id === id ? { ...item, status } : item)),
          events: [
            createProductEvent('experiment_status_changed', `${experiment?.hypothesis ?? id} moved to ${status}`, {
              experimentId: id,
              status,
            }),
            ...current.events,
          ].slice(0, 60),
        }
      })
    },
    [saveWorkspace],
  )

  const setActivePersona = useCallback(
    (id: string) => {
      saveWorkspace((current) => ({ ...current, activePersonaId: id }))
      recordEvent('persona_selected', `Persona selected: ${id}`, { id })
    },
    [recordEvent, saveWorkspace],
  )

  const addDecision = useCallback(() => {
    saveWorkspace((current) => ({
      ...current,
      decisions: [
        {
          id: crypto.randomUUID(),
          decision: `Focus next on ${readiness.criteria.slice().sort((a, b) => a.score - b.score)[0].label}.`,
          reason: 'The lowest judge-weighted score is the best next constraint to improve.',
          timestamp: new Date().toISOString(),
        },
        ...current.decisions,
      ].slice(0, 12),
    }))
    recordEvent('decision_added', 'A judge-score decision was added', { readiness: readiness.overall })
  }, [readiness, recordEvent, saveWorkspace])

  const exportWorkspace = useCallback(() => {
    downloadJson(`${workspace.brief.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-workspace.json`, workspace)
    recordEvent('workspace_exported', 'Workspace JSON downloaded', { readiness: readiness.overall })
    showToast('Workspace exported')
  }, [readiness.overall, recordEvent, showToast, workspace])

  const importWorkspace = useCallback(
    (file: File) => {
      if (fileImportRef.current) {
        return
      }
      fileImportRef.current = true
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as WorkspaceState
          setWorkspace(normalizeWorkspace({ ...defaultWorkspace, ...parsed, lastSavedAt: new Date().toISOString() }))
          showToast('Workspace imported')
        } catch {
          showToast('Import failed')
        } finally {
          fileImportRef.current = false
        }
      }
      reader.readAsText(file)
    },
    [setWorkspace, showToast],
  )

  const resetWorkspace = useCallback(() => {
    setWorkspace({ ...defaultWorkspace, lastSavedAt: new Date().toISOString() })
    showToast('Workspace reset')
  }, [setWorkspace, showToast])

  const copyAsset = useCallback(
    async (label: string, text: string) => {
      await copyText(text)
      recordEvent('submission_pack_copied', `${label} copied to clipboard`, { label })
      showToast(`${label} copied`)
    },
    [recordEvent, showToast],
  )

  const setDarkMode = useCallback(() => {
    saveWorkspace((current) => ({ ...current, darkMode: !current.darkMode }))
  }, [saveWorkspace])

  const markSaved = useCallback(() => {
    saveWorkspace((current) => current)
    showToast('Workspace saved')
  }, [saveWorkspace, showToast])

  const activeViewConfig = views.find((view) => view.key === activeView) ?? views[0]
  const ViewIcon = activeViewConfig.icon

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark">
            <WandSparkles size={22} aria-hidden="true" />
          </div>
          <div>
            <strong>LaunchPilot</strong>
            <span>Ship measured products</span>
          </div>
        </div>
        <nav className="nav-list">
          {views.map((view, index) => {
            const Icon = view.icon
            return (
              <button
                key={view.key}
                className={cn('nav-item', activeView === view.key && 'active')}
                type="button"
                onClick={() => setActiveView(view.key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{view.label}</span>
                <kbd>{index + 1}</kbd>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <div>
            <span>Autosaved</span>
            <strong>{formatTime(workspace.lastSavedAt)}</strong>
          </div>
          <div>
            <span>Novus</span>
            <strong>{novusDiagnostics.agentReady ? 'Tracking' : isNovusConfigured() ? 'Configured' : 'Ready'}</strong>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">
              <ViewIcon size={16} aria-hidden="true" />
              {activeViewConfig.label}
            </span>
            <strong>{workspace.brief.name}</strong>
          </div>
          <div className="topbar-actions">
            <IconButton icon={PanelLeft} label="Open command view" onClick={() => setActiveView('command')} />
            <IconButton icon={Save} label="Save workspace" onClick={markSaved} />
            <IconButton icon={workspace.darkMode ? Sun : Moon} label="Toggle theme" onClick={setDarkMode} />
          </div>
        </header>

        <div className="content-shell">
          {activeView === 'command' && (
            <CommandView
              workspace={workspace}
              readiness={readiness}
              countdown={countdown}
              setView={setActiveView}
              recordEvent={recordEvent}
              toggleTask={toggleTask}
              toggleRisk={toggleRisk}
            />
          )}
          {activeView === 'strategy' && (
            <StrategyView
              workspace={workspace}
              readiness={readiness}
              patchBrief={patchBrief}
              setActivePersona={setActivePersona}
              cycleExperiment={cycleExperiment}
              addDecision={addDecision}
              strengthenEvidence={strengthenEvidence}
            />
          )}
          {activeView === 'build' && (
            <BuildView
              workspace={workspace}
              readiness={readiness}
              toggleFeature={toggleFeature}
              toggleTask={toggleTask}
              toggleRisk={toggleRisk}
              toggleJourneyStep={toggleJourneyStep}
            />
          )}
          {activeView === 'analytics' && (
            <AnalyticsView
              workspace={workspace}
              readiness={readiness}
              recordEvent={recordEvent}
              toggleTaxonomy={toggleTaxonomy}
              diagnostics={novusDiagnostics}
              integrationChecks={runtimeIntegrationChecks}
            />
          )}
          {activeView === 'launch' && (
            <LaunchView
              workspace={workspace}
              readiness={readiness}
              patchBrief={patchBrief}
              toggleChecklist={toggleChecklist}
              toggleQa={toggleQa}
              exportWorkspace={exportWorkspace}
              importWorkspace={importWorkspace}
              resetWorkspace={resetWorkspace}
              copyAsset={copyAsset}
              cycleLaunchAsset={cycleLaunchAsset}
            />
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <ArrowRight size={16} aria-hidden="true" />
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
