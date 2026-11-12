**Yes—there are several worth studying before extending a runner.** For your TypeScript/Vitest work and the richer specification ideas behind Architect/SDP, I would prioritize **Playwright-BDD, Gwen, Karate, Reqnroll, and pytest-bdd-ng/StructBDD**. There are also useful smaller JavaScript projects and a particularly relevant research extension for specifications with formal semantics.

The main distinction is **what each project extends**:

- **The language:** new syntax or structural constructs.
- **Specification semantics:** what annotations, step categories, parameters, and composition mean.
- **Execution:** how scenarios become tests, acquire resources, run, and produce results.
- **Evidence and tooling:** reporting, traceability, editor support, and agent-facing information.

That distinction matters because Gherkin already provides an independently usable parser/compiler. You can retain its syntax while substantially changing the specification model or execution engine. [GitHub](https://github.com/cucumber/gherkin?utm_source=chatgpt.com)

*I checked current primary documentation and repositories on 12 November 2026. The recommendations below distinguish established implementations from smaller architectural references and research prototypes.*

## 1. Check current Cucumber-JS extension points first

This was one of the most useful findings: **Cucumber-JS now has a documented plugin API, introduced in v12.5.0.**

Plugins can observe the Cucumber message stream, perform asynchronous initialization and cleanup, and register transformations for:

- `pickles:filter` — selecting which compiled scenarios execute.
- `pickles:order` — ordering the selected scenarios.

The documented passive events include `message`, `paths:resolve`, and `publish:url`. Filtering, sharding, and publishing themselves use this plugin infrastructure. [GitHub](https://github.com/cucumber/cucumber-js/blob/main/docs/plugins.md?utm_source=chatgpt.com)

Separately, the public JavaScript API provides `loadConfiguration`, `loadSources`, `loadSupport`, and `runCucumber`. In particular, `loadSources` can calculate a test plan, while `loadSupport` allows support code to be reused across runs in one process. [GitHub](https://github.com/cucumber/cucumber-js/blob/main/docs/javascript_api.md?utm_source=chatgpt.com)

**Why this matters for you:** a specification graph could determine the relevant scenarios, a plugin could select them, and a message consumer could record execution evidence. That is my architectural inference from these APIs.

The boundary is important: filtering and ordering are not a dependency-aware scheduler, and the documented plugin API is not a general AST-rewriting or execution-engine replacement interface.

**Read:** [Cucumber-JS plugins](https://github.com/cucumber/cucumber-js/blob/main/docs/plugins.md) · [Programmatic API](https://github.com/cucumber/cucumber-js/blob/main/docs/javascript_api.md)

## 2. Playwright-BDD — the strongest TypeScript reference for changing the execution backend

[Playwright-BDD](https://github.com/vitalets/playwright-bdd) is particularly relevant because of its architecture: it **transforms Gherkin feature files into native Playwright tests**, wiring those tests to step implementations. Playwright then supplies fixtures, parallel execution, sharding, traces, screenshots, and other runner capabilities. [GitHub](https://github.com/vitalets/playwright-bdd?utm_source=chatgpt.com)

This is a useful precedent for treating Gherkin as a specification front end and compiling it into an existing execution system.

Its extensions include scoped step definitions, reusable step functions, decorators, and operational tags. These provide examples of stronger binding and execution semantics without adding new top-level Gherkin constructs. [GitHub](https://github.com/vitalets/playwright-bdd?utm_source=chatgpt.com)

Two details deserve inspection:

- **Step scoping:** useful when different bounded contexts need similar vocabulary without one global step registry becoming ambiguous.
- **Keyword-sensitive matching:** its optional `matchKeywords` behavior makes the Gherkin keyword participate in matching. This is a semantic choice worth making explicitly in a custom runner.

The changelog documents both capabilities and shows v9.2.1 dated 6 September 2026. Some newer capabilities remain under “Unreleased,” so distinguish the released package from development documentation when evaluating it. [GitHub](https://github.com/vitalets/playwright-bdd/blob/main/CHANGELOG.md?utm_source=chatgpt.com)

**What I would borrow:** the compiler boundary, scoped bindings, and the division of responsibility between specification processing and test execution.

**Tradeoff:** you gain the host runner’s infrastructure, but your semantics must map coherently onto its test, fixture, retry, and concurrency model. An extra generation phase also becomes part of the development workflow.

**Priority for you: very high.**

## 3. Gwen — especially interesting for composable specifications and semantic rules

[Gwen](https://gweninterpreter.org/docs) is probably the most interesting lesser-known project in this search for your purposes.

It separates:

- `.feature` files describing domain behavior.
- `.meta` files describing how that behavior executes.

A scenario annotated with `@StepDef` becomes a callable step definition. Its name binds to a feature step, and its body composes lower-level operations. Step definitions can have parameters and can call other step definitions. [Gwen](https://gweninterpreter.org/docs/meta?utm_source=chatgpt.com)

Gwen also gives annotations substantial meaning:

| Annotation | Meaning |
|---|---|
| `@StepDef` | Makes a scenario callable as a step definition |
| `@Import` | Loads particular meta specifications |
| `@Context` | Restricts a definition to context/Given usage |
| `@Action` | Restricts a definition to action/When usage |
| `@Assertion` | Restricts a definition to assertion/Then usage |
| `@ForEach` | Iterates over data-table records |
| `@Examples` | Imports CSV example data |
| `@Synchronized` | Controls concurrent access to a step definition |

These are documented execution semantics, rather than merely labels for filtering. [Gwen](https://gweninterpreter.org/docs/annotations?utm_source=chatgpt.com)

The behavior categories are enforced in strict mode, which has been the default since Gwen 3. For example, a definition categorized as an assertion cannot simply be invoked as an action. [Gwen](https://gweninterpreter.org/docs?utm_source=chatgpt.com)

**Why this is valuable for your project:** it demonstrates a small semantic system over familiar Gherkin. An analogous design could distinguish preconditions, commands, observations, invariants, and evidence-producing operations, with validation before execution.

That would be your extension; Gwen does not supply your lifecycle or pattern graph.

The implementation is JVM-based and its supplied automation stack is strongly browser-oriented. I would study its composition and validation design. It has recent maintenance evidence: the core changelog lists 4.18.0 on 30 October 2026. [GitHub](https://github.com/gwen-interpreter/gwen/blob/master/CHANGELOG?utm_source=chatgpt.com)

**Read:** [Meta specifications](https://gweninterpreter.org/docs/meta) · [Annotations](https://gweninterpreter.org/docs/annotations) · [Behavior rules](https://gweninterpreter.org/docs#behavioural-rules-and-semantics)

**Priority for you: very high, especially if the missing capability is semantic structure or reusable specifications.**

## 4. Karate — the major example of a richer Gherkin-based execution language

[Karate](https://github.com/karatelabs/karate) is an independent Gherkin-based DSL and runtime with built-in operations, expressions, data handling, assertions, and feature composition.

It is especially worth examining if your intended extensions involve **variables, reusable flows, dynamically supplied examples, or richer execution control**.

For example, Karate supports calling another feature with `call read(...)` and receiving its defined variables as a result object. It also distinguishes feature-scoped cached execution through `callonce` from suite-wide setup through `karate.callSingle()`. Those choices make scope and reuse explicit. [Karate](https://docs.karatelabs.io/reusability/calling-features/?utm_source=chatgpt.com)

Its dynamic scenario mechanism is another substantial extension. A single-cell `Examples` table can reference a provider resolved at execution time. Providers can draw from JSON, CSV, generated data, or external systems. [Karate](https://docs.karatelabs.io/reusability/dynamic-scenarios/?utm_source=chatgpt.com)

For someone implementing a runner, the [current v2 source design document](https://github.com/karatelabs/karate/blob/main/docs/DESIGN.md) is particularly useful. It discusses parser/model separation, scenario execution, step execution, events, nested execution identity, and cancellation. Treat this as current source architecture; individual internals may evolve beyond a released version. [GitHub](https://github.com/karatelabs/karate/blob/main/docs/DESIGN.md?utm_source=chatgpt.com)

**What I would borrow:**

- Explicit composition and scope rules.
- A defined interface for example-data providers.
- Structured identities for nested execution.
- Separation between the execution engine and reporting/event consumers.

**Tradeoff:** as the feature language becomes more powerful, it accumulates its own expression, state, scope, and control-flow rules. Karate is useful precisely because it shows how much language design is involved once a runner becomes a richer interpreter.

**Priority for you: high as an execution-language reference.**

## 5. Reqnroll — a genuine fork, with a well-separated extension architecture

[Reqnroll](https://github.com/reqnroll/Reqnroll) is a real fork of **SpecFlow**, created to continue the .NET project. It retains Gherkin rather than defining a replacement grammar. [Reqnroll](https://reqnroll.net/news/2024/02/from-specflow-to-reqnroll-why-and-how/?utm_source=chatgpt.com)

Its most useful design feature for you is the separation between:

- **Generator plugins**, invoked during the build.
- **Runtime plugins**, which customize dependencies and behavior at global, test-thread, feature, and scenario scopes. [Reqnroll Documentation](https://docs.reqnroll.net/latest/extend/plugins.html?utm_source=chatgpt.com)

That separation is worth borrowing even in a TypeScript implementation. Specification validation and test generation have different responsibilities from resource allocation, lifecycle hooks, and execution.

Its **External Data plugin** is also a concrete semantic extension. Tags such as `@DataSource`, `@DataSet`, and `@DataField` connect scenarios to CSV, Excel, or JSON data. A tagged ordinary scenario can be treated as a scenario outline, and external rows can supplement inline examples. [Reqnroll Documentation](https://docs.reqnroll.net/latest/integrations/externaldata.html?utm_source=chatgpt.com)

This demonstrates an important compatibility distinction: another runner may parse the same tags successfully while knowing nothing about their execution meaning.

**What I would borrow:** separate build-time and runtime extension contracts, explicit metadata interpretation, and well-defined scoping.

**Read:** [Plugin architecture](https://docs.reqnroll.net/latest/extend/plugins.html) · [External Data](https://docs.reqnroll.net/latest/integrations/externaldata.html)

**Priority for you: high as an architectural reference; its implementation is .NET-specific.**

## 6. pytest-bdd-ng and StructBDD — a real fork that explores richer specification structure

[pytest-bdd-ng](https://github.com/elchupanebrej/pytest-bdd-ng) is a fork of pytest-bdd. Its documented architecture uses the official Gherkin parser, Cucumber Expressions, Cucumber Messages, and Pickles as an internal execution representation. That last choice allows additional specification formats to feed the execution machinery. [PyPI](https://pypi.org/project/pytest-bdd-ng/?utm_source=chatgpt.com)

The especially interesting component is **StructBDD**.

It addresses cases such as alternative scenario paths, more elaborate background composition, parameter-table joins, and examples at different structural levels. It provides a structured DSL with formats including YAML, TOML, JSON5, HJSON, and HOCON. [Pytest-BDD-NG 2.3.1 documentation](https://pytest-bdd-ng.readthedocs.io/en/default/include.html?utm_source=chatgpt.com)

For your TypeScript specification direction, the valuable idea is:

> A richer specification model can have several authoring formats while sharing one execution representation.

That suggests a possible arrangement where typed TypeScript specifications and Gherkin scenarios both feed a common model, with each front end exposing an intentional subset of capabilities.

**Maturity qualification:** PyPI still lists 2.3.1 from 26 November 2024 as the latest published release, while the development documentation contains newer work. I would treat it primarily as an implementation and design reference until its current release path is assessed. [PyPI](https://pypi.org/project/pytest-bdd-ng/?utm_source=chatgpt.com)

Also, its older comparison table should not be treated as a current feature comparison against upstream pytest-bdd. Upstream has since adopted the official Gherkin parser and added capabilities previously highlighted as differentiators. [pytest-bdd 9.0.1 documentation](https://pytest-bdd.readthedocs.io/en/latest/index.html?highlight=target+fixture\&utm_source=chatgpt.com)

**Read:** [StructBDD documentation](https://pytest-bdd-ng.readthedocs.io/en/default/include.html#structbdd)

**Priority for you: high if the extension concerns the specification model itself.**

## 7. Two further projects worth inspecting for specific ideas

### QAF BDD2 — metadata with explicit values and inheritance

[QAF BDD2](https://qaf-tm.github.io/qaf/latest/bdd2.html) explicitly describes its syntax as derived from QAF BDD, JBehave, and Gherkin.

Its distinguishing feature is metadata such as `@key:value`, where values can be strings, numbers, booleans, or lists. Feature metadata is inherited by scenarios, and metadata can influence selection, priorities, and data providers. It also supports external data sources. [QMetry Automation Framework Documentation](https://qaf-tm.github.io/qaf/latest/bdd2.html?utm_source=chatgpt.com)

This is relevant to your annotated-specification work because it provides a precedent for defining:

- Which metadata belongs on which elements.
- How inheritance works.
- Which metadata is descriptive.
- Which metadata affects execution.

**Caveat:** do not assume full syntactic interchangeability with standard Gherkin; its documented metadata includes constructs such as spaced values. I could verify the design, but not a sufficiently clear recent release cadence to make it a first-choice adoption recommendation.

### Yadda — flexible JavaScript vocabulary and context-dependent step libraries

[Yadda](https://github.com/acuminous/yadda) is a JavaScript BDD library with a Gherkin-like parser. Its language permits steps without the usual Given/When/Then prefixes, supports key/value annotations, and offers Markdown specifications. [GitHub](https://github.com/acuminous/yadda/blob/master/docs/feature-files.md?utm_source=chatgpt.com)

Its most interesting feature for your purposes is **dynamic library selection**: scenarios can use selected step libraries, and the interpreter resolves matches across them. It also has reusable dictionaries and parameter conversion. [GitHub](https://github.com/acuminous/yadda/blob/master/docs/step-libraries.md?utm_source=chatgpt.com)

I would inspect it if you need bounded-context vocabularies, pluggable interpreters, or a less restrictive authoring language.

One design choice deserves scrutiny: Yadda can score competing matches using contextual information. For an auditable specification system, I would favor explicit scoping and reproducible binding decisions wherever ambiguous interpretation would affect correctness.

## 8. For your Vitest work, compare the runtime boundaries carefully

There are multiple similarly named packages with substantially different architectures. Given your earlier use of Vitest and Gherkin, this comparison may be more immediately useful than adopting a new dialect.

| Project | Architecture | Why it matters when extending it |
|---|---|---|
| [`@amiceli/vitest-cucumber`](https://github.com/amiceli/vitest-cucumber) | Its documented mapping is **Scenario → Vitest `describe`**, and **step → Vitest `test`**. | Step-level tests affect how you design scenario status, retries, failure propagation, and evidence aggregation. [GitHub](https://github.com/amiceli/vitest-cucumber?utm_source=chatgpt.com) |
| [QuickPickle](https://github.com/dnotes/quickpickle) | Uses the official Gherkin parser and integrates execution with Vitest; it began as a fork of `vitest-cucumber-plugin` and was substantially rewritten. | A useful example of retaining the parser while owning more runtime semantics. Its README documents gaps including full Cucumber tag-expression filtering and native dry-run behavior. [GitHub](https://github.com/dnotes/quickpickle?utm_source=chatgpt.com) |
| [`@lotun/vitest-cucumber`](https://github.com/lotun-io/vitest-cucumber) | Loads support code through Vitest but delegates scenario execution to the official `@cucumber/cucumber` runtime. | Demonstrates adapting an existing runtime instead of reconstructing it. Vitest owns parallelism; Cucumber’s `parallel` configuration is rejected. Treat this small project as an architectural reference. [lotun-io/vitest-cucumber · GitHub](https://github.com/lotun-io/vitest-cucumber?utm_source=chatgpt.com) |
| [jest-cucumber](https://github.com/bencompton/jest-cucumber) | Defines scenario-local implementations and validates that tests and feature files agree. | Useful for explicit binding and detecting specification/implementation divergence. Its default model avoids global step matching. [GitHub](https://github.com/bencompton/jest-cucumber?utm_source=chatgpt.com) |

There is another detail in `@amiceli/vitest-cucumber` that intersects with your drift concerns: its optional plugin automatically creates and updates `.spec.ts` files when feature files change. It uses ts-morph and can remove implementation code when corresponding specification elements disappear; deletion is the default, with commenting available as an alternative. [vitest-cucumber](https://vitest-cucumber.miceli.click/integrations/setup?utm_source=chatgpt.com)

For your system, I would explicitly decide whether a specification change should:

1. Generate an implementation change.
2. Produce a reviewable proposed change.
3. Preserve the mismatch as a divergence requiring resolution.

Those are different product and correctness policies. Automatic synchronization alone does not establish that the changed behavior remains valid.

## 9. Extensions particularly relevant to evidence and stronger contracts

### Serenity/JS — typed domain activities and structured execution evidence

[Serenity/JS](https://serenity-js.org/getting-started/cucumber/) preserves Cucumber’s Gherkin, steps, and hooks while adding the Screenplay model and structured reporting. Its abstractions include actors, abilities, tasks, interactions, and questions. [Serenity/JS](https://serenity-js.org/getting-started/cucumber/?utm_source=chatgpt.com)

Its runner adapters convert runner-specific events into Serenity/JS domain events consumed by reporting services. Reporting can be adopted independently of a wholesale move to Screenplay. [Serenity/JS](https://serenity-js.org/handbook/test-runners/cucumber/?utm_source=chatgpt.com)

For your project, the interesting separation is between **the readable scenario, reusable typed domain operations, the runner, and recorded evidence**. This is a good reference if your intended extension is primarily about meaningful execution traces and domain structure.

Its “actors” represent participants in the tested workflow; they are not an AI-agent orchestration mechanism.

### PICKLES — a research extension unusually close to your specification goals

The 2026 paper [*PICKLES: a Natural Language Framework for Requirement Specification and Model-Based Testing*](https://arxiv.org/abs/2604.26572) introduces a Gherkin-style language with typed variables, admissible ranges, guards, and defined interaction/observation semantics.

Specifications translate into **Symbolic Transition Systems**; scenario models can be composed, and model-derived tests can be translated back into readable scenarios. [arxiv.org](https://arxiv.org/html/2604.26572v1?utm_source=chatgpt.com)

This is directly relevant if your objective is to give behavioral specifications a precise semantic model.

However, the implementation is a Python/Lark proof of concept. The paper explicitly notes that its prototype composition includes transitions regardless of path satisfiability. It should be read as research into specification semantics and model-based testing, not evidence of a mature runner or proof of implementation correctness. [arxiv.org](https://arxiv.org/html/2604.26572v1?utm_source=chatgpt.com)

A [downloadable research artifact](https://zenodo.org/records/19710432) includes source and case-study material. I could confirm source availability, but not the software’s reuse license. Also, **this PICKLES project is distinct from Cucumber’s Pickles intermediate representation**. [Zenodo](https://zenodo.org/records/19710432?utm_source=chatgpt.com)

### pytest-bdd-property — property testing behind standard Gherkin

[pytest-bdd-property](https://github.com/zerotechdebt/pytest-bdd-property) is a small extension that gives an `@property-based` scenario generated-input semantics through Hypothesis.

It uses two phases: the scenario first registers strategies, assumptions, actions, and assertions; a later phase executes generated cases and shrinks failures. That is an interesting example of changing execution semantics while retaining standard Gherkin structure. [PyPI](https://pypi.org/project/pytest-bdd-property/?utm_source=chatgpt.com)

The package is classified as alpha, with a release on 9 November 2026. I would use it as a design reference for an “example versus property” execution mode. Generated testing can find counterexamples; passing it is not a universal correctness proof. [PyPI](https://pypi.org/project/pytest-bdd-property/?utm_source=chatgpt.com)

## 10. If authoring flexibility is the issue, also inspect Markdown approaches

Two approaches are worth a quick comparison:

**Upstream Markdown with Gherkin.** The official parser includes an alternative Markdown format using `.feature.md`. One consequential detail for your metadata extraction work: its documentation says the resulting AST’s description properties are empty. Check what survives parsing before treating this as a richer drop-in specification format. Runner and editor support also need separate verification. [GitHub](https://github.com/cucumber/gherkin/blob/main/MARKDOWN_WITH_GHERKIN.md?utm_source=chatgpt.com)

**Gauge.** [Gauge](https://docs.gauge.org/writing-specifications.html) uses its own Markdown-like specification language, rather than Gherkin. Its reusable, parameterized **concepts** can contain groups of steps and can be nested. It is worth inspecting if the missing feature is specification composition or literate authoring. [docs.gauge.org](https://docs.gauge.org/writing-specifications.html?utm_source=chatgpt.com)

I would keep Gauge in the “alternative language design” category when comparing it with the other projects.

## What I would take from this for your implementation

For the metadata, lifecycle, traceability, and typed-contract direction you have described previously, **my preferred starting point is a semantic layer over Gherkin, with execution behind an explicit adapter**.

This is my synthesis from the projects above, rather than a capability supplied by one package.

### Preserve separate specification and execution models

The official Gherkin pipeline already distinguishes the document AST from compiled **Pickles**, which represent executable cases. Scenario outlines expand into individual cases; backgrounds and inherited tags are incorporated into the execution view. [GitHub](https://github.com/cucumber/gherkin?utm_source=chatgpt.com)

For your purposes, I would retain both views:

| Layer | Responsibility |
|---|---|
| **Source document** | Authored syntax, descriptions, locations, and annotations |
| **Specification model** | Stable identities, contracts, lifecycle state, dependencies, and traceability |
| **Execution plan** | Concrete cases, bindings, required resources, and execution policy |
| **Execution evidence** | Observed results, attempts, environment, artifacts, and provenance |

This prevents test-execution details from becoming the entire specification model. A requirement can exist before it is executable; a passing execution is an observation about a particular implementation and environment.

If typed TypeScript remains your canonical specification format, Gherkin can be an additional front end or projection with explicitly defined coverage. StructBDD is a useful precedent for that separation.

### Decide compatibility at more than the parser level

I would define compatibility in four dimensions:

- **Syntax:** can standard tooling parse the document?
- **Binding:** do the same steps and parameters resolve?
- **Execution:** do ordering, state, composition, retries, and failures mean the same thing?
- **Evidence:** do reported outcomes preserve the meaning consumers expect?

Reqnroll’s external-data annotations illustrate why the first does not imply the others.

For execution-affecting extensions, I would make required capabilities explicit and fail validation when they are unavailable. Silently accepting an annotation whose contract is never enforced would undermine the specification.

### Reuse the reporting protocol where it fits

[Cucumber Messages](https://github.com/cucumber/messages) provides schema-defined messages serialized as an NDJSON stream. It includes source, AST, binding, and execution information, and existing reporting tools consume it. [GitHub](https://github.com/cucumber/messages?utm_source=chatgpt.com)

I would emit compatible Messages for ordinary test evidence and link your additional contract, lifecycle, and graph evidence through a separate typed representation. That gives you a deliberate interoperability boundary without requiring standard consumers to understand arbitrary new message fields.

### Extend the grammar when a structural requirement justifies it

A new grammar becomes more compelling when you need constructs such as nested alternatives, explicit state transitions, typed declarations, or temporal relationships to be first-class parts of the document.

Metadata, scoped bindings, richer parameter conversion, evidence collection, and many execution policies can be implemented at other layers. The projects above provide concrete precedents for each.

**My inspection order for your project would be:**

1. **Cucumber-JS plugins and public API** — establish how much extension the current runtime already permits.
2. **Playwright-BDD and the contrasting Vitest integrations** — choose the boundary between specification processing and execution.
3. **Gwen** — study composition, semantic step categories, and validation.
4. **Reqnroll and QAF BDD2** — study extension contracts and metadata semantics.
5. **Karate** — study richer execution, scope, and dynamic data.
6. **StructBDD and PICKLES** — study richer specification models where ordinary scenarios are insufficient.

**Gwen is the most interesting semantic-extension precedent I found; Playwright-BDD is the most directly useful TypeScript runner reference; PICKLES is the most relevant research lead for your stronger-contract ambitions.**