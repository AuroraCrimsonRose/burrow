/**
 * Voice Engine — WebRTC P2P mesh for voice channels.
 *
 * - Joins voice:{server_id} Phoenix channel for signaling
 * - Acquires microphone via getUserMedia
 * - Creates RTCPeerConnection per peer (mesh topology)
 * - Exchanges offer/answer/ICE via Phoenix channel
 * - Handles mute/deafen locally
 * - Emits state changes via callbacks
 */

import { Socket, Channel } from 'phoenix';

// ── Types ──

export type StreamKind = 'camera' | 'screen';
export type DisplaySurface = 'monitor' | 'window' | 'browser';

export interface VideoStreamInfo {
  kind: StreamKind;
  /** For screens: an ID to differentiate multiple screen shares */
  screenId?: string;
  stream: MediaStream;
}

export interface VoiceUser {
  user_id: string;
  channel_id: string;
  server_id: string;
  self_mute: boolean;
  self_deaf: boolean;
  self_video: { camera: boolean; screens: string[] };
}

export interface VoiceCallbacks {
  onStateChange: (state: VoiceEngineState) => void;
  onVoiceStates: (states: VoiceUser[]) => void;
  onSpeaking: (userId: string, speaking: boolean) => void;
  onError: (error: string) => void;
  onRemoteVideo?: (userId: string, streamKey: string, stream: MediaStream | null) => void;
}

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected';

export type PeerConnectionStatus = 'idle' | 'negotiating' | 'connected' | 'no-route' | 'failed';

export type VoiceQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface VoiceEngineState {
  connectionState: VoiceConnectionState;
  peerStatus: PeerConnectionStatus;
  channelId: string | null;
  serverId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: { camera: boolean; screens: string[] };
}

// ── Audio analysis for speaking detection ──

const SPEAKING_THRESHOLD = 0.015;
const SPEAKING_CHECK_INTERVAL = 100;

// ── Audio device preferences (persisted in localStorage) ──

const AUDIO_PREFS_KEY = 'burrow_audio_prefs';

export interface AudioPrefs {
  inputDeviceId: string;  // '' = default
  outputDeviceId: string; // '' = default
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

const defaultPrefs: AudioPrefs = {
  inputDeviceId: '',
  outputDeviceId: '',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

function loadAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultPrefs };
}

function saveAudioPrefs(prefs: AudioPrefs) {
  localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(prefs));
}

let audioPrefs: AudioPrefs = loadAudioPrefs();

export function getAudioPrefs(): AudioPrefs {
  return { ...audioPrefs };
}

export function setAudioPrefs(update: Partial<AudioPrefs>) {
  audioPrefs = { ...audioPrefs, ...update };
  saveAudioPrefs(audioPrefs);
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  // Need a temporary stream to get permission for device labels
  let tempStream: MediaStream | null = null;
  try {
    tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // If denied, return what we can
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const audio = devices
    .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || (d.kind === 'audioinput' ? `Microphone ${d.deviceId.slice(0, 4)}` : `Speaker ${d.deviceId.slice(0, 4)}`),
      kind: d.kind as 'audioinput' | 'audiooutput',
    }));

  if (tempStream) {
    tempStream.getTracks().forEach((t) => t.stop());
  }

  return audio;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export async function enumerateCameraDevices(): Promise<CameraDevice[]> {
  let tempStream: MediaStream | null = null;
  try {
    tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    // If denied, return what we can
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
    }));

  if (tempStream) {
    tempStream.getTracks().forEach((t) => t.stop());
  }

  return cameras;
}

/** Apply output device to all current remote audio elements */
export async function applyOutputDevice(deviceId: string) {
  for (const [, audio] of remoteAudioElements) {
    if ('setSinkId' in audio) {
      try {
        await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      } catch { /* unsupported or denied */ }
    }
  }
}

/** Set per-user audio volume (0–2, where 1 = 100%, 2 = 200%). */
export function setUserVolume(userId: string, volume: number) {
  const clamped = Math.max(0, Math.min(2, volume));
  const gain = remoteGainNodes.get(userId);
  if (gain) gain.gain.value = clamped;
  // For volumes <= 1 also set the element volume as fallback
  const audio = remoteAudioElements.get(userId);
  if (audio) audio.volume = Math.min(1, clamped);
}

// ── Engine ──

let socket: Socket | null = null;
let voiceChannel: Channel | null = null;
let localStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let speakingInterval: ReturnType<typeof setInterval> | null = null;
const peers: Map<string, RTCPeerConnection> = new Map();
const pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
const remoteStreams: Map<string, MediaStream> = new Map();
const remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
const remoteGainNodes: Map<string, GainNode> = new Map();
const remoteAudioContexts: Map<string, AudioContext> = new Map();
let turnCredentials: { username: string; credential: string; urls: string[] } | null = null;
let callbacks: VoiceCallbacks | null = null;
let currentUserId: string | null = null;
/** Tracked voice users for state restoration on component remount */
let trackedVoiceUsers: VoiceUser[] = [];
let localVideoStream: MediaStream | null = null;
/** Screen share streams keyed by screenId */
const localScreenStreams: Map<string, MediaStream> = new Map();
/** Video senders: Map<peerId, Map<streamKey, RTCRtpSender>> */
const videoSenders: Map<string, Map<string, RTCRtpSender>> = new Map();
let screenIdCounter = 0;
/** When true, force TURN relay (no P2P). Set per-connection by connectVoice. */
let forceRelay = false;
/** Synchronous lock to prevent duplicate offer processing per peer. */
const negotiationLock = new Set<string>();

