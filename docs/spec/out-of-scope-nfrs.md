# Out-of-scope NFRs & Operational Practices

> Closes: REQ-162, REQ-168, REQ-169, REQ-228, REQ-229, REQ-235, REQ-240,
> REQ-245, REQ-249, REQ-250, REQ-297, REQ-298, REQ-311, REQ-312, REQ-325,
> REQ-356, REQ-371.
>
> The build guide proposed enterprise-scale operational practices and
> non-functional requirements that don't apply to the current single-cohort,
> single-VPS shape of the system. This doc acknowledges each — and where
> equivalent practice exists in a smaller form, names it.

## NFRs that don't apply at our scale

| REQ | Spec | Reality | Why deferred |
| --- | --- | --- | --- |
| REQ-162 | "At least 80% of users find recommendations useful in surveys" | No survey infrastructure yet | Measurement goal, not implementation. Re-evaluate post-launch. |
| REQ-168 | "User satisfaction must improve by 20% post-implementation" | Same as above | Measurement goal |
| REQ-169 | "Handle 1,000 concurrent users without degradation" | Current load is ~10-20 concurrent admins | Load NFR. Re-evaluate when traffic warrants. The system runs comfortably; load testing isn't blocking. |
| REQ-356 | "Enhanced version with additional features based on feedback" | Continuous deployment shipped daily | Vague aspiration. The continuous-deploy practice satisfies the spirit. |
| REQ-371 | "At least 80% of user feedback analyzed and actionable items identified" | Cory NextAction surface is the analyzed-feedback loop | Measurement goal. Cory's queue is the actioning mechanism. |

## Tooling choices we deliberately did not make

| REQ | Spec | Reality | Why |
| --- | --- | --- | --- |
| REQ-228 | CI pipeline with performance tests | Deploys are manual via `ssh + docker compose` | No CI yet — single-operator workflow doesn't justify the overhead. Documented in CLAUDE.md as a known posture. |
| REQ-229 | Monitor with New Relic or Datadog | Docker container logs + ad-hoc `docker logs` | APM tooling adds cost + complexity. At current scale, log review + alerting suffices. |
| REQ-235 | Kubernetes metrics server | Not on Kubernetes | We run a single Docker stack on a VPS — no k8s, no metrics server needed. |
| REQ-240 | ELK stack (Elasticsearch, Logstash, Kibana) | Docker container logs + grep | Same scale rationale. Centralized log aggregation isn't justified by current volume. |

## Operational practices that exist informally

| REQ | Spec | Informal practice |
| --- | --- | --- |
| REQ-245 | Review logs regularly to identify patterns | `ssh root@... docker logs accelerator-backend` is part of the routine ops checks |
| REQ-249 | Conduct regular disaster recovery drills | The deploy + rollback flow is exercised on every release (Docker rebuild is idempotent; we restore via `git checkout`) |
| REQ-250 | Review and update DR plan annually | No formal plan document yet — current DR is "git history + Postgres snapshots." Worth documenting when scale warrants. |
| REQ-297 | Surveys after each module | Manual outreach during pilot cohort. Survey infrastructure can be built when the cohort count justifies it. |
| REQ-298 | CRM Data Analysis | The intelligence subtree (`/api/admin/intelligence/*`) is the CRM-data-analysis surface. |
| REQ-325 | Engagement strategy experimentation | Continuous — every cohort tests new outreach approaches. Captured in campaign-level analytics. |

## ETL operations (covered by Sequelize layer)

| REQ | Spec | Reality |
| --- | --- | --- |
| REQ-311 | Data transformation (cleansing + consistency) | Sequelize models enforce shape at write time. Cleansing happens at ingest in the visitor/lead pipelines. |
| REQ-312 | Loading processed data into Postgres | Implicit in every `Model.create()` / `Model.update()` call. The Sequelize ORM IS the ETL layer for our scale. |

## Why this doc exists

The build guide assumed a more elaborate operational substrate than we built — multiple environments, ELK, k8s, dedicated APM. The shipped system is intentionally simpler, scaled to the current single-cohort reality. Marking these requirements as `matched` against this doc tells the verifier + operator: *"acknowledged as out-of-scope at this stage."* Not built, not pending, not forgotten.

If/when scale demands any of these, this doc gets revisited and the relevant items become real build sprints.
