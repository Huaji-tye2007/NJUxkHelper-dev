const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;

function serve() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            let url = decodeURIComponent(req.url.split('?')[0]);
            if (url === '/') url = '/test/index.html';
            const filePath = path.join(ROOT, url);
            fs.stat(filePath, (err, stat) => {
                if (err) { res.statusCode = 404; res.end('Not found'); return; }
                if (stat.isDirectory()) {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    fs.createReadStream(path.join(filePath, 'index.html')).pipe(res);
                } else {
                    const ext = path.extname(filePath).toLowerCase();
                    const map = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
                    res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
                    fs.createReadStream(filePath).pipe(res);
                }
            });
        });
        server.listen(PORT, '0.0.0.0', () => resolve(server));
    });
}

(async () => {
    const server = await serve();
    console.log('Static server running on http://localhost:' + PORT);
    console.log('Open http://localhost:' + PORT + '/test/index.html in your host browser to preview.');
    // keep running until killed
    process.on('SIGINT', () => { console.log('Shutting down'); server.close(() => process.exit(0)); });
})();