let state: VoiceEngineState = {
  connectionState: 'disconnected',
  peerStatus: 'idle',
  channelId: null,
  serverId: null,
  selfMute: false,
  selfDeaf: false,
  selfVideo: { camera: false, screens: [] },
};

function setState(update: Partial<VoiceEngineState>) {
  state = { ...state, ...update };
  callbacks?.onStateChange(state);
}

export function getVoiceState(): VoiceEngineState {
  return { ...state };
}

export function getRemoteStreams(): Map<string, MediaStream> {
  return remoteStreams;
}

/** Replace callbacks without disconnecting — used when the UI component remounts. */
export function updateCallbacks(cbs: VoiceCallbacks) {
  callbacks = cbs;
}

/** Return the last-known voice user list (for state restoration on remount). */
export function getVoiceUsers(): VoiceUser[] {
  return [...trackedVoiceUsers];
}

/** Measure connection quality by averaging RTT across all peer connections. */
export async function getConnectionQuality(): Promise<VoiceQuality> {
  if (state.connectionState !== 'connected' || peers.size === 0) return 'unknown';

  let totalRtt = 0;
  let count = 0;

  for (const [, pc] of peers) {
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
          totalRtt += report.currentRoundTripTime;
          count++;
        }
      });
    } catch { /* peer may be closing */ }
  }

  if (count === 0) return 'unknown';
  const avgRtt = (totalRtt / count) * 1000; // Convert to ms
  if (avgRtt < 50) return 'excellent';
  if (avgRtt < 100) return 'good';
  if (avgRtt < 200) return 'fair';
  return 'poor';
}

/** Detailed connection debug info for the debug card. */
export interface VoiceDebugInfo {
  peerCount: number;
  avgRttMs: number | null;
  localCandidate: string | null;
  remoteCandidate: string | null;
  candidateType: string | null;
  protocol: string | null;
  codec: string | null;
  bytesSent: number | null;
  bytesReceived: number | null;
  packetsSent: number | null;
  packetsReceived: number | null;
  packetsLost: number | null;
  jitter: number | null;
  channelId: string | null;
  serverId: string | null;
}

export async function getConnectionDebug(): Promise<VoiceDebugInfo> {
  const info: VoiceDebugInfo = {
    peerCount: peers.size,
    avgRttMs: null,
    localCandidate: null,
    remoteCandidate: null,
    candidateType: null,
    protocol: null,
    codec: null,
    bytesSent: null,
    bytesReceived: null,
    packetsSent: null,
    packetsReceived: null,
    packetsLost: null,
    jitter: null,
    channelId: state.channelId,
    serverId: state.serverId,
  };

  if (state.connectionState !== 'connected' || peers.size === 0) return info;

  let totalRtt = 0;
  let rttCount = 0;

  for (const [, pc] of peers) {
    try {
      const stats = await pc.getStats();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidateMap = new Map<string, any>();

      // First pass: index all candidates so lookups in second pass always succeed
      stats.forEach((report) => {
        if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
          candidateMap.set(report.id, report);
        }
      });

      // Second pass: process pairs, RTP, codecs
      stats.forEach((report) => {
        // Active candidate pair
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') {
            totalRtt += report.currentRoundTripTime;
            rttCount++;
          }
          if (typeof report.bytesSent === 'number') info.bytesSent = (info.bytesSent || 0) + report.bytesSent;
          if (typeof report.bytesReceived === 'number') info.bytesReceived = (info.bytesReceived || 0) + report.bytesReceived;

          // Get candidate details
          const localCand = report.localCandidateId ? candidateMap.get(report.localCandidateId) : null;
          const remoteCand = report.remoteCandidateId ? candidateMap.get(report.remoteCandidateId) : null;
          if (localCand && !info.localCandidate) {
            info.localCandidate = `${localCand.address || localCand.ip || '?'}:${localCand.port || '?'}`;
            info.candidateType = localCand.candidateType || null;
            info.protocol = localCand.protocol || null;
          }
          if (remoteCand && !info.remoteCandidate) {
            info.remoteCandidate = `${remoteCand.address || remoteCand.ip || '?'}:${remoteCand.port || '?'}`;
          }
        }

        // Inbound RTP — packet loss and jitter
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          if (typeof report.packetsReceived === 'number') info.packetsReceived = (info.packetsReceived || 0) + report.packetsReceived;
          if (typeof report.packetsLost === 'number') info.packetsLost = (info.packetsLost || 0) + report.packetsLost;
          if (typeof report.jitter === 'number' && (info.jitter === null || report.jitter > info.jitter)) info.jitter = report.jitter;
        }

        // Outbound RTP
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          if (typeof report.packetsSent === 'number') info.packetsSent = (info.packetsSent || 0) + report.packetsSent;
        }

        // Codec
        if (report.type === 'codec' && report.mimeType && !info.codec) {
          info.codec = report.mimeType.replace('audio/', '');
        }
      });
    } catch { /* peer may be closing */ }
  }

  info.avgRttMs = rttCount > 0 ? Math.round((totalRtt / rttCount) * 1000) : null;
  return info;
}

