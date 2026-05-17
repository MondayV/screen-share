<script lang="ts">
  import { WebRTCManager, type ConnectionState } from './lib/webrtc';

  export let connectionState: string = 'disconnected';

  const manager = new WebRTCManager();

  manager.setStateCallback((state: ConnectionState) => {
    connectionState = state;
  });

  // Exposed methods for Host
  export function init(): Promise<void> { return manager.init(); }
  export function setupLocalMedia(sourceId?: string): Promise<void> { return manager.setupLocalMedia(sourceId); }
  export function createConnectionForParticipant(peerId: string): Promise<RTCSessionDescriptionInit> { return manager.createConnectionForParticipant(peerId); }
  export function setRemoteAnswer(peerId: string, answer: RTCSessionDescriptionInit): void { manager.setRemoteAnswer(peerId, answer); }
  export function addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void { manager.addIceCandidate(peerId, candidate); }

  // Exposed methods for Participant
  export function setRemoteVideo(video: HTMLVideoElement): void { manager.setRemoteVideo(video); }
  export function handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> { return manager.handleOffer(peerId, offer); }

  // ICE candidate forwarding
  export function setIceCandidateCallback(cb: (peerId: string, candidate: RTCIceCandidateInit) => void): void { manager.setIceCandidateCallback(cb); }

  // Common methods
  export function toggleDisplayStream(): void { manager.toggleDisplayStream(); }
  export function toggleMicrophone(): void { manager.toggleMicrophone(); }
  export function isMicrophoneActive(): boolean { return manager.isMicrophoneActive(); }
  export function hasAudioInput(): boolean { return manager.hasAudioInput(); }
  export function getAudioStream(): MediaStream | null { return manager.getAudioStream(); }
  export function isConnected(): boolean { return manager.isConnected(); }
  export function disconnect(): Promise<void> { return manager.disconnect(); }
  export function getPeerCount(): number { return manager.getPeerCount(); }
  export function removeConnection(peerId: string): void { manager.removeConnection(peerId); }

  // Cursor control
  export function toggleRemoteCursors(enabled: boolean): void { manager.toggleRemoteCursors(enabled); }
  export function pingRemoteCursor(cursorId: string): void { manager.pingRemoteCursor(cursorId); }
  export function updateRemoteCursor(data: { x: number; y: number; id: string; name: string; color: string }): void { manager.updateRemoteCursor(data); }
  export function sendRemoteClick(data: { type: string; x: number; y: number }): void { manager.sendRemoteClick(data); }
  export function setRemoteClickCallback(cb: (data: { type: string; x: number; y: number }) => void): void { manager.setRemoteClickCallback(cb); }

  // Legacy compatibility - for gradual migration
  export async function Setup(v?: HTMLVideoElement): Promise<void> {
    await manager.init();
    if (v) manager.setRemoteVideo(v);
  }

  export async function Connect(c: RTCSessionDescriptionInit): Promise<void> {
    // Legacy: used by participant to connect with old URL-based flow
    // New code uses handleOffer instead
  }

  export async function CreateHostUrl(data: { username: string }): Promise<string> {
    // Legacy: returns empty string, new code uses signaling
    return '';
  }

  export async function CreateParticipantUrl(c: RTCSessionDescriptionInit, data: { username: string }): Promise<string> {
    // Legacy: returns empty string, new code uses signaling
    return '';
  }

  export function ToggleDisplayStream(): void { manager.toggleDisplayStream(); }
  export function ToggleMicrophone(): void { manager.toggleMicrophone(); }
  export function HasAudioInput(): boolean { return manager.hasAudioInput(); }
  export function GetAudioStream(): MediaStream | null { return manager.getAudioStream(); }
  export function IsConnected(): boolean { return manager.isConnected(); }
  export function Disconnect(): Promise<void> { return manager.disconnect(); }
  export function ToggleRemoteCursors(enabled: boolean): void { manager.toggleRemoteCursors(enabled); }
  export function PingRemoteCursor(cursorId: string): void { manager.pingRemoteCursor(cursorId); }
  export function UpdateRemoteCursor(data: { x: number; y: number; id: string; name: string; color: string }): void { manager.updateRemoteCursor(data); }
</script>
