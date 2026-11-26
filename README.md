# ContractIQ

Real-estate contract intelligence and legal dispute support for home buyers in India.

A buyer uploads the builder-buyer agreement and receipts. ContractIQ answers questions about the contract
with the clause and page, lists each party's rights and obligations, extracts and verifies the key facts,
calculates what the buyer is owed, finds real precedents in public RERA orders, simulates a hearing with
advocate, defence and judge agents, and drafts the complaint and report.

**Main rule:** nothing is shown unless it can be traced to a source. Every answer, clause, fact and
citation is checked by code against the stored document or order, and all money is calculated by
ordinary Python code, never by the language model.

ContractIQ started as *eContractIQ* (mid-viva: contract Q&A and benefits/obligations analysis).
How it grew: `docs/project-evolution.md`.

## Features

| Feature | Code (`backend/app/...`) |
|---|---|
| Upload PDFs and photos; PDF text layer, or Tesseract OCR for scans | `buyer/documents.py`, `ingestion/pdf_text.py` |
| **Ask your contract** (RAG): answers with verified quotes, or "not enough in the documents" | `rag/answer.py`, `retrieval/case_search.py` |
| **Clause analysis**: rights, obligations, penalties and one-sided terms of each party | `rag/clauses.py` |
| **Fact extraction** with page and quote; unconfirmed facts are never used later | `buyer/facts.py`, `extraction/` |
| **Interest calculator**: delay interest and refund under RERA s.18, payment by payment | `calculator/interest.py` |
| **Precedent search** over 2,209 HRERA Gurugram orders (~73,000 passages), keyword + vector | `retrieval/search.py` |
| **Citation verifier**: every cited order, page and quote must exist in the database | `verifier/citations.py` |
| **Hearing simulation**: buyer's advocate, builder's advocate, citation gate, judge | `hearing/` |
| **Agent analysis**: the model picks tools and specialist agents step by step, every step saved | `agent/` |
| **Report and complaint draft**: outcome estimate, weak points, draft from verified facts | `insights/` |
| **Live case progress** (optional, Convex): hearing stages and agent steps appear as they happen | `live.py`, `frontend/convex/` |
| **Accounts**: email + password, Google sign-in, email confirmation, per-user cases, rate limits | `auth/` |

## How one case flows through the system

```text
Upload ─► OCR / text layer ─► pages stored ─► chunks + embeddings (pgvector)
                                   │
                                   ├─► Facts:  Gemini proposes ─► code checks quote + value ─► buyer confirms
                                   ├─► Ask:    search this case ─► Gemini answers ─► code checks every quote
                                   └─► Clauses: same as Ask, for each party
Verified facts ─► Calculator (pure Python) ─► money owed
Verified facts ─► Precedent search (orders) ─► Hearing: advocate ─► defence ─► citation gate ─► judge
Agent: plans which of the above tools to run, within fixed limits
Everything verified ─► Report + complaint draft
```

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, Alembic, PostgreSQL 17 + pgvector, LangGraph
- **AI:** Google Gemini; `bge-small-en-v1.5` embeddings run locally (fastembed); scikit-learn classifiers
- **OCR:** Tesseract (English + Hindi), pypdfium2
- **Frontend:** Next.js 15, React 19, TypeScript; optional Convex for live progress

## Folder layout

```text
backend/            FastAPI API
  app/              the application (map below)
  migrations/       database schema (Alembic)
  tests/            pytest tests
  scripts/          command-line tools (table below)
  eval/             question set for the document Q&A evaluation
frontend/           Next.js website
  app/              pages (one folder per URL)
  components/       shared UI pieces
  lib/              API clients used by the pages
docs/               all documentation (table below)
infra/              local database, Docker stack, deploy / backup / restore scripts
demo/               fictional sample documents to try the app
benchmark/          frozen train / validation / test split of the orders
data/               trained classifiers (tracked); uploads and model cache (not tracked)
scripts/            start the API and website locally (PowerShell)
render.yaml         Render deployment blueprint
```

### Backend packages (`backend/app/`)