// ── Connect to voice ──

export async function connectVoice(
  phoenixSocket: Socket,
  serverId: string,
  channelId: string,
  userId: string,
  cbs: VoiceCallbacks,
  opts?: { relay?: boolean },
) {
  callbacks = cbs;
  currentUserId = String(userId);
  socket = phoenixSocket;
  forceRelay = opts?.relay ?? false;

  setState({ connectionState: 'connecting', serverId: String(serverId), channelId: String(channelId) });

  // Join voice:{server_id} signaling channel
  voiceChannel = socket.channel(`voice:${serverId}`, {});

  voiceChannel.on('voice_state_update', (payload: Record<string, unknown>) => {
    handleVoiceStateUpdate(payload as unknown as VoiceUser);
  });

  voiceChannel.on('rtc_offer', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    const match = toStr === currentUserId || !payload.to;
    console.log('[voice] rtc_offer received', { to: payload.to, toType: typeof payload.to, me: currentUserId, meType: typeof currentUserId, match });
    if (match) {
      handleOffer(String(payload.from), payload.sdp as RTCSessionDescriptionInit);
    }
  });

  voiceChannel.on('rtc_answer', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    const match = toStr === currentUserId || !payload.to;
    console.log('[voice] rtc_answer received', { to: payload.to, toType: typeof payload.to, me: currentUserId, match });
    if (match) {
      handleAnswer(String(payload.from), payload.sdp as RTCSessionDescriptionInit);
    }
  });

  voiceChannel.on('rtc_ice', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    const match = toStr === currentUserId || !payload.to;
    if (match) {
      console.log('[voice] rtc_ice accepted from', String(payload.from));
      handleIceCandidate(String(payload.from), payload.candidate as RTCIceCandidateInit);
    }
  });

  return new Promise<void>((resolve, reject) => {
    voiceChannel!.join()
      .receive('ok', async (resp: Record<string, unknown>) => {
        // Use the backend's canonical stringified user ID to avoid
        // JavaScript BigInt precision loss on Snowflake IDs (>2^53)
        if (resp.self_user_id) {
          const canonical = String(resp.self_user_id);
          if (canonical !== currentUserId) {
            console.warn('[voice] fixing currentUserId precision:', currentUserId, '->', canonical);
          }
          currentUserId = canonical;
        }
        console.log('[voice] joined signaling channel, self:', currentUserId);

        // Emit initial voice states
        if (resp.voice_states) {
          trackedVoiceUsers = resp.voice_states as VoiceUser[];
          callbacks?.onVoiceStates(trackedVoiceUsers);
        }

        try {
          // Get TURN credentials
          await requestTurnCredentials();

          // Get microphone with user preferences
          const audioConstraints: MediaTrackConstraints = {
            echoCancellation: audioPrefs.echoCancellation,
            noiseSuppression: audioPrefs.noiseSuppression,
            autoGainControl: audioPrefs.autoGainControl,
            sampleRate: 48000,
          };
          if (audioPrefs.inputDeviceId) {
            audioConstraints.deviceId = { exact: audioPrefs.inputDeviceId };
          }
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });

          // Set up speaking detection
          setupSpeakingDetection(localStream);

          // Join the voice channel
          voiceChannel!.push('voice_join', { channel_id: channelId })
            .receive('ok', (joinResp: Record<string, unknown>) => {
              console.log('[voice] joined voice channel', joinResp);

              // Double-check canonical user ID from voice_state
              const vs = joinResp.voice_state as VoiceUser | undefined;
              if (vs?.user_id && String(vs.user_id) !== currentUserId) {
                console.warn('[voice] fixing currentUserId from voice_state:', currentUserId, '->', String(vs.user_id));
                currentUserId = String(vs.user_id);
              }

              setState({ connectionState: 'connected' });

              // Connect to existing peers
              const existingPeers: VoiceUser[] = (joinResp.peers as VoiceUser[]) || [];
              for (const peer of existingPeers) {
                if (String(peer.user_id) !== currentUserId) {
                  createPeerConnection(String(peer.user_id), true);
                }
              }

              resolve();
            })
            .receive('error', (err: Record<string, unknown>) => {
              console.error('[voice] failed to join voice channel:', err);
              callbacks?.onError(String(err?.reason || 'Failed to join voice channel'));
              cleanup();
              reject(err);
            });
        } catch (err) {
          console.error('[voice] mic/setup error:', err);
          callbacks?.onError('Failed to access microphone');
          cleanup();
          reject(err);
        }
      })
      .receive('error', (err: Record<string, unknown>) => {
        console.error('[voice] failed to join signaling:', err);
        callbacks?.onError('Failed to connect');
        reject(err);
      });
  });
}

// ── Disconnect ──

