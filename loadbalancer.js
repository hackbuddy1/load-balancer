const http = require('http');  // require NOde.js ka module system hain jaise python me use krte hain import ussi tarah node.js me use krte hain require.

const servers = [{ host: 'server1', port: 1370, working: true, requests: 0}, {host: 'server2', port: 1380, working: true, requests: 0}, {host: 'server3', port: 1390, working: true, requests: 0}];
// server1 = docker container ka naam. we use it because docker me hrr ek container alag-alag network prr hota hain- ek container dusre ko localhost se nhi dhund skta hain. 
let curr =0;

http.createServer((req, res) => {    // server bna rhe hain. req = request, res = response. 
    
    if(req.url === '/dashboard'){
        const data = {
            totalRequests: servers.reduce((sum, s) => sum+s.requests, 0),
            servers: servers.map(s => ({
                port: s.port,
                working: s.working,
                requests: s.requests,
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
            <div class="stat-number" id="alive-count">-</div>
            <div class="stat-label">Alive Servers</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="dead-count">-</div>
            <div class="stat-label">Dead Servers</div>
        </div>
    </div>

    <div id="servers"></div>
    <div class="refresh" id="refresh-time">Updating...</div>

    <script>
        async function updateDashboard() {
            const res = await fetch('/dashboard');
            const data = await res.json();

            document.getElementById('total').textContent = data.totalRequests;
            document.getElementById('alive-count').textContent = data.servers.filter(s => s.working).length;
            document.getElementById('dead-count').textContent = data.servers.filter(s => !s.working).length;

            const container = document.getElementById('servers');
            container.innerHTML = data.servers.map(s => \`
                <div class="server-card">
                    <div class="server-name">
                        <div class="dot \${s.working ? 'alive' : 'dead'}"></div>
                        Server \${s.port}
                    </div>
                    <div class="requests">Requests: \${s.requests}</div>
                    <div class="badge \${s.working ? 'badge-alive' : 'badge-dead'}">
                        \${s.working ? 'ALIVE' : 'DEAD'}
                    </div>
                </div>
            \`).join('');

            document.getElementById('refresh-time').textContent = 
                'Last updated: ' + new Date().toLocaleTimeString();
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

    const proxy = http.request(options, (serverRes) => {
        res.writeHead(serverRes.statusCode, serverRes.headers);
        serverRes.pipe(res);  // worker server ko request bhej rhe. werker server ne jo status and headers diye woh browser ko wapas bhej rhe
    }); //res browser tk pipe kr rhe hain. 

    proxy.on('error', () => {
        res.writeHead(502);
        res.end('Cannot connect through server.');
    });
    req.pipe(proxy);
}).listen(8080);

function healthCheck(server){
    const options = {
        hostname: server.host,
        port: server.port,
        path: '/',
        method: 'GET',
    };

    const req = http.request(options, (res) => {
        if(res.statusCode === 200){
            server.working = true;
            console.log(`Server ${server.port} is working.`);
        } else{
            server.working = false;
            console.log(`Server ${server.port} is not working.`);
        }
    });

    req.on('error', () => {
        server.working = false;
        console.log(`Server ${server.port} is dead!`);
    });

    req.end();  //healthcheck kb fail hoga? server crash ho jaye, server overload ho jaye, ya network problem ho. 
}

function updateServer(){
    const workingServers = servers.filter(server => server.working === true);

    if(workingServers.length === 0){
        return null;
    }

    const selectedServer = workingServers[curr % workingServers.length];
    curr = (curr+1) % workingServers.length;

    selectedServer.requests += 1; //requests ke count increase krr rhe hain.

    return selectedServer;   //Round robin ke alawa hmm aur kya use kr skte hain, 1) Least connection: jis serevr pr kam load ho. 
    // weighted: powerful server ko zyada traffic.
}

setInterval(() => {
    servers.forEach(server => {
        healthCheck(server);
    });
}, 5000);


//Tumhare load balancer mein kya kami hai?"*

//**Yeh jawab do — khud bolna interviewer ko impress karta hai:**

//1. Session persistence nahi hai — ek user baar baar alag server pe jaata hai

//2. HTTPS support nahi hai — sirf HTTP hai

//3. Rate limiting nahi hai — ek user hazaar requests bhej sakta hai

//4. Metrics nahi hain — kitni requests gayi kahan, koi tracking nahi