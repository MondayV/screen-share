import type { SettingsData } from '../BananasTypes';
import { getRTCPeerConnectionConfig } from '../Config';

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:relay1.expressturn.com:3478', username: 'efree', credential: 'efree' },
    { urls: 'turn:relay2.expressturn.com:3478?transport=tcp', username: 'efree', credential: 'efree' }
  ]
};

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed';

export class WebRTCManager {
  private connections = new Map<string, RTCPeerConnection>();
  private displayStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private remoteVideoElement: HTMLVideoElement | null = null;
  private remoteCursorEnabled = false;
  private cursorPositionChannels = new Map<string, RTCDataChannel>();
  private cursorPingChannels = new Map<string, RTCDataChannel>();
  private remoteClickChannel: RTCDataChannel | null = null;
  private userSettings: SettingsData | null = null;
  private onStateChange: ((state: ConnectionState) => void) | null = null;
  private onRemoteClick: ((data: { type: string; x: number; y: number }) => void) | null = null;
  private onIceCandidate: ((peerId: string, candidate: RTCIceCandidateInit) => void) | null = null;

  setStateCallback(cb: (state: ConnectionState) => void): void {
    this.onStateChange = cb;
  }

  setRemoteClickCallback(cb: (data: { type: string; x: number; y: number }) => void): void {
    this.onRemoteClick = cb;
  }

  setIceCandidateCallback(cb: (peerId: string, candidate: RTCIceCandidateInit) => void): void {
    this.onIceCandidate = cb;
  }

  private updateState(state: ConnectionState): void {
    if (this.onStateChange) this.onStateChange(state);
  }

  async init(): Promise<void> {
    this.userSettings = await window.PcConnectApi.getSettings();
  }

  getAudioStream(): MediaStream | null {
    return this.audioStream;
  }

  hasAudioInput(): boolean {
    return this.audioStream !== null;
  }

  async setupLocalMedia(sourceId?: string): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      }).catch(() => null);
    } catch {
      this.audioStream = null;
    }

    try {
      if (sourceId) {
        this.displayStream = await navigator.mediaDevices.getUserMedia({
          video: {
            // @ts-ignore - Electron-specific Chrome MediaSource API
            mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId }
          },
          audio: false
        } as any);
      } else {
        this.displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
      }
    } catch (e) {
      console.error('Failed to get display media:', e);
      throw e;
    }

    if (this.audioStream && this.userSettings) {
      for (const track of this.audioStream.getAudioTracks()) {
        track.enabled = this.userSettings.isMicrophoneEnabledOnConnect;
      }
    }
  }

  async createConnectionForParticipant(peerId: string): Promise<RTCSessionDescriptionInit> {
    const config = await this.getConfig();
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, e.candidate);
      }
    };
    pc.oniceconnectionstatechange = () => {
      const states = Array.from(this.connections.values()).map(c => c.iceConnectionState);
      if (states.includes('connected')) {
        this.updateState('connected');
      } else if (states.every(s => s === 'failed' || s === 'closed')) {
        this.updateState('failed');
      } else if (states.every(s => s === 'closed')) {
        this.updateState('closed');
      }
    };

    // Add local tracks
    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        pc.addTrack(track, this.displayStream);
      }
    }
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        pc.addTrack(track, this.audioStream);
      }
    }

    // Create data channels for cursor control
    const cursorPosChannel = pc.createDataChannel('remoteMouseCursorPositions');
    const cursorPingChannel = pc.createDataChannel('remoteCursorPing');
    const clickChannel = pc.createDataChannel('remoteClick');
    this.setupDataChannel(pc, cursorPosChannel, peerId);
    this.setupDataChannel(pc, cursorPingChannel, peerId);
    this.setupClickChannel(pc, clickChannel);

    this.connections.set(peerId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.updateState('connecting');
    return pc.localDescription!;
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const config = await this.getConfig();
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (e.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, e.candidate);
      }
    };
    pc.oniceconnectionstatechange = () => {
      this.updateState(pc.iceConnectionState as ConnectionState);
    };
    pc.ontrack = (evt) => {
      if (this.remoteVideoElement) {
        this.remoteVideoElement.srcObject = evt.streams[0];
      }
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'remoteMouseCursorPositions') {
        this.setupDataChannel(pc, e.channel, peerId);
      }
      if (e.channel.label === 'remoteCursorPing') {
        this.setupDataChannel(pc, e.channel, peerId);
      }
      if (e.channel.label === 'remoteClick') {
        this.setupClickChannel(pc, e.channel);
      }
    };

    this.connections.set(peerId, pc);

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.updateState('connected');
    return pc.localDescription!;
  }

  setRemoteAnswer(peerId: string, answer: RTCSessionDescriptionInit): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.setRemoteDescription(answer);
    }
  }

  addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  setRemoteVideo(video: HTMLVideoElement): void {
    this.remoteVideoElement = video;
  }

  private setupDataChannel(pc: RTCPeerConnection, dc: RTCDataChannel, _peerId: string): void {
    if (dc.label === 'remoteMouseCursorPositions') {
      this.cursorPositionChannels.set(_peerId, dc);
      dc.onmessage = (e) => {
        if (!this.remoteCursorEnabled || !this.remoteVideoElement) return;
        const data = JSON.parse(e.data);
        window.PcConnectApi.updateRemoteCursor(data);
      };
    }
    if (dc.label === 'remoteCursorPing') {
      this.cursorPingChannels.set(_peerId, dc);
      dc.onmessage = (e) => {
        if (!this.remoteCursorEnabled || !this.remoteVideoElement) return;
        window.PcConnectApi.remoteCursorPing(e.data);
      };
    }
  }

  private setupClickChannel(pc: RTCPeerConnection, dc: RTCDataChannel): void {
    if (dc.label === 'remoteClick') {
      this.remoteClickChannel = dc;
      dc.onmessage = (e) => {
        if (this.onRemoteClick) {
          this.onRemoteClick(JSON.parse(e.data));
        }
      };
    }
  }

  toggleRemoteCursors(enabled: boolean): void {
    this.remoteCursorEnabled = enabled;
  }

  pingRemoteCursor(cursorId: string): void {
    for (const dc of this.cursorPingChannels.values()) {
      if (dc.readyState === 'open') dc.send(cursorId);
    }
  }

  updateRemoteCursor(data: { x: number; y: number; id: string; name: string; color: string }): void {
    for (const dc of this.cursorPositionChannels.values()) {
      if (dc.readyState === 'open') dc.send(JSON.stringify(data));
    }
  }

  sendRemoteClick(data: { type: string; x: number; y: number }): void {
    if (this.remoteClickChannel && this.remoteClickChannel.readyState === 'open') {
      this.remoteClickChannel.send(JSON.stringify(data));
    }
  }

  hostHandleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    this.addIceCandidate(peerId, candidate);
  }

  getPeerIceCandidateHandler(peerId: string): (e: RTCPeerConnectionIceEvent) => void {
    return (e) => {
      if (e.candidate) {
        this.addIceCandidate(peerId, e.candidate);
      }
    };
  }

  toggleDisplayStream(): void {
    if (this.displayStream) {
      for (const track of this.displayStream.getVideoTracks()) {
        track.enabled = !track.enabled;
      }
    }
  }

  toggleMicrophone(): void {
    if (this.audioStream) {
      for (const track of this.audioStream.getAudioTracks()) {
        track.enabled = !track.enabled;
      }
    }
  }

  isMicrophoneActive(): boolean {
    if (this.audioStream) {
      for (const track of this.audioStream.getAudioTracks()) {
        return track.enabled;
      }
    }
    return false;
  }

  removeConnection(peerId: string): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.close();
      this.connections.delete(peerId);
    }
    this.cursorPositionChannels.delete(peerId);
    this.cursorPingChannels.delete(peerId);
  }

  async disconnect(): Promise<void> {
    for (const [peerId, pc] of this.connections) {
      pc.close();
    }
    this.connections.clear();
    this.cursorPositionChannels.clear();
    this.cursorPingChannels.clear();
    this.remoteClickChannel = null;

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop();
      }
      this.displayStream = null;
    }
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        track.stop();
      }
      this.audioStream = null;
    }
    this.updateState('disconnected');
  }

  isConnected(): boolean {
    return Array.from(this.connections.values()).some(c => c.iceConnectionState === 'connected');
  }

  getPeerCount(): number {
    return this.connections.size;
  }

  getConnection(peerId: string): RTCPeerConnection | undefined {
    return this.connections.get(peerId);
  }

  private async getConfig(): Promise<RTCConfiguration> {
    try {
      const settings = await window.PcConnectApi.getSettings();
      if (settings.iceServers && settings.iceServers.length > 0) {
        return { iceServers: settings.iceServers };
      }
    } catch {}
    return DEFAULT_ICE_SERVERS;
  }
}