export function disconnectVoice() {
  if (voiceChannel) {
    // Send appropriate leave message depending on channel type
    if (state.serverId?.startsWith('dm:')) {
      voiceChannel.push('dm_call_leave', {});
    } else {
      voiceChannel.push('voice_leave', {});
    }
    voiceChannel.leave();
    voiceChannel = null;
  }
  cleanup();
  trackedVoiceUsers = [];
  setState({
    connectionState: 'disconnected',
    peerStatus: 'idle',
    channelId: null,
    serverId: null,
    selfMute: false,
    selfDeaf: false,
    selfVideo: { camera: false, screens: [] },
  });
}

/**
 * Connect to a DM voice call.
 * Uses dm_voice:{dmId} signaling channel for 1-on-1 calls.
 */
export async function connectDmVoice(
  phoenixSocket: Socket,
  dmId: string,
  userId: string,
  peerId: string,
  cbs: VoiceCallbacks,
) {
  callbacks = cbs;
  currentUserId = String(userId);
  socket = phoenixSocket;
  forceRelay = false;

  setState({ connectionState: 'connecting', serverId: `dm:${dmId}`, channelId: dmId });

  voiceChannel = socket.channel(`dm_voice:${dmId}`, {});

  voiceChannel.on('rtc_offer', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    if (toStr === currentUserId || !payload.to) {
      handleOffer(String(payload.from), payload.sdp as RTCSessionDescriptionInit);
    }
  });

  voiceChannel.on('rtc_answer', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    if (toStr === currentUserId || !payload.to) {
      handleAnswer(String(payload.from), payload.sdp as RTCSessionDescriptionInit);
    }
  });

  voiceChannel.on('rtc_ice', (payload: Record<string, unknown>) => {
    const toStr = String(payload.to);
    if (toStr === currentUserId || !payload.to) {
      handleIceCandidate(String(payload.from), payload.candidate as RTCIceCandidateInit);
    }
  });

  voiceChannel.on('dm_call_peer_joined', (payload: Record<string, unknown>) => {
    const joinedId = String(payload.user_id);
    if (joinedId !== currentUserId) {
      console.log('[dm-voice] peer joined:', joinedId);
      createPeerConnection(joinedId, true);
      // Update tracked voice users
      trackedVoiceUsers = [
        { user_id: currentUserId, self_mute: state.selfMute, self_deaf: state.selfDeaf, self_video: state.selfVideo } as VoiceUser,
        { user_id: joinedId, self_mute: false, self_deaf: false, self_video: { camera: false, screens: [] } } as VoiceUser,
      ];
      callbacks?.onVoiceStates(trackedVoiceUsers);
    }
  });

  voiceChannel.on('dm_call_peer_left', (payload: Record<string, unknown>) => {
    const leftId = String(payload.user_id);
    if (leftId !== currentUserId) {
      console.log('[dm-voice] peer left:', leftId);
      removePeer(leftId);
      trackedVoiceUsers = trackedVoiceUsers.filter(u => String(u.user_id) !== leftId);
      callbacks?.onVoiceStates(trackedVoiceUsers);
    }
  });

  return new Promise<void>((resolve, reject) => {
    voiceChannel!.join()
      .receive('ok', async (resp: Record<string, unknown>) => {
        if (resp.self_user_id) {
          const canonical = String(resp.self_user_id);
          if (canonical !== currentUserId) currentUserId = canonical;
        }
        console.log('[dm-voice] joined signaling channel, self:', currentUserId);

        try {
          // Get TURN credentials
          await requestTurnCredentials();

          // Get microphone
          const audioConstraints: MediaTrackConstraints = {
            echoCancellation: audioPrefs.echoCancellation,
            noiseSuppression: audioPrefs.noiseSuppression,
            autoGainControl: audioPrefs.autoGainControl,
            sampleRate: 48000,
          };
          if (audioPrefs.inputDeviceId) {
            audioConstraints.deviceId = { exact: audioPrefs.inputDeviceId };
          }
          localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
          setupSpeakingDetection(localStream);

          // Announce join
          voiceChannel!.push('dm_call_join', {});

          setState({ connectionState: 'connected' });

          // If we know the peer, create connection immediately (caller initiates)
          if (peerId && peerId !== currentUserId) {
            createPeerConnection(peerId, true);
          }

          resolve();
        } catch (err) {
          console.error('[dm-voice] mic/setup error:', err);
          callbacks?.onError('Failed to access microphone');
          cleanup();
          reject(err);
        }
      })
      .receive('error', (err: Record<string, unknown>) => {
        console.error('[dm-voice] failed to join signaling:', err);
        callbacks?.onError('Failed to connect DM call');
        reject(err);
      });
  });
}

function cleanup() {
  // Stop speaking detection
  if (speakingInterval) {
    clearInterval(speakingInterval);
    speakingInterval = null;
  }

  // Close audio context
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyser = null;
  }

  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  // Stop local video stream
  if (localVideoStream) {
    localVideoStream.getTracks().forEach((t) => t.stop());
    localVideoStream = null;
  }

  // Stop all screen share streams
  for (const [, stream] of localScreenStreams) {
    stream.getTracks().forEach((t) => t.stop());
  }
  localScreenStreams.clear();
  videoSenders.clear();

  // Close all peer connections
  for (const [, pc] of peers) {
    pc.close();
  }
  peers.clear();
  pendingCandidates.clear();
  negotiationLock.clear();

  // Clean up remote audio elements
  for (const [, audio] of remoteAudioElements) {
    audio.pause();
    audio.srcObject = null;
  }
  remoteAudioElements.clear();
  for (const [, ctx] of remoteAudioContexts) ctx.close().catch(() => {});
  remoteAudioContexts.clear();
  remoteGainNodes.clear();
  remoteStreams.clear();

  turnCredentials = null;
}

// ── Mute / Deafen ──

export function toggleMute() {
  const newMute = !state.selfMute;
  setState({ selfMute: newMute });

  // Mute local mic track
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !newMute;
    });
  }

  // Notify server
  voiceChannel?.push('voice_state', { self_mute: newMute });
}

export function toggleDeafen() {
  const newDeaf = !state.selfDeaf;
  // If deafening, also mute
  const newMute = newDeaf ? true : state.selfMute;
  setState({ selfDeaf: newDeaf, selfMute: newMute });

  // Mute local mic
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !newMute;
    });
  }

  // Mute all remote audio
  for (const [, audio] of remoteAudioElements) {
    audio.muted = newDeaf;
  }

  voiceChannel?.push('voice_state', { self_mute: newMute, self_deaf: newDeaf });
}

// ── Video / Screen Share ──

function pushVideoState() {
  const screens = [...localScreenStreams.keys()];
  const selfVideo = { camera: !!localVideoStream, screens };
  setState({ selfVideo });
  voiceChannel?.push('voice_state', { self_video: selfVideo });
}

function addTrackToPeers(streamKey: string, track: MediaStreamTrack, stream: MediaStream) {
  for (const [peerId, pc] of peers) {
    const sender = pc.addTrack(track, stream);
    let senderMap = videoSenders.get(peerId);
    if (!senderMap) { senderMap = new Map(); videoSenders.set(peerId, senderMap); }
    senderMap.set(streamKey, sender);
  }
  for (const [peerId] of peers) renegotiate(peerId);
}

function removeTrackFromPeers(streamKey: string) {
  for (const [peerId, pc] of peers) {
    const senderMap = videoSenders.get(peerId);
    const sender = senderMap?.get(streamKey);
    if (sender && pc) {
      try { pc.removeTrack(sender); } catch { /* ok */ }
    }
    senderMap?.delete(streamKey);
  }
  for (const [peerId] of peers) renegotiate(peerId);
}

/** Toggle camera on/off. */
export async function toggleCamera(deviceId?: string): Promise<void> {
  if (state.connectionState !== 'connected') return;

  if (localVideoStream) {
    // Turn off camera
    removeTrackFromPeers('camera');
    localVideoStream.getVideoTracks().forEach((t) => t.stop());
    localVideoStream = null;
    pushVideoState();
  } else {
    // Turn on camera
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        audio: false,
      };
      localVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = localVideoStream.getVideoTracks()[0];
      if (!videoTrack) return;
      addTrackToPeers('camera', videoTrack, localVideoStream);
      pushVideoState();
    } catch (err) {
      console.error('[voice] camera error:', err);
      callbacks?.onError('Failed to access camera');
    }
  }
}

/** Start a screen share (specific monitor, application, or browser tab). Returns the screenId or null on cancel. */
export async function startScreenShare(surface?: DisplaySurface): Promise<string | null> {
  if (state.connectionState !== 'connected') return null;
  if (localScreenStreams.size >= 3) {
    callbacks?.onError('Maximum 3 screen shares');
    return null;
  }

  try {
    const displayMediaOpts: DisplayMediaStreamOptions = {
      video: {
        frameRate: { ideal: 30, max: 30 },
        ...(surface ? { displaySurface: surface } : {}),
      } as MediaTrackConstraints,
      audio: false,
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOpts);
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) { stream.getTracks().forEach((t) => t.stop()); return null; }

    const screenId = `screen_${++screenIdCounter}`;
    localScreenStreams.set(screenId, stream);

    // When user stops sharing via browser UI
    videoTrack.addEventListener('ended', () => {
      stopScreenShare(screenId);
    });

    addTrackToPeers(screenId, videoTrack, stream);
    pushVideoState();
    return screenId;
  } catch (err) {
    // User cancelled the picker — not an error
    if ((err as DOMException)?.name === 'NotAllowedError') return null;
    console.error('[voice] screen share error:', err);
    callbacks?.onError('Failed to share screen');
    return null;
  }
}

/** Stop a specific screen share. */
export function stopScreenShare(screenId: string) {
  const stream = localScreenStreams.get(screenId);
  if (!stream) return;
  removeTrackFromPeers(screenId);
  stream.getTracks().forEach((t) => t.stop());
  localScreenStreams.delete(screenId);
  pushVideoState();
}

/** Legacy toggle — kept for backward compat, maps to toggleCamera. */
export async function toggleVideo(): Promise<void> {
  return toggleCamera();
}

/** Get the local camera stream for rendering. */
export function getLocalVideoStream(): MediaStream | null {
  return localVideoStream;
}

/** Get all local video streams (camera + screens) keyed by streamKey. */
export function getLocalStreams(): Map<string, { kind: StreamKind; stream: MediaStream }> {
  const result = new Map<string, { kind: StreamKind; stream: MediaStream }>();
  if (localVideoStream) result.set('camera', { kind: 'camera', stream: localVideoStream });
  for (const [id, s] of localScreenStreams) result.set(id, { kind: 'screen', stream: s });
  return result;
}

// ── Adaptive Bitrate ──

const BITRATE_CHECK_INTERVAL = 5000;
let bitrateInterval: ReturnType<typeof setInterval> | null = null;
let lastBytesSent = 0;
let lastBytesTime = 0;

function startBitrateMonitor() {
  if (bitrateInterval) return;
  lastBytesSent = 0;
  lastBytesTime = performance.now();
  bitrateInterval = setInterval(checkAndAdaptBitrate, BITRATE_CHECK_INTERVAL);
}

function stopBitrateMonitor() {
  if (bitrateInterval) { clearInterval(bitrateInterval); bitrateInterval = null; }
}

async function checkAndAdaptBitrate() {
  if (peers.size === 0) return;

  let totalPacketsLost = 0;
  let totalPackets = 0;
  let totalBytesSent = 0;

  for (const [, pc] of peers) {
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          totalBytesSent += report.bytesSent || 0;
          totalPackets += report.packetsSent || 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          totalPacketsLost += report.packetsLost || 0;
          totalPackets += report.packetsReceived || 0;
        }
      });
    } catch { /* ok */ }
  }

  // Calculate loss ratio
  const lossRatio = totalPackets > 0 ? totalPacketsLost / totalPackets : 0;
  const now = performance.now();
  const elapsed = (now - lastBytesTime) / 1000;
  // Track bandwidth for future telemetry
  void (elapsed > 0 ? ((totalBytesSent - lastBytesSent) * 8) / elapsed : 0);
  lastBytesSent = totalBytesSent;
  lastBytesTime = now;

  // If loss > 5%, reduce quality
  if (lossRatio > 0.05) {
    for (const [, pc] of peers) {
      const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
      for (const sender of senders) {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) continue;
        const current = params.encodings[0].maxBitrate || 800000;
        const reduced = Math.max(100000, Math.round(current * 0.7));
        params.encodings[0].maxBitrate = reduced;
        try { await sender.setParameters(params); } catch { /* ok */ }
      }
    }
    console.log(`[voice] Reducing video bitrate (loss: ${(lossRatio * 100).toFixed(1)}%)`);
  } else if (lossRatio < 0.01) {
    // Loss is low, try to increase
    for (const [, pc] of peers) {
      const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
      for (const sender of senders) {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) continue;
        const current = params.encodings[0].maxBitrate || 400000;
        const increased = Math.min(1500000, Math.round(current * 1.2));
        params.encodings[0].maxBitrate = increased;
        try { await sender.setParameters(params); } catch { /* ok */ }
      }
    }
  }
}

/** Renegotiate a peer connection (create new offer). */
function renegotiate(peerId: string) {
  const pc = peers.get(peerId);
  if (!pc) return;
  pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      voiceChannel?.push('rtc_offer', {
        to: peerId,
        sdp: pc.localDescription?.toJSON(),
      });
    })
    .catch((err) => console.error('[voice] renegotiate error:', err));
}

// ── TURN Credentials ──

function requestTurnCredentials(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!voiceChannel) return reject('No voice channel');
    voiceChannel.push('turn_credentials', {})
      .receive('ok', (creds: Record<string, unknown>) => {
        turnCredentials = creds as unknown as { username: string; credential: string; urls: string[] };
        console.log('[voice] TURN credentials received:', {
          username: turnCredentials.username,
          urls: turnCredentials.urls,
          hasCredential: !!turnCredentials.credential,
        });
        resolve();
      })
      .receive('error', () => {
        // Proceed without TURN — STUN may still work
        console.warn('[voice] failed to get TURN credentials, continuing with STUN only');
        resolve();
      });
  });
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  if (turnCredentials) {
    // TURN response includes stun:, turn: UDP, and turn: TCP URLs
    servers.push({
      urls: turnCredentials.urls,
      username: turnCredentials.username,
      credential: turnCredentials.credential,
    });
  } else {
    // Fallback public STUN when TURN credentials unavailable
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  return servers;
}

// ── Peer Connection Management ──

