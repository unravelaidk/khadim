# The Current LLM Landscape
## A practical brief for business leaders

**Research cutoff:** 1 August 2026
**Focus:** adoption, economics, risk, and the next 90 days
**Audience:** boards, executives, business-unit leaders, CIO/CTO/CISO, legal and risk teams

> **Executive judgment:** LLMs are now broadly available and useful, but access to a model is no longer the differentiator. Value comes from choosing a narrow workflow, redesigning it, connecting the right data, controlling model actions, measuring accepted outcomes, and driving employee adoption. Most firms should buy commodity copilots, build only differentiating workflows on managed APIs, and postpone autonomous agents or self-hosting until the economics and controls are proven.

---

## Page 1 — Executive summary

### What leaders need to know

**Adoption is widespread; scaled value is not.** In McKinsey’s 2025 survey, 88% of respondents said their organization regularly used AI in at least one function, up from 78% a year earlier, but only about one-third said their organization had begun scaling AI across the enterprise. Twenty-three percent reported scaling an agentic system somewhere, yet no individual business function exceeded 10% scaled agent adoption ([McKinsey, 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai)).

**The financial evidence is promising but uneven.** Thirty-nine percent of respondents attributed some enterprise-level EBIT impact to AI, usually less than 5% of EBIT; only about 6% met McKinsey’s “AI high performer” definition ([McKinsey, 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai)). Stanford’s 2025 AI Index similarly found that reported function-level savings were generally below 10% and the most common reported revenue gains were below 5% ([Stanford HAI, 2025](https://hai.stanford.edu/ai-index/2025-ai-index-report/economy)). These are self-reported survey results, not audited causal estimates.

**Controlled workplace studies do show real task-level gains.** A peer-reviewed field study of 5,172 support agents found that an AI assistant increased issues resolved per hour by 15%, with larger benefits for less-experienced workers ([Brynjolfsson, Li & Raymond, 2025](https://doi.org/10.1093/qje/qjae044)). A randomized experiment involving 758 consultants found that GPT-4 users completed 12.2% more suitable tasks and worked 25.1% faster, but were 19 percentage points less likely to give a correct answer on a task outside the model’s capability frontier ([Dell’Acqua et al., 2026](https://doi.org/10.1287/orsc.2025.21838)). The lesson is not “AI always raises productivity”; it is “AI can materially improve well-chosen tasks and quietly harm poorly matched ones.”

**Model access is becoming a commodity.** Businesses can choose among proprietary APIs, cloud marketplaces, packaged SaaS copilots, hosted open-weight models, and self-hosted models. Token prices vary widely and change often; caching and asynchronous batch processing can materially reduce inference charges, including discounts of roughly 50% for selected batch workloads on Amazon Bedrock ([AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)). The cheapest model per token is not necessarily cheapest per accepted business result.

**Risk increases sharply when a model can act.** The principal concerns are inaccurate outputs, confidential-data leakage, prompt injection, excessive agency, weak authorization, bias, IP uncertainty, supplier dependence, and runaway consumption. OWASP’s 2025 LLM list treats prompt injection, sensitive-data disclosure, improper output handling, excessive agency, misinformation, and unbounded consumption as distinct application risks ([OWASP](https://genai.owasp.org/llm-top-10/)).

**Governance and speed are compatible.** NIST’s voluntary Generative AI Profile recommends managing GenAI through the continuous functions **Govern, Map, Measure, and Manage**, rather than through a one-time approval checklist ([NIST AI 600-1, 2024](https://doi.org/10.6028/NIST.AI.600-1)). A tiered process lets low-risk drafting tools move quickly while imposing stronger testing, oversight, and documentation on consequential decisions and agentic actions.

### Five recommendations

1. **Fund workflows, not generic AI access.** Select 3–5 high-volume, measurable workflows with a clear owner and baseline.
2. **Buy commodity capabilities; build differentiation.** Use packaged copilots for standard work and managed APIs for proprietary workflows.
3. **Measure cost per accepted outcome.** Include correction labor, integration, retrieval, security, training, and change management—not just tokens or licenses.
4. **Keep authority outside the model.** Enforce identity, permissions, transaction limits, and approvals in ordinary software controls.
5. **Run a 90-day portfolio, not an open-ended lab.** Scale winners, redesign borderline cases, and stop pilots that cannot clear predefined value and risk gates.

---

## Page 2 — Adoption and where value is appearing

### The market has moved from experimentation to selective operationalization

The current landscape has four layers:

| Layer | Typical choices | Best business use |
|---|---|---|
| **Packaged applications** | Office, CRM, customer-support, coding, legal, and analytics copilots | Fast adoption in common workflows; vendor owns much of the integration |
| **Proprietary model APIs** | Frontier and smaller models accessed directly or through hyperscalers | Custom applications where proprietary data, UX, or orchestration matters |
| **Hosted open-weight models** | Open weights served by a cloud or specialist provider | More model choice and control without operating GPUs |
| **Self-hosted open-weight models** | Models deployed on dedicated or internal infrastructure | Sustained workloads, hard sovereignty constraints, or deep weight customization |

“Open” should not be interpreted as automatically open source, low risk, or free. Model-specific licenses may impose attribution, acceptable-use, redistribution, geographic, or large-user restrictions; Stanford notes that open weights are more common than releases containing full training code and reproducible training artifacts ([Stanford HAI, 2025](https://hai.stanford.edu/ai-index/2025-ai-index-report)). Legal review must therefore be conducted at the exact model-and-version level.

### Use cases with the clearest near-term business case

| Priority | Use case | Why it works | Required guardrail |
|---|---|---|---|
| **High** | Customer-service agent assistance | High volume, known knowledge base, measurable handle time and resolution quality | Human agent owns the response; source-ground answers |
| **High** | Software development assistance | Frequent tasks, strong user feedback loop, measurable cycle time | Code review, testing, secret scanning, dependency checks |
| **High** | Document search, synthesis, and extraction | Large reading burden and repeatable output schemas | Permission-aware retrieval and citation verification |
| **High** | Sales and service drafting | Rapid first drafts and personalization | Approved claims, brand rules, human send approval |
| **Medium** | Internal analytics narratives | Speeds explanation and exploration | Calculations performed by deterministic tools; source lineage |
| **Medium** | Contract or policy review support | Highlights and comparison can save time | Qualified reviewer makes decisions; no fabricated citations |
| **Caution** | Hiring, credit, health, legal, safety, or benefits decisions | High consequence and regulatory exposure | Specialist assessment, meaningful oversight, appeal, subgroup testing |
| **Caution** | Autonomous external actions | Error can become an immediate financial, legal, or security incident | Least privilege, limits, approval and reversibility |

### What separates value from activity

The evidence suggests that **workflow redesign matters more than distributing licenses**. McKinsey’s March 2025 study found that only 21% of organizations using GenAI reported fundamentally redesigning at least some workflows, fewer than one in five tracked well-defined GenAI KPIs, and more than 80% reported no tangible enterprise-level EBIT impact from GenAI ([McKinsey, 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai-how-organizations-are-rewiring-to-capture-value)).

For each proposed use case, leaders should require a one-page value hypothesis:

- **User and job:** Who performs which recurring task?
- **Baseline:** Current time, cost, throughput, quality, rework, and risk.
- **Intervention:** What will the LLM draft, retrieve, classify, recommend, or execute?
- **Changed workflow:** Which steps disappear, move, or require review?
- **Outcome metric:** Accepted cases, first-contact resolution, cycle time, conversion, defect rate, or risk reduction.
- **Adoption metric:** Weekly active eligible users and proportion of eligible cases assisted.
- **Stop rule:** The date and threshold at which the pilot is ended or redesigned.

Avoid counting prompts, generated words, seats assigned, or time “saved” as final value. A large randomized Microsoft 365 Copilot study found that active users spent roughly two fewer hours per week on email, but it did not detect broad changes in task composition; time released must be intentionally converted into more output, better quality, faster service, or avoided cost ([NBER Working Paper 33795, 2025](https://doi.org/10.3386/w33795)).

---

## Page 3 — Costs and operating model

### The token bill is only the visible tip

Model APIs generally charge for input and output tokens, with output and billable reasoning often costing more than input. Current official price sheets show wide differences across model tiers and separate charges for features such as web grounding, file retrieval, cache storage, dedicated capacity, and regional processing ([OpenAI Pricing](https://developers.openai.com/api/docs/pricing); [Anthropic Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing); [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing); [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)). Prices and model names change rapidly, so procurement should reprice a representative workload immediately before signing.

Use this equation:

> **Cost per accepted outcome = (licenses + model and tool usage + data/retrieval + integration + security/governance + operations + human review and correction) ÷ accepted completed outcomes**

### Major cost drivers

| Cost driver | Often overlooked effect | Management response |
|---|---|---|
| Seats and minimum commitments | Paid access without repeated use | Start with eligible roles; expand from observed weekly use |
| Context and output length | Long histories and verbose reasoning recur on each call | Trim context; cap outputs; summarize history |
| Agent loops and retries | One user request can trigger many model and tool calls | Set loop, token, time, and dollar budgets |
| Retrieval-augmented generation (RAG) | Parsing, embeddings, vector storage, retrieval, reranking, and maintenance | Budget and test the whole retrieval stack |
| Human review and correction | Can exceed inference cost in high-risk work | Measure minutes per accepted output and error severity |
| Evaluation and monitoring | Every model or prompt change needs regression testing | Maintain a reusable, versioned evaluation set |
| Security and privacy | DLP, private networking, retention, audit, and residency add cost | Classify data and apply controls by risk tier |
| Self-hosting | GPUs cost money while idle and require platform staff | Compare on realistic utilization, resilience, and labor |
| Migration | Models are updated and retired | Contract for notice; keep prompts, data, and evaluations portable |

### Buy, build, or self-host?

**Buy a packaged application** when the workflow is common, integration with an existing system of record matters, and the capability is not a strategic differentiator. Evaluate actual adoption, permissions, logging, data terms, and measurable task completion—not a demo.

**Build on managed APIs** when proprietary workflow design, data, user experience, model routing, or tool integration creates differentiation. This is the default for most custom applications because it keeps fixed infrastructure low and enables rapid model comparison.

**Use hosted open-weight models** when model portability or economics matter but the organization does not want GPU operations. Verify the exact model license, hosting terms, region, retention, support, deprecation policy, and task quality.

**Self-host only with a quantified case.** It is appropriate when a validated open model meets the quality requirement and workloads are sufficiently high and steady, or where sovereignty, latency, or weight ownership is mandatory. Include redundant capacity, GPU utilization, serving software, security, patching, on-call operations, evaluation, and migration labor. There is no universal token-volume break-even.

### Cost-control sequence

1. Define quality and risk thresholds for the task.
2. Route routine cases to the smallest model that meets them.
3. Reserve premium reasoning models for exceptions.
4. Use RAG for current or private facts; use fine-tuning mainly to change repeatable behavior.
5. Cache stable prompt prefixes and batch noninteractive jobs where supported; AWS lists 50% lower batch inference prices for selected models ([AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)).
6. Cap output length, retries, agent steps, tool calls, and total spend.
7. Measure cost per accepted result by use case, model, and team.
8. Negotiate commitments only after production demand is stable.

A sound architecture uses a model gateway, provider-neutral business logic where practical, a versioned evaluation suite, and at least one fallback option. Avoid selecting a long-term platform solely on today’s benchmark score or per-token price.

---

## Page 4 — Risk, governance, and regulation

### The risk changes with the use case

| Risk | Business failure | Minimum control |
|---|---|---|
| Inaccuracy/confabulation | Fabricated facts, citations, policies, or calculations | Grounding, deterministic checks, abstention, qualified review |
| Confidentiality/privacy | Sensitive prompts, retrieved data, logs, or outputs leak | Approved tools, DLP, minimization, retention rules, tenant isolation |
| Prompt injection | A document or webpage manipulates the model | Treat retrieved content as untrusted; authorize tools outside the model |
| Excessive agency | Model sends, deletes, purchases, or changes records incorrectly | Read-only default, least privilege, transaction limits, approval |
| Improper output handling | Model output reaches SQL, shell, browser, or email unsafely | Schema validation, parameterization, escaping, sandboxing |
| Bias and discrimination | Unequal decisions or service quality | Representative data, subgroup tests, impact review, appeal |
| IP and confidentiality | Unlicensed output or disclosure of trade secrets | Data/license provenance, protected input channels, similarity review |
| Vendor/supply chain | Model change, outage, compromised component, lock-in | Version tracking, change notice, revalidation, fallback and exit plan |
| Runaway consumption | Recursive agents and denial-of-wallet | User/run budgets, rate limits, circuit breakers and alerts |

These categories align with the OWASP Top 10 for LLM Applications, which emphasizes that security is an application and authorization problem—not merely a prompt-filtering problem ([OWASP](https://genai.owasp.org/llm-top-10/)).

### A proportionate governance model

Adopt the NIST cycle of **Govern → Map → Measure → Manage** ([NIST AI 600-1, 2024](https://doi.org/10.6028/NIST.AI.600-1)):

- **Govern:** accountable owner, AI inventory, acceptable-use policy, risk tiers, incident process, vendor standards, and role-based training.
- **Map:** intended purpose, affected people, data flows, jurisdictions, foreseeable misuse, tools, permissions, and non-AI alternatives.
- **Measure:** task quality, factual errors, subgroup performance, leakage, prompt-injection success, unauthorized-action attempts, latency, cost, reviewer overrides, and complaints.
- **Manage:** launch thresholds, staged rollout, monitoring, human escalation, rollback, kill switch, incident reporting, and decommissioning.

Apply three practical tiers:

1. **Low risk:** internal brainstorming, drafting, summarization of non-sensitive material. Lightweight approval, approved enterprise tools, and user training.
2. **Moderate risk:** customer-facing drafts, internal decision support, proprietary knowledge retrieval, or code generation. Formal owner, evaluation set, access controls, output review, monitoring, and vendor due diligence.
3. **High risk:** employment, credit, healthcare, legal, safety, essential services, regulated decisions, or agents with consequential write access. Legal/privacy/security assessment, independent testing, meaningful human authority, full audit trail, appeal, staged deployment, and executive approval.

### EU and existing law

The EU AI Act entered into force on 1 August 2024; prohibited-practice and AI-literacy provisions began applying on 2 February 2025, and obligations for providers of general-purpose AI models began applying on 2 August 2025 ([European Commission](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)). Organizations operating in or serving the EU should confirm their role—provider, deployer, importer, distributor, or GPAI provider—and obtain current legal advice because implementation dates and supporting standards can change.

AI-specific legislation is only one layer. Privacy, employment, discrimination, consumer protection, sector regulation, professional duties, cybersecurity, confidentiality, contract, and IP law may already govern an LLM use case. The U.S. Copyright Office concluded that purely AI-generated material is not protected by U.S. copyright and that protectability depends on meaningful human-authored expression or creative contribution ([U.S. Copyright Office, 2025](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)).

### Non-negotiable rule for agents

**The model may propose an action; ordinary software must decide whether it is authorized.** Use user-scoped credentials, destination allowlists, parameter and transaction limits, separation of duties, approval for external or irreversible actions, and reversible execution where possible. Never store secrets in a system prompt or assume the prompt cannot be extracted.

---

## Page 5 — Recommended next steps

### A 90-day action plan

#### Days 0–30: establish control and select the portfolio

- Name an executive sponsor and a cross-functional AI steering group covering business, technology, data, security, privacy, legal, HR, finance, and change management.
- Inventory sanctioned and “shadow” AI, including AI embedded in SaaS products; record owner, users, data, model/provider, tools, jurisdiction, and business decision affected.
- Publish a simple acceptable-use matrix: approved services, allowed data classes, prohibited uses, and escalation channels.
- Select **3–5 workflows**, not 30 ideas. Score each on volume, pain, data readiness, measurability, integration complexity, risk, and strategic differentiation.
- Capture baseline metrics and define an accepted-output standard before the pilot begins.
- Immediately restrict unapproved use of secrets, privileged content, regulated personal data, sensitive source code, and consequential autonomous actions.

#### Days 31–60: build and test

- Start with a managed enterprise product or API and a model appropriate to the task; avoid premature self-hosting or fine-tuning.
- Create 100–500 representative test cases, including normal cases, difficult edge cases, adversarial inputs, subgroup cases, and known failures.
- Measure task success, unsupported claims, review time, cost, latency, adoption, and error severity against the baseline.
- For knowledge applications, test retrieval quality separately from final-answer quality; enforce source permissions before retrieval.
- Complete vendor diligence on data use, retention, location, subprocessors, security, incident notification, model changes, IP terms, indemnity, export, deletion, and exit.
- For any agent, document every tool, permission, destination, budget, approval, and failure mode. Start read-only.

#### Days 61–90: operate, decide, and scale selectively

- Run a controlled production pilot with real users, monitoring, feedback, and a rollback path.
- Train users on the changed workflow, not merely on prompting. Teach verification, confidential-data rules, limitations, and escalation.
- Compare realized economics using accepted outcomes and human-correction costs.
- Scale only use cases that meet predefined value, quality, adoption, and risk thresholds.
- Redesign borderline cases once; terminate weak pilots and document what was learned.
- Establish quarterly model revalidation and executive reporting for value, risk, incidents, concentration, and regulatory readiness.

### Pilot scorecard

| Dimension | Example metric | Suggested decision question |
|---|---|---|
| Business value | Cost per accepted case; cycle-time reduction | Did value exceed all-in operating cost? |
| Quality | Accepted without correction; severe error rate | Is quality no worse than the approved baseline? |
| Adoption | Weekly active eligible users; assisted-case share | Is the tool embedded in the real workflow? |
| Risk | Leakage, policy violations, unauthorized attempts | Is residual risk within the approved tier? |
| Operations | p95 latency, uptime, escalation and fallback | Can the process run reliably at target volume? |
| Economics | Model, tools, infrastructure, review and support | Does the case remain attractive under 2× usage or price? |
| Portability | Time and cost to switch model/provider | Is there a credible exit route? |

### Board-level questions

1. Which three workflows—not tools—are expected to create measurable value this year?
2. What baseline and accepted-outcome metric will prove that value?
3. Which data and systems can each LLM access, and under whose identity?
4. What decisions or actions are prohibited from being delegated to a model?
5. How is independent authorization enforced for agent actions?
6. How much do correction labor, integration, security, and change management add to token or license costs?
7. How are model changes tested before release?
8. Which laws, jurisdictions, and affected groups apply to each high-impact use case?
9. Can the organization detect, stop, investigate, and replay an AI incident?
10. What is the fallback if the provider changes price, behavior, terms, or availability?

## Final recommendation

Treat the next year as an **operating-model transformation**, not a model-buying contest. Give employees safe access to approved tools, but concentrate investment on a small portfolio of measurable workflows. Buy standard capabilities, build differentiating ones on managed services, keep models replaceable, and reserve autonomy for cases where permissions, limits, monitoring, and reversibility are proven. The winning KPI is not “AI adoption”; it is **reliable business outcomes per dollar, within risk appetite**.

---

# Sources

## Academic / peer-reviewed and working papers

- [Brynjolfsson, Li & Raymond, 2025 — *Generative AI at Work*](https://doi.org/10.1093/qje/qjae044) (*Quarterly Journal of Economics*, peer reviewed)
- [Dell’Acqua et al., 2026 — *The Cybernetic Teammate: A Field Experiment on Generative AI Reshaping Teamwork and Expertise*](https://doi.org/10.1287/orsc.2025.21838) (*Organization Science*, peer reviewed)
- [Dillon et al., 2025 — *Shifting Work Patterns with Generative AI*](https://doi.org/10.3386/w33795) (NBER Working Paper 33795; revised November 2025)

## Government, standards, and nonprofit guidance

- [NIST AI 600-1 — Generative AI Profile](https://doi.org/10.6028/NIST.AI.600-1) (July 2024)
- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) (2025 edition)
- [European Commission — AI Act regulatory framework and implementation timeline](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [Regulation (EU) 2024/1689 — Official legal text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)
- [U.S. Copyright Office — Copyrightability Report, Part 2](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf) (January 2025)
- [Stanford HAI — 2025 AI Index Report](https://hai.stanford.edu/ai-index/2025-ai-index-report) (April 2025)
- [Stanford HAI — 2025 AI Index, Economy chapter](https://hai.stanford.edu/ai-index/2025-ai-index-report/economy) (April 2025)

## Industry surveys and official commercial documentation

- [McKinsey — *The State of AI in 2025*](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai) (November 2025; executive survey)
- [McKinsey — *How Organizations Are Rewiring to Capture Value*](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai-how-organizations-are-rewiring-to-capture-value) (March 2025; executive survey)
- [OpenAI — API Pricing](https://developers.openai.com/api/docs/pricing) (live pricing page)
- [Anthropic — Claude Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing) (live pricing page)
- [Google — Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) (live pricing page)
- [AWS — Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/) (live pricing page)

## Evidence cautions

Adoption and ROI surveys are self-reported and may mix generative AI with other AI, overrepresent organizations already using AI, and measure the best initiative rather than the full portfolio. Field experiments provide stronger causal evidence but cover particular tools, workers, tasks, and time periods. API prices, model names, regulatory implementation dates, and commercial terms are volatile; they should be reconfirmed during procurement and legal review.
