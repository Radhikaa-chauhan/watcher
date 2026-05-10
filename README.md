## watcher

# PR Spam Detection Agent

A production-grade agentic system for detecting and handling spam/low-quality PRs using LangGraph, WebSockets, and microservices.

## Architecture

```
GitHub Webhook
      │
      ▼
 API Gateway (Kong/Nginx)
      │  HMAC verification, JWT auth, rate limiting
      ▼
 Detection Service (Node.js)
      │  Runs 8 detector modules → score
      ▼
 Redis Streams (message broker)
      │
      ├──► LangGraph Agent (Python)
      │         │  Claude decides action
      │         ▼
      │    GitHub Action Service
      │         │  posts comment, closes/approves PR
      │
      └──► WS Broadcaster (Node.js)
                │  streams events live
                ▼
           Dashboard (browser)
```

## Services

| Service | Port | Language | Purpose |
|---|---|---|---|
| API Gateway | 8080 | Nginx | Auth, routing, rate limiting |
| Detection Service | 3001 | Node.js | Runs detector modules |
| LangGraph Agent | 8000 | Python | Claude-powered decision making |
| GitHub Action Service | 3002 | Node.js | Posts comments, closes PRs |
| WS Broadcaster | 3003 | Node.js | Real-time dashboard streaming |
| Redis | 6379 | Redis | Message broker + state |

## Quick Start

```bash
# 1. Copy and fill in secrets
cp .env.example .env

# 2. Start all services
docker compose up --build

# 3. Point your GitHub webhook to:
#    http://your-host:8080/webhook/github
#    Content-Type: application/json
#    Secret: your GITHUB_WEBHOOK_SECRET
```

## Environment Variables

See `.env.example` for all required variables.

## Security

- HMAC signature verification on all GitHub webhooks
- JWT authentication on WebSocket connections
- Service-to-service communication only via Redis Streams
- No internal ports exposed externally
- TLS via reverse proxy in production
