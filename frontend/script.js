let ws;
let curGroupId = '', myNick = '', myUserId = '';
let peers = new Map();

const objects = ['●', '◆', '■', '▲', '♥', '♦', '♣', '♠', '✧', '☆', '◈', '◉', '◍', '◎', '◘'];

function getRandomObject() {
  return objects[Math.floor(Math.random() * objects.length)];
}

function createFallingObjects() {
  let container = document.getElementById('objects-bg');
  if (!container) return;
  
  for (let i = 0; i < 60; i++) {
    let obj = document.createElement('div');
    obj.className = 'falling-obj';
    
    let size = Math.random() * 24 + 12;
    obj.style.width = size + 'px';
    obj.style.height = size + 'px';
    obj.style.fontSize = size + 'px';
    obj.style.left = Math.random() * 100 + '%';
    obj.style.animationDuration = Math.random() * 3 + 2 + 's';
    obj.style.animationDelay = Math.random() * 8 + 's';
    obj.style.setProperty('--drift', (Math.random() * 100 - 50) + 'px');
    obj.style.setProperty('--rot-end', (Math.random() * 720 - 360) + 'deg');
    
    let objChar = getRandomObject();
    obj.innerText = objChar;
    
    let hue = Math.random() * 60 + 260;
    obj.style.color = `hsla(${hue}, 80%, 65%, 0.8)`;
    obj.style.textShadow = `0 0 ${Math.random() * 8 + 4}px hsla(${hue}, 80%, 65%, 0.5)`;
    
    container.appendChild(obj);
  }
}

function genGroupId() {
  return Math.random().toString(36).substring(2, 9);
}

function saveNick(nick) {
  localStorage.setItem('ln_nick', nick);
}

function loadNick() {
  let saved = localStorage.getItem('ln_nick');
  if (saved && saved.length > 20) saved = saved.substring(0, 20);
  return saved || 'anon_' + Math.floor(Math.random()*1000);
}

function getFirstLetter(str) {
  return str ? str.charAt(0).toUpperCase() : '?';
}

function updateAvatarDisplay() {
  let box = document.getElementById('avatar-box');
  if (box) {
    box.style.backgroundImage = '';
    box.innerText = getFirstLetter(myNick);
  }
}

function updatePreviewOnNickChange() {
  let nickInput = document.getElementById('nick-input');
  let currentNick = nickInput ? nickInput.value.trim() : '?';
  if (currentNick.length > 20) currentNick = currentNick.substring(0, 20);
  let preview = document.getElementById('avatar-preview');
  
  if (preview) {
    preview.style.backgroundImage = '';
    preview.innerText = getFirstLetter(currentNick);
  }
  
  let charCount = document.getElementById('char-count');
  if (charCount && nickInput) {
    let len = nickInput.value.length;
    charCount.innerText = `${len}/20`;
    if (len >= 18) {
      charCount.className = 'char-count danger';
    } else if (len >= 15) {
      charCount.className = 'char-count warning';
    } else {
      charCount.className = 'char-count';
    }
  }
}

function updateGroupDisplay() {
  let groupElem = document.getElementById('group-id-value');
  if (groupElem) groupElem.innerText = curGroupId;
}

function updatePeerList() {
  let container = document.getElementById('peers-container');
  if (!container) return;
  
  container.innerHTML = '';
  for (let [id, nick] of peers) {
    let div = document.createElement('div');
    div.className = 'peer-item';
    div.dataset.peer = id;
    let avatarSpan = document.createElement('span');
    avatarSpan.className = 'peer-avatar';
    avatarSpan.innerText = getFirstLetter(nick);
    let nameSpan = document.createElement('span');
    nameSpan.innerText = nick;
    div.appendChild(avatarSpan);
    div.appendChild(nameSpan);
    container.appendChild(div);
  }
}

function addPeer(id, nick) {
  if (id !== myUserId && !peers.has(id)) {
    peers.set(id, nick);
    updatePeerList();
  }
}

function removePeer(id) {
  if (peers.has(id)) {
    peers.delete(id);
    updatePeerList();
  }
}

function updatePeerNick(id, newNick) {
  if (peers.has(id)) {
    peers.set(id, newNick);
    updatePeerList();
  }
}

function addSystemMessage(text) {
  let messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;
  
  let div = document.createElement('div');
  div.className = 'message system';
  div.innerHTML = `<i>${escapeHtml(text)}</i>`;
  messagesDiv.appendChild(div);
  div.scrollIntoView();
}

function addMsgToChat(nick, text, isSelf = false) {
  let messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;
  
  let div = document.createElement('div');
  div.className = 'message' + (isSelf ? ' self' : '');
  let displayNick = isSelf ? 'вы' : escapeHtml(nick);
  div.innerHTML = `<b>${displayNick}</b><br>${escapeHtml(text)}`;
  messagesDiv.appendChild(div);
  div.scrollIntoView();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function connectWebSocket() {
  ws = new WebSocket('wss://lessness-backend.onrender.com');
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      t: 'join',
      gid: curGroupId,
      nick: myNick
    }));
  };
  
  ws.onmessage = (ev) => {
    let msg = JSON.parse(ev.data);
    
    if (msg.t === 'joined') {
      myUserId = msg.userId;
      myNick = msg.nick;
      document.getElementById('current-nick').innerText = myNick;
      updateAvatarDisplay();
    }
    else if (msg.t === 'peers') {
      peers.clear();
      for (let p of msg.list) {
        peers.set(p.id, p.nick);
      }
      updatePeerList();
    }
    else if (msg.t === 'peer_joined') {
      addPeer(msg.id, msg.nick);
    }
    else if (msg.t === 'peer_left') {
      removePeer(msg.id);
    }
    else if (msg.t === 'peer_nick') {
      updatePeerNick(msg.id, msg.nick);
    }
    else if (msg.t === 'msg') {
      let isSelf = (msg.nick === myNick);
      addMsgToChat(msg.nick, msg.text, isSelf);
    }
    else if (msg.t === 'system') {
      addSystemMessage(msg.text);
    }
  };
  
  ws.onclose = () => {
    addSystemMessage('соединение потеряно, переподключение...');
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onerror = () => {
    addSystemMessage('ошибка соединения');
  };
}

