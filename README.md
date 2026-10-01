# AXIOSBRAND

**Open-source Commerce Operating System for Brands.**

AXIOSBRAND is an open-source commerce operating system for brands.
Run storefront, content, catalog, customers, orders, markets, operations and AI from one self-hosted platform.

![AXIOSBRAND](./shop.png)

Built for independent brands, fashion labels, design studios, art projects, and teams that want full control over their commerce stack without being locked into a hosted platform.

> One system for commerce, content, operations, and AI.

---

## Why AXIOSBRAND

Commerce infrastructure is usually fragmented across multiple tools:

```text
Storefront
   ↓
CMS
   ↓
CRM
   ↓
Payments
   ↓
Analytics
   ↓
Operations
   ↓
AI tools
```

AXIOSBRAND brings these layers into one self-hosted platform:

```text
                      AXIOSBRAND
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Commerce           Content          Operations
        │                  │                  │
     Products           Pages            Warehouses
     Orders             Blog             Markets
     Customers          Lookbook         Localization
     Payments           Media            Accounting
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                        AI Layer
```

The goal is not to be another store template.

AXIOSBRAND is designed as the **operating system behind the brand**.

---

## Core Capabilities

### Commerce

- Products
- Categories
- Brands
- Pricing
- Orders
- Returns
- Payment requests
- Payment gateways
- Promo codes
- Marketing flows
- Customer management
- Partner programs

### Content

- Homepage management
- Pages
- Blog
- Lookbooks
- Header and navigation
- Footer
- Shop page design
- Product page design
- Media and object storage

### Global Commerce

- Countries
- Languages
- Localization
- Currency rates
- Multi-market configuration
- Delivery tracking

### Operations

- Warehouses
- Sales points
- Accounting entities
- Reports
- Dashboard metrics
- Backups
- Activity logs
- Admin users
- API keys
- System settings

### Customer Operations

- Customer records
- Support tickets
- Partner data
- Admin profiles

### AI

AXIOSBRAND includes an AI and RAG layer designed to evolve from a standalone assistant into a natural-language control interface for commerce operations.

Current AI infrastructure includes:

- OpenAI SDK integration
- Dedicated PostgreSQL + pgvector database
- RAG services
- Prompt management
- Assistant analytics
- Logs and diagnostics
- Assistant testing tools
- AI health endpoints

The long-term direction is simple:

```text
Human
  ↓
AI
  ↓
Commerce data + operations
  ↓
Actions
```

Examples of the intended interaction model:

```text
"Show me products with high traffic but low conversion."

"Prepare this collection for the French market."

"Translate the new product launch content."

"Summarize today's orders, returns, and support issues."
```

---

## Technology Stack

### Frontend

- SvelteKit
- Svelte 5
- Vite
- Tailwind CSS

### Backend

- Node.js
- Express
- TypeScript
- Prisma

### Data

- PostgreSQL
- PostgreSQL + pgvector for RAG

### Storage

- MinIO
- Any S3-compatible object storage

### Infrastructure

- Docker Compose
- Makefile
- Self-hosted deployment

### AI

- OpenAI SDK
- RAG services
- pgvector

---

## Repository Layout

```text
.
├── backend/
├── frontend/
├── scripts/
├── docker-compose.yml
├── docker-compose.dev.yml
├── Makefile
├── README.md
└── LICENSE
```

Main areas:

- `frontend/` — storefront and admin interface
- `backend/` — API, business logic, Prisma schemas, services, seeds, and scripts
- `backend/prisma/` — main application database
- `backend/prisma-rag/` — separate RAG database
- `frontend/src/routes/(admin)/admin/` — administration interface
- `backend/src/services/gpt-*` — GPT-related services
- `backend/src/services/rag.service.ts` — RAG service
- `scripts/` — development and deployment utilities
- `docker-compose.dev.yml` — complete local development stack
- `docker-compose.yml` — production application stack
- `Makefile` — common development and operations commands

---

## Quick Start

### Requirements

- Docker
- Docker Compose
- Node.js 20+ and npm for non-Docker development
- Make

### Run the full local stack

```bash
cp .env.dev.example .env.dev
docker compose --env-file .env.dev -f docker-compose.dev.yml up --build
```

After startup:

| Service | URL |
|---|---|
| Storefront | `http://localhost:8080` |
| API | `http://localhost:3001` |
| API Health | `http://localhost:3001/health` |
| PostgreSQL | `localhost:15432` |
| RAG PostgreSQL | `localhost:15433` |
| MinIO API | `http://localhost:19000` |
| MinIO Console | `http://localhost:19001` |

Stop the stack:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml down
```

Remove local volumes:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml down -v
```

---

## Development Mode

For active frontend development, you can run backend infrastructure in Docker and the frontend locally.

Start backend infrastructure:

```bash
./scripts/dev-start.sh
```

Check:

```env
VITE_API_PROXY_TARGET=3001
```

Then run:

```bash
cd frontend
npm install
npm run dev
```

The frontend will usually be available at:

```text
http://localhost:5173
```

---

## Environment

Available templates:

- `.env.dev.example` — local Docker development
- `.env.docker.example` — production / self-hosted deployment
- `frontend/.env.example` — frontend local proxy configuration

Important variables:

```text
DATABASE_URL
RAG_DATABASE_URL
RAG_DATABASE_DIRECT_URL
FRONTEND_BASE_URL
CORS_ORIGIN
PUBLIC_SITE_URL

MINIO_*

JWT_SECRET
JWT_REFRESH_SECRET
ENCRYPTION_KEY
```

Never commit production credentials or secrets.

---

## Common Commands

### Docker

```bash
make docker-up
make docker-down
make docker-logs
make docker-build
make docker-dev
make status
make health
```

