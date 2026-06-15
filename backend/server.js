const http = require('http');
const https = require('https');
const ws = require('ws');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('lessness backend running');
  }
});

const wss = new ws.Server({ server });

let groups = new Map();

function startSelfPing() {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  console.log(`self-ping target: ${url}`);
  
  setInterval(() => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(`${url}/ping`, (res) => {
      console.log(`[${new Date().toISOString()}] self-ping: ${res.statusCode}`);
      res.resume();
    });
    req.on('error', (err) => {
      console.log(`[${new Date().toISOString()}] ping failed: ${err.message}`);
    });
    req.end();
  }, 120000);
}

wss.on('connection', (c) => {
  let curGroup = null;
  
  c.on('message', (raw) => {
    try {
      let msg = JSON.parse(raw);
      
      if (msg.t === 'join') {
        let gid = msg.gid;
        if (!groups.has(gid)) groups.set(gid, []);
        let grp = groups.get(gid);
        if (!grp.includes(c)) grp.push(c);
        curGroup = gid;
        c.send(JSON.stringify({ t: 'joined', gid }));
        let peers = grp.filter(p => p !== c).map(p => ({ id: p._socket?.remoteAddress || 'peer' }));
        c.send(JSON.stringify({ t: 'peers', list: peers }));
      }
      else if (msg.t === 'offer' || msg.t === 'answer' || msg.t === 'ice') {
        let grp = groups.get(curGroup);
        if (grp) {
          for (let client of grp) {
            if (client !== c) {
              client.send(JSON.stringify({ t: msg.t, from: c._socket?.remoteAddress, data: msg.data }));
            }
          }
        }
      }
    } catch(e) {
      console.log('parse error:', e);
    }
  });
  
  c.on('close', () => {
    if (curGroup && groups.has(curGroup)) {
      let grp = groups.get(curGroup);
      let idx = grp.indexOf(c);
      if (idx !== -1) grp.splice(idx, 1);
      if (grp.length === 0) groups.delete(curGroup);
    }
  });
});

server.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  startSelfPing();
});