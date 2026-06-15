const ws = require('ws');
const srv = new ws.Server({ port: process.env.PORT || 8080 });

let groups = new Map();

srv.on('connection', (c) => {
  let curGroup = null;
  
  c.on('message', (raw) => {
    let msg = JSON.parse(raw);
    
    if (msg.t === 'join') {
      let gid = msg.gid;
      if (!groups.has(gid)) groups.set(gid, []);
      let grp = groups.get(gid);
      if (!grp.includes(c)) grp.push(c);
      curGroup = gid;
      c.send(JSON.stringify({ t: 'joined', gid }));
      let peers = grp.filter(p => p !== c).map(p => ({ id: p._socket.remoteAddress || 'peer' }));
      c.send(JSON.stringify({ t: 'peers', list: peers }));
    }
    else if (msg.t === 'offer' || msg.t === 'answer' || msg.t === 'ice') {
      let target = groups.get(curGroup)?.find(p => p !== c);
      if (target) target.send(JSON.stringify({ t: msg.t, from: c._socket.remoteAddress, data: msg.data }));
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