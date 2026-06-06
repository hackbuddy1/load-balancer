const http = require('http');  // require NOde.js ka module system hain jaise python me use krte hain import ussi tarah node.js me use krte hain require.

//using weighted round robin algorithm. powerful server ko zyada traffic dena.
const servers = [{ host: 'server1', port: 1370, working: true, requests: 0, weight: 3, connections: 0, failures: 0, state: 'CLOSED', nextRetry: null}, 
    {host: 'server2', port: 1380, working: true, requests: 0,  weight: 2, connections: 0, failures: 0, state: 'CLOSED', nextRetry: null}, 
    {host: 'server3', port: 1390, working: true, requests: 0, weight: 1, connections: 0, failures: 0, state: 'CLOSED', nextRetry: null}];
// server1 = docker container ka naam. we use it because docker me hrr ek container alag-alag network prr hota hain- ek container dusre ko localhost se nhi dhund skta hain. 

const metrics = {
    RequestrsAccepted: 0,          //dashboard for admin. kitne request aaye, kitne reject hue, average response time kya hain.
    RequestsRejected: 0,
    totalResponseTime: 0,
}

let algo = 'round-robin';
const rateLimit = {}; // will store ip address
const LIMIT = 10; // 10 requests per minute per user
const failLimit = 3; // 3 brr fail hone prr -> open
const retryTime = 30 * 1000; // 30 sec baad half-open hoga
const Window = 60*1000;  // 1 minute
let curr =0;

