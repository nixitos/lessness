import asyncio
import json
import random
import string
import ssl
import websockets
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
import queue

# Dataclass'ы прямо здесь
@dataclass
class Message:
    nick: str
    text: str
    time: int
    is_self: bool = False

@dataclass
class Peer:
    id: str
    nick: str

class LessNessBot:
    def __init__(self, group_id: str, nick: str = None):
        self.group_id = group_id
        self.nick = nick or self._gen_nick()
        self.ws = None
        self.user_id = None
        self.peers: Dict[str, str] = {}
        self.is_running = False
        self._message_handlers: List[Callable] = []
        self._peer_join_handlers: List[Callable] = []
        self._peer_leave_handlers: List[Callable] = []
        self._peer_nick_handlers: List[Callable] = []
        
    def _gen_nick(self) -> str:
        return 'bot_' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    
    def on_message(self, handler: Callable[[Message], None]):
        self._message_handlers.append(handler)
        return handler
    
    def on_peer_join(self, handler: Callable[[str, str], None]):
        self._peer_join_handlers.append(handler)
        return handler
    
    def on_peer_leave(self, handler: Callable[[str, str], None]):
        self._peer_leave_handlers.append(handler)
        return handler
    
    def on_peer_nick(self, handler: Callable[[str, str, str], None]):
        self._peer_nick_handlers.append(handler)
        return handler
    
    async def _send(self, data: dict):
        if self.ws and self.ws.open:
            await self.ws.send(json.dumps(data))
    
    async def send_msg(self, text: str):
        await self._send({'t': 'msg', 'text': text})
    
    async def set_nick(self, new_nick: str):
        if new_nick and new_nick != self.nick:
            self.nick = new_nick
            await self._send({'t': 'nick', 'nick': new_nick})
    
    async def join(self):
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        async with websockets.connect("wss://lessness-backend.onrender.com", ssl=ssl_context) as websocket:
            self.ws = websocket
            self.is_running = True
            
            await self._send({
                't': 'join',
                'gid': self.group_id,
                'nick': self.nick
            })
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    pass
    
    async def _handle_message(self, data: dict):
        t = data.get('t')
        
        if t == 'joined':
            self.user_id = data.get('userId')
            self.nick = data.get('nick', self.nick)
            
        elif t == 'peers':
            self.peers = {}
            for p in data.get('list', []):
                self.peers[p['id']] = p['nick']
                
        elif t == 'peer_joined':
            pid = data.get('id')
            pnick = data.get('nick')
            if pid != self.user_id:
                self.peers[pid] = pnick
                for h in self._peer_join_handlers:
                    await self._call_handler(h, pid, pnick)
                
        elif t == 'peer_left':
            pid = data.get('id')
            if pid in self.peers:
                old_nick = self.peers.pop(pid)
                for h in self._peer_leave_handlers:
                    await self._call_handler(h, pid, old_nick)
                
        elif t == 'peer_nick':
            pid = data.get('id')
            new_nick = data.get('nick')
            if pid in self.peers:
                old_nick = self.peers[pid]
                self.peers[pid] = new_nick
                for h in self._peer_nick_handlers:
                    await self._call_handler(h, pid, old_nick, new_nick)
                
        elif t == 'msg':
            msg = Message(
                nick=data.get('nick'),
                text=data.get('text'),
                time=data.get('time', 0),
                is_self=(data.get('nick') == self.nick)
            )
            for h in self._message_handlers:
                await self._call_handler(h, msg)
    
    async def _call_handler(self, handler, *args):
        if asyncio.iscoroutinefunction(handler):
            await handler(*args)
        else:
            handler(*args)
    
    def get_peers(self) -> Dict[str, str]:
        return self.peers.copy()
    
    def get_peer_count(self) -> int:
        return len(self.peers)
    
    def is_connected(self) -> bool:
        return self.ws is not None and self.ws.open and self.is_running
    
    async def disconnect(self):
        self.is_running = False
        if self.ws:
            await self.ws.close()
            self.ws = None
    
    def run(self):
        asyncio.run(self.join())


class BotManager:
    def __init__(self):
        self.bots: List[LessNessBot] = []
        
    def create_bot(self, group_id: str, nick: str = None) -> LessNessBot:
        bot = LessNessBot(group_id, nick)
        self.bots.append(bot)
        return bot
    
    async def run_all(self):
        tasks = [bot.join() for bot in self.bots]
        await asyncio.gather(*tasks)
    
    def stop_all(self):
        for bot in self.bots:
            bot.is_running = False
    
    async def broadcast(self, text: str):
        tasks = [bot.send_msg(text) for bot in self.bots if bot.is_connected()]
        await asyncio.gather(*tasks)