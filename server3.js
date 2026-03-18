const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(`Server is ready for port ${PORT}!`);
}).listen(PORT, () => {
    console.log(`Server ${PORT} ready hai!`);
});  