function sendMsg(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('нет соединения с сервером');
    return false;
  }
  
  ws.send(JSON.stringify({
    t: 'msg',
    text: text
  }));
  return true;
}

function changeNick(newNick) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('не удалось сменить ник, нет соединения');
    return false;
  }
  
  ws.send(JSON.stringify({
    t: 'nick',
    nick: newNick
  }));
  return true;
}

let actionBtn = document.getElementById('action-btn');
let groupInput = document.getElementById('group-id-input');
let lastMode = null;

function animateButtonGlow() {
  if (!actionBtn) return;
  actionBtn.style.transform = 'scale(1)';
  actionBtn.style.boxShadow = '0 0 0 0 rgba(168, 85, 247, 0.7)';
  
  actionBtn.offsetHeight;
  
  actionBtn.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
  actionBtn.style.transform = 'scale(1.03)';
  actionBtn.style.boxShadow = '0 0 0 4px rgba(168, 85, 247, 0.4), 0 0 0 8px rgba(168, 85, 247, 0.2)';
  
  setTimeout(() => {
    if (actionBtn) {
      actionBtn.style.transform = 'scale(1)';
      actionBtn.style.boxShadow = '0 0 0 0 rgba(168, 85, 247, 0)';
      setTimeout(() => {
        if (actionBtn) actionBtn.style.transition = '';
      }, 200);
    }
  }, 200);
}

if (actionBtn && groupInput) {
  let btnImg = actionBtn.querySelector('img');
  let btnSpan = actionBtn.querySelector('span');
  
  function updateButtonMode(hasText) {
    if (hasText) {
      if (btnImg) btnImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='white' viewBox='0 0 24 24'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E";
      if (btnSpan) btnSpan.innerText = 'присоединиться';
      actionBtn.style.background = 'linear-gradient(135deg, #a855f7, #7c3aed)';
    } else {
      if (btnImg) btnImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='white' viewBox='0 0 24 24'%3E%3Cpath d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'/%3E%3C/svg%3E";
      if (btnSpan) btnSpan.innerText = 'создать группу';
      actionBtn.style.background = 'linear-gradient(135deg, #7c3aed, #a855f7)';
    }
  }
  
  groupInput.addEventListener('input', function() {
    let hasText = this.value.trim().length > 0;
    let currentMode = hasText ? 'join' : 'create';
    
    if (currentMode !== lastMode) {
      updateButtonMode(hasText);
      animateButtonGlow();
      lastMode = currentMode;
    }
  });
  
  let initialHasText = groupInput.value.trim().length > 0;
  lastMode = initialHasText ? 'join' : 'create';
  updateButtonMode(initialHasText);
  
  if (actionBtn) {
    actionBtn.onclick = () => {
      let gid = groupInput.value.trim();
      if (!gid) {
        gid = genGroupId();
        groupInput.value = gid;
      }
      let rawNick = document.getElementById('nick-input') ? document.getElementById('nick-input').value.trim() : loadNick();
      if (rawNick.length > 20) rawNick = rawNick.substring(0, 20);
      myNick = rawNick || loadNick();
      saveNick(myNick);
      curGroupId = gid;
      updateGroupDisplay();
      let loginView = document.getElementById('login-view');
      let chatView = document.getElementById('chat-view');
      if (loginView) loginView.classList.remove('active');
      if (chatView) chatView.classList.add('active');
      connectWebSocket();
    };
  }
}

let sendBtn = document.getElementById('send-btn');
let msgInput = document.getElementById('msg-input');

function handleSendMessage() {
  if (msgInput && msgInput.value.trim()) {
    sendMsg(msgInput.value.trim());
    msgInput.value = '';
  }
}

if (sendBtn) {
  sendBtn.onclick = handleSendMessage;
}

if (msgInput) {
  msgInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  });
}

let editNickBtn = document.getElementById('edit-nick-btn');
if (editNickBtn) {
  editNickBtn.onclick = () => {
    let newNick = prompt('новый ник (макс 20 символов):', myNick);
    if(newNick && newNick.trim()) { 
      let trimmed = newNick.trim();
      if (trimmed.length > 20) trimmed = trimmed.substring(0, 20);
      if (trimmed !== myNick) {
        myNick = trimmed;
        saveNick(myNick);
        document.getElementById('current-nick').innerText = myNick;
        updateAvatarDisplay();
        changeNick(myNick);
      }
    }
  };
}

let copyBtn = document.getElementById('copy-group-id');
if (copyBtn) {
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(curGroupId);
    let originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' fill=\'white\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z\'/%3E%3C/svg%3E" alt="copied">';
    setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000);
  };
}

let logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.onclick = () => {
    if(ws) ws.close();
    location.reload();
  };
}

let savedNick = loadNick();
let nickInputField = document.getElementById('nick-input');

if (nickInputField) {
  nickInputField.value = savedNick;
  nickInputField.maxLength = 20;
  nickInputField.addEventListener('input', function() {
    if (this.value.length > 20) this.value = this.value.substring(0, 20);
    updatePreviewOnNickChange();
  });
}

let preview = document.getElementById('avatar-preview');
if (preview) {
  preview.style.backgroundImage = '';
  preview.innerText = getFirstLetter(savedNick);
}

createFallingObjects();