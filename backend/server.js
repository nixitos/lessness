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
let userIdCounter = 0;

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

function broadcastToGroup(group, senderId, packet, excludeSender = true) {
  for (let [uid, client] of group) {
    if (excludeSender && uid === senderId) continue;
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(packet));
    }
  }
}

wss.on('connection', (c) => {
  let curGroup = null;
  let userId = (++userIdCounter).toString();
  let userNick = 'anon';
  
  c.on('message', (raw) => {
    try {
      let msg = JSON.parse(raw);
      
      if (msg.t === 'join') {
        let gid = msg.gid;
        userNick = msg.nick || 'anon';
        
        if (!groups.has(gid)) {
          groups.set(gid, new Map());
        }
        let grp = groups.get(gid);
        
        if (!grp.has(userId)) {
          grp.set(userId, { ws: c, nick: userNick });
          
          let joinMsg = {
            t: 'system',
            text: `${userNick} присоединился к чату`,
            time: Date.now()
          };
          broadcastToGroup(grp, userId, joinMsg, true);
        }
        
        curGroup = gid;
        c.send(JSON.stringify({ t: 'joined', gid, userId, nick: userNick }));
        
        let peers = [];
        for (let [uid, client] of grp) {
          if (uid !== userId) {
            peers.push({ id: uid, nick: client.nick });
          }
        }
        c.send(JSON.stringify({ t: 'peers', list: peers }));
        
        let newUserPacket = {
          t: 'peer_joined',
          id: userId,
          nick: userNick
        };
        broadcastToGroup(grp, userId, newUserPacket, true);
      }
      else if (msg.t === 'msg') {
        let grp = groups.get(curGroup);
        if (grp) {
          let packet = {
            t: 'msg',
            nick: userNick,
            text: msg.text,
            time: Date.now()
          };
          broadcastToGroup(grp, userId, packet, false);
        }
      }
      else if (msg.t === 'nick') {
        let grp = groups.get(curGroup);
        if (grp && grp.has(userId)) {
          let oldNick = userNick;
          userNick = msg.nick;
          grp.get(userId).nick = userNick;
          
          let nickMsg = {
            t: 'system',
            text: `${oldNick} сменил ник на ${userNick}`,
            time: Date.now()
          };
          broadcastToGroup(grp, userId, nickMsg, true);
          
          let nickUpdatePacket = {
            t: 'peer_nick',
            id: userId,
            nick: userNick
          };
          broadcastToGroup(grp, userId, nickUpdatePacket, true);
        }
      }
    } catch(e) {
      console.log('parse error:', e);
    }
  });
  
  c.on('close', () => {
    if (curGroup && groups.has(curGroup)) {
      let grp = groups.get(curGroup);
      if (grp.has(userId)) {
        let leaveNick = grp.get(userId).nick;
        grp.delete(userId);
        
        let leaveMsg = {
          t: 'system',
          text: `${leaveNick} покинул чат`,
          time: Date.now()
        };
        broadcastToGroup(grp, userId, leaveMsg, true);
        
        let leavePacket = {
          t: 'peer_left',
          id: userId
        };
        broadcastToGroup(grp, userId, leavePacket, true);
        
        if (grp.size === 0) {
          groups.delete(curGroup);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  startSelfPing();
});