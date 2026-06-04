# LaunchPilot

LaunchPilot is a measured launch command center for AI-era product builders. It helps a builder turn a raw idea into a judge-ready shipped product by connecting product strategy, execution progress, analytics instrumentation, risk control, QA, and final submission assets.

## Why This Wins

The World Product Day challenge rewards product thinking, craft and execution, originality and ambition, and shippedness. LaunchPilot is built directly around those judging signals:

- Product thinking: editable thesis, personas, differentiator, north star, experiments, and risks.
- Craft and execution: dense but readable dashboard, kanban, scoring, charts, responsive controls, and local persistence.
- Originality and ambition: a 48-feature launch operating system that makes shipping measurable.
- Shippedness: Novus-ready analytics, export/import, public URL field, QA checklist, demo script, and submission description.

## Core Features

LaunchPilot includes 48 integrated capabilities:

1. Judge-weighted readiness scoring
2. Product thesis canvas
3. Persona lens switcher
4. Problem evidence bank
5. Differentiator stress test
6. North star KPI designer
7. RICE priority matrix
8. Scope firewall
9. Feature status toggles
10. 30-day release plan
11. Launch kanban
12. Milestone burndown
13. Risk radar
14. Mitigation owner map
15. Experiment backlog
16. Hypothesis designer
17. Success metric assignment
18. Novus integration guide
19. Event taxonomy
20. Real-time local event feed
21. Funnel health chart
22. Adoption trend chart
23. Retention signal chart
24. Submission checklist
25. Two-minute demo script builder
26. Submission description builder
27. Deployment QA checklist
28. Accessibility QA checklist
29. Security and privacy checklist
30. Workspace import and export
31. Local persistence
32. Keyboard navigation
33. Theme switcher
34. Activity log
35. Decision log
36. Launch confidence forecast
37. Launch coach recommendations
38. Evidence strength scoring
39. Competitive wedge map
40. Judge simulator
41. Instrumented user journey map
42. Novus health diagnostics
43. Analytics event queue
44. Launch asset studio
45. Testing instructions generator
46. Deployment proof center
47. Score improvement path
48. Winner narrative builder

## Novus Setup

Novus is required for the hackathon submission. The app includes a production-safe browser analytics integration using the Pendo/Novus agent pattern.

1. Register or open your Novus project.
2. Copy your public install or app key.
3. Set the key in your deployment environment:

```bash
VITE_NOVUS_PUBLIC_APP_ID=your-novus-install-key
```

4. Deploy the app.
5. Use the app and confirm events appear in the Novus dashboard.
6. Capture the required Novus dashboard screenshot for the final submission.

Tracked events include:

- `workspace_opened`
- `criteria_viewed`
- `feature_status_changed`
- `task_advanced`
- `risk_resolved`
- `submission_pack_copied`
- `workspace_exported`
- `coach_recommendation_selected`
- `evidence_strength_updated`
- `journey_step_instrumented`
- `launch_asset_status_changed`

When the Novus key is not configured, the app still records events locally in the real-time feed so development remains useful. When the key is configured but the browser agent is still loading, events are marked as queued and flushed after the agent becomes available.

## Local Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run test
npm run build
```

## Deployment

This is a static Vite app and can be deployed to Vercel, Netlify, Cloudflare Pages, Render, or any static host.

For Vercel, use the exact guide in [`VERCEL_DEPLOY.md`](./VERCEL_DEPLOY.md). The repository includes `vercel.json`.

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

Set `VITE_NOVUS_PUBLIC_APP_ID` in the deployment platform before final judging.
