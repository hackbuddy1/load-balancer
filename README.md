# Load Balancer

A custom HTTP Load Balancer built from scratch using Node.js and Docker.

## What it does
- Distributes traffic across 3 servers using Round Robin algorithm
- Health Check system — automatically detects dead servers
- Auto failover — dead servers are skipped automatically
- Real-time Dashboard showing server status and request count

## Tech Stack
- Node.js
- Docker
- docker-compose

## How to Run
```bash
docker-compose up --build
```

Then open:
- `localhost:8080` — Load Balancer
- `localhost:8080/ui` — Live Dashboard

## Dashboard
![Dashboard shows server status, request count, alive/dead servers]

## Architecture
- 3 Worker Server containers (port 1370, 1380, 1390)
- 1 Load Balancer container (port 8080)
- Health check runs every 5 seconds