http.createServer((req, res) => {   
    
    // server bna rhe hain. req = request, res = response. 

    const IP = req.socket.remoteAddress;  // ip address mil jayega

    if(!rateLimit[IP]){
        rateLimit[IP] = {
            count: 0
        };
        setTimeout(() => {
            delete rateLimit[IP]; // ek minute baad ip address delete kr denge. 
        }, Window);
    }

    if(rateLimit[IP].count >= LIMIT && req.url !== '/ui' && req.url !== '/dashboard'){
        metrics.RequestsRejected += 1;  //requests rejected ka count
        res.writeHead(429, { 'Content-Type': 'text/plain'});
        res.end('Too many requests! Please try again later.');
        return;
    }

    rateLimit[IP].count += 1;

    
    if(req.url === '/change-algo' && req.method === 'POST'){
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const {algo: newAlgo} = JSON.parse(body);

            if(algo === 'round-robin' || algo === 'least-connections'){
                algo = newAlgo;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: `Algorithm switched to ${algo}` }));
            } else{
                res.writeHead(400);
                res.end('Invalid algorithm. Use round-robin or least-connections');
            }
        });
        return;
    }
    if(req.url === '/dashboard'){
        const data = {
            totalRequests: servers.reduce((sum, s) => sum+s.requests, 0),
            blockedRequests: metrics.RequestsRejected,
            allowedRequests: metrics.RequestrsAccepted,
            algorithm: algo,
            averageResponseTime: metrics.RequestrsAccepted > 0 
            ? (metrics.totalResponseTime / metrics.RequestrsAccepted).toFixed(2) + ' ms' 
            : 'N/A',
            servers: servers.map(s => ({
                port: s.port,
                working: s.working,
                requests: s.requests,
                connections: s.connections,
                state: s.state,
                failures: s.failures,
            })),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
    }

    if (req.url === '/ui') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Load Balancer Dashboard</title>
    <style>

    <div style="margin-top: 24px; text-align: center;">
    <span style="color:#94a3b8; margin-right: 12px;">Current Algorithm:</span>
    <span id="current-algo" style="color:#38bdf8; font-weight:bold;">-</span>
    <div style="margin-top: 12px; display:flex; gap:12px; justify-content:center;">
        <button onclick="switchAlgo('round-robin')" 
            style="background:#1e293b; color:white; border:1px solid #38bdf8; 
            padding:8px 20px; border-radius:8px; cursor:pointer;">
            Round Robin
        </button>
        <button onclick="switchAlgo('least-connections')" 
            style="background:#1e293b; color:white; border:1px solid #22c55e; 
            padding:8px 20px; border-radius:8px; cursor:pointer;">
            Least Connections
        </button>
    </div>
</div>
        body { font-family: Arial, sans-serif; background: #0f172a; color: white; padding: 30px; }
        h1 { color: #38bdf8; margin-bottom: 24px; }
        .stats { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat-card { background: #1e293b; padding: 20px; border-radius: 12px; flex: 1; text-align: center; }
        .stat-number { font-size: 36px; font-weight: bold; color: #38bdf8; }
        .stat-label { font-size: 13px; color: #94a3b8; margin-top: 6px; }
        .server-card { background: #1e293b; padding: 16px 20px; border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
        .dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 12px; }
        .alive { background: #22c55e; }
        .dead { background: #ef4444; }
        .server-name { display: flex; align-items: center; font-size: 15px; }
        .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .badge-alive { background: #166534; color: #22c55e; }
        .badge-dead { background: #7f1d1d; color: #ef4444; }
        .requests { color: #94a3b8; font-size: 13px; }
        .refresh { color: #475569; font-size: 12px; margin-top: 20px; text-align: center; }
    </style>
</head>
<body>
    <h1>Load Balancer Dashboard</h1>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number" id="total">-</div>
            <div class="stat-label">Total Requests</div>
        </div>

        <div class="stat-card">
        <div class="stat-number" id="allowed" style="color:#22c55e">-</div>
        <div class="stat-label">Allowed</div>
        </div>

        <div class="stat-card">
        <div class="stat-number" id="blocked" style="color:#ef4444">-</div>
        <div class="stat-label">Blocked (429)</div>
        </div>

        <div class="stat-card">
            <div class="stat-number" id="alive-count">-</div>
            <div class="stat-label">Alive Servers</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="dead-count">-</div>
            <div class="stat-label">Dead Servers</div>
        </div>

        <div class="stat-card">
        <div class="stat-number" id="avg-rt" style="color:#f59e0b">-</div>
        <div class="stat-label">Avg Response (ms)</div>
        </div>
    </div>

    <div id="servers"></div>
    <div style="margin-top: 24px; text-align: center;">
        <span style="color:#94a3b8; margin-right: 12px;">Current Algorithm:</span>
        <span id="current-algo" style="color:#38bdf8; font-weight:bold;">-</span>
        <div style="margin-top: 12px; display:flex; gap:12px; justify-content:center;">
            <button onclick="switchAlgo('round-robin')"
                style="background:#1e293b; color:white; border:1px solid #38bdf8;
                padding:8px 20px; border-radius:8px; cursor:pointer;">
                Round Robin
            </button>
            <button onclick="switchAlgo('least-connections')"
                style="background:#1e293b; color:white; border:1px solid #22c55e;
                padding:8px 20px; border-radius:8px; cursor:pointer;">
                Least Connections
            </button>
        </div>
    </div>
    <div class="refresh" id="refresh-time">Updating...</div>

    <script>
        async function updateDashboard() {
            const res = await fetch('/dashboard');
            const data = await res.json();

            document.getElementById('total').textContent = data.totalRequests;
            document.getElementById('allowed').textContent = data.allowedRequests;
            document.getElementById('blocked').textContent = data.blockedRequests;
            document.getElementById('avg-rt').textContent = data.averageResponseTime;
            document.getElementById('current-algo').textContent = data.algorithm;
            document.getElementById('alive-count').textContent = data.servers.filter(s => s.working).length;
            document.getElementById('dead-count').textContent = data.servers.filter(s => !s.working).length;

            const container = document.getElementById('servers');
            container.innerHTML = data.servers.map(s => \`
                <div class="server-card">
                    <div class="server-name">
                        <div class="dot \${s.working ? 'alive' : 'dead'}"></div>
                        Server \${s.port}
                    </div>
                    <div class="requests">Requests: \${s.requests} | Failures: \${s.failures}</div> 
                    <div style="font-size:11px; margin-top:4px; color: \${s.state === 'CLOSED' ? '#22c55e' : s.state === 'HALF-OPEN' ? '#f59e0b' : '#ef4444'}">
                        Circuit: \${s.state}
                    </div>
                    <div class="badge \${s.working ? 'badge-alive' : 'badge-dead'}">
                        \${s.working ? 'ALIVE' : 'DEAD'}
                    </div>
                </div>
            \`).join('');

            document.getElementById('refresh-time').textContent = 
                'Last updated: ' + new Date().toLocaleTimeString();
        }

        async function switchAlgo(newAlgo) {
            await fetch('/change-algo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ algo: newAlgo })
            });
            updateDashboard();
        }

        updateDashboard();
        setInterval(updateDashboard, 3000);
    </script>
</body>
</html>
    `);
    return;
}


    const selectedServer = updateServer();

    if(!selectedServer){
        res.writeHead(503); // 503 : server available nhi hain. 502: server hain lekin connect nhi ho paya. 500: server crash ho gya. 
        res.end('No servers available! Try again later.')
        return;
    }

    const options ={
        hostname: selectedServer.host, // server ka address server1, server2, server3
        port: selectedServer.port, // kose port prr jana hain.
        path: req.url, // konsa page
        method: req.method, //GET hain ya POST
        headers: req.headers,
    };

    const start = Date.now();
    const proxy = http.request(options, (serverRes) => {
        metrics.RequestrsAccepted += 1;
        metrics.totalResponseTime += (Date.now() - start);
        selectedServer.connections -= 1;
        res.writeHead(serverRes.statusCode, serverRes.headers);
        serverRes.pipe(res);  // worker server ko request bhej rhe. werker server ne jo status and headers diye woh browser ko wapas bhej rhe
    }); //res browser tk pipe kr rhe hain. 

    proxy.on('error', () => {
        tripCircuit(selectedServer);  
        selectedServer.connections -= 1;
        res.writeHead(502);
        res.end('Cannot connect through server.');
    });
    req.pipe(proxy);
}).listen(8080);

function tripCircuit(server){
    server.failures += 1;
    if(server.failures >= failLimit){
        server.state = 'OPEN';
        server.working = false;
        server.nextRetry = Date.now() + retryTime; // 30 sec baad phir se retry krenge
    }
}

function resetCircuit(server) {
    server.failures = 0;
    server.state = 'CLOSED';
    server.working = true;
    server.nextRetry = null;
    console.log(`Circuit CLOSED for Server ${server.port} — recovered!`);
}

function checkHalfOpen(server) {
    if (server.state === 'OPEN' && Date.now() >= server.nextRetry) {
        server.state = 'HALF-OPEN';
        console.log(`Circuit HALF-OPEN for Server ${server.port} — testing...`);
    }
}

function healthCheck(server){
    checkHalfOpen(server);
    if (server.state === 'OPEN') return;
    const options = {
        hostname: server.host,
        port: server.port,
        path: '/',
        method: 'GET',
    }; 

    const req = http.request(options, (res) => {
        if(res.statusCode === 200){
            resetCircuit(server); 
        } else{
            tripCircuit(server);
        }
    });

    req.on('error', () => {
        tripCircuit(server);     
        console.log(`Server ${server.port} is dead!`);
    });

    req.end();  //healthcheck kb fail hoga? server crash ho jaye, server overload ho jaye, ya network problem ho. 
}

function updateServer(){
    // working servers lenge, unme se ek select krenge, usko request bhejenge.
    const workingServers = servers.filter(server => server.working === true);

    if(workingServers.length === 0){
        return null;
    }

    let selectedServer;

    if(algo === 'round-robin'){
        const pool = [];
        workingServers.forEach(server => {
            for(let i = 0; i < server.weight; i++){
                pool.push(server);
            }
        });
        selectedServer = pool[curr % pool.length];
        curr = (curr + 1) % pool.length;
    } else if(algo === 'least-connections'){
        selectedServer = workingServers.reduce((min, server) => {
            return server.connections < min.connections ? server : min;
        });
    }

    selectedServer.requests += 1;
    selectedServer.connections += 1; 
    return selectedServer;
}

setInterval(() => {
    servers.forEach(server => {
        healthCheck(server);
    });
}, 5000);

