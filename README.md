# HTTP Load Balancer

A production-style HTTP load balancer built from scratch in Node.js — no external load-balancing libraries. Distributes traffic across multiple backend servers with automatic failover, rate limiting, and circuit breaking.

**Live repo:** [github.com/hackbuddy1/load-balancer](https://github.com/hackbuddy1/load-balancer)

---

## Features

- **Weighted Round Robin** — powerful servers get proportionally more traffic
- **Least Connections** — routes to the server with fewest active connections
- **Runtime algorithm switching** — switch between algorithms from the dashboard, no restart needed
- **Health checks** — pings every server every 5 seconds, auto-removes dead servers
- **Circuit Breaker** — 3 failures → OPEN → 30s cooldown → HALF-OPEN → CLOSED
- **Rate Limiting** — 10 requests/min per IP, returns `429` when exceeded
- **Real-time dashboard** — live stats at `/ui`, JSON metrics at `/dashboard`

---

## Architecture

```
                        ┌─────────────────────┐
                        │        Client        │
                        └──────────┬──────────┘
                                   │ HTTP Request
                                   ▼
            ┌──────────────────────────────────────────┐
            │           Load Balancer :8080             │
            │                                          │
            │  Rate Limiter → Algorithm → Circuit      │
            │  Breaker Check → Proxy to Server         │
            └────────┬──────────┬──────────┬──────────┘
                     │          │          │
           weight=3  │ weight=2 │ weight=1 │
                     ▼          ▼          ▼
             ┌──────────┐ ┌──────────┐ ┌──────────┐
             │ Server 1  │ │ Server 2  │ │ Server 3  │
             │  :1370    │ │  :1380    │ │  :1390    │
             └──────────┘ └──────────┘ └──────────┘
                     ▲          ▲          ▲
                     └──────────┴──────────┘
                           Health Check (5s)
```

---

## Tech stack

| Component | Choice |
|---|---|
| Runtime | Node.js — built-in `http` module only, no Express or proxy libs |
| Containers | Docker + Docker Compose |
| Dashboard | Vanilla HTML/CSS/JS |

---

## Getting started

```bash
git clone https://github.com/hackbuddy1/load-balancer.git
cd load-balancer
docker-compose up --build
```

| URL | Description |
|---|---|
| `localhost:8080` | Load balancer |
| `localhost:8080/ui` | Live dashboard |
| `localhost:8080/dashboard` | Raw JSON metrics |

---

## API

**Switch algorithm at runtime:**
```bash
curl -X POST http://localhost:8080/change-algo \
  -H "Content-Type: application/json" \
  -d '{"algo": "least-connections"}'
```
Accepted: `"round-robin"`, `"least-connections"`

---

## Configuration

All in `loadbalancer.js`:

| Constant | Default | Description |
|---|---|---|
| `LIMIT` | 10 | Requests per IP per window |
| `Window` | 60,000 ms | Rate limit window |
| `failLimit` | 3 | Failures before circuit opens |
| `retryTime` | 30,000 ms | Circuit cooldown before HALF-OPEN |

---

## Known limitations

- Metrics reset on restart (no persistence)
- Rate limiter is in-memory — won't work across multiple LB instances
- HTTP only — no TLS termination

---

## License

MIT
