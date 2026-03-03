const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8000;

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
                    // basic content-type
                    const ext = path.extname(filePath).toLowerCase();
                    const map = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
                    res.setHeader('Content-Type', map[ext] || 'application/octet-stream');
                    fs.createReadStream(filePath).pipe(res);
                }
            });
        });
        server.listen(PORT, () => resolve(server));
    });
}

(async () => {
    const server = await serve();
    console.log('Static server running on http://localhost:' + PORT);

    // prefer system chromium when running in Alpine container
    const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
    const fallbackPath = '/usr/bin/chromium';
    const executablePath = require('fs').existsSync(chromiumPath) ? chromiumPath : (require('fs').existsSync(fallbackPath) ? fallbackPath : undefined);

    const launchOptions = {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (executablePath) launchOptions.executablePath = executablePath;

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    page.on('console', msg => {
        try { console.log('PAGE LOG:', msg.text()); } catch (e) { }
    });
    await page.goto('http://localhost:' + PORT + '/test/index.html', { waitUntil: 'networkidle2' });

    // wait for table rows
    await page.waitForSelector('tr.course-tr', { timeout: 5000 });

    // wait for content script to enhance table (anchor links)
    try {
        await page.waitForSelector('tr.course-tr:first-child td.kcmc a', { timeout: 10000 });
    } catch (err) {
        // dump page html for debugging
        const html = await page.content();
        const debugPath = path.join(ROOT, 'test', 'page_debug.html');
        fs.writeFileSync(debugPath, html, 'utf8');
        console.error('DEBUG: wrote page HTML to', debugPath);
        throw err;
    }

    // click first course link
    await page.click('tr.course-tr:first-child td.kcmc a');

    // wait for panel
    await page.waitForSelector('.njxk-panel', { timeout: 5000 });
    console.log('Panel shown for standard row');

    // TEST: Program Course (JXB Item)
    console.log('Testing JXB Item enhancement...');
    // check if jxb item is enhanced
    const jxbLink = await page.waitForSelector('.jxb-item[data-enhanced="true"] .head .jxb-title a.njxk-clickable-link', { timeout: 5000 });
    if (!jxbLink) throw new Error('JXB item teacher link not found');
    console.log('JXB item teacher link found');

    // click JXB teacher link
    await page.click('.jxb-item[data-enhanced="true"] .head .jxb-title a.njxk-clickable-link');

    // wait for panel again (it might be already shown, but we want to make sure it's updated or still visible)
    await page.waitForSelector('.njxk-panel', { timeout: 5000 });
    console.log('Panel shown for JXB teacher');

    // screenshot
    const out = path.join(ROOT, 'test', 'screenshot.png');
    await page.screenshot({ path: out, fullPage: false });
    console.log('Saved screenshot to', out);

    await browser.close();
    server.close();
    process.exit(0);
})().catch(err => { console.error(err); process.exit(2); });