| Package | What it does |
|---|---|
| `main.py`, `config.py`, `middleware.py` | App start-up, settings (env vars start with `CONTRACTIQ_`), security headers and CSRF check |
| `api/` | HTTP endpoints: `auth`, `cases`, `rag` (ask + clauses), `calculations`, `insights` (search, estimate, draft), `hearing`, `agent` |
| `auth/` | Passwords, sessions, Google sign-in, email links, rate limits, private demo mode |
| `db/` | Database tables (`models.py`) and sessions |
| `buyer/` | The buyer's case: uploaded documents, facts, follow-up questions, page images |
| `rag/` | Question answering and clause analysis over the buyer's own documents |
| `retrieval/` | Search: embeddings, search over a case's documents, search over public orders |
| `extraction/` | Gemini client, quote locating, reading dates and amounts, choosing pages |
| `calculator/` | Interest and refund calculation (no AI allowed here) |
| `ingestion/` | Download public HRERA orders, read their text, split into chunks |
| `verifier/` | Checks every citation against the stored orders |
| `hearing/` | Simulated hearing: agents, prompts, LangGraph graph, background runs |
| `agent/` | Agent orchestration: tools, LangGraph loop, answer verification |
| `insights/` | Outcome estimate and complaint draft |
| `ml/` | Trained claim-type and outcome classifiers |
| `backtest/`, `benchmark/` | Evaluation: time-split backtest and frozen benchmark |

### Backend scripts (`backend/scripts/`, run as `python -m scripts.<name>`)

| Script | Use |
|---|---|
| `demo_buyer_case` | Create a fictional demo case with documents and facts |
| `ingest_hrera`, `embed_chunks`, `ingest_report` | Download orders, embed passages, report progress |
| `extract_fields`, `export_review` | Extract outcome records from orders, export them for review |
| `train_classifier`, `backtest`, `benchmark`, `eval_rag` | Train and evaluate the models and the Q&A |
| `run_hearing`, `e2e_check` | Run a hearing from the command line; end-to-end check of the whole journey |
| `admin_users`, `check_db`, `export_example`, `data_gate_haryana` | Admin and maintenance tools |

### Documentation (`docs/`)

| File | Content |
|---|---|
| `run-local.md` | Full local setup |
| `demo-guide.md` | Step-by-step demonstration script |
| `architecture.md` | Design and data flow |
| `api.md` | API endpoints |
| `calculator.md` | Interest formulas, legal sources, worked examples |
| `model-training.md`, `model-evaluation.md` | Prediction models and their results |
| `security.md` | Security controls and known gaps |
| `deployment.md` | Vercel + Render, Docker, or one server |
| `live-progress.md` | Optional live case progress through Convex: setup and privacy |
| `test-report.md` | What was tested and how |
| `project-evolution.md` | Problem statement; mid-viva vs final comparison |
| `components/` | Notes per component (search, hearing, citations, extraction, ...) |
| `archive/` | Older status reports and the mid-viva eContractIQ code |

## How to run (Windows, PowerShell)

Needs Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 20+, Docker Desktop and Tesseract OCR.

```powershell
docker compose -f infra/docker-compose.yml up -d     # database
cd backend; uv sync; copy .env.example .env           # add GEMINI_API_KEY to .env
cd ..; .\scripts\dev-api.ps1 -AllowDemo                # API on http://localhost:8000/docs
.\scripts\dev-web.ps1                                  # website on http://localhost:3100 (new terminal)
```

Full details, including loading the order database: `docs/run-local.md`.

**Privacy rule:** the free Gemini tier may keep data, so case text is sent to the model only for cases
marked as *demo* (fictional documents). For real cases the AI steps are refused until a no-retention
model is configured. Search, OCR and the calculator run on the server for every case.

## Tests

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest
```

## Measured results

| Component | Result | Note |
|---|---|---|
| Citation checker | Precision 100%, recall 98.3% | held-out orders |
| Document Q&A (40 questions, fictional documents) | 30/30 correct with correct citation; 10/10 unanswerable refused | small, easy set |
| Outcome prediction (claim × delay rule) | 72.9% | exploratory |
| Claim type (relief-section rule + model) | 74.3%, macro-F1 0.455 | exploratory |

Outcome labels were extracted by a model and not checked by people; read `docs/model-evaluation.md` before
quoting a prediction figure.

## Limits

Decision support, not legal advice. Predictions are not reliable enough to act on. Orders cover one
authority (HRERA Gurugram).
