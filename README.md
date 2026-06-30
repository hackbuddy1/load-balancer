# HTTP Load Balancer

A production-style HTTP load balancer built from scratch in Node.js, with no external load-balancing libraries. It distributes traffic across multiple backend servers and includes the core resilience patterns used in real-world systems : weighted load distribution, automatic failover, rate limiting, and circuit breaking.

---

## Why this project exists

Most load balancer tutorials stop at round robin. This one goes further by implementing the failure-handling logic that production load balancers (NGINX, AWS ELB, Envoy) actually rely on because a load balancer's real job isn't just distributing traffic, it's *surviving failure*.

---

## Features

### Load balancing algorithms (switchable at runtime)
- **Weighted Round Robin** — servers with a higher weight receive proportionally more traffic, useful when backend servers have different capacities.
- **Least Connections** — routes each request to the server with the fewest active connections, which adapts better than round robin when requests have uneven processing times.
- Algorithm can be switched live from the dashboard or via API, with no restart required.

### Health checks & auto-failover
- Background health checks run every 5 seconds against each backend.
- Servers that stop responding are automatically removed from the routing pool.
- Recovered servers are automatically added back.

### Circuit Breaker
- Tracks consecutive failures per server.
- After 3 consecutive failures, a server's circuit trips to **OPEN** — no further traffic is sent to it, preventing wasted requests against a server that's clearly down.
- After a 30-second cooldown, the circuit moves to **HALF-OPEN** and sends a single test request.
- Success → circuit closes (**CLOSED**) and the server resumes normal traffic.
- Failure → circuit reopens and the cooldown restarts.

This prevents the load balancer from repeatedly hammering a dead server and gives it time to recover — the same pattern used in Netflix's Hystrix and Resilience4j.

### Rate limiting
- Per-IP request limiting using a sliding window (10 requests / 60 seconds by default).
- Requests over the limit receive an HTTP `429 Too Many Requests` response.
- Protects backend servers from being overwhelmed by a single client.

### Real-time monitoring dashboard
- Live dashboard at `/ui`, auto-refreshing every 3 seconds.
- Tracks total requests, allowed vs. blocked requests, average response time, and per-server stats (active connections, failure count, circuit state).
- JSON metrics also available at `/dashboard` for programmatic access.

---

## Architecture

```
                              ┌─────────────────────┐
                              │       Client          │
                              └──────────┬───────────┘
                                         │ HTTP Request
                                         ▼
                    ┌───────────────────────────────────────┐
                    │            Load Balancer (8080)          │
                    │                                         │
                    │  1. Rate Limiter   → 429 if over limit │
                    │  2. Algorithm      → Round Robin /     │
                    │     Selector         Least Connections │
                    │  3. Circuit Breaker → skip OPEN servers│
                    │  4. Proxy Request   → forward to server│
                    └───────┬───────────┬───────────┬───────┘
                            │           │           │
                  weight=3  │ weight=2  │ weight=1  │
                            ▼           ▼           ▼
                    ┌───────────┐ ┌───────────┐ ┌───────────┐
                    │  Server 1   │ │  Server 2   │ │  Server 3   │
                    │  :1370      │ │  :1380      │ │  :1390      │
                    └───────────┘ └───────────┘ └───────────┘
                            ▲           ▲           ▲
                            └───────────┴───────────┘
                                       │
                          Health Check (every 5s)
                          Updates circuit state:
                          CLOSED → OPEN → HALF-OPEN → CLOSED
```

### Request flow
1. A request hits the load balancer on port `8080`.
2. The client's IP is checked against the rate limiter. If the limit is exceeded, a `429` is returned immediately.
3. The load balancer selects a backend server using the active algorithm (Weighted Round Robin or Least Connections), considering only servers whose circuit is not `OPEN`.
4. The request is proxied to the selected server, and response time is recorded.
5. If the proxied request fails, the circuit breaker registers a failure for that server.
6. Independently, a background health check pings every server every 5 seconds and updates its state.

---

## Tech stack

| Component | Choice |
|---|---|
| Runtime | Node.js (built-in `http` module — no Express, no proxy libraries) |
| Containerization | Docker + Docker Compose |
| Backend servers | 3 simple Node.js HTTP servers (simulating real services) |
| Dashboard | Vanilla HTML/CSS/JS served directly from the load balancer |

No external load-balancing or proxy packages were used — the proxying, health checks, rate limiting, and circuit breaker are all implemented directly on top of Node's `http` module.

---

## Project structure

```
Load-Balancer/
├── loadbalancer.js       # Core load balancer logic
├── server1.js             # Backend worker server (port 1370)
├── server2.js             # Backend worker server (port 1380)
├── server3.js             # Backend worker server (port 1390)
├── docker-compose.yml     # Orchestrates all 4 containers
├── Dockerfile.lb          # Load balancer image
├── Dockerfile.server      # Backend server image
└── README.md
```

---

## Getting started

### Prerequisites
- Docker & Docker Compose installed

### Run

```bash
git clone https://github.com/hackbuddy1/load-balancer.git
cd load-balancer
docker-compose up --build
```

### Access

| URL | Description |
|---|---|
| `http://localhost:8080` | Load balancer entry point (proxies to backend servers) |
| `http://localhost:8080/ui` | Live dashboard |
| `http://localhost:8080/dashboard` | Raw JSON metrics |

---

## API reference

### `GET /dashboard`
Returns current metrics as JSON.

```json
{
  "totalRequests": 42,
  "blockedRequests": 3,
  "allowedRequests": 39,
  "algorithm": "round-robin",
  "averageResponseTime": "4.21 ms",
  "servers": [
    {
      "port": 1370,
      "working": true,
      "requests": 18,
      "connections": 0,
      "state": "CLOSED",
      "failures": 0
    }
  ]
}
```

### `POST /change-algo`
Switches the load balancing algorithm at runtime.

```bash
curl -X POST http://localhost:8080/change-algo \
  -H "Content-Type: application/json" \
  -d '{"algo": "least-connections"}'
```

Accepted values: `"round-robin"`, `"least-connections"`

---

## Configuration

These are currently set as constants in `loadbalancer.js` and can be adjusted directly:

| Setting | Default | Description |
|---|---|---|
| `LIMIT` | 10 | Max requests per IP per window |
| `Window` | 60,000 ms | Rate limit window |
| `failLimit` | 3 | Consecutive failures before circuit opens |
| `retryTime` | 30,000 ms | Cooldown before a circuit moves to HALF-OPEN |
| Health check interval | 5,000 ms | How often each server is pinged |

---

## Design decisions & trade-offs

**Why an in-memory rate limiter instead of Redis?**
For a single load balancer instance, in-memory tracking is simpler and has zero external dependencies. It would not work correctly across multiple load balancer instances (each would track limits independently) — a production multi-instance deployment would need a shared store like Redis.

**Why track requests in-process instead of a database?**
Metrics reset on restart, which is acceptable for this scope. A production system would persist metrics to a time-series store (Prometheus, InfluxDB) for historical analysis and alerting.

**Why HTTP instead of HTTPS?**
Kept the scope focused on load balancing logic. TLS termination would typically be handled at this layer in production and is a natural next step.

---

## Possible extensions

- [ ] TLS/HTTPS termination
- [ ] Sticky sessions (session affinity) for stateful backends
- [ ] Shared rate-limit store (Redis) for multi-instance deployments
- [ ] Persistent metrics (Prometheus + Grafana)
- [ ] Graceful shutdown (drain in-flight requests before stopping)
- [ ] Config file instead of hardcoded constants

---

## License

MIT
