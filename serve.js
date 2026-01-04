const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
let clients = [];

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

// Server-Sent Events endpoint for live reload
function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  clients.push(res);
  res.write('data: connected\n\n');

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
}

function notifyClients() {
  clients.forEach(client => {
    try {
      client.write('data: reload\n\n');
    } catch (e) {
      // Client disconnected
    }
  });
}

function injectLiveReloadScript(content, contentType) {
  if (contentType === 'text/html') {
    const script = `
    <script>
      if (typeof EventSource !== 'undefined') {
        const eventSource = new EventSource('/__live_reload__');
        eventSource.onmessage = function(event) {
          if (event.data === 'reload') {
            window.location.reload();
          }
        };
        eventSource.onerror = function() {
          console.log('Live reload connection closed');
        };
      }
    </script>
    `;
    return content.toString().replace('</body>', script + '</body>');
  }
  return content;
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Handle Server-Sent Events for live reload
  if (req.url === '/__live_reload__') {
    handleSSE(req, res);
    return;
  }

  // Remove query string and decode URL
  let filePath = '.' + req.url.split('?')[0];
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      // Inject live reload script for HTML files
      if (contentType === 'text/html') {
        content = Buffer.from(injectLiveReloadScript(content, contentType));
      }
      
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

// Watch for file changes
function watchFiles() {
  const filesToWatch = ['index.html', 'main.js', 'main.css'];
  
  filesToWatch.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          console.log(`\n🔄 File changed: ${file}`);
          console.log('   Reloading clients...\n');
          notifyClients();
        }
      });
    }
  });
}

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log('\n🚀 Server running with live reload!');
  console.log(`📱 Access from your phone:`);
  console.log(`   http://${localIP}:${PORT}`);
  console.log(`💻 Or locally:`);
  console.log(`   http://localhost:${PORT}`);
  console.log('\n✨ Changes will auto-reload on connected devices');
  console.log('Press Ctrl+C to stop\n');
  
  watchFiles();
});

