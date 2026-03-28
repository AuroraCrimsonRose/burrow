import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../api';
import { getSocket } from '../socket';
import EmojiPicker from './EmojiPicker';
import {
  disconnectVoice, toggleMute, toggleDeafen, toggleCamera, startScreenShare, stopScreenShare,
  getVoiceState, getConnectionQuality, getConnectionDebug, enumerateCameraDevices,
  connectDmVoice,
  type VoiceEngineState, type VoiceQuality, type VoiceDebugInfo, type CameraDevice,
} from '../voiceEngine';

// ── Types ──

interface Friend {
  id: string;
  username: string;
}

interface FriendRequest {
  id: string;
  user: { id: string; username: string };
}

interface DMMessage {
  id: string;
  channel_id: string;
  author: { id: string; username: string };
  content: string;
  type: string;
  reply_to_id: string | null;
  edited_at: string | null;
  channel_seq: number;
  timestamp: string;
}

type Tab = 'dms' | 'friends' | 'requests';

interface FriendsPanelProps {
  currentUserId: string;
  username: string;
  userStatus: 'online' | 'idle' | 'dnd' | 'invisible';
  presenceMap?: Record<string, string>;
  customStatusMap?: Record<string, string>;
  dmUnreads?: Record<string, { lastReadSeq: number; lastMsgSeq: number }>;
  onAckDm?: (dmId: string, messageId: string) => void;
  openDmWithUserId?: string | null;
  onOpenDmWithUserHandled?: () => void;
}

export default function FriendsPanel({ currentUserId, username, userStatus, presenceMap = {}, customStatusMap = {}, dmUnreads = {}, onAckDm, openDmWithUserId, onOpenDmWithUserHandled }: FriendsPanelProps) {
  const [tab, setTab] = useState<Tab>('dms');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [dmRecipient, setDmRecipient] = useState<{ id: string; username: string } | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [msgDraft, setMsgDraft] = useState('');
  const [addFriendQuery, setAddFriendQuery] = useState('');
  const [addFriendError, setAddFriendError] = useState('');
  const [addFriendSuccess, setAddFriendSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);
  const dmFileInputRef = useRef<HTMLInputElement>(null);
  const [dmEmojiOpen, setDmEmojiOpen] = useState(false);
  const [dmPendingFiles, setDmPendingFiles] = useState<File[]>([]);
  const [dmUploadStatus, setDmUploadStatus] = useState<{ uploading: boolean; current: number; total: number; error?: string } | null>(null);
  const [dmError, setDmError] = useState<string | null>(null);

  // Map friend user ID → DM channel ID (for unread tracking)
  const [friendDmMap, setFriendDmMap] = useState<Record<string, string>>({});

  // Voice state (reads global singleton)
  const [voiceState, setVoiceState] = useState<VoiceEngineState>(getVoiceState());
  const [voiceQuality, setVoiceQuality] = useState<VoiceQuality>('unknown');
  const [showDebugCard, setShowDebugCard] = useState(false);
  const [debugInfo, setDebugInfo] = useState<VoiceDebugInfo | null>(null);
  const [showStreamPicker, setShowStreamPicker] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);

  // Poll voice state to stay in sync with BurrowView
  useEffect(() => {
    const id = setInterval(() => setVoiceState(getVoiceState()), 500);
    return () => clearInterval(id);
  }, []);

  // Poll connection quality while voice is connected
  useEffect(() => {
    if (voiceState.connectionState !== 'connected') {
      setVoiceQuality('unknown');
      setShowDebugCard(false);
      return;
    }
    let mounted = true;
    const poll = () => { getConnectionQuality().then((q) => { if (mounted) setVoiceQuality(q); }); };
    poll();
    const id = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [voiceState.connectionState]);

  // Enumerate cameras when stream picker opens
  useEffect(() => {
    if (showStreamPicker) enumerateCameraDevices().then(setCameraDevices);
  }, [showStreamPicker]);

  function handleVoiceDisconnect() {
    disconnectVoice();
    setVoiceState(getVoiceState());
  }

  async function handleDmCall() {
    if (!activeDmId || !selectedFriendId) return;
    // If already in a call, disconnect first
    if (getVoiceState().connectionState !== 'disconnected') {
      disconnectVoice();
      setVoiceState(getVoiceState());
      return;
    }
    const sock = getSocket();
    if (!sock) return;
    try {
      await connectDmVoice(sock, activeDmId, currentUserId, selectedFriendId, {
        onStateChange: (s) => setVoiceState({ ...s }),
        onVoiceStates: () => {},
        onSpeaking: () => {},
        onError: (err) => { console.error('[dm-call]', err); setDmError(`Call failed: ${err}`); },
      });
      setVoiceState(getVoiceState());
    } catch (e: any) {
      console.error('[dm-call] failed:', e);
      setDmError(`Call failed: ${e?.message || e}`);
    }
  }

  // Load friends + DM channels on mount
  useEffect(() => {
    api.listFriends().then((r) => setFriends((r as { friends: Friend[] }).friends || [])).catch(console.error);
    // Load DM channels to build friend→DM mapping
    api.listDMs().then((r: any) => {
      const channels: any[] = r.dm_channels || r.dms || r.channels || [];
      const map: Record<string, string> = {};
      for (const ch of channels) {
        for (const recip of ch.recipients || []) {
          map[recip.id] = String(ch.id);
        }
      }
      setFriendDmMap(map);
    }).catch(console.error);
  }, []);

  // Load requests when switching to requests tab
  useEffect(() => {
    if (tab === 'requests') {
      api.listFriendRequests().then((r) => {
        const data = r as { incoming: FriendRequest[]; outgoing: FriendRequest[] };
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }).catch(console.error);
    }
  }, [tab]);

  // Load DM messages when selecting a user
  const openDM = useCallback(async (userId: string) => {
    setSelectedFriendId(userId);
    setMessages([]);
    setActiveDmId(null);
    setDmError(null);
    setLoading(true);
    // Resolve recipient info: try friends list first, then fetch from API
    const friend = friends.find((f) => f.id === userId);
    if (friend) {
      setDmRecipient({ id: friend.id, username: friend.username });
    } else {
      try {
        const profile = await api.getUserProfile(userId) as { username: string };
        setDmRecipient({ id: userId, username: profile.username || 'User' });
      } catch {
        setDmRecipient({ id: userId, username: 'User' });
      }
    }
    try {
      const dmRes = await api.createDM(userId) as { id: string };
      const dmId = dmRes.id;
      if (!dmId) throw new Error('DM channel creation returned no id');
      setActiveDmId(dmId);
      setFriendDmMap((prev) => ({ ...prev, [userId]: dmId }));
      const msgRes = await api.listDMMessages(dmId, { limit: 50 }) as { messages: DMMessage[] };
      const msgs = (msgRes.messages || []).reverse();
      setMessages(msgs);
      // Ack the last message to clear unread
      if (msgs.length > 0 && onAckDm) {
        onAckDm(dmId, msgs[msgs.length - 1].id);
      }
    } catch (e: any) {
      console.error('Failed to open DM:', e);
      setDmError(`Failed to open DM: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [onAckDm, friends]);

  // Handle open-DM-from-profile trigger
  useEffect(() => {
    if (openDmWithUserId) {
      setTab('dms');
      openDM(openDmWithUserId);
      onOpenDmWithUserHandled?.();
    }
  }, [openDmWithUserId]);

  // Poll for new messages every 3s when a DM is active
  useEffect(() => {
    if (!activeDmId) return;
    const poll = () => {
      const lastSeq = messages.length > 0 ? messages[messages.length - 1].channel_seq : 0;
      api.listDMMessages(activeDmId, { after: String(lastSeq), limit: 50 }).then((r) => {
        const newMsgs: DMMessage[] = ((r as { messages: DMMessage[] }).messages || []).reverse();
        if (newMsgs.length > 0) {
          setMessages((prev) => [...prev, ...newMsgs.filter((m) => !prev.some((p) => p.id === m.id))]);
        }
      }).catch(console.error);
    };
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeDmId, messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    console.warn('[DM-SEND] handleSendMessage called, msgDraft:', JSON.stringify(msgDraft), 'activeDmId:', activeDmId, 'selectedFriendId:', selectedFriendId, 'files:', dmPendingFiles.length);
    if (!msgDraft.trim() && dmPendingFiles.length === 0) {
      console.warn('[DM-SEND] early return: empty message and no files');
      return;
    }
    setDmError(null);

    // Ensure we have an active DM channel — retry creation if missing
    let dmId = activeDmId;
    if (!dmId && selectedFriendId) {
      console.warn('[DM-SEND] activeDmId is null, retrying createDM for friend:', selectedFriendId);
      try {
        const dmRes = await api.createDM(selectedFriendId) as { id: string };
        dmId = dmRes.id;
        console.warn('[DM-SEND] createDM returned dmId:', dmId);
        if (!dmId) throw new Error('DM channel creation returned no id');
        setActiveDmId(dmId);
      } catch (e: any) {
        console.error('[DM-SEND] Failed to create DM channel:', e);
        setDmError(`Cannot open DM channel: ${e?.message || e}`);
        return;
      }
    }
    if (!dmId) {
      console.warn('[DM-SEND] no dmId and no selectedFriendId — bailing');
      setDmError('No DM channel available. Try clicking the friend again.');
      return;
    }
    console.warn('[DM-SEND] sending to dmId:', dmId);

    const content = msgDraft.trim();
    setMsgDraft('');
    const filesToSend = [...dmPendingFiles];
    setDmPendingFiles([]);

    // Upload files if any
    let attachmentUrls: string[] = [];
    if (filesToSend.length > 0) {
      try {
        setDmUploadStatus({ uploading: true, current: 0, total: filesToSend.length });
        for (let i = 0; i < filesToSend.length; i++) {
          setDmUploadStatus({ uploading: true, current: i + 1, total: filesToSend.length });
          const att = await api.uploadFile(filesToSend[i], 'dm');
          attachmentUrls.push(att.url || att.filename);
        }
        setDmUploadStatus(null);
      } catch (e) {
        console.error('DM file upload failed:', e);
        setDmUploadStatus({ uploading: false, current: 0, total: 0, error: String(e instanceof Error ? e.message : e) });
        setTimeout(() => setDmUploadStatus(null), 4000);
        // Restore draft so user doesn't lose their message
        if (content) setMsgDraft(content);
        return;
      }
    }

    // Build message content with any attachment URLs appended
    const finalContent = attachmentUrls.length > 0
      ? [content, ...attachmentUrls].filter(Boolean).join('\n')
      : content;
    if (!finalContent) return;

    try {
      console.warn('[DM-SEND] calling sendDMMessage with dmId:', dmId, 'content length:', finalContent.length);
      const res = await api.sendDMMessage(dmId, finalContent) as DMMessage;
      console.warn('[DM-SEND] message sent successfully, id:', res?.id);
      setMessages((prev) => [...prev, res]);
    } catch (e: any) {
      console.error('[DM-SEND] Failed to send DM:', e);
      setDmError(`Failed to send: ${e?.message || e}`);
      // Restore draft so user doesn't lose their message
      if (content) setMsgDraft(content);
    }
  };

  const handleAddFriend = async () => {
    const q = addFriendQuery.trim();
    if (!q) return;
    setAddFriendError('');
    setAddFriendSuccess('');
    try {
      await api.sendFriendRequest(q);
      setAddFriendSuccess('Request sent!');
      setAddFriendQuery('');
      // Refresh outgoing
      api.listFriendRequests().then((r) => {
        const data = r as { incoming: FriendRequest[]; outgoing: FriendRequest[] };
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }).catch(() => {});
    } catch (e: unknown) {
      setAddFriendError(e instanceof Error ? e.message : 'Failed to send request');
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      await api.acceptFriendRequest(userId);
      setIncoming((prev) => prev.filter((r) => r.user.id !== userId));
      // Refresh friends
      api.listFriends().then((r) => setFriends((r as { friends: Friend[] }).friends || [])).catch(() => {});
    } catch (e) {
      console.error('Failed to accept:', e);
    }
  };

  const handleDecline = async (userId: string) => {
    try {
      await api.declineFriendRequest(userId);
      setIncoming((prev) => prev.filter((r) => r.user.id !== userId));
    } catch (e) {
      console.error('Failed to decline:', e);
    }
  };

  const handleCancelOutgoing = async (userId: string) => {
    try {
      await api.removeFriend(userId);
      setOutgoing((prev) => prev.filter((r) => r.user.id !== userId));
    } catch (e) {
      console.error('Failed to cancel:', e);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await api.removeFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
      if (selectedFriendId === friendId) {
        setSelectedFriendId(null);
        setActiveDmId(null);
        setDmRecipient(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to remove friend:', e);
    }
  };

  const selectedFriend = dmRecipient || friends.find((f) => f.id === selectedFriendId) || null;

  return (
    <div className="fp-shell">
      <div className="fp-main">
      {/* Left: friends list */}
      <div className="fp-sidebar">
        {/* Tabs */}
        <div className="fp-tabs">
          <button className={`fp-tab${tab === 'dms' ? ' active' : ''}`} onClick={() => setTab('dms')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            DMs
          </button>
          <button className={`fp-tab${tab === 'friends' ? ' active' : ''}`} onClick={() => setTab('friends')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            Friends
          </button>
          <button className={`fp-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Requests
            {incoming.length > 0 && <span className="fp-badge">{incoming.length}</span>}
          </button>
        </div>

        {tab === 'dms' && (
          <div className="fp-friends-list">
            {friends.length === 0 && (
              <div className="fp-empty">No friends yet</div>
            )}
            {friends.map((f) => {
              const status = presenceMap[f.id] || 'offline';
              const dmChId = friendDmMap[f.id];
              const hasUnread = !!(dmChId && dmUnreads[dmChId]);
              return (
                <button
                  key={f.id}
                  className={`fp-friend-item${selectedFriendId === f.id ? ' active' : ''}${hasUnread ? ' unread' : ''}`}
                  onClick={() => openDM(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (confirm(`Remove ${f.username} from friends?`)) handleRemoveFriend(f.id);
                  }}
                >
                  <div className="fp-friend-avatar">
                    <span className={`status-dot status-${status}`} />
                    {f.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="fp-friend-info">
                    <span className="fp-friend-name">{f.username}</span>
                    <span className="fp-friend-status">{status === 'online' ? 'Online' : status === 'idle' ? 'Away' : status === 'dnd' ? 'DND' : 'Offline'}</span>
                  </div>
                  {hasUnread && <span className="fp-unread-dot" />}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'friends' && (
          <div className="fp-friends-list">
            {friends.length === 0 && (
              <div className="fp-empty">No friends yet</div>
            )}
            {(() => {
              const online = friends.filter((f) => (presenceMap[f.id] || 'offline') !== 'offline');
              const offline = friends.filter((f) => (presenceMap[f.id] || 'offline') === 'offline');
              return (
                <>
                  {online.length > 0 && (
                    <>
                      <div className="fp-section-label">Online — {online.length}</div>
                      {online.map((f) => {
                        const status = presenceMap[f.id] || 'offline';
                        const customStatus = customStatusMap[f.id];
                        return (
                          <button
                            key={f.id}
                            className="fp-friend-item"
                            onClick={() => { setTab('dms'); openDM(f.id); }}
                          >
                            <div className="fp-friend-avatar">
                              <span className={`status-dot status-${status}`} />
                              {f.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="fp-friend-info">
                              <span className="fp-friend-name">{f.username}</span>
                              {customStatus ? (
                                <span className="fp-friend-activity">{customStatus}</span>
                              ) : (
                                <span className="fp-friend-status">{status === 'online' ? 'Online' : status === 'idle' ? 'Away' : 'Do Not Disturb'}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {offline.length > 0 && (
                    <>
                      <div className="fp-section-label">Offline — {offline.length}</div>
                      {offline.map((f) => (
                        <button
                          key={f.id}
                          className="fp-friend-item fp-friend-offline"
                          onClick={() => { setTab('dms'); openDM(f.id); }}
                        >
                          <div className="fp-friend-avatar">
                            <span className="status-dot status-offline" />
                            {f.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="fp-friend-info">
                            <span className="fp-friend-name">{f.username}</span>
                            <span className="fp-friend-status">Offline</span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {tab === 'requests' && (
          <div className="fp-requests">
            <div className="fp-add-friend">
              <input
                className="fp-add-input"
                placeholder="User ID to add…"
                value={addFriendQuery}
                onChange={(e) => { setAddFriendQuery(e.target.value); setAddFriendError(''); setAddFriendSuccess(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddFriend(); }}
              />
              <button className="fp-add-btn" onClick={handleAddFriend}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            {addFriendError && <div className="fp-add-error">{addFriendError}</div>}
            {addFriendSuccess && <div className="fp-add-success">{addFriendSuccess}</div>}

            {incoming.length > 0 && (
              <>
                <div className="fp-section-label">Incoming</div>
                {incoming.map((r) => (
                  <div key={r.id} className="fp-request-item">
                    <div className="fp-friend-avatar">{r.user.username.charAt(0).toUpperCase()}</div>
                    <span className="fp-request-name">{r.user.username}</span>
                    <div className="fp-request-actions">
                      <button className="fp-req-btn fp-req-accept" onClick={() => handleAccept(r.user.id)} title="Accept">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </button>
                      <button className="fp-req-btn fp-req-decline" onClick={() => handleDecline(r.user.id)} title="Decline">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {outgoing.length > 0 && (
              <>
                <div className="fp-section-label">Outgoing</div>
                {outgoing.map((r) => (
                  <div key={r.id} className="fp-request-item">
                    <div className="fp-friend-avatar">{r.user.username.charAt(0).toUpperCase()}</div>
                    <span className="fp-request-name">{r.user.username}</span>
                    <button className="fp-req-btn fp-req-decline" onClick={() => handleCancelOutgoing(r.user.id)} title="Cancel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </>
            )}

            {incoming.length === 0 && outgoing.length === 0 && (
              <div className="fp-empty">No pending requests</div>
            )}
          </div>
        )}
      </div>

      {/* Right: DM chat area */}
      <div className="fp-chat">
        {selectedFriend ? (
          <>
            <div className="fp-chat-header">
              <span className="fp-chat-recipient">{selectedFriend.username}</span>
              <div className="fp-chat-header-actions">
                {voiceState.connectionState !== 'disconnected' && voiceState.serverId === `dm:${activeDmId}` ? (
                  <button
                    className="fp-call-btn active"
                    onClick={handleVoiceDisconnect}
                    title="End call"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className="fp-call-btn"
                    onClick={handleDmCall}
                    title="Start voice call"
                    disabled={!activeDmId}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="fp-messages">
              {loading && <div className="fp-loading">Loading…</div>}
              {!loading && messages.length === 0 && (
                <div className="fp-empty-chat">Start a conversation with {selectedFriend.username}</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`fp-msg${m.author.id === currentUserId ? ' fp-msg-self' : ''}`}>
                  <span className="fp-msg-author">{m.author.username}</span>
                  <span className="fp-msg-content">{m.content}</span>
                  <span className="fp-msg-time">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {dmError && (
              <div className="fp-dm-error" onClick={() => setDmError(null)} title="Click to dismiss">
                {dmError}
              </div>
            )}
            <div className="spine-input-wrap">
              {dmPendingFiles.length > 0 && (
                <div className="spine-file-preview">
                  {dmPendingFiles.map((f, i) => {
                    const isImage = f.type.startsWith('image/');
                    return (
                      <div key={i} className="spine-file-item">
                        {isImage ? (
                          <img src={URL.createObjectURL(f)} alt={f.name} className="spine-file-thumb" />
                        ) : (
                          <div className="spine-file-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </div>
                        )}
                        <span className="spine-file-name">{f.name}</span>
                        <button type="button" className="spine-file-remove" onClick={() => setDmPendingFiles((p) => p.filter((_, j) => j !== i))} title="Remove">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {dmUploadStatus && (
                <div className={`spine-upload-status${dmUploadStatus.error ? ' error' : ''}`}>
                  {dmUploadStatus.uploading ? (
                    <>
                      <div className="spine-upload-bar"><div className="spine-upload-bar-fill" style={{ width: `${(dmUploadStatus.current / dmUploadStatus.total) * 100}%` }} /></div>
                      <span className="spine-upload-text">Uploading {dmUploadStatus.current}/{dmUploadStatus.total}...</span>
                    </>
                  ) : dmUploadStatus.error ? (
                    <span className="spine-upload-text">{dmUploadStatus.error}</span>
                  ) : null}
                </div>
              )}
              <form className="spine-terminal" onSubmit={(e) => { e.preventDefault(); console.warn('[DM-SEND] form onSubmit fired'); handleSendMessage(); }}>
                <span className="spine-terminal-prompt">&gt;</span>
                <input
                  className="spine-terminal-input"
                  type="text"
                  placeholder={`transmit → @${selectedFriend.username}`}
                  value={msgDraft}
                  onChange={(e) => setMsgDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); console.warn('[DM-SEND] Enter key pressed'); handleSendMessage(); } }}
                  autoFocus
                />
                <input
                  ref={dmFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files) { setDmPendingFiles((p) => [...p, ...Array.from(e.target.files!)]); e.target.value = ''; } }}
                />
                <div className="spine-terminal-actions">
                  <button className="spine-terminal-attach" type="button" onClick={() => dmFileInputRef.current?.click()} title="Attach files">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <button className="spine-terminal-emoji" type="button" onClick={() => setDmEmojiOpen(!dmEmojiOpen)} title="Emoji">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                  </button>
                  <button className="spine-terminal-send" type="submit" disabled={!msgDraft.trim() && dmPendingFiles.length === 0} title="Send">
                    <svg className="send-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 1.5l11 6.5-11 6.5V9l7-1-7-1z" /></svg>
                  </button>
                </div>
              </form>
              {dmEmojiOpen && (
                <div className="input-emoji-picker-wrap">
                  <EmojiPicker
                    animatedEmojis={false}
                    onSelect={(emoji) => { setMsgDraft((p) => p + emoji); setDmEmojiOpen(false); }}
                    onClose={() => setDmEmojiOpen(false)}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="fp-no-chat">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span>Select a friend to start chatting</span>
          </div>
        )}
      </div>
      </div>

      {/* Status bar — spans full width at bottom */}
      {voiceState.connectionState !== 'disconnected' ? (
        <div className="fp-status-bar voice-active">
          <div className="fp-status-user">
            <div className="fp-status-avatar">
              <span className={`status-dot status-${userStatus}`} />
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="fp-status-info">
              <span className="fp-status-name">{username}</span>
              <span className="fp-status-text voice-text">Voice Connected</span>
            </div>
          </div>
          <div className="voice-status-row">
            <button
              className={`voice-quality-indicator ${voiceQuality}`}
              title={`Quality: ${voiceQuality} — click for details`}
              onClick={() => {
                if (showDebugCard) { setShowDebugCard(false); return; }
                getConnectionDebug().then((info) => { setDebugInfo(info); setShowDebugCard(true); });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <rect x="1" y="14" width="3" height="5" rx="0.5" />
                <rect x="6" y="10" width="3" height="9" rx="0.5" opacity={['poor', 'unknown'].includes(voiceQuality) ? 0.3 : 1} />
                <rect x="11" y="5" width="3" height="14" rx="0.5" opacity={['poor', 'fair', 'unknown'].includes(voiceQuality) ? 0.3 : 1} />
                <rect x="16" y="1" width="3" height="18" rx="0.5" opacity={voiceQuality === 'excellent' ? 1 : 0.3} />
              </svg>
            </button>
            {showDebugCard && debugInfo && (
              <div className="voice-debug-card">
                <div className="voice-debug-title">Connection Debug</div>
                {debugInfo.peerCount === 0 ? (
                  <div className="voice-debug-empty">
                    <span>No peers connected</span>
                    <span className="voice-debug-hint">WebRTC stats appear when another user joins</span>
                  </div>
                ) : (
                  <div className="voice-debug-grid">
                    <span className="voice-debug-label">Ping</span>
                    <span className={`voice-debug-value${debugInfo.avgRttMs != null && debugInfo.avgRttMs < 80 ? ' good' : debugInfo.avgRttMs != null && debugInfo.avgRttMs < 200 ? ' fair' : debugInfo.avgRttMs != null ? ' poor' : ''}`}>{debugInfo.avgRttMs != null ? `${debugInfo.avgRttMs} ms` : '—'}</span>
                    <span className="voice-debug-label">Peers</span>
                    <span className="voice-debug-value">{debugInfo.peerCount}</span>
                    <span className="voice-debug-label">Route</span>
                    <span className="voice-debug-value mono">{debugInfo.localCandidate || '—'} → {debugInfo.remoteCandidate || '—'}</span>
                    <span className="voice-debug-label">Type</span>
                    <span className="voice-debug-value">{debugInfo.candidateType || '—'}</span>
                    <span className="voice-debug-label">Protocol</span>
                    <span className="voice-debug-value">{debugInfo.protocol || '—'}</span>
                    <span className="voice-debug-label">Codec</span>
                    <span className="voice-debug-value">{debugInfo.codec || '—'}</span>
                    <span className="voice-debug-label">Packets ↑</span>
                    <span className="voice-debug-value">{debugInfo.packetsSent ?? '—'}</span>
                    <span className="voice-debug-label">Packets ↓</span>
                    <span className="voice-debug-value">{debugInfo.packetsReceived ?? '—'}</span>
                    <span className="voice-debug-label">Lost</span>
                    <span className={`voice-debug-value${(debugInfo.packetsLost ?? 0) > 0 ? ' poor' : ''}`}>{debugInfo.packetsLost ?? '—'}</span>
                    <span className="voice-debug-label">Jitter</span>
                    <span className={`voice-debug-value${(debugInfo.jitter ?? 0) > 0.03 ? ' fair' : ''}`}>{debugInfo.jitter != null ? `${(debugInfo.jitter * 1000).toFixed(1)} ms` : '—'}</span>
                    <span className="voice-debug-label">Bytes ↑</span>
                    <span className="voice-debug-value mono">{debugInfo.bytesSent != null ? debugInfo.bytesSent.toLocaleString() : '—'}</span>
                    <span className="voice-debug-label">Bytes ↓</span>
                    <span className="voice-debug-value mono">{debugInfo.bytesReceived != null ? debugInfo.bytesReceived.toLocaleString() : '—'}</span>
                  </div>
                )}
              </div>
            )}
            <div className="voice-status-controls">
              <button
                className={`voice-status-btn${voiceState.selfMute ? ' active' : ''}`}
                onClick={() => { toggleMute(); setVoiceState({ ...getVoiceState() }); }}
                title={voiceState.selfMute ? 'Unmute' : 'Mute'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {voiceState.selfMute ? (
                    <>
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.48-.35 2.17" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </>
                  )}
                </svg>
              </button>
              <button
                className={`voice-status-btn${voiceState.selfDeaf ? ' active' : ''}`}
                onClick={() => { toggleDeafen(); setVoiceState({ ...getVoiceState() }); }}
                title={voiceState.selfDeaf ? 'Undeafen' : 'Deafen'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {voiceState.selfDeaf ? (
                    <>
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M18 8a6 6 0 0 0-9.33-5" />
                      <path d="M3 18v-6a9 9 0 0 1 .47-2.83" />
                      <path d="M21 12v6" />
                    </>
                  ) : (
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  )}
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </button>
              <div className="voice-status-stream-wrapper">
                <button
                  className={`voice-status-btn${(voiceState.selfVideo.camera || voiceState.selfVideo.screens.length > 0) ? ' stream-on' : ''}`}
                  onClick={() => setShowStreamPicker((p) => !p)}
                  title="Stream"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" />
                  </svg>
                </button>
                {showStreamPicker && (
                  <div className="stream-picker-popover stream-picker-status">
                    <div className="stream-picker-section">
                      <div className="stream-picker-title">Camera</div>
                      {cameraDevices.length === 0 ? (
                        <div className="stream-picker-empty">No cameras found</div>
                      ) : cameraDevices.map((cam) => (
                        <button
                          key={cam.deviceId}
                          className={`stream-picker-option${voiceState.selfVideo.camera ? ' active' : ''}`}
                          onClick={() => { toggleCamera(cam.deviceId).then(() => setVoiceState({ ...getVoiceState() })); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="14" height="14" rx="2" ry="2" /><polygon points="23 7 16 12 23 17 23 7" />
                          </svg>
                          <span className="stream-picker-label">{cam.label}</span>
                          {voiceState.selfVideo.camera && <span className="stream-picker-live">Live</span>}
                        </button>
                      ))}
                    </div>
                    <div className="stream-picker-section">
                      <div className="stream-picker-title">Share</div>
                      <button className="stream-picker-option" onClick={() => { startScreenShare('monitor').then(() => setVoiceState({ ...getVoiceState() })); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                        <span className="stream-picker-label">Entire Screen</span>
                      </button>
                      <button className="stream-picker-option" onClick={() => { startScreenShare('window').then(() => setVoiceState({ ...getVoiceState() })); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /></svg>
                        <span className="stream-picker-label">Window</span>
                      </button>
                      <button className="stream-picker-option" onClick={() => { startScreenShare('browser').then(() => setVoiceState({ ...getVoiceState() })); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                        <span className="stream-picker-label">Browser Tab</span>
                      </button>
                    </div>
                    {voiceState.selfVideo.screens.length > 0 && (
                      <div className="stream-picker-section">
                        <div className="stream-picker-title">Active</div>
                        {voiceState.selfVideo.screens.map((sid) => (
                          <div key={sid} className="stream-picker-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                            <span className="stream-picker-label">Screen</span>
                            <span className="stream-picker-live">Live</span>
                            <button className="stream-picker-stop" onClick={() => { stopScreenShare(sid); setVoiceState({ ...getVoiceState() }); }} title="Stop sharing">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="voice-status-btn disconnect"
                onClick={handleVoiceDisconnect}
                title="Disconnect"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="fp-status-bar">
          <div className="fp-status-user">
            <div className="fp-status-avatar">
              <span className={`status-dot status-${userStatus}`} />
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="fp-status-info">
              <span className="fp-status-name">{username}</span>
              <span className="fp-status-text">
                {userStatus === 'online' ? 'Online' : userStatus === 'idle' ? 'Away' : userStatus === 'dnd' ? 'Do Not Disturb' : 'Invisible'}
              </span>
            </div>
          </div>
          <div className="fp-status-counts">
            <span className="fp-status-count">{friends.length} friend{friends.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
