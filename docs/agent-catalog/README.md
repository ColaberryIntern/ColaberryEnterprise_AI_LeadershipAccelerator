# Agent Catalog

Colaberry Enterprise AI Leadership Accelerator - Complete Agent Fleet Documentation

**Total Agents: 134** across 9 categories and 18 departments.

## Categories

| Category | Count | Description |
|----------|-------|-------------|
| [Intelligence](intelligence/) | 16 | Core Cory AI decision-making agents |
| [Assistant](assistant/) | 3 | Query pipeline and data analysis agents |
| [Super Agents](super-agents/) | 8 | High-level orchestrators coordinating department agents |
| [Departments](departments/) | 24 | Department-specific operational agents (8 depts x 3 agents) |
| [Admissions](admissions/) | 24 | Admissions funnel, lead qualification, and conversation agents |
| [OpenClaw](openclaw/) | 17 | LinkedIn and multi-platform engagement automation agents |
| [Reporting](reporting/) | 11 | Analytics, reporting, and visualization agents |
| [Security](security/) | 8 | Security monitoring, audit, and threat detection agents |
| [Services](services/) | 23 | Direct service agents for campaigns, curriculum, and platform ops |

## Intelligence Agents (Core)

These power Cory, the AI COO. They handle strategic decisions, problem detection, and autonomous operations.

| Agent | Purpose |
|-------|---------|
| [Cory Strategic Agent](intelligence/cory-strategic-agent.md) | Plans ticket creation, curriculum design, strategic initiatives |
| [Problem Discovery Agent](intelligence/problem-discovery-agent.md) | Scans for anomalies, conversion drops, error spikes |
| [Action Planner Agent](intelligence/action-planner-agent.md) | Maps root causes to safe, executable actions |
| [Execution Agent](intelligence/execution-agent.md) | Launches approved actions and monitors execution |
| [Root Cause Agent](intelligence/root-cause-agent.md) | Deep investigation of problems and evidence chaining |
| [Risk Evaluator Agent](intelligence/risk-evaluator-agent.md) | Assesses risk of proposed actions |
| [Monitor Agent](intelligence/monitor-agent.md) | Tracks outcomes at 1h/6h/24h checkpoints, rolls back if needed |
| [Impact Estimator Agent](intelligence/impact-estimator-agent.md) | Quantifies expected business impact |
| [Strategic Intelligence Agent](intelligence/strategic-intelligence-agent.md) | Long-term strategic analysis |
| [Governance Agent](intelligence/governance-agent.md) | Enforces safety policies and approval workflows |
| [Audit Agent](intelligence/audit-agent.md) | Compliance tracking and regulatory reporting |
| [Cost Optimization Agent](intelligence/cost-optimization-agent.md) | Analyzes spend, identifies cost reductions |
| [Revenue Optimization Agent](intelligence/revenue-optimization-agent.md) | Revenue forecasting and pricing optimization |
| [Growth Experiment Agent](intelligence/growth-experiment-agent.md) | Proposes and tracks A/B tests |
| [Dataset Registration Agent](intelligence/dataset-registration-agent.md) | Registers new datasets in the intelligence system |
| [Process Observation Agent](intelligence/process-observation-agent.md) | Observes business processes for inefficiencies |

## Super Agents (Orchestrators)

High-level agents that coordinate multiple department agents for cross-functional operations.

| Agent | Purpose |
|-------|---------|
| [Admissions Super Agent](super-agents/admissions-super-agent.md) | Coordinates all admissions agents |
| [Analytics Engine Super Agent](super-agents/analytics-engine-super-agent.md) | Aggregates analytics across departments |
| [Campaign Ops Super Agent](super-agents/campaign-ops-super-agent.md) | Orchestrates campaign execution |
| [Content Engine Super Agent](super-agents/content-engine-super-agent.md) | Manages content generation pipeline |
| [Finance Super Agent](super-agents/finance-super-agent.md) | Finance planning and reporting |
| [Lead Intelligence Super Agent](super-agents/lead-intelligence-super-agent.md) | Lead scoring, enrichment, and routing |
| [Partnership Super Agent](super-agents/partnership-super-agent.md) | Partnership channel management |
| [System Resilience Super Agent](super-agents/system-resilience-super-agent.md) | System resilience and recovery |

## Departments

8 departments, 3 agents each:

- **Education**: [Curriculum Improvement](departments/curriculum-improvement-agent.md), [Mentor Matching](departments/mentor-matching-agent.md), [Student Success](departments/student-success-agent.md)
- **Finance**: [Cost Optimization](departments/cost-optimization-agent.md), [Revenue Forecast](departments/revenue-forecast-agent.md), [Scholarship Allocation](departments/scholarship-allocation-agent.md)
- **Growth**: [Growth Experiment](departments/growth-experiment-agent.md), [Opportunity Scanner](departments/growth-opportunity-scanner-agent.md), [Partnership](departments/growth-partnership-agent.md)
- **Infrastructure**: [AI Model Performance](departments/ai-model-performance-agent.md), [Security Monitoring](departments/security-monitoring-agent.md), [System Health](departments/system-health-agent.md)
- **Intelligence**: [Anomaly Detection](departments/anomaly-detection-agent.md), [Insight Narrative](departments/insight-narrative-agent.md), [Strategic Planning](departments/strategic-planning-agent.md)
- **Marketing**: [Audience Segmentation](departments/audience-segmentation-agent.md), [Campaign Performance](departments/campaign-performance-agent.md), [Content Generation](departments/content-generation-agent.md)
- **Operations**: [Quality Assurance](departments/quality-assurance-agent.md), [Task Assignment](departments/task-assignment-agent.md), [Workflow Optimization](departments/workflow-optimization-agent.md)
- **Orchestration**: [Agent Hiring](departments/agent-hiring-agent.md), [Agent Performance](departments/agent-performance-agent.md), [Decision Simulation](departments/decision-simulation-agent.md)

## Agent Lifecycle

1. **Creation** - Agent defined with role, department, responsibilities, and trigger type
2. **Pending Approval** - Starts disabled, requires admin activation
3. **Active** - Runs on-demand, on schedule (cron), or in response to events
4. **Monitoring** - Performance tracked via Agent Performance Analytics
5. **Retirement** - Disabled and removed from active roster

## How to Browse

Each agent .md file includes:
- **Purpose** - What the agent does
- **Department** - Where it belongs
- **Status** - Live, In Development, or Planned
- **Input/Output** - What it receives and produces
- **How It Works** - Step-by-step process
- **Use Cases** - Industry and department applications
- **Integration Points** - Connected systems and agents