function createPeerConnection(peerId: string, initiator: boolean) {
  if (peers.has(peerId)) return;

  const pc = new RTCPeerConnection({
    iceServers: getIceServers(),
    iceCandidatePoolSize: 4,
    iceTransportPolicy: forceRelay ? 'relay' : 'all',
  });

  console.log('[voice] createPeerConnection', peerId, { initiator, forceRelay, iceServers: getIceServers() });

  peers.set(peerId, pc);

  // Add local audio tracks
  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  // Add local camera track if camera is on
  if (localVideoStream) {
    const videoTrack = localVideoStream.getVideoTracks()[0];
    if (videoTrack) {
      const sender = pc.addTrack(videoTrack, localVideoStream);
      let senderMap = videoSenders.get(peerId);
      if (!senderMap) { senderMap = new Map(); videoSenders.set(peerId, senderMap); }
      senderMap.set('camera', sender);
    }
  }

  // Add local screen share tracks
  for (const [screenId, stream] of localScreenStreams) {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const sender = pc.addTrack(videoTrack, stream);
      let senderMap = videoSenders.get(peerId);
      if (!senderMap) { senderMap = new Map(); videoSenders.set(peerId, senderMap); }
      senderMap.set(screenId, sender);
    }
  }

  // Track remote video streams by their MediaStream id
  const remoteVideoStreamIds = new Map<string, string>(); // msid → streamKey

  // Handle remote tracks
  pc.ontrack = (e) => {
    const track = e.track;
    const stream = e.streams[0];
    if (track.kind === 'video' && stream) {
      // Assign a unique streamKey per distinct MediaStream from this peer
      let streamKey = remoteVideoStreamIds.get(stream.id);
      if (!streamKey) {
        const existingCount = remoteVideoStreamIds.size;
        streamKey = existingCount === 0 ? 'camera' : `screen_${existingCount}`;
        remoteVideoStreamIds.set(stream.id, streamKey);
      }
      callbacks?.onRemoteVideo?.(peerId, streamKey, stream);

      // When the remote track ends (peer stopped camera/screen), notify UI
      const sk = streamKey; // capture for closure
      track.onended = () => {
        callbacks?.onRemoteVideo?.(peerId, sk, null);
        remoteVideoStreamIds.delete(stream.id);
      };
      track.onmute = () => {
        callbacks?.onRemoteVideo?.(peerId, sk, null);
        remoteVideoStreamIds.delete(stream.id);
      };
      // Also handle stream-level removal (renegotiation removes track from stream)
      stream.onremovetrack = () => {
        if (stream.getVideoTracks().length === 0) {
          callbacks?.onRemoteVideo?.(peerId, sk, null);
          remoteVideoStreamIds.delete(stream.id);
        }
      };

      // Start bitrate monitoring when we have video
      startBitrateMonitor();
    } else if (track.kind === 'audio' && stream) {
      remoteStreams.set(peerId, stream);
      playRemoteAudio(peerId, stream);
    }
  };

  // ICE candidates
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      voiceChannel?.push('rtc_ice', {
        to: peerId,
        candidate: e.candidate.toJSON(),
      });
    }
  };

  // Connection state monitoring
  pc.oniceconnectionstatechange = () => {
    console.log(`[voice] peer ${peerId} ICE: ${pc.iceConnectionState}`);
    updatePeerStatus();
  };

  pc.onconnectionstatechange = () => {
    console.log(`[voice] peer ${peerId} conn: ${pc.connectionState}`);
    updatePeerStatus();
    if (pc.connectionState === 'failed') {
      console.warn(`[voice] peer ${peerId} connection failed — removing`);
      removePeer(peerId);
    }
    // 'disconnected' is transient (network blip) — don't remove immediately
  };

  // If we're the initiator, create and send offer
  if (initiator) {
    pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    }).then((offer) => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      voiceChannel?.push('rtc_offer', {
        to: peerId,
        sdp: pc.localDescription?.toJSON(),
      });
    }).catch((err) => {
      console.error('[voice] offer error:', err);
    });
  }
}

function removePeer(peerId: string) {
  console.log(`[voice] removePeer ${peerId}, remaining: ${peers.size - 1}`);
  const pc = peers.get(peerId);
  if (pc) {
    pc.close();
    peers.delete(peerId);
  }
  remoteStreams.delete(peerId);
  videoSenders.delete(peerId);
  // Remove all remote video streams from this peer
  callbacks?.onRemoteVideo?.(peerId, '*', null);
  const audio = remoteAudioElements.get(peerId);
  if (audio) {
    audio.pause();
    audio.srcObject = null;
    remoteAudioElements.delete(peerId);
  }
  const rctx = remoteAudioContexts.get(peerId);
  if (rctx) { rctx.close().catch(() => {}); remoteAudioContexts.delete(peerId); }
  remoteGainNodes.delete(peerId);
  if (peers.size === 0) stopBitrateMonitor();
  updatePeerStatus();
}

function updatePeerStatus() {
  if (peers.size === 0) {
    setState({ peerStatus: 'idle' });
    return;
  }

  let hasConnected = false;
  let hasFailed = false;
  let hasChecking = false;

  for (const [, pc] of peers) {
    const ice = pc.iceConnectionState;
    if (ice === 'connected' || ice === 'completed') hasConnected = true;
    else if (ice === 'failed') hasFailed = true;
    else if (ice === 'checking' || ice === 'new') hasChecking = true;
  }

  let status: PeerConnectionStatus;
  if (hasFailed && !hasConnected) status = 'no-route';
  else if (hasFailed) status = 'failed';
  else if (hasConnected) status = 'connected';
  else if (hasChecking) status = 'negotiating';
  else status = 'idle';

  setState({ peerStatus: status });
}