### Database

```bash
make db-migrate
make db-setup
make db-seed
make db-studio
make db-shell
```

Or from the backend:

```bash
cd backend

npm run prisma:migrate
npm run prisma:migrate:deploy
npm run db:seed
npm run prisma:generate
```

---

## RAG / AI Database

AXIOSBRAND uses a dedicated database for RAG.

The primary application database should not be reused as the RAG database.

Useful commands:

```bash
cd backend

npm run prisma:generate:rag
npm run prisma:deploy:rag
```

Health endpoints:

```text
GET /health
GET /api/gpt-assistant/admin/health
```

---

## Backup and Restore

Database:

```bash
cd backend

npm run backup:db
npm run restore:db
npm run list:backups
```

Object storage:

```bash
npm run backup:s3
npm run restore:s3
```

Docker-based migration backup:

```bash
make backup-migrate
```

---

## Production Deployment

Create the production environment file:

```bash
cp .env.docker.example .env
```

Validate configuration:

```bash
make prod-check
```

Deploy:

```bash
make prod-deploy
```

The production `docker-compose.yml` runs the application layer:

```text
frontend
backend
```

Production PostgreSQL is expected to be provisioned separately.

Recommended architecture:

```text
User
  ↓
Frontend
  ↓
Backend
  ├── External PostgreSQL
  └── External S3 / Object Storage
```

Minimum production configuration:

```env
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?schema=public

FRONTEND_BASE_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com
PUBLIC_SITE_URL=https://your-domain.com

JWT_SECRET=replace-with-real-secret
JWT_REFRESH_SECRET=replace-with-real-secret
ENCRYPTION_KEY=replace-with-real-secret

MINIO_ENDPOINT=s3-provider-host
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET_NAME=your-bucket
MINIO_PRIVATE_BUCKET_NAME=your-private-bucket
MINIO_PUBLIC_URL=https://files.your-domain.com
```

Recommended deployment order:

1. Provision PostgreSQL.
2. Create the production database and application user.
3. Configure S3-compatible object storage.
4. Create public and private storage buckets.
5. Fill the production `.env`.
6. Run `make prod-check`.
7. Run `make prod-deploy`.

On startup, the backend will:

- wait for the database;
- apply Prisma migrations;
- start the API.

---

## Admin Platform

The admin interface is located in:

```text
frontend/src/routes/(admin)/admin/
```

Main functional areas include:

```text
Catalog
├── Products
├── Categories
├── Brands
├── Lookbook
└── Pages

Content
├── Homepage
├── Header
├── Footer
├── Shop Page Design
├── Product Page Design
└── Blog

Sales
├── Orders
├── Returns
├── Payment Requests
├── Payment Gateways
├── Promo
└── Marketing

Customers
├── Customers
├── Tickets
└── Partners

Operations
├── Warehouses
├── Sales Points
├── Countries
├── Languages
├── Currency Rates
└── Delivery Tracking

Finance
├── Accounting
├── Reports
├── Dashboard
└── Backups

System
├── Settings
├── Admins
├── Activity Logs
├── API Keys
└── Onboarding

AI
├── GPT Assistant
├── Prompts
├── Analytics
├── Logs
└── Test
```

---

## Launched Projects

AXIOSBRAND is already being used as the foundation for live commerce projects.

| Project | Category | Description | Website | Status |
|---|---|---|---|---|
| SHISTEROV | Fashion / Art | Independent fashion and art brand | https://shisterov.to | Live |

If you launch a project using AXIOSBRAND, you can submit it through a GitHub Issue for consideration.

Suggested issue title:

```text
[SUBMIT] Project Name
```

Include:

```text
Project name:
Website:
Category:
Short description:
Founder / Team:
Contact:
Launch date:
```

---

## Philosophy

AXIOSBRAND is built around several principles:

### Own your infrastructure

Your commerce stack should remain portable and self-hostable.

### Own your data

Products, customers, orders, content, operational data, and AI context should not be trapped inside a proprietary platform.

### Commerce is more than checkout

Modern brands operate across content, community, logistics, localization, analytics, customer support, and internal operations.

### AI should operate the system

AI should not be a decorative chatbot.

The long-term goal is an intelligent operational layer capable of understanding commerce data and executing authorized actions across the platform.

### Brand first

The platform should adapt to the brand — not force the brand into a predefined storefront template.

---

## Roadmap

AXIOSBRAND is under active development.

Key directions:

- stronger modular architecture;
- public API documentation;
- improved extension system;
- deeper international commerce support;
- additional payment integrations;
- additional logistics integrations;
- richer analytics;
- AI actions and agent workflows;
- semantic search across commerce data;
- improved RAG workflows;
- production hardening;
- automated testing;
- improved developer documentation;
- public demo environment.

---

## Contributing

Contributions, issues, discussions, and implementation ideas are welcome.

Before submitting a large pull request, consider opening an Issue describing the proposed change.

Recommended contribution flow:

```bash
git clone <repository-url>
cd axiosbrand

git checkout -b feature/my-feature

# make changes

git commit -m "Add my feature"
git push origin feature/my-feature
```

Then open a Pull Request.

---

## Security

Do not publish security vulnerabilities in public Issues.

If you discover a vulnerability, contact the project maintainers privately.

Never commit:

- `.env` files;
- passwords;
- API keys;
- JWT secrets;
- encryption keys;
- database credentials;
- object-storage credentials.

---

## License

AXIOSBRAND is open source software released under the **MIT License**.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software subject to the terms of the MIT License.

See [`LICENSE`](LICENSE).

---

## AXIOSBRAND

**Open commerce infrastructure for independent brands.**

Commerce. Content. Operations. AI.

One system.
