const WORKER_URL = 'https://screen-share-signal.mondayv-screen-share.workers.dev';

let ws: WebSocket | null = null;
const listeners = new Map<string, Array<(msg: any) => void>>();

export function connectToRoom(roomCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close(); } catch {}
    }
    ws = new WebSocket(`${WORKER_URL}/room/${roomCode}`);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('信令连接失败'));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const cbs = listeners.get(msg.type);
      if (cbs) {
        cbs.forEach(cb => cb(msg));
      }
    };
    ws.onclose = () => {
      const cbs = listeners.get('close');
      if (cbs) cbs.forEach(cb => cb({}));
    };
  });
}

export function sendToAll(data: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

export function sendTo(peerId: string, data: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'targeted', target: peerId, ...data }));
  }
}

export function on(eventType: string, callback: (msg: any) => void): void {
  if (!listeners.has(eventType)) listeners.set(eventType, []);
  listeners.get(eventType)!.push(callback);
}

export function off(eventType: string, callback: (msg: any) => void): void {
  const cbs = listeners.get(eventType);
  if (cbs) {
    listeners.set(eventType, cbs.filter(cb => cb !== callback));
  }
}

export function closeSignaling(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  listeners.clear();
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ2346789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