function playRemoteAudio(peerId: string, stream: MediaStream) {
  let audio = remoteAudioElements.get(peerId);
  if (!audio) {
    // Create an AudioContext + GainNode chain for volume amplification > 100%
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    remoteAudioContexts.set(peerId, ctx);
    remoteGainNodes.set(peerId, gain);

    audio = new Audio();
    audio.autoplay = true;
    remoteAudioElements.set(peerId, audio);
  }
  audio.srcObject = stream;
  audio.muted = state.selfDeaf;

  // Apply output device preference
  if (audioPrefs.outputDeviceId && 'setSinkId' in audio) {
    (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(audioPrefs.outputDeviceId).catch(() => {});
  }
}

// ── Signaling Handlers ──

async function handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
  if (fromId === currentUserId) return;

  // Synchronous lock — prevents duplicate offers from racing through async code.
  // The signalingState check alone is insufficient because both calls read 'stable'
  // before either's setRemoteDescription promise changes the state.
  if (negotiationLock.has(fromId)) {
    console.log('[voice] ignoring duplicate offer (locked) from', fromId);
    return;
  }
  negotiationLock.add(fromId);

  // Create peer connection if it doesn't exist (we're the responder)
  if (!peers.has(fromId)) {
    createPeerConnection(fromId, false);
  }

  const pc = peers.get(fromId);
  if (!pc) { negotiationLock.delete(fromId); return; }

  console.log('[voice] handleOffer from', fromId, 'signalingState:', pc.signalingState);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[voice] setRemoteDescription OK, creating answer');

    // Flush any ICE candidates that arrived before the offer
    const pending = pendingCandidates.get(fromId);
    if (pending) {
      for (const cand of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ok */ }
      }
      pendingCandidates.delete(fromId);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    voiceChannel?.push('rtc_answer', {
      to: fromId,
      sdp: pc.localDescription?.toJSON(),
    });
    console.log('[voice] answer sent to', fromId);
  } catch (err) {
    console.error('[voice] answer error:', err);
  } finally {
    negotiationLock.delete(fromId);
  }
}

async function handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
  const pc = peers.get(fromId);
  if (!pc) return;

  // Synchronous lock — same race as handleOffer: two duplicate answers can
  // both read signalingState before either's async setRemoteDescription runs.
  if (negotiationLock.has(fromId)) {
    console.log('[voice] ignoring duplicate answer (locked) from', fromId);
    return;
  }
  negotiationLock.add(fromId);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[voice] setRemoteDescription(answer) OK from', fromId);

    // Flush any ICE candidates that arrived before the answer
    const pending = pendingCandidates.get(fromId);
    if (pending) {
      for (const cand of pending) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ok */ }
      }
      pendingCandidates.delete(fromId);
    }
  } catch (err) {
    console.error('[voice] remote description error:', err);
  } finally {
    negotiationLock.delete(fromId);
  }
}

async function handleIceCandidate(fromId: string, candidate: RTCIceCandidateInit) {
  const pc = peers.get(fromId);

  // Buffer if no PC yet or remote description not set
  if (!pc || !pc.remoteDescription) {
    if (!pendingCandidates.has(fromId)) {
      pendingCandidates.set(fromId, []);
    }
    pendingCandidates.get(fromId)!.push(candidate);
    return;
  }

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error('[voice] ICE error:', err);
  }
}

// ── Voice State Events ──

function handleVoiceStateUpdate(payload: VoiceUser) {
  // Update tracked voice users (use String() for all ID comparisons — backend
  // may return integers from ETS in initial loads vs strings in broadcasts)
  const payloadUserId = String(payload.user_id);
  const payloadChannelId = payload.channel_id != null ? String(payload.channel_id) : null;
  console.log('[voice] voice_state_update', { userId: payloadUserId, channelId: payloadChannelId, myChannel: state.channelId });
  const idx = trackedVoiceUsers.findIndex((u) => String(u.user_id) === payloadUserId);
  if (payloadChannelId === state.channelId) {
    if (idx >= 0) trackedVoiceUsers[idx] = payload;
    else trackedVoiceUsers = [...trackedVoiceUsers, payload];
  } else {
    if (idx >= 0) trackedVoiceUsers = trackedVoiceUsers.filter((u) => String(u.user_id) !== payloadUserId);
  }

  // If a new user joined our channel, create a peer connection
  // Don't initiate — the new joiner will send us an offer (from their voice_join peer list)
  const peerId = payloadUserId;
  if (
    payloadChannelId === state.channelId &&
    peerId !== currentUserId &&
    !peers.has(peerId)
  ) {
    createPeerConnection(peerId, false);
  }

  // If a user left our channel, remove peer
  if (
    payloadChannelId !== state.channelId &&
    peers.has(peerId)
  ) {
    removePeer(peerId);
  }

  // Forward to UI — pass tracked list so remounted components get full state
  callbacks?.onVoiceStates(trackedVoiceUsers);
}

// ── Speaking Detection ──

function setupSpeakingDetection(stream: MediaStream) {
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  const dataArray = new Float32Array(analyser.fftSize);
  let wasSpeaking = false;

  speakingInterval = setInterval(() => {
    if (!analyser || state.selfMute) {
      if (wasSpeaking) {
        wasSpeaking = false;
        callbacks?.onSpeaking(currentUserId!, false);
      }
      return;
    }

    analyser.getFloatTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const isSpeaking = rms > SPEAKING_THRESHOLD;

    if (isSpeaking !== wasSpeaking) {
      wasSpeaking = isSpeaking;
      callbacks?.onSpeaking(currentUserId!, isSpeaking);
    }
  }, SPEAKING_CHECK_INTERVAL);
}
