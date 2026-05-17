export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'room' || !parts[1]) {
      return new Response('PC Connect Signaling — use /room/<code>', { status: 200 });
    }
    const roomCode = parts[1].toUpperCase().slice(0, 8);
    const id = env.ROOM.idFromName(roomCode);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map(); // webSocket -> { role, id }
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    const role = this.sessions.size === 0 ? 'host' : 'participant';
    const peerId = crypto.randomUUID();
    this.sessions.set(server, { role, id: peerId });

    if (role === 'participant') {
      for (const [ws, info] of this.sessions) {
        if (info.role === 'host') {
          ws.send(JSON.stringify({ type: 'participant-joined', peerId }));
        }
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const data = JSON.parse(raw);
    const sender = this.sessions.get(ws);
    if (!sender) return;

    if (data.type === 'targeted') {
      for (const [w, info] of this.sessions) {
        if (info.id === data.target) {
          w.send(JSON.stringify({ ...data, from: sender.id }));
          return;
        }
      }
      return;
    }

    for (const [w, info] of this.sessions) {
      if (w !== ws) {
        w.send(JSON.stringify({ ...data, from: sender.id }));
      }
    }
  }

  async webSocketClose(ws) {
    const info = this.sessions.get(ws);
    if (!info) return;
    for (const [w, other] of this.sessions) {
      if (w !== ws) w.send(JSON.stringify({ type: 'peer-left', peerId: info.id }));
    }
    this.sessions.delete(ws);

    if (info.role === 'host') {
      for (const [w] of this.sessions) {
        try { w.close(); } catch {}
      }
      this.sessions.clear();
    }
  }

  async webSocketError(ws, error) {
    console.error('WebSocket error:', error);
  }
}
