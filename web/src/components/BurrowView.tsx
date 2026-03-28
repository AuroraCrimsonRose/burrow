import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../api';
import DataSpine, { type SpineMessage, type PresenceUser, type ServerMember, type MessageAttachment } from './DataSpine';
import { BadgeCompact, type BadgeData } from './Badge';
import { joinChannel, leaveChannel, updateLastSeq, getSocket } from '../socket';
import {
  connectVoice, disconnectVoice, toggleMute, toggleDeafen, toggleCamera, startScreenShare, stopScreenShare,
  getVoiceState, getVoiceUsers, updateCallbacks, getConnectionQuality, getConnectionDebug, getLocalVideoStream, getLocalStreams,
  setUserVolume, enumerateCameraDevices,
  type VoiceUser, type VoiceEngineState, type VoiceQuality, type VoiceDebugInfo, type StreamKind, type CameraDevice, type DisplaySurface,
} from '../voiceEngine';

// ── Types ──

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Channel {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  type: string;
  topic: string | null;
  position: number | null;
  nsfw: boolean;
  bitrate?: number | null;
  user_limit?: number | null;
}

interface BurrowViewProps {
  serverId: string;
  serverName: string;
  currentUserId: string;
  currentUsername: string;
  compact?: boolean;
  userStatus?: 'online' | 'idle' | 'dnd' | 'invisible';
  presenceMap?: Record<string, string>;
  customStatusMap?: Record<string, string>;
  onMemberClick?: (member: { user_id: string; username: string; nickname?: string; bio?: string; pronouns?: string }) => void;
  channelUnreads?: Record<string, { serverId: string; categoryId: string | null; lastReadSeq: number; lastMsgSeq: number }>;
  onAckChannel?: (channelId: string, messageId: string) => void;
}

// ── Channel type icons ──

const CHANNEL_ICONS: Record<string, string> = {
  text: '#',
  voice: '(v)',
  announcement: '(a)',
  stage: '(s)',
  forum: '(f)',
  gallery: '(g)',
  status: '(!)',
  events: '(e)',
  file_repo: '(d)',
};

// ── Member item with hover card ──

interface MemberItemProps {
  member: { user_id: string; username: string; display_name?: string; nickname?: string; bio?: string; pronouns?: string; primary_badge?: BadgeData | null };
  status: string;
  customStatus?: string;
  isSelf: boolean;
  onClick: () => void;
  clickable: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function MemberItem({ member, status, customStatus, isSelf, onClick, clickable, onContextMenu }: MemberItemProps) {
  const [hovered, setHovered] = useState(false);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const displayName = member.nickname || member.display_name || member.username;

  const dismissCard = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => {
      setHovered(true);
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const cardH = 140;
        const top = rect.top + cardH > window.innerHeight
          ? window.innerHeight - cardH - 8
          : rect.top;
        setCardStyle({ top, left: rect.right + 8 });
      }
    }, 350);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    dismissCard();
    onContextMenu?.(e);
  }, [dismissCard, onContextMenu]);

  const statusLabel = status === 'online' ? 'Online' : status === 'idle' ? 'Away' : status === 'dnd' ? 'DND' : 'Offline';

  return (
    <div
      ref={ref}
      className={`side-member${isSelf ? ' self' : ''}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={dismissCard}
      style={{ cursor: clickable ? 'pointer' : undefined }}
    >
      <span className={`status-dot status-${status}`} />
      <div className="side-member-info">
        <span className="side-member-name">{displayName}</span>
        {customStatus ? <span className="side-member-custom-status">{customStatus}</span>
          : member.pronouns ? <span className="side-member-pronouns">{member.pronouns}</span> : null}
      </div>
      {member.primary_badge && <BadgeCompact badge={member.primary_badge} />}

      {hovered && createPortal(
        <div className="member-card" style={cardStyle}>
          <div className="member-card-accent" />
          <div className="member-card-body">
            <div className="member-card-header">
              <div className="member-card-avatar">{displayName.charAt(0).toUpperCase()}</div>
              <div className="member-card-identity">
                <div className="member-card-displayname">{displayName}</div>
                {(member.nickname || member.display_name) && <div className="member-card-username">@{member.username}</div>}
                {member.pronouns && <div className="member-card-pronouns">{member.pronouns}</div>}
              </div>
            </div>
            {customStatus && <div className="member-card-custom-status">{customStatus}</div>}
            <div className="member-card-row">
              <span className="member-card-status">
                <span className={`status-dot status-${status}`} />
                {statusLabel}
              </span>
              {member.primary_badge && (
                <span className="member-card-badge">
                  <BadgeCompact badge={member.primary_badge} />
                </span>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Video tile — attaches a MediaStream to a <video> element ──

function VideoTile({ stream, muted, label, onHide, onStop }: { stream: MediaStream; muted?: boolean; label: string; onHide?: () => void; onStop?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.srcObject = stream;
    return () => { if (el) { el.pause(); el.srcObject = null; } };
  }, [stream]);
  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="video-tile-label">{label}</span>
      <div className="video-tile-actions">
        {onStop && (
          <button className="video-tile-btn stop" onClick={onStop} title="Stop stream">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
        {onHide && (
          <button className="video-tile-btn hide" onClick={onHide} title="Hide video">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Component ──

export default function BurrowView({
  serverId, serverName, currentUserId, currentUsername, compact, userStatus = 'online', presenceMap = {}, customStatusMap = {}, onMemberClick,
  channelUnreads = {}, onAckChannel,
}: BurrowViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorized, setUncategorized] = useState<Channel[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<SpineMessage[]>([]);
  const [presence] = useState<PresenceUser[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'overview' | 'channels' | 'invites' | 'roles' | 'members' | 'manage'>('overview');
  const [serverNameDraft, setServerNameDraft] = useState(serverName);
  const [invites, setInvites] = useState<{ code: string; uses: number; max_uses: number | null; expires_at: string | null }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; permissions: string; position: number; hoist: boolean; color?: string; mentionable?: boolean }[]>([]);
  const [members, setMembers] = useState<{ user_id: string; username: string; joined_at?: string; trust_score?: number; trust_tier?: number; nickname?: string; bio?: string; pronouns?: string }[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelCategory, setNewChannelCategory] = useState<string | ''>('');
  const [newChannelBitrate, setNewChannelBitrate] = useState(64);
  const [newChannelUserLimit, setNewChannelUserLimit] = useState(0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState(false);
  const [editingPerms, setEditingPerms] = useState<bigint>(0n);
  const [settingsToast, setSettingsToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [roleNameDraft, setRoleNameDraft] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState<string>('0');
  const [inviteExpiresIn, setInviteExpiresIn] = useState<string>('0');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [searchResults, setSearchResults] = useState<SpineMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasSearched, setSearchHasSearched] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterUserText, setFilterUserText] = useState('');
  const [filterUserOpen, setFilterUserOpen] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterAfter, setFilterAfter] = useState('');
  const [filterBefore, setFilterBefore] = useState('');
  const [contentLoading, setContentLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [draftRoles, setDraftRoles] = useState<typeof roles | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [serverMembers, setServerMembers] = useState<{ user_id: string; username: string; display_name?: string; nickname?: string; bio?: string; pronouns?: string; primary_badge?: BadgeData | null; role_ids?: string[] }[]>([]);
  const [myPerms, setMyPerms] = useState<bigint>(0n);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: typeof serverMembers[0] } | null>(null);
  const [ctxNicknameEdit, setCtxNicknameEdit] = useState<string | null>(null);
  const [ctxRolesOpen, setCtxRolesOpen] = useState(false);
  const [ctxTimeoutOpen, setCtxTimeoutOpen] = useState(false);

  // Channel / category context menu + permissions editor
  const [channelCtx, setChannelCtx] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [categoryCtx, setCategoryCtx] = useState<{ x: number; y: number; category: Category } | null>(null);
  const [permEditor, setPermEditor] = useState<{ type: 'channel' | 'category'; id: string; name: string; categoryId?: string } | null>(null);
  const [permSelectedRole, setPermSelectedRole] = useState<string | null>(null);
  const [permOverrides, setPermOverrides] = useState<Record<string, { allow: bigint; deny: bigint }>>({});
  const [permDirty, setPermDirty] = useState<Record<string, { allow: bigint; deny: bigint }>>({});
  const [permCategoryRef, setPermCategoryRef] = useState<Record<string, { allow: bigint; deny: bigint }> | null>(null);
  const [permSynced, setPermSynced] = useState(true);
  const [permSaving, setPermSaving] = useState(false);

  // Voice state — initialise from engine so remount preserves connection
  const [voiceState, setVoiceState] = useState<VoiceEngineState>(() => getVoiceState());
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>(() => getVoiceUsers());
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const voiceUsersRef = useRef<VoiceUser[]>(getVoiceUsers());
  const [voiceQuality, setVoiceQuality] = useState<VoiceQuality>('unknown');
  const [showDebugCard, setShowDebugCard] = useState(false);
  const [debugInfo, setDebugInfo] = useState<VoiceDebugInfo | null>(null);
  /** Remote video: userId → Map<streamKey, MediaStream> */
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Map<string, Map<string, MediaStream>>>(new Map());
  const [hiddenVideos, setHiddenVideos] = useState<Set<string>>(new Set());
  const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
  const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null);
  const [showStreamPicker, setShowStreamPicker] = useState<'status' | 'footer' | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);

  // Refresh channels/categories in-place (avoids window.location.reload)
  const refreshChannels = useCallback(() => {
    api.listCategories(serverId)
      .then((res) => {
        const cats: Category[] = res.categories || [];
        const uncat: Channel[] = res.uncategorized || [];
        setCategories(cats);
        setUncategorized(uncat);
        import('../cache').then(({ cacheChannels }) => {
          cacheChannels(serverId, [...cats.map((c) => ({ ...c, _isCat: true })), ...uncat]);
        }).catch(() => {});
      })
      .catch(console.error);
  }, [serverId]);

  // PiP drag state
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const pipDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Enumerate cameras when stream picker opens
  useEffect(() => {
    if (showStreamPicker !== null) {
      enumerateCameraDevices().then(setCameraDevices);
    }
  }, [showStreamPicker]);

  // Close card popover on outside click
  useEffect(() => {
    if (!openCardMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.voice-card-menu-wrapper')) setOpenCardMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCardMenu]);

  // Re-register voice callbacks when component remounts while engine is active
  useEffect(() => {
    const vs = getVoiceState();
    if (vs.connectionState !== 'disconnected' && vs.serverId === serverId) {
      updateCallbacks({
        onStateChange: (s) => setVoiceState({ ...s }),
        onVoiceStates: (states) => {
          if (states.length > 0) {
            voiceUsersRef.current = states;
            setVoiceUsers([...states]);
          }
        },
        onSpeaking: (userId, speaking) => {
          setSpeakingUsers((prev) => {
            const next = new Set(prev);
            if (speaking) next.add(userId);
            else next.delete(userId);
            return next;
          });
        },
        onError: (err) => console.error('[voice]', err),
        onRemoteVideo: (userId, streamKey, stream) => {
          setRemoteVideoStreams((prev) => {
            const next = new Map(prev);
            if (streamKey === '*') {
              next.delete(userId);
            } else if (stream) {
              const userStreams = new Map(next.get(userId) || []);
              userStreams.set(streamKey, stream);
              next.set(userId, userStreams);
            } else {
              const userStreams = next.get(userId);
              if (userStreams) {
                const updated = new Map(userStreams);
                updated.delete(streamKey);
                if (updated.size === 0) next.delete(userId);
                else next.set(userId, updated);
              }
            }
            return next;
          });
        },
      });
    }
  }, [serverId]);

  // Poll connection quality while connected
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

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu && !channelCtx && !categoryCtx) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); setChannelCtx(null); setCategoryCtx(null); e.stopPropagation(); }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [contextMenu, channelCtx, categoryCtx]);

  // Load categories + channels on server entry
  useEffect(() => {
    setContentLoading(true);

    // Hydrate channels from cache first
    import('../cache').then(({ getCachedChannels, getCachedRoles }) => {
      getCachedChannels(serverId).then((cached) => {
        if (cached.length) {
          // Split cached channels into categories + uncategorized
          const cats = cached.filter((c: any) => c._isCat);
          const flat = cached.filter((c: any) => !c._isCat);
          if (cats.length) {
            setCategories(cats.map((c: any) => ({ id: c.id, name: c.name, position: c.position, channels: c.channels || [] })));
          }
          if (flat.length) setUncategorized(flat);
        }
      }).catch(() => {});
      getCachedRoles(serverId).then((cached) => {
        if (cached.length) setRoles(cached);
      }).catch(() => {});
    }).catch(() => {});

    api.listCategories(serverId)
      .then((res) => {
        const cats: Category[] = res.categories || [];
        const uncat: Channel[] = res.uncategorized || [];
        setCategories(cats);
        setUncategorized(uncat);

        // Auto-select first category (or uncategorized if no categories)
        if (cats.length > 0) {
          setActiveCategory(cats[0].id);
          const firstText = cats[0].channels.find((c) => c.type === 'text');
          if (firstText) setActiveChannel(firstText);
        } else if (uncat.length > 0) {
          setActiveCategory('__uncategorized__');
          const firstText = uncat.find((c) => c.type === 'text');
          if (firstText) setActiveChannel(firstText);
        }

        // Cache channels + categories
        import('../cache').then(({ cacheChannels }) => {
          const toCache = [
            ...cats.map((c) => ({ ...c, _isCat: true })),
            ...uncat,
          ];
          cacheChannels(serverId, toCache);
        }).catch(() => {});
      })
      .catch((err) => {
        console.error('Failed to load categories:', err);
        // Fallback: load flat channel list
        api.listChannels(serverId).then((res) => {
          const chs: Channel[] = res.channels || [];
          setUncategorized(chs);
          setActiveCategory('__uncategorized__');
          const firstText = chs.find((c: Channel) => c.type === 'text');
          if (firstText) setActiveChannel(firstText);
        }).catch(console.error);
      })
      .finally(() => setContentLoading(false));

    // Load member list for side panel
    api.listMembers(serverId).then((r) => {
      const list = (r.members || []).map((m: Record<string, unknown>) => ({
        user_id: String(m.user_id || m.id),
        username: String(m.username),
        display_name: m.display_name as string | undefined,
        nickname: m.nickname as string | undefined,
        bio: m.bio as string | undefined,
        pronouns: m.pronouns as string | undefined,
        primary_badge: m.primary_badge as BadgeData | null | undefined,
        role_ids: (m.role_ids as string[] | undefined) || [],
      }));
      setServerMembers(list);
    }).catch(console.error);

    // Load roles for member panel grouping
    api.listRoles(serverId).then((r) => {
      const roles = r.data || [];
      setRoles(roles);
      import('../cache').then(({ cacheRoles }) => cacheRoles(serverId, roles)).catch(() => {});
    }).catch(() => {});

    // Load current user's permissions
    api.getMyPermissions(serverId).then((r) => {
      try { setMyPerms(BigInt(r.permissions)); } catch { setMyPerms(0n); }
    }).catch(() => {});
  }, [serverId]);

  // Channels visible in the tab bar for the active category
  const tabChannels = useMemo(() => {
    if (activeCategory === '__uncategorized__') return uncategorized;
    const cat = categories.find((c) => c.id === activeCategory);
    return cat?.channels || [];
  }, [activeCategory, categories, uncategorized]);

  // Load messages + subscribe to WebSocket when active channel changes
  useEffect(() => {
    if (!activeChannel || activeChannel.type === 'voice') {
      setMessages([]);
      return;
    }

    // Hydrate from cache first
    import('../cache').then(({ getCachedMessages }) =>
      getCachedMessages(activeChannel.id).then((cached) => {
        if (cached.length) setMessages(cached.map(mapMsg));
      })
    ).catch(() => {});

    setMessagesLoading(true);
    api.listMessages(serverId, activeChannel.id, { limit: 50 })
      .then((res) => {
        const msgs = (res.messages || []).reverse().map(mapMsg);
        setMessages(msgs);
        // Seed last_seq from initial message load
        const topic = `channel:${activeChannel.id}`;
        for (const m of msgs) {
          if (m.channel_seq) updateLastSeq(topic, m.channel_seq);
        }
        // Ack last message to clear unread
        if (msgs.length > 0 && onAckChannel) {
          onAckChannel(activeChannel.id, msgs[msgs.length - 1].id);
        }
        // Cache messages
        import('../cache').then(({ cacheMessages }) =>
          cacheMessages(activeChannel.id, msgs)
        ).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setMessagesLoading(false));

    const topic = `channel:${activeChannel.id}`;
    joinChannel(topic, (event, payload) => {
      if (event === 'message_create') {
        const msg = mapMsg(payload);
        if (typeof msg.channel_seq === 'number') updateLastSeq(topic, msg.channel_seq);
        // Auto-ack new messages while viewing this channel
        if (onAckChannel) onAckChannel(activeChannel.id, msg.id);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const tempIdx = prev.findIndex(
            (m) => typeof m.id === 'string' && m.id.startsWith('temp-') &&
              m.author.id === msg.author?.id && m.content === msg.content
          );
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = msg;
            return next;
          }
          return [...prev, msg];
        });
      } else if (event === 'message_edit') {
        const edited = mapMsg(payload);
        if (typeof edited.channel_seq === 'number') updateLastSeq(topic, edited.channel_seq);
        setMessages((prev) => prev.map((m) =>
          m.id === edited.id ? { ...m, content: edited.content, edited_at: edited.edited_at } : m
        ));
      } else if (event === 'message_delete') {
        const { id, channel_seq } = payload;
        if (typeof channel_seq === 'number') updateLastSeq(topic, channel_seq);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } else if (event === 'reaction_add') {
        const { message_id, user_id, emoji } = payload;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== message_id) return m;
          const oldReactions = m.reactions ?? [];
          const idx = oldReactions.findIndex((r) => r.emoji === emoji);
          let reactions;
          if (idx !== -1) {
            const existing = oldReactions[idx];
            if (existing.userIds.includes(user_id)) return m;
            reactions = oldReactions.map((r, i) =>
              i === idx ? { ...r, userIds: [...r.userIds, user_id] } : r
            );
          } else {
            reactions = [...oldReactions, { emoji, userIds: [user_id] }];
          }
          return { ...m, reactions };
        }));
      } else if (event === 'reaction_remove') {
        const { message_id, user_id, emoji } = payload;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== message_id) return m;
          const reactions = (m.reactions || [])
            .map((r) => r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== user_id) } : r)
            .filter((r) => r.userIds.length > 0);
          return { ...m, reactions };
        }));
      }
    });

    return () => leaveChannel(topic);
  }, [serverId, activeChannel?.id]);

  function mapMsg(m: any): SpineMessage {
    return {
      ...m,
      replyTo: m.replyTo || m.reply_to_id || undefined,
      reactions: m.reactions || [],
    };
  }

  const handleSend = useCallback(async (content: string, replyTo?: string, attachments?: MessageAttachment[]) => {
    if ((!content.trim() && (!attachments || attachments.length === 0)) || !activeChannel) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: SpineMessage = {
      id: tempId,
      content,
      author: { id: currentUserId, username: currentUsername },
      timestamp: new Date().toISOString(),
      channel_seq: 0,
      status: 'pending',
      replyTo,
      attachments,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const apiAttachments = attachments?.map(({ key, filename, content_type, size }) => ({
        key, filename, content_type, size,
      }));
      const res = await api.sendMessage(serverId, activeChannel.id, content, replyTo, apiAttachments);
      const real = mapMsg(res.message || res);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...optimistic, ...real, status: undefined } : m));
    } catch (err) {
      console.error('Failed to send:', err);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m));
      // Queue for retry on reconnect
      import('../offlineQueue').then(({ enqueue }) => {
        const apiAttachments = attachments?.map(({ key, filename, content_type, size }) => ({
          key, filename, content_type, size,
        }));
        enqueue({ serverId, channelId: activeChannel.id, content, tempId, replyTo, attachments: apiAttachments });
      }).catch(() => {});
    }
  }, [serverId, activeChannel, currentUserId, currentUsername]);

  const handleUploadFile = useCallback(async (file: File): Promise<MessageAttachment> => {
    const res = await api.uploadFile(file, 'attachments');
    return {
      key: res.key,
      filename: file.name,
      content_type: res.content_type || file.type,
      size: res.size || file.size,
      url: res.url,
      scan_status: res.scan_status || 'pending',
      virus_result: res.virus_result,
      mime_verified: res.mime_verified,
      expires_at: res.expires_at,
    };
  }, []);

  // Poll scan status for attachments still pending/scanning
  useEffect(() => {
    const pendingKeys = new Set<string>();
    for (const msg of messages) {
      if (!msg.attachments) continue;
      for (const att of msg.attachments) {
        if (att.key && (att.scan_status === 'pending' || att.scan_status === 'scanning')) {
          pendingKeys.add(att.key);
        }
      }
    }
    if (pendingKeys.size === 0) return;

    const timer = setInterval(async () => {
      for (const key of pendingKeys) {
        try {
          const res = await api.getScanStatus(key);
          if (res.scan_status && res.scan_status !== 'pending' && res.scan_status !== 'scanning') {
            setMessages((prev) =>
              prev.map((m) => {
                if (!m.attachments) return m;
                const updated = m.attachments.map((a) =>
                  a.key === key ? { ...a, scan_status: res.scan_status, virus_result: res.virus_result, mime_verified: res.mime_verified, expires_at: res.expires_at } : a
                );
                return updated !== m.attachments ? { ...m, attachments: updated } : m;
              })
            );
            pendingKeys.delete(key);
          }
        } catch { /* retry next interval */ }
      }
      if (pendingKeys.size === 0) clearInterval(timer);
    }, 3000);

    return () => clearInterval(timer);
  }, [messages]);

  const handleEdit = useCallback(async (messageId: string, newContent: string) => {
    if (!activeChannel) return;
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m));
    try {
      await api.editMessage(serverId, activeChannel.id, messageId, newContent);
    } catch (err) {
      console.error('Failed to edit:', err);
    }
  }, [serverId, activeChannel]);

  const handleDelete = useCallback(async (messageId: string) => {
    if (!activeChannel) return;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await api.deleteMessage(serverId, activeChannel.id, messageId);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [serverId, activeChannel]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!activeChannel) return;
    try {
      // Toggle: if user already reacted with this emoji, remove it
      const msg = messages.find((m) => m.id === messageId);
      const existing = msg?.reactions?.find((r) => r.emoji === emoji);
      if (existing && existing.userIds.includes(currentUserId)) {
        // Optimistic remove
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = (m.reactions || [])
            .map((r) => r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== currentUserId) } : r)
            .filter((r) => r.userIds.length > 0);
          return { ...m, reactions };
        }));
        await api.removeReaction(serverId, activeChannel.id, messageId, emoji);
      } else {
        // Optimistic add
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m;
          const oldReactions = m.reactions ?? [];
          const idx = oldReactions.findIndex((r) => r.emoji === emoji);
          let reactions;
          if (idx !== -1) {
            reactions = oldReactions.map((r, i) =>
              i === idx ? { ...r, userIds: [...r.userIds, currentUserId] } : r
            );
          } else {
            reactions = [...oldReactions, { emoji, userIds: [currentUserId] }];
          }
          return { ...m, reactions };
        }));
        await api.reactToMessage(serverId, activeChannel.id, messageId, emoji);
      }
    } catch (err) {
      console.error('Failed to react:', err);
    }
  }, [serverId, activeChannel, messages, currentUserId]);

  const handleSearch = useCallback(async (q: string, offset = 0) => {
    if (q.length < 2) return;
    setSearching(true);
    setSearchHasSearched(true);
    try {
      const filters: Record<string, string | number> = { offset };
      if (filterUser) filters.author_id = filterUser;
      if (filterType) filters.content_type = filterType;
      if (filterAfter) filters.after = filterAfter;
      if (filterBefore) filters.before = filterBefore;
      const res = await api.searchMessages(serverId, q, filters as any);
      setSearchResults((res.messages || []).map(mapMsg));
      setSearchTotal(res.total || 0);
      setSearchOffset(offset);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [serverId, filterUser, filterType, filterAfter, filterBefore]);

  function handleCategorySelect(catId: string) {
    setActiveCategory(catId);
    setSearchOpen(false);
    // Auto-select first text channel in this category
    const chans = catId === '__uncategorized__'
      ? uncategorized
      : categories.find((c) => c.id === catId)?.channels || [];
    const firstText = chans.find((c) => c.type === 'text');
    if (firstText) setActiveChannel(firstText);
  }

  function handleTabSelect(channel: Channel) {
    setActiveChannel(channel);
  }

  function handleVoiceDisconnect() {
    disconnectVoice();
    setVoiceState(getVoiceState());
    setVoiceUsers([]);
    setSpeakingUsers(new Set());
  }

  async function handleVoiceConnect(channel: Channel) {
    // If in another channel, disconnect first
    if (getVoiceState().connectionState !== 'disconnected') {
      disconnectVoice();
    }

    const sock = getSocket();
    if (!sock) return;

    try {
      await connectVoice(sock, serverId, channel.id, currentUserId, {
        onStateChange: (s) => setVoiceState({ ...s }),
        onVoiceStates: (states) => {
          if (states.length > 0) {
            voiceUsersRef.current = states;
            setVoiceUsers([...states]);
          }
        },
        onSpeaking: (userId, speaking) => {
          setSpeakingUsers((prev) => {
            const next = new Set(prev);
            if (speaking) next.add(userId);
            else next.delete(userId);
            return next;
          });
        },
        onError: (err) => console.error('[voice]', err),
        onRemoteVideo: (userId, streamKey, stream) => {
          setRemoteVideoStreams((prev) => {
            const next = new Map(prev);
            if (streamKey === '*') {
              // Remove all streams for this user
              next.delete(userId);
            } else if (stream) {
              const userStreams = new Map(next.get(userId) || []);
              userStreams.set(streamKey, stream);
              next.set(userId, userStreams);
            } else {
              const userStreams = next.get(userId);
              if (userStreams) {
                const updated = new Map(userStreams);
                updated.delete(streamKey);
                if (updated.size === 0) next.delete(userId);
                else next.set(userId, updated);
              }
            }
            return next;
          });
        },
      }, { relay: false });
    } catch {
      // Error handled in callbacks
    }
  }

  return (
    <div className={`burrow-shell${compact ? ' compact' : ''}`}>
      {/* Channel Tab Bar — top */}
      <div className="channel-tab-bar" onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const tabs = Array.from((e.currentTarget as HTMLElement).querySelectorAll('button.channel-tab')) as HTMLElement[];
        const idx = tabs.indexOf(e.target as HTMLElement);
        if (idx < 0) return;
        const next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
        tabs[next]?.focus();
      }}>
        {tabChannels.map((ch) => {
          const isActive = activeChannel?.id === ch.id;
          const isVoiceConnected = ch.type === 'voice' && voiceState.channelId === ch.id;
          const icon = CHANNEL_ICONS[ch.type] || '#';
          const voiceCount = ch.type === 'voice' ? voiceUsers.filter((u) => String(u.channel_id) === String(ch.id)).length : 0;
          const hasUnread = !isActive && !!channelUnreads[ch.id];
          return (
            <button
              key={ch.id}
              className={`channel-tab${isActive ? ' active' : ''}${ch.type === 'voice' ? ' voice' : ''}${isVoiceConnected ? ' voice-connected' : ''}${hasUnread ? ' unread' : ''}`}
              onClick={() => handleTabSelect(ch)}
              onContextMenu={(e) => { e.preventDefault(); setChannelCtx({ x: e.clientX, y: e.clientY, channel: ch }); setCategoryCtx(null); }}
              title={ch.name}
            >
              <span className="channel-tab-icon">{icon}</span>
              <span className="channel-tab-name">{ch.name}</span>
              {ch.type === 'voice' && voiceCount > 0 && (
                <span className="voice-tab-count">{voiceCount}</span>
              )}
              {hasUnread && <span className="channel-unread-dot" />}
            </button>
          );
        })}
      </div>

      <div className={`burrow-body${contentLoading ? ' body-loading' : ''}`}>
        {/* Members Panel (left) */}
        <div className="burrow-side-panel">
          <div className="side-panel-header">Members</div>
          <div className="side-panel-content">
            <div className="side-panel-members">
              {(() => {
                // Compute status for each member
                const withStatus = serverMembers.map((m) => ({
                  ...m,
                  status: m.user_id === currentUserId ? userStatus : (presenceMap[m.user_id] || 'offline'),
                }));
                const online = withStatus.filter((m) => m.status !== 'offline');
                const offline = withStatus.filter((m) => m.status === 'offline');

                // Hoisted roles sorted by hierarchy (highest first)
                const hoisted = [...roles].filter((r) => r.hoist && r.name !== '@everyone').sort((a, b) => b.position - a.position);

                // Build groups for online members
                const claimed = new Set<string>();
                const groups: { label: string; color?: string; members: typeof online }[] = [];

                for (const role of hoisted) {
                  const group = online.filter((m) => !claimed.has(m.user_id) && m.role_ids?.includes(role.id));
                  if (group.length > 0) {
                    group.forEach((m) => claimed.add(m.user_id));
                    groups.push({ label: role.name, color: role.color, members: group });
                  }
                }

                // Remaining online members (no hoisted role or already ungrouped)
                const remaining = online.filter((m) => !claimed.has(m.user_id));
                if (remaining.length > 0) {
                  groups.push({ label: 'Online', members: remaining });
                }

                return (
                  <>
                    {groups.map((g) => (
                      <div key={g.label} className="member-group">
                        <div className="member-group-label" style={g.color ? { color: g.color } : undefined}>
                          {g.label} — {g.members.length}
                        </div>
                        {g.members.map((m) => (
                          <MemberItem
                            key={m.user_id}
                            member={m}
                            status={m.status}
                            customStatus={customStatusMap[m.user_id]}
                            isSelf={m.user_id === currentUserId}
                            onClick={() => onMemberClick?.(m)}
                            clickable={!!onMemberClick}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, member: m }); setCtxNicknameEdit(null); setCtxRolesOpen(false); setCtxTimeoutOpen(false); }}
                          />
                        ))}
                      </div>
                    ))}
                    {offline.length > 0 && (
                      <div className="member-group offline-group">
                        <div className="member-group-label">Offline — {offline.length}</div>
                        {offline.map((m) => (
                          <MemberItem
                            key={m.user_id}
                            member={m}
                            status={m.status}
                            customStatus={customStatusMap[m.user_id]}
                            isSelf={m.user_id === currentUserId}
                            onClick={() => onMemberClick?.(m)}
                            clickable={!!onMemberClick}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, member: m }); setCtxNicknameEdit(null); setCtxRolesOpen(false); setCtxTimeoutOpen(false); }}
                          />
                        ))}
                      </div>
                    )}
                    {serverMembers.length === 0 && <div className="side-panel-empty">No members</div>}
                  </>
                );
              })()}
            </div>
          </div>
          {voiceState.connectionState !== 'disconnected' ? (
            <div className="side-panel-status voice-active">
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
                      onClick={() => setShowStreamPicker((p) => p === 'status' ? null : 'status')}
                      title="Stream"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" />
                      </svg>
                    </button>
                    {showStreamPicker === 'status' && (
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
            <div className="side-panel-status" />
          )}
        </div>

        {/* Content Area — center */}
        <div className={`burrow-content${messagesLoading ? ' content-loading' : ''}`}>
          <button
            className={`content-search-btn${searchOpen ? ' active' : ''}`}
            onClick={() => {
              setSearchOpen((v) => !v);
              setSearchResults([]);
              setSearchQuery('');
              setSearchHasSearched(false);
              setSearchTotal(0);
              setSearchOffset(0);
              setFilterUser('');
              setFilterUserText('');
              setFilterUserOpen(false);
              setFilterType('');
              setFilterAfter('');
              setFilterBefore('');
            }}
            title="Search messages"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          {searchOpen && (
            <div className="msg-search-popup">
              <div className="msg-search-header">
                <span className="msg-search-title">Search</span>
                <button className="msg-search-close" onClick={() => { setSearchOpen(false); setSearchResults([]); setSearchQuery(''); setSearchHasSearched(false); }}>×</button>
              </div>
              <div className="msg-search-bar">
                <svg className="msg-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="msg-search-input"
                  autoFocus
                  placeholder="Search messages…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch(searchQuery);
                    if (e.key === 'Escape') { setSearchOpen(false); setSearchResults([]); }
                  }}
                />
                {searchQuery && (
                  <button className="msg-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchHasSearched(false); }}>×</button>
                )}
              </div>
              <div className="msg-search-section-label">Filters</div>
              <div className="msg-search-filters">
                <div className="msg-search-filter-group">
                  <label className="msg-search-filter-label">User</label>
                  <div className="msg-search-user-filter">
                    <input
                      className="msg-search-filter"
                      placeholder="Type to filter…"
                      value={filterUserText}
                      onChange={(e) => {
                        setFilterUserText(e.target.value);
                        setFilterUserOpen(true);
                        if (!e.target.value) { setFilterUser(''); }
                      }}
                      onFocus={() => setFilterUserOpen(true)}
                      onBlur={() => setTimeout(() => setFilterUserOpen(false), 150)}
                    />
                    {filterUserOpen && filterUserText.length > 0 && (() => {
                      const q = filterUserText.toLowerCase();
                      const matches = serverMembers.filter((m) => {
                        const dn = m.display_name || '';
                        const nick = m.nickname || '';
                        return dn.toLowerCase().includes(q) || nick.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
                      }).slice(0, 6);
                      if (matches.length === 0) return null;
                      return (
                        <div className="msg-search-user-dropdown">
                          {matches.map((m) => {
                            const label = m.nickname || m.display_name || m.username;
                            return (
                              <button
                                key={m.user_id}
                                className="msg-search-user-card"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setFilterUser(m.user_id);
                                  setFilterUserText(label);
                                  setFilterUserOpen(false);
                                }}
                              >
                                <div className="user-card-avatar">{(m.display_name || m.username).charAt(0).toUpperCase()}</div>
                                <div className="user-card-info">
                                  <div className="user-card-names">
                                    <span className="user-card-display">{m.display_name || m.username}</span>
                                    {m.nickname && <span className="user-card-nick">— {m.nickname}</span>}
                                  </div>
                                  {(m.display_name || m.nickname) && <div className="user-card-username">@{m.username}</div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="msg-search-filter-group">
                  <label className="msg-search-filter-label">Type</label>
                  <select className="msg-search-filter" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="">All types</option>
                    <option value="message">Message</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="gif">GIF</option>
                    <option value="file">File</option>
                  </select>
                </div>
                <div className="msg-search-filter-group">
                  <label className="msg-search-filter-label">After</label>
                  <input className="msg-search-filter" type="date" value={filterAfter} onChange={(e) => setFilterAfter(e.target.value)} />
                </div>
                <div className="msg-search-filter-group">
                  <label className="msg-search-filter-label">Before</label>
                  <input className="msg-search-filter" type="date" value={filterBefore} onChange={(e) => setFilterBefore(e.target.value)} />
                </div>
              </div>
              <div className="msg-search-divider" />
              {searching && <div className="msg-search-status"><div className="msg-search-spinner" />Searching…</div>}
              {!searching && !searchHasSearched && (
                <div className="msg-search-hint">Press Enter to search</div>
              )}
              {!searching && searchHasSearched && searchResults.length > 0 && (
                <>
                  <div className="msg-search-meta">{searchTotal} result{searchTotal !== 1 ? 's' : ''}</div>
                  <div className="msg-search-results">
                    {searchResults.map((msg) => (
                      <div key={msg.id} className="msg-search-result">
                        <div className="msg-search-result-avatar">{(msg.author.display_name || msg.author.username).charAt(0).toUpperCase()}</div>
                        <div className="msg-search-result-body">
                          <div className="msg-search-result-header">
                            <span className="msg-search-author">{msg.author.display_name || msg.author.username}</span>
                            <span className="msg-search-time">{new Date(msg.timestamp).toLocaleDateString()}</span>
                          </div>
                          <div className="msg-search-content">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {searchTotal > 25 && (
                    <div className="msg-search-pagination">
                      <button
                        className="msg-search-page-btn"
                        disabled={searchOffset === 0}
                        onClick={() => handleSearch(searchQuery, searchOffset - 25)}
                      >← Prev</button>
                      <span className="msg-search-page-info">
                        {searchOffset + 1}–{Math.min(searchOffset + 25, searchTotal)} of {searchTotal}
                      </span>
                      <button
                        className="msg-search-page-btn"
                        disabled={searchOffset + 25 >= searchTotal}
                        onClick={() => handleSearch(searchQuery, searchOffset + 25)}
                      >Next →</button>
                    </div>
                  )}
                </>
              )}
              {!searching && searchHasSearched && searchResults.length === 0 && (
                <div className="msg-search-status">No results found</div>
              )}
            </div>
          )}
          {contentLoading ? (
            <div className="burrow-loading">
              <div className="burrow-loading-spinner" />
              <p>Loading…</p>
            </div>
          ) : activeChannel && activeChannel.type === 'voice' ? (
            /* ── Voice Channel View ── */
            (() => {
              const isConnectedHere = voiceState.channelId === activeChannel.id && voiceState.connectionState !== 'disconnected';
              const isConnectedElsewhere = voiceState.connectionState !== 'disconnected' && voiceState.channelId !== activeChannel.id;
              const isConnecting = voiceState.connectionState === 'connecting' && voiceState.channelId === activeChannel.id;
              const channelUsers = voiceUsers.filter((u) => String(u.channel_id) === String(activeChannel.id));
              return (
                <div className="voice-channel-view">
                  {/* Header — small, top-left aligned */}
                  <div className="voice-channel-top">
                    <div className="voice-channel-header">
                      <svg className="voice-channel-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" /></svg>
                      <span className="voice-channel-name">{activeChannel.name}</span>
                    </div>
                    <div className="voice-channel-subtitle">
                      {isConnecting ? (
                        <span className="voice-status-connecting"><span className="voice-pulse-dot">●</span> Connecting…</span>
                      ) : isConnectedHere && voiceState.peerStatus === 'negotiating' ? (
                        <span className="voice-status-connecting"><span className="voice-pulse-dot">●</span> ICE Negotiating…</span>
                      ) : isConnectedHere && voiceState.peerStatus === 'no-route' ? (
                        <span className="voice-status-failed">✕ No Route Found</span>
                      ) : isConnectedHere && voiceState.peerStatus === 'failed' ? (
                        <span className="voice-status-failed">✕ Peer Connection Failed</span>
                      ) : isConnectedHere ? (
                        <span className="voice-status-connected">● Connected</span>
                      ) : channelUsers.length > 0 ? (
                        <span className="voice-channel-view-info">{channelUsers.length} user{channelUsers.length !== 1 ? 's' : ''} in channel</span>
                      ) : null}
                    </div>
                    <div className="voice-channel-meta">
                      {activeChannel.bitrate ? `${Math.round(activeChannel.bitrate / 1000)} kbps` : '64 kbps'}
                      {activeChannel.user_limit ? ` · ${activeChannel.user_limit} max` : ''}
                    </div>
                  </div>

                  {/* Video grid — shown when anyone has video on */}
                  {(() => {
                    const localStreams = isConnectedHere ? getLocalStreams() : new Map();
                    // Build list of visible tiles: { key, label, stream, kind, onHide }
                    const tiles: { key: string; label: string; stream: MediaStream; kind: StreamKind; muted?: boolean; onHide?: () => void; onStop?: () => void }[] = [];
                    // Local camera
                    const camStream = localStreams.get('camera');
                    if (camStream && !hiddenVideos.has('self:camera')) {
                      tiles.push({ key: 'self:camera', label: 'You (Camera)', stream: camStream.stream, kind: 'camera', muted: true, onHide: () => setHiddenVideos((p) => new Set(p).add('self:camera')), onStop: () => { toggleCamera().then(() => setVoiceState({ ...getVoiceState() })); } });
                    }
                    // Local screens
                    for (const [id, info] of localStreams) {
                      if (id === 'camera') continue;
                      if (hiddenVideos.has(`self:${id}`)) continue;
                      tiles.push({ key: `self:${id}`, label: `You (Screen)`, stream: info.stream, kind: 'screen', muted: true, onHide: () => setHiddenVideos((p) => new Set(p).add(`self:${id}`)), onStop: () => { stopScreenShare(id); setVoiceState({ ...getVoiceState() }); } });
                    }
                    // Remote streams
                    for (const u of channelUsers) {
                      if (String(u.user_id) === currentUserId) continue;
                      const userStreams = remoteVideoStreams.get(String(u.user_id));
                      if (!userStreams) continue;
                      const member = serverMembers.find((m) => String(m.user_id) === String(u.user_id));
                      const displayName = member?.nickname || member?.display_name || member?.username || u.user_id.slice(0, 6);
                      for (const [streamKey, stream] of userStreams) {
                        const hideKey = `${u.user_id}:${streamKey}`;
                        if (hiddenVideos.has(hideKey)) continue;
                        const kind: StreamKind = streamKey === 'camera' ? 'camera' : 'screen';
                        const suffix = kind === 'screen' ? ' (Screen)' : '';
                        tiles.push({ key: hideKey, label: `${displayName}${suffix}`, stream, kind, onHide: () => setHiddenVideos((p) => new Set(p).add(hideKey)) });
                      }
                    }
                    if (tiles.length === 0) return null;
                    return (
                      <div className="video-grid-area">
                        <div className="video-grid">
                          {tiles.map((t) => (
                            <VideoTile key={t.key} stream={t.stream} muted={t.muted} label={t.label} onHide={t.onHide} onStop={t.onStop} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Members area — center of the view */}
                  <div className="voice-members-area">
                    {channelUsers.length > 0 ? (
                      <div className="voice-card-grid">
                        {channelUsers.map((u) => {
                          const uid = String(u.user_id);
                          const member = serverMembers.find((m) => String(m.user_id) === uid);
                          const isSpeaking = speakingUsers.has(uid);
                          const isSelf = uid === currentUserId;
                          const displayName = member?.nickname || member?.display_name || member?.username || uid.slice(0, 6);
                          const initial = displayName.charAt(0).toUpperCase();
                          const hidKey = isSelf ? 'self' : uid;
                          const hasVideo = typeof u.self_video === 'object' ? (u.self_video.camera || u.self_video.screens.length > 0) : !!u.self_video;
                          const isHidden = hiddenVideos.has(`${hidKey}:camera`) && hasVideo;
                          const vol = userVolumes.get(uid) ?? 1;
                          const isLocalMuted = localMutes.has(uid);
                          const cardClasses = [
                            'voice-card',
                            isSpeaking && !isSelf && !u.self_mute && !isLocalMuted ? 'speaking' : '',
                            isSelf ? 'self' : '',
                            u.self_mute ? 'muted' : '',
                            u.self_deaf ? 'deafened' : '',
                            hasVideo ? 'streaming' : '',
                            isLocalMuted ? 'local-muted' : '',
                          ].filter(Boolean).join(' ');
                          return (
                            <div key={uid} className={cardClasses}>
                              <div
                                className={`voice-card-clickable`}
                                onClick={() => {
                                  if (member) onMemberClick?.({ user_id: member.user_id, username: member.username, nickname: member.nickname });
                                }}
                              >
                                <div className={`voice-card-avatar${isSpeaking && !u.self_mute ? ' speaking' : ''}`}>
                                  <span className="voice-card-initial">{initial}</span>
                                </div>
                                <div className="voice-card-info">
                                  <span className="voice-card-name">{displayName}{isSelf && <span className="voice-card-you"> (you)</span>}</span>
                                  <div className="voice-card-status">
                                  {u.self_deaf ? (
                                    <span className="voice-card-badge deafened">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M18 8a6 6 0 0 0-9.33-5" /><path d="M3 18v-6a9 9 0 0 1 .47-2.83" /><path d="M21 12v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
                                      Deafened
                                    </span>
                                  ) : u.self_mute ? (
                                    <span className="voice-card-badge muted">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.48-.35 2.17" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                      Muted
                                    </span>
                                  ) : isSpeaking ? (
                                    <span className="voice-card-badge speaking">Speaking</span>
                                  ) : (
                                    <span className="voice-card-badge idle">Listening</span>
                                  )}
                                  {hasVideo && <span className="voice-card-badge streaming"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" /></svg> Live</span>}
                                </div>
                              </div>
                              </div>
                              <div className="voice-card-controls">
                                {!isSelf && isConnectedHere && (
                                  <div className="voice-card-menu-wrapper">
                                    <button
                                      className={`voice-card-menu-btn${openCardMenu === uid ? ' active' : ''}`}
                                      title="User options"
                                      onClick={() => setOpenCardMenu((p) => p === uid ? null : uid)}
                                    >
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5" /><circle cx="12" cy="12" r="2.5" /><circle cx="12" cy="19" r="2.5" /></svg>
                                    </button>
                                    {openCardMenu === uid && (
                                      <div className="voice-card-popover">
                                        <div className="voice-card-popover-section">
                                          <div className="voice-card-popover-label">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /></svg>
                                            Volume
                                            <span className="voice-card-popover-vol-pct">{Math.round(vol * 100)}%</span>
                                          </div>
                                          <input
                                            type="range"
                                            className="voice-volume-slider"
                                            min={0}
                                            max={2}
                                            step={0.005}
                                            value={vol}
                                            onChange={(e) => {
                                              const v = parseFloat(e.target.value);
                                              setUserVolumes((prev) => { const next = new Map(prev); next.set(uid, v); return next; });
                                              setUserVolume(uid, v);
                                            }}
                                          />
                                        </div>
                                        <div className="voice-card-popover-divider" />
                                        <button
                                          className={`voice-card-popover-option${localMutes.has(uid) ? ' active' : ''}`}
                                          onClick={() => {
                                            setLocalMutes((prev) => {
                                              const next = new Set(prev);
                                              if (next.has(uid)) { next.delete(uid); setUserVolume(uid, userVolumes.get(uid) ?? 1); }
                                              else { next.add(uid); setUserVolume(uid, 0); }
                                              return next;
                                            });
                                          }}
                                        >
                                          {localMutes.has(uid) ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
                                          ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" /></svg>
                                          )}
                                          {localMutes.has(uid) ? 'Unmute User' : 'Mute User'}
                                        </button>
                                        {isHidden && (
                                          <>
                                            <div className="voice-card-popover-divider" />
                                            <button
                                              className="voice-card-popover-option"
                                              onClick={() => {
                                                setHiddenVideos((prev) => { const next = new Set(prev); for (const k of next) { if (k.startsWith(`${hidKey}:`)) next.delete(k); } return next; });
                                                setOpenCardMenu(null);
                                              }}
                                            >
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                              Show Video
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isSelf && isHidden && (
                                  <button
                                    className="voice-card-unhide"
                                    title="Show video"
                                    onClick={() => setHiddenVideos((prev) => { const next = new Set(prev); for (const k of next) { if (k.startsWith(`${hidKey}:`)) next.delete(k); } return next; })}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="voice-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="voice-empty-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08" /></svg>
                        <span className="voice-empty-text">No one is here yet</span>
                        <span className="voice-empty-hint">Join to start a conversation</span>
                      </div>
                    )}
                  </div>

                  {/* Actions — bottom of the view */}
                  <div className="voice-channel-footer">
                    {isConnectedHere && (
                      <div className="voice-stream-controls">
                        <button
                          className={`voice-action-btn stream-toggle${(voiceState.selfVideo.camera || voiceState.selfVideo.screens.length > 0) ? ' active' : ''}`}
                          onClick={() => setShowStreamPicker((p) => p === 'footer' ? null : 'footer')}
                          title="Stream"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" /><polygon points="12 15 17 21 7 21 12 15" />
                          </svg>
                          {((voiceState.selfVideo.camera ? 1 : 0) + voiceState.selfVideo.screens.length) > 0 && (
                            <span className="stream-count-badge">{(voiceState.selfVideo.camera ? 1 : 0) + voiceState.selfVideo.screens.length}</span>
                          )}
                        </button>
                        {showStreamPicker === 'footer' && (
                          <div className="stream-picker-popover">
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
                    )}
                    {isConnectedHere ? (
                      <button className="voice-action-btn disconnect" onClick={handleVoiceDisconnect}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        Disconnect
                      </button>
                    ) : isConnectedElsewhere ? (
                      <button className="voice-action-btn switch" onClick={() => handleVoiceConnect(activeChannel)}>
                        Switch to this channel
                      </button>
                    ) : (
                      <button className="voice-action-btn join" onClick={() => handleVoiceConnect(activeChannel)} disabled={isConnecting}>
                        {isConnecting ? 'Connecting…' : 'Join Voice'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()
          ) : activeChannel ? (
            <DataSpine
              messages={messages}
              activeChannel={activeChannel}
              currentUserId={currentUserId}
              loading={messagesLoading}
              presence={presence}
              members={serverMembers as ServerMember[]}
              onSend={handleSend}
              onUploadFile={handleUploadFile}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
              onMemberClick={onMemberClick}
            />
          ) : (
            <div className="burrow-empty">
              <div className="burrow-empty-icon">⦿</div>
              <p>select a channel</p>
            </div>
          )}
        </div>

        {/* Category Rail — right */}
        <div className="category-rail">
          <div className="category-rail-header">
            <span className="category-rail-name" title={serverName}>{serverName}</span>
            <button
              className="category-rail-settings"
              title="Server Settings"
              onClick={() => {
                setServerSettingsOpen(true);
                setServerNameDraft(serverName);
                setSettingsTab('overview');
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
          <div className="category-rail-divider" />
          <div className="category-rail-list">
            {categories.map((cat) => {
              const catHasUnread = cat.channels.some((ch) => !!channelUnreads[ch.id]);
              return (
              <button
                key={cat.id}
                className={`category-pill${activeCategory === cat.id ? ' active' : ''}${catHasUnread ? ' has-unread' : ''}`}
                onClick={() => handleCategorySelect(cat.id)}
                onContextMenu={(e) => { e.preventDefault(); setCategoryCtx({ x: e.clientX, y: e.clientY, category: cat }); setChannelCtx(null); }}
                title={cat.name}
              >
                {cat.name}
                {catHasUnread && <span className="category-unread-dot" />}
              </button>
              );
            })}
            {uncategorized.length > 0 && (() => {
              const uncatHasUnread = uncategorized.some((ch) => !!channelUnreads[ch.id]);
              return (
              <button
                className={`category-pill${activeCategory === '__uncategorized__' ? ' active' : ''}${uncatHasUnread ? ' has-unread' : ''}`}
                onClick={() => handleCategorySelect('__uncategorized__')}
                title="General"
              >
                General
                {uncatHasUnread && <span className="category-unread-dot" />}
              </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Server Settings Overlay */}
      {serverSettingsOpen && (
        <div className="server-settings-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setServerSettingsOpen(false);
        }}>
          <div className="server-settings-panel">
            <div className="server-settings-sidebar">
              <h2>Server Settings</h2>
              <nav className="server-settings-nav">
                {(['overview', 'channels', 'invites', 'roles', 'members', 'manage'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`settings-tab ${settingsTab === tab ? 'active' : ''}`}
                    onClick={() => {
                      setSettingsTab(tab);
                      setSettingsLoading(false);
                      setDraftRoles(null);
                      if (tab === 'invites') { setSettingsLoading(true); api.listInvites(serverId).then((r) => setInvites((r.invites || []).map((i: Record<string, unknown>) => ({ code: i.code as string, uses: (i.uses_count || 0) as number, max_uses: (i.max_uses ?? null) as number | null, expires_at: (i.expires_at ?? null) as string | null })))).catch(() => {}).finally(() => setSettingsLoading(false)); }
                      if (tab === 'roles') { setSettingsLoading(true); api.listRoles(serverId).then((r) => { setRoles(r.data || []); setSelectedRole(null); }).catch(() => {}).finally(() => setSettingsLoading(false)); }
                      if (tab === 'members') { setSettingsLoading(true); api.listMembers(serverId).then((r) => setMembers((r.members || []).map((m: Record<string, unknown>) => ({ user_id: String(m.user_id || m.id), username: String(m.username), joined_at: m.joined_at as string | undefined, trust_score: m.trust_score as number | undefined, trust_tier: m.trust_tier as number | undefined })))).catch(() => {}).finally(() => setSettingsLoading(false)); }
                      if (tab === 'manage') { setSettingsLoading(true); api.listMembers(serverId).then((r) => setMembers((r.members || []).map((m: Record<string, unknown>) => ({ user_id: String(m.user_id || m.id), username: String(m.username), joined_at: m.joined_at as string | undefined, trust_score: m.trust_score as number | undefined, trust_tier: m.trust_tier as number | undefined })))).catch(() => {}).finally(() => setSettingsLoading(false)); }
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </nav>
            </div>
            <div className="server-settings-content">
              <div className="settings-content-header">
                <h3>{settingsTab.charAt(0).toUpperCase() + settingsTab.slice(1)}</h3>
                <button className="settings-close" onClick={() => setServerSettingsOpen(false)} title="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="settings-content-body">
                {settingsLoading && (
                  <div className="settings-spinner-wrap">
                    <div className="settings-spinner" />
                  </div>
                )}
                {!settingsLoading && settingsTab === 'overview' && (
                  <>
                    <div className="settings-group">
                      <h4>Server Name</h4>
                      <div className="settings-row vertical">
                        <input
                          className="settings-input"
                          value={serverNameDraft}
                          onChange={(e) => setServerNameDraft(e.target.value)}
                          maxLength={100}
                        />
                      </div>
                      <div className="settings-row">
                        <div className="settings-row-info" />
                        <button className="btn-primary btn-sm" onClick={async () => {
                          if (serverNameDraft.trim() && serverNameDraft !== serverName) {
                            await api.updateServer(serverId, { name: serverNameDraft.trim() });
                            setSettingsToast({ message: 'Server name updated', type: 'success' });
                          }
                        }}>Save</button>
                      </div>
                    </div>
                    <div className="settings-group">
                      <h4>Server ID</h4>
                      <div className="settings-row">
                        <div className="settings-row-info">
                          <span className="value mono">{serverId}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!settingsLoading && settingsTab === 'channels' && (
                  <>
                    <div className="settings-group">
                      <h4>Categories</h4>
                      <div className="settings-row">
                        <input
                          className="settings-input"
                          style={{ flex: 1 }}
                          placeholder="New category name"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newCategoryName.trim()) { api.createCategory(serverId, newCategoryName.trim()).then(() => { setNewCategoryName(''); refreshChannels(); }).catch(console.error); } }}
                        />
                        <button className="btn-primary btn-sm" onClick={() => { if (newCategoryName.trim()) { api.createCategory(serverId, newCategoryName.trim()).then(() => { setNewCategoryName(''); refreshChannels(); }).catch(console.error); } }}>Create</button>
                      </div>
                      {categories.map((cat) => (
                        <div key={cat.id} className="settings-row">
                          {editingCategoryId === cat.id ? (
                            <>
                              <input className="settings-input" style={{ flex: 1 }} value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && editingCategoryName.trim()) { api.updateCategory(serverId, cat.id, editingCategoryName.trim()).then(() => { setEditingCategoryId(null); refreshChannels(); }).catch(console.error); } if (e.key === 'Escape') setEditingCategoryId(null); }} autoFocus />
                              <button className="btn-primary btn-sm" onClick={() => { api.updateCategory(serverId, cat.id, editingCategoryName.trim()).then(() => { setEditingCategoryId(null); refreshChannels(); }).catch(console.error); }}>Save</button>
                              <button className="btn-ghost btn-sm" onClick={() => setEditingCategoryId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <div className="settings-row-info">
                                <label>{cat.name}</label>
                                <span className="value">{cat.channels.length} channel{cat.channels.length !== 1 ? 's' : ''}</span>
                              </div>
                              <button className="btn-ghost btn-sm" onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}>Edit</button>
                              <button className="btn-ghost btn-sm" style={{ color: 'var(--crimson)' }} onClick={() => { if (confirm(`Delete category "${cat.name}"? Channels will become uncategorized.`)) { api.deleteCategory(serverId, cat.id).then(() => refreshChannels()).catch(console.error); } }}>Delete</button>
                            </>
                          )}
                        </div>
                      ))}
                      {categories.length === 0 && <div className="settings-row"><div className="settings-row-info"><span className="value">No categories</span></div></div>}
                    </div>
                    <div className="settings-group">
                      <h4>Create Channel</h4>
                      <div className="settings-row">
                        <input
                          className="settings-input"
                          style={{ flex: 1 }}
                          placeholder="Channel name"
                          value={newChannelName}
                          onChange={(e) => setNewChannelName(e.target.value)}
                        />
                      </div>
                      <div className="settings-row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                        <div className="channel-type-picker">
                          {Object.entries(CHANNEL_ICONS).map(([type, icon]) => {
                            const enabled = type === 'text' || type === 'voice';
                            return (
                              <button
                                key={type}
                                className={`channel-type-btn ${newChannelType === type ? 'active' : ''} ${!enabled ? 'disabled' : ''}`}
                                onClick={() => { if (enabled) setNewChannelType(type); }}
                                title={enabled ? type : `${type} (coming soon)`}
                              >
                                <span className="channel-type-icon">{icon}</span>
                                <span className="channel-type-label">{type}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {newChannelType === 'voice' && (
                        <div className="settings-row voice-channel-opts" style={{ gap: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <label className="settings-label-sm">Bitrate (kbps)</label>
                            <select className="settings-input" value={newChannelBitrate} onChange={(e) => setNewChannelBitrate(Number(e.target.value))}>
                              <option value={32}>32</option>
                              <option value={64}>64</option>
                              <option value={96}>96</option>
                              <option value={128}>128</option>
                              <option value={256}>256</option>
                              <option value={384}>384</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="settings-label-sm">User Limit</label>
                            <select className="settings-input" value={newChannelUserLimit} onChange={(e) => setNewChannelUserLimit(Number(e.target.value))}>
                              <option value={0}>Unlimited</option>
                              {[2, 5, 10, 15, 25, 50, 99].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                      <div className="settings-row">
                        <select className="settings-input" value={newChannelCategory} onChange={(e) => setNewChannelCategory(e.target.value)}>
                          <option value="">Uncategorized</option>
                          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                        <button className="btn-primary btn-sm" onClick={() => {
                          if (newChannelName.trim()) {
                            const opts = newChannelType === 'voice' ? { bitrate: newChannelBitrate * 1000, user_limit: newChannelUserLimit || undefined } : undefined;
                            api.createChannel(serverId, newChannelName.trim(), newChannelType, newChannelCategory || undefined, opts)
                              .then(() => { setNewChannelName(''); refreshChannels(); }).catch(console.error);
                          }
                        }}>Create</button>
                      </div>
                    </div>
                    <div className="settings-group">
                      <h4>Channels</h4>
                      {[...categories.flatMap((c) => c.channels), ...uncategorized].map((ch) => (
                        <div key={ch.id} className="settings-row">
                          <div className="settings-row-info">
                            <label>{CHANNEL_ICONS[ch.type] || '#'} {ch.name}</label>
                            <span className="value">{ch.type}{ch.category_id ? ` · ${categories.find((c) => c.id === ch.category_id)?.name || ''}` : ''}</span>
                          </div>
                          <button className="btn-ghost btn-sm" style={{ color: 'var(--crimson)' }} onClick={() => {
                            if (confirm(`Delete channel #${ch.name}?`)) {
                              api.deleteChannel(serverId, ch.id).then(() => refreshChannels()).catch(console.error);
                            }
                          }}>Delete</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {!settingsLoading && settingsTab === 'invites' && (
                  <>
                    <div className="settings-group">
                      <h4>Generate Invite</h4>
                      <div className="settings-row">
                        <label style={{ minWidth: '80px' }}>Max Uses</label>
                        <select className="settings-input" value={inviteMaxUses} onChange={(e) => setInviteMaxUses(e.target.value)}>
                          <option value="0">Unlimited</option>
                          <option value="1">1 use</option>
                          <option value="5">5 uses</option>
                          <option value="10">10 uses</option>
                          <option value="25">25 uses</option>
                          <option value="50">50 uses</option>
                          <option value="100">100 uses</option>
                        </select>
                      </div>
                      <div className="settings-row">
                        <label style={{ minWidth: '80px' }}>Expires</label>
                        <select className="settings-input" value={inviteExpiresIn} onChange={(e) => setInviteExpiresIn(e.target.value)}>
                          <option value="0">Never</option>
                          <option value="1800">30 minutes</option>
                          <option value="3600">1 hour</option>
                          <option value="21600">6 hours</option>
                          <option value="43200">12 hours</option>
                          <option value="86400">1 day</option>
                          <option value="604800">7 days</option>
                        </select>
                      </div>
                      <div className="settings-row">
                        <div className="settings-row-info" />
                        <button className="btn-primary btn-sm" onClick={() => {
                          const opts: { max_uses?: number; expires_in?: number } = {};
                          if (Number(inviteMaxUses) > 0) opts.max_uses = Number(inviteMaxUses);
                          if (Number(inviteExpiresIn) > 0) opts.expires_in = Number(inviteExpiresIn);
                          api.createInvite(serverId, Object.keys(opts).length ? opts : undefined).then((r) => {
                            const inv = r.invite || r;
                            setInvites((prev) => [...prev, { code: inv.code, uses: inv.uses_count || 0, max_uses: inv.max_uses, expires_at: inv.expires_at }]);
                          }).catch(console.error);
                        }}>Generate Invite</button>
                      </div>
                    </div>
                    <div className="settings-group">
                      <h4>Active Invites</h4>
                      {invites.map((inv) => {
                        const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
                        return (
                          <div key={inv.code} className="settings-row" style={expired ? { opacity: 0.5 } : undefined}>
                            <div className="settings-row-info">
                              <label className="mono">{inv.code}</label>
                              <span className="value">
                                {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ''} uses
                                {inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleString()}` : ' · never expires'}
                                {expired ? ' (expired)' : ''}
                              </span>
                            </div>
                            <button className="btn-ghost btn-sm" title="Copy invite link" onClick={() => {
                              navigator.clipboard.writeText(inv.code).catch(console.error);
                            }}>Copy</button>
                            <button className="btn-ghost btn-sm" style={{ color: 'var(--crimson)' }} onClick={() => {
                              api.deleteInvite(serverId, inv.code)
                                .then(() => setInvites((prev) => prev.filter((i) => i.code !== inv.code)))
                                .catch(console.error);
                            }}>Revoke</button>
                          </div>
                        );
                      })}
                      {invites.length === 0 && (
                        <div className="settings-row"><div className="settings-row-info"><span className="value">No active invites</span></div></div>
                      )}
                    </div>
                  </>
                )}

                {!settingsLoading && settingsTab === 'roles' && (() => {
                  // Permission entries: [bit, label, desc, indent?]
                  type PermEntry = { bit: number; label: string; desc: string; indent?: boolean; parent?: number };
                  const PERM_SECTIONS: { title: string; perms: PermEntry[] }[] = [
                    { title: 'General', perms: [
                      { bit: 0, label: 'View Channels', desc: 'See channels and read names' },
                      { bit: 20, label: 'Create Invite', desc: 'Generate invite links' },
                      { bit: 21, label: 'Change Nickname', desc: 'Change own display name' },
                    ]},
                    { title: 'Text', perms: [
                      { bit: 1, label: 'Send Messages', desc: 'Send messages in text channels' },
                      { bit: 7, label: 'Read Message History', desc: 'View past messages' },
                      { bit: 4, label: 'Add Reactions', desc: 'React to messages with emoji' },
                      { bit: 2, label: 'Embed Links', desc: 'Links show previews' },
                      { bit: 3, label: 'Attach Files', desc: 'Upload files and images' },
                      { bit: 5, label: 'Mention @everyone', desc: 'Ping all members' },
                      { bit: 6, label: 'Manage Messages', desc: 'Delete or pin others\' messages' },
                    ]},
                    { title: 'Voice', perms: [
                      { bit: 8, label: 'Connect', desc: 'Join voice channels' },
                      { bit: 9, label: 'Speak', desc: 'Talk in voice channels' },
                      { bit: 10, label: 'Stream', desc: 'Share screen in voice' },
                    ]},
                    { title: 'Channels', perms: [
                      { bit: 15, label: 'Manage Channels', desc: 'Full channel control (overrides children)' },
                      { bit: 54, label: 'Create Channels', desc: 'Create new channels', indent: true, parent: 15 },
                      { bit: 55, label: 'Edit Channels', desc: 'Edit channel name, topic, settings', indent: true, parent: 15 },
                      { bit: 56, label: 'Delete Channels', desc: 'Delete channels', indent: true, parent: 15 },
                    ]},
                    { title: 'Categories', perms: [
                      { bit: 60, label: 'Manage Categories', desc: 'Full category control (overrides children)' },
                      { bit: 57, label: 'Create Categories', desc: 'Create new categories', indent: true, parent: 60 },
                      { bit: 58, label: 'Edit Categories', desc: 'Edit/rename categories', indent: true, parent: 60 },
                      { bit: 59, label: 'Delete Categories', desc: 'Delete categories', indent: true, parent: 60 },
                    ]},
                    { title: 'Moderation', perms: [
                      { bit: 61, label: 'Manage Members', desc: 'Full member control (overrides children)' },
                      { bit: 18, label: 'Kick Members', desc: 'Remove members from server', indent: true, parent: 61 },
                      { bit: 19, label: 'Ban Members', desc: 'Permanently ban members', indent: true, parent: 61 },
                      { bit: 38, label: 'Timeout Members', desc: 'Temporarily mute members', indent: true, parent: 61 },
                      { bit: 22, label: 'Manage Nicknames', desc: 'Change others\' nicknames' },
                      { bit: 16, label: 'Manage Roles', desc: 'Full role control (overrides children)' },
                      { bit: 63, label: 'Create Roles', desc: 'Create new roles', indent: true, parent: 16 },
                      { bit: 64, label: 'Edit Roles', desc: 'Edit roles and assign/unassign', indent: true, parent: 16 },
                      { bit: 65, label: 'Delete Roles', desc: 'Delete roles', indent: true, parent: 16 },
                      { bit: 17, label: 'Manage Server', desc: 'Edit server name and settings' },
                    ]},
                    { title: 'Audit', perms: [
                      { bit: 62, label: 'View Audit Log', desc: 'Full audit access (overrides children)' },
                      { bit: 29, label: 'View Basic Audit', desc: 'See recent audit events', indent: true, parent: 62 },
                      { bit: 41, label: 'View Full Audit', desc: 'See complete audit history', indent: true, parent: 62 },
                      { bit: 42, label: 'Export Audit Log', desc: 'Export audit data', indent: true, parent: 62 },
                    ]},
                    { title: 'Dangerous', perms: [
                      { bit: 26, label: 'Administrator', desc: 'Full access to everything' },
                    ]},
                  ];
                  // Use draft roles if reordering, otherwise live roles
                  const displayRoles = draftRoles || roles;
                  const activeRole = displayRoles.find((r) => r.id === selectedRole) || displayRoles.find((r) => r.name === '@everyone');
                  // BigInt-safe permission helpers
                  const toBig = (v: string | number | bigint): bigint => {
                    try { return BigInt(v); } catch { return 0n; }
                  };
                  const hasPerm = (bits: bigint, bit: number): boolean => (bits & (1n << BigInt(bit))) !== 0n;
                  const togglePerm = (bits: bigint, bit: number): bigint => bits ^ (1n << BigInt(bit));
                  // Effective check: granted directly OR via parent toggle
                  const hasEffective = (bits: bigint, p: PermEntry): boolean => {
                    if (hasPerm(bits, p.bit)) return true;
                    if (hasPerm(bits, 26)) return true; // administrator
                    if (p.parent !== undefined) return hasPerm(bits, p.parent);
                    return false;
                  };
                  const permBits: bigint = editingRole ? editingPerms : toBig(activeRole?.permissions ?? '0');
                  // Check if there are any pending changes
                  const orderChanged = draftRoles !== null && JSON.stringify(draftRoles.map(r => r.id)) !== JSON.stringify([...roles].sort((a, b) => b.position - a.position).map(r => r.id));
                  const permsDirty = editingRole && activeRole && editingPerms !== toBig(activeRole.permissions);
                  const hasUnsaved = orderChanged || permsDirty;

                  // Sorted list for display (highest position first, @everyone last)
                  const sortedDisplay = [...displayRoles].sort((a, b) => {
                    if (a.name === '@everyone') return 1;
                    if (b.name === '@everyone') return -1;
                    return b.position - a.position;
                  });

                  // Drag and drop handlers
                  const handleDragStart = (idx: number) => {
                    setDragIdx(idx);
                  };
                  const handleDragOver = (e: React.DragEvent, idx: number) => {
                    e.preventDefault();
                    setDragOverIdx(idx);
                  };
                  const handleDrop = (idx: number) => {
                    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
                    const list = [...sortedDisplay];
                    const [moved] = list.splice(dragIdx, 1);
                    list.splice(idx, 0, moved);
                    // Reassign positions: highest index in array = highest position, @everyone stays 0
                    const reordered = list.map((r, i) => {
                      if (r.name === '@everyone') return r;
                      return { ...r, position: list.length - 1 - i };
                    });
                    setDraftRoles(reordered);
                    setDragIdx(null);
                    setDragOverIdx(null);
                  };
                  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

                  const showToast = (message: string, type: 'success' | 'error') => {
                    setSettingsToast({ message, type });
                    setTimeout(() => setSettingsToast(null), 3000);
                  };

                  const handleSaveAll = async () => {
                    try {
                      if (orderChanged && draftRoles) {
                        const positions = draftRoles.filter(r => r.name !== '@everyone').map(r => ({ id: r.id, position: r.position }));
                        const res = await api.reorderRoles(serverId, positions);
                        setRoles(res.data || draftRoles);
                        setDraftRoles(null);
                      }
                      if (permsDirty && activeRole) {
                        await api.updateRole(serverId, activeRole.id, { permissions: String(editingPerms) });
                        setRoles((prev) => prev.map((r) => r.id === activeRole.id ? { ...r, permissions: String(editingPerms) } : r));
                        if (draftRoles) setDraftRoles((prev) => prev!.map((r) => r.id === activeRole.id ? { ...r, permissions: String(editingPerms) } : r));
                        setEditingRole(false);
                      }
                      showToast('Changes saved', 'success');
                    } catch (err) {
                      console.error(err);
                      showToast('Failed to save changes', 'error');
                    }
                  };
                  const handleClearAll = () => {
                    setDraftRoles(null);
                    if (editingRole && activeRole) {
                      setEditingPerms(toBig(activeRole.permissions));
                    }
                    setEditingRole(false);
                  };

                  return (
                    <>
                      <div className="settings-group">
                        <h4>Roles</h4>
                        <div className="settings-row">
                          <input className="settings-input" style={{ flex: 1 }} placeholder="New role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && newRoleName.trim()) { api.createRole(serverId, newRoleName.trim(), 0).then((r) => { const role = r.data || r; setRoles((prev) => [...prev, role]); setDraftRoles(null); setNewRoleName(''); showToast('Role created', 'success'); }).catch((err) => { console.error(err); showToast('Failed to create role', 'error'); }); }}} />
                          <button className="btn-primary btn-sm" onClick={() => { if (newRoleName.trim()) { api.createRole(serverId, newRoleName.trim(), 0).then((r) => { const role = r.data || r; setRoles((prev) => [...prev, role]); setDraftRoles(null); setNewRoleName(''); showToast('Role created', 'success'); }).catch((err) => { console.error(err); showToast('Failed to create role', 'error'); }); }}}>Create</button>
                        </div>
                        <span className="settings-hint" style={{ marginBottom: 4 }}>Drag to reorder. Highest role is at the top.</span>
                        {sortedDisplay.map((role, idx) => (
                          <div
                            key={role.id}
                            className={`settings-row clickable ${activeRole?.id === role.id ? 'selected' : ''}${dragOverIdx === idx ? ' drag-over' : ''}${dragIdx === idx ? ' dragging' : ''}`}
                            draggable={role.name !== '@everyone'}
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={() => handleDrop(idx)}
                            onDragEnd={handleDragEnd}
                            onClick={() => { setSelectedRole(role.id); setEditingRole(false); setRoleNameDraft(role.name); }}>
                            {role.name !== '@everyone' && <span className="drag-handle">⠿</span>}
                            <div className="settings-row-info">
                              {selectedRole === role.id && role.name !== '@everyone' ? (
                                <input className="settings-input" style={{ flex: 1 }} value={roleNameDraft}
                                  onChange={(e) => setRoleNameDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && roleNameDraft.trim() && roleNameDraft !== role.name) { api.updateRole(serverId, role.id, { name: roleNameDraft.trim() }).then(() => { setRoles((prev) => prev.map((r) => r.id === role.id ? { ...r, name: roleNameDraft.trim() } : r)); if (draftRoles) setDraftRoles((prev) => prev!.map((r) => r.id === role.id ? { ...r, name: roleNameDraft.trim() } : r)); showToast('Role renamed', 'success'); }).catch((err) => { console.error(err); showToast('Failed to rename role', 'error'); }); } if (e.key === 'Escape') setRoleNameDraft(role.name); }} />
                              ) : (
                                <label>{role.name}</label>
                              )}
                              <span className="value">{role.name === '@everyone' ? 'Default role for all members' : `Position ${role.position}`}</span>
                            </div>
                            {role.name !== '@everyone' && (
                              <button className="btn-ghost btn-sm" style={{ color: 'var(--crimson)' }} onClick={(e) => {
                                e.stopPropagation();
                                api.deleteRole(serverId, role.id)
                                  .then(() => { setRoles((prev) => prev.filter((r) => r.id !== role.id)); setDraftRoles((prev) => prev ? prev.filter((r) => r.id !== role.id) : null); if (selectedRole === role.id) setSelectedRole(null); showToast('Role deleted', 'success'); })
                                  .catch((err) => { console.error(err); showToast('Failed to delete role', 'error'); });
                              }}>Delete</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {activeRole && (
                        <div className="settings-group">
                          {activeRole.name !== '@everyone' && (
                            <div className="settings-row clickable" onClick={() => {
                              const newHoist = !activeRole.hoist;
                              api.updateRole(serverId, activeRole.id, { hoist: newHoist }).then(() => {
                                setRoles((prev) => prev.map((r) => r.id === activeRole.id ? { ...r, hoist: newHoist } : r));
                                if (draftRoles) setDraftRoles((prev) => prev!.map((r) => r.id === activeRole.id ? { ...r, hoist: newHoist } : r));
                                showToast(newHoist ? 'Role will display separately' : 'Role will no longer display separately', 'success');
                              }).catch((err) => { console.error(err); showToast('Failed to update role', 'error'); });
                            }}>
                              <div className="settings-row-info">
                                <label>Display role separately</label>
                                <span className="value">Show members with this role in their own group in the member list</span>
                              </div>
                              <span className={`perm-badge ${activeRole.hoist ? 'granted' : 'denied'}`}>{activeRole.hoist ? '✓' : '✗'}</span>
                            </div>
                          )}
                          <h4>{activeRole.name} — Permissions</h4>
                          <div className="settings-row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                            {!editingRole ? (
                              <button className="btn-primary btn-sm" onClick={() => { setEditingRole(true); setEditingPerms(toBig(activeRole.permissions)); }}>Edit Permissions</button>
                            ) : (
                              <span className="settings-hint">Editing — use the save bar below to apply</span>
                            )}
                            <button className="btn-ghost btn-sm" title="Copy permissions to clipboard" onClick={() => {
                              navigator.clipboard.writeText(activeRole.permissions).then(() => showToast('Permissions copied', 'success')).catch(console.error);
                            }}>Copy Perms</button>
                            <button className="btn-ghost btn-sm" title="Import permissions from clipboard" onClick={() => {
                              navigator.clipboard.readText().then((text) => {
                                try {
                                  const val = BigInt(text.trim());
                                  if (val >= 0n) { setEditingPerms(val); setEditingRole(true); showToast('Permissions imported', 'success'); }
                                } catch { showToast('Invalid permissions value', 'error'); }
                              }).catch(console.error);
                            }}>Import Perms</button>
                          </div>
                          {PERM_SECTIONS.map((section) => (
                            <div key={section.title} className="perm-section">
                              <div className="perm-section-title">{section.title}</div>
                              <div className="permissions-grid">
                                {section.perms.map((p) => {
                                  const granted = hasPerm(permBits, p.bit);
                                  const effective = hasEffective(permBits, p);
                                  const inherited = !granted && effective && p.parent !== undefined;
                                  return (
                                    <div key={p.bit} className={`perm-item${p.indent ? ' perm-child' : ''}${editingRole ? ' clickable' : ''}`}
                                      onClick={() => { if (editingRole) setEditingPerms(togglePerm(editingPerms, p.bit)); }}>
                                      <div className="perm-info">
                                        <span className="perm-label">{p.label}</span>
                                        <span className="perm-desc">{p.desc}</span>
                                      </div>
                                      <span className={`perm-badge ${granted ? 'granted' : inherited ? 'inherited' : 'denied'}`}>
                                        {granted ? '✓' : inherited ? '↑' : '✗'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {hasUnsaved && (
                        <div className="settings-save-bar">
                          <span>You have unsaved changes</span>
                          <div className="settings-save-bar-actions">
                            <button className="btn-ghost btn-sm" onClick={handleClearAll}>Reset</button>
                            <button className="btn-primary btn-sm" onClick={handleSaveAll}>Save Changes</button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {!settingsLoading && settingsTab === 'members' && (
                  <div className="settings-group">
                    <h4>Members ({members.length})</h4>
                    {members.map((m) => (
                      <div key={m.user_id} className="settings-row">
                        <div className="settings-row-info">
                          <label>{m.username}</label>
                          <span className="value">
                            {m.trust_score !== undefined && (
                              <>Trust: {m.trust_score} (T{m.trust_tier ?? 0}) · </>
                            )}
                            Joined {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'unknown'}
                          </span>
                        </div>
                        <span className="value mono" style={{ fontSize: '0.7em' }}>{m.user_id}</span>
                      </div>
                    ))}
                    {members.length === 0 && (
                      <div className="settings-row"><div className="settings-row-info"><span className="value">No members loaded</span></div></div>
                    )}
                  </div>
                )}

                {!settingsLoading && settingsTab === 'manage' && (
                  <>
                    <div className="settings-group">
                      <h4>Transfer Ownership</h4>
                      <p className="settings-hint">Transfer server ownership to another member. This cannot be undone.</p>
                      <div className="settings-row">
                        <select className="settings-input" value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                          <option value="">Select a member</option>
                          {members.filter((m) => m.user_id !== currentUserId).map((m) => (
                            <option key={m.user_id} value={m.user_id}>{m.username}</option>
                          ))}
                        </select>
                        <button className="btn-danger btn-sm" disabled={!transferTarget} onClick={async () => {
                          const target = members.find((m) => m.user_id === transferTarget);
                          if (target && confirm(`Transfer ownership to ${target.username}? You will lose owner privileges.`)) {
                            await api.transferOwnership(serverId, transferTarget);
                            window.location.reload();
                          }
                        }}>Transfer</button>
                      </div>
                    </div>
                    <div className="settings-group danger-zone">
                      <h4>Delete Server</h4>
                      <p className="settings-warn">Deleting a server is permanent and cannot be undone. Type the server name to confirm.</p>
                      <div className="settings-row">
                        <input
                          className="settings-input"
                          placeholder={`Type "${serverName}" to confirm`}
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                        />
                        <button
                          className="btn-danger btn-sm"
                          disabled={deleteConfirm !== serverName}
                          onClick={async () => {
                            if (deleteConfirm === serverName) {
                              await api.deleteServer(serverId);
                              window.location.reload();
                            }
                          }}
                        >Delete Server</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {settingsToast && (
            <div className={`settings-toast settings-toast-${settingsToast.type}`}>
              {settingsToast.type === 'success' ? '✓' : '✗'} {settingsToast.message}
            </div>
          )}
        </div>
      )}

      {/* Member Context Menu */}
      {contextMenu && (() => {
        const isAdmin = (myPerms & (1n << 26n)) !== 0n;
        const hasBit = (bit: number) => isAdmin || (myPerms & (1n << BigInt(bit))) !== 0n;
        // Effective permission checks with parent fallback
        const canNickname = hasBit(22); // manage_nicknames
        const canRoles = hasBit(64) || hasBit(16); // edit_roles or manage_roles
        const canTimeout = hasBit(38) || hasBit(61); // timeout_members or manage_members
        const canKick = hasBit(18) || hasBit(61); // kick_members or manage_members
        const canBan = hasBit(19) || hasBit(61); // ban_members or manage_members
        const isOther = contextMenu.member.user_id !== currentUserId;
        // Clamp menu position to viewport
        const menuW = 240, menuH = 320;
        const x = Math.min(contextMenu.x, window.innerWidth - menuW - 8);
        const y = Math.min(contextMenu.y, window.innerHeight - menuH - 8);

        return createPortal(
        <div className="ctx-menu-backdrop" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div className="ctx-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
            <div className="ctx-menu-header">
              <span className="ctx-menu-name">{contextMenu.member.nickname || contextMenu.member.display_name || contextMenu.member.username}</span>
              <span className="ctx-menu-username">@{contextMenu.member.username}</span>
            </div>
            {/* Profile */}
            <div className="ctx-menu-item" onClick={() => { onMemberClick?.(contextMenu.member); setContextMenu(null); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Profile
            </div>

            <div className="ctx-menu-divider" />

            {/* Edit Nickname */}
            {canNickname && isOther && (
              ctxNicknameEdit !== null ? (
                <div className="ctx-menu-item ctx-nickname-row">
                  <input
                    className="ctx-nickname-input"
                    value={ctxNicknameEdit}
                    onChange={(e) => setCtxNicknameEdit(e.target.value)}
                    placeholder="Nickname"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        api.updateMemberNickname(serverId, contextMenu.member.user_id, ctxNicknameEdit.trim()).then(() => {
                          setServerMembers((prev) => prev.map((m) => m.user_id === contextMenu.member.user_id ? { ...m, nickname: ctxNicknameEdit.trim() || undefined } : m));
                          setContextMenu(null);
                        }).catch(console.error);
                      }
                      if (e.key === 'Escape') setCtxNicknameEdit(null);
                    }}
                  />
                  <button className="ctx-nickname-save" onClick={() => {
                    api.updateMemberNickname(serverId, contextMenu.member.user_id, ctxNicknameEdit.trim()).then(() => {
                      setServerMembers((prev) => prev.map((m) => m.user_id === contextMenu.member.user_id ? { ...m, nickname: ctxNicknameEdit.trim() || undefined } : m));
                      setContextMenu(null);
                    }).catch(console.error);
                  }}>✓</button>
                </div>
              ) : (
                <div className="ctx-menu-item" onClick={() => setCtxNicknameEdit(contextMenu.member.nickname || '')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                  Edit Nickname
                </div>
              )
            )}

            {/* Roles submenu */}
            {canRoles && (
              <>
                <div className="ctx-menu-item" onClick={() => setCtxRolesOpen(!ctxRolesOpen)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
                  Roles {ctxRolesOpen ? '▾' : '▸'}
                </div>
                {ctxRolesOpen && (
                  <div className="ctx-submenu">
                    {roles.filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position).map((role) => {
                      const has = contextMenu.member.role_ids?.includes(role.id);
                      return (
                        <div key={role.id} className={`ctx-menu-item ctx-role-item${has ? ' active' : ''}`} onClick={() => {
                          const fn = has ? api.unassignRole : api.assignRole;
                          fn(serverId, contextMenu.member.user_id, role.id).then(() => {
                            setServerMembers((prev) => prev.map((m) => {
                              if (m.user_id !== contextMenu.member.user_id) return m;
                              const ids = m.role_ids || [];
                              return { ...m, role_ids: has ? ids.filter((id) => id !== role.id) : [...ids, role.id] };
                            }));
                            setContextMenu((prev) => prev ? { ...prev, member: {
                              ...prev.member,
                              role_ids: has
                                ? (prev.member.role_ids || []).filter((id) => id !== role.id)
                                : [...(prev.member.role_ids || []), role.id],
                            }} : null);
                          }).catch(console.error);
                        }}>
                          <span className="ctx-role-check">{has ? '✓' : ''}</span>
                          <span style={role.color ? { color: role.color } : undefined}>{role.name}</span>
                        </div>
                      );
                    })}
                    {roles.filter((r) => r.name !== '@everyone').length === 0 && (
                      <div className="ctx-menu-item disabled">No roles</div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Timeout */}
            {canTimeout && isOther && (
              <>
                <div className="ctx-menu-item" onClick={() => setCtxTimeoutOpen(!ctxTimeoutOpen)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Timeout {ctxTimeoutOpen ? '▾' : '▸'}
                </div>
                {ctxTimeoutOpen && (
                  <div className="ctx-submenu">
                    {[
                      { label: '60 seconds', duration: 60 },
                      { label: '5 minutes', duration: 300 },
                      { label: '10 minutes', duration: 600 },
                      { label: '1 hour', duration: 3600 },
                      { label: '1 day', duration: 86400 },
                      { label: '1 week', duration: 604800 },
                    ].map((opt) => (
                      <div key={opt.duration} className="ctx-menu-item" onClick={() => {
                        api.timeoutMember(serverId, contextMenu.member.user_id, opt.duration)
                          .then(() => setContextMenu(null))
                          .catch(console.error);
                      }}>
                        {opt.label}
                      </div>
                    ))}
                    <div className="ctx-menu-item" onClick={() => {
                      api.removeTimeout(serverId, contextMenu.member.user_id)
                        .then(() => setContextMenu(null))
                        .catch(console.error);
                    }}>
                      Remove Timeout
                    </div>
                  </div>
                )}
              </>
            )}

            {(canKick || canBan) && isOther && <div className="ctx-menu-divider" />}

            {/* Kick */}
            {canKick && isOther && (
              <div className="ctx-menu-item danger" onClick={() => {
                if (confirm(`Kick ${contextMenu.member.username}?`)) {
                  api.kickMember(serverId, contextMenu.member.user_id).then(() => {
                    setServerMembers((prev) => prev.filter((m) => m.user_id !== contextMenu.member.user_id));
                    setContextMenu(null);
                  }).catch(console.error);
                }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Kick
              </div>
            )}

            {/* Ban */}
            {canBan && isOther && (
              <div className="ctx-menu-item danger" onClick={() => {
                const reason = prompt(`Ban ${contextMenu.member.username}? Enter reason (optional):`);
                if (reason !== null) {
                  api.banMember(serverId, contextMenu.member.user_id, reason || undefined).then(() => {
                    setServerMembers((prev) => prev.filter((m) => m.user_id !== contextMenu.member.user_id));
                    setContextMenu(null);
                  }).catch(console.error);
                }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                Ban
              </div>
            )}
          </div>
        </div>,
        document.body
      );
      })()}

      {/* Channel Context Menu */}
      {channelCtx && (() => {
        const canManage = (myPerms & (1n << 26n)) !== 0n || (myPerms & (1n << 15n)) !== 0n; // admin or manage_channels
        const menuW = 200, menuH = 80;
        const x = Math.min(channelCtx.x, window.innerWidth - menuW - 8);
        const y = Math.min(channelCtx.y, window.innerHeight - menuH - 8);
        return createPortal(
          <div className="ctx-menu-backdrop" onClick={() => setChannelCtx(null)} onContextMenu={(e) => { e.preventDefault(); setChannelCtx(null); }}>
            <div className="ctx-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
              <div className="ctx-menu-header">
                <span className="ctx-menu-name">{CHANNEL_ICONS[channelCtx.channel.type] || '#'} {channelCtx.channel.name}</span>
              </div>
              {canManage && (
                <div className="ctx-menu-item" onClick={() => {
                  const ch = channelCtx.channel;
                  setPermEditor({ type: 'channel', id: ch.id, name: ch.name, categoryId: ch.category_id || undefined });
                  setPermSelectedRole(null);
                  setPermOverrides({});
                  setPermDirty({});
                  setPermCategoryRef(null);
                  setPermSynced(true);
                  setChannelCtx(null);
                  // Load channel overrides
                  api.listChannelOverrides(serverId, ch.id).then((res) => {
                    const map: Record<string, { allow: bigint; deny: bigint }> = {};
                    (res.overrides || []).forEach((o: any) => {
                      map[`${o.target_type}:${o.target_id}`] = { allow: BigInt(o.allow || '0'), deny: BigInt(o.deny || '0') };
                    });
                    setPermOverrides(map);
                    setPermDirty(map);
                    // Also load category overrides for comparison
                    if (ch.category_id) {
                      const cat = categories.find((c) => c.id === ch.category_id);
                      const refCh = cat?.channels[0];
                      if (refCh && refCh.id !== ch.id) {
                        api.listChannelOverrides(serverId, refCh.id).then((catRes) => {
                          const catMap: Record<string, { allow: bigint; deny: bigint }> = {};
                          (catRes.overrides || []).forEach((o: any) => {
                            catMap[`${o.target_type}:${o.target_id}`] = { allow: BigInt(o.allow || '0'), deny: BigInt(o.deny || '0') };
                          });
                          setPermCategoryRef(catMap);
                          // Check if in sync
                          const chStr = JSON.stringify(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { a: v.allow.toString(), d: v.deny.toString() }])));
                          const catStr = JSON.stringify(Object.fromEntries(Object.entries(catMap).map(([k, v]) => [k, { a: v.allow.toString(), d: v.deny.toString() }])));
                          setPermSynced(chStr === catStr);
                        }).catch(console.error);
                      } else {
                        // This IS the first channel — it's the category reference
                        setPermCategoryRef(map);
                        setPermSynced(true);
                      }
                    }
                  }).catch(console.error);
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Edit Permissions
                </div>
              )}
              {!canManage && <div className="ctx-menu-item disabled">No permission</div>}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Category Context Menu */}
      {categoryCtx && (() => {
        const canManage = (myPerms & (1n << 26n)) !== 0n || (myPerms & (1n << 15n)) !== 0n;
        const menuW = 200, menuH = 80;
        const x = Math.min(categoryCtx.x, window.innerWidth - menuW - 8);
        const y = Math.min(categoryCtx.y, window.innerHeight - menuH - 8);
        return createPortal(
          <div className="ctx-menu-backdrop" onClick={() => setCategoryCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCategoryCtx(null); }}>
            <div className="ctx-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
              <div className="ctx-menu-header">
                <span className="ctx-menu-name">{categoryCtx.category.name}</span>
              </div>
              {canManage && (
                <>
                  <div className="ctx-menu-item" onClick={() => {
                    const cat = categoryCtx.category;
                    const first = cat.channels[0];
                    if (!first) return;
                    setPermEditor({ type: 'category', id: first.id, name: cat.name, categoryId: cat.id });
                    setPermSelectedRole(null);
                    setPermOverrides({});
                    setPermDirty({});
                    setPermCategoryRef(null);
                    setPermSynced(true);
                    setCategoryCtx(null);
                    api.listChannelOverrides(serverId, first.id).then((res) => {
                      const map: Record<string, { allow: bigint; deny: bigint }> = {};
                      (res.overrides || []).forEach((o: any) => {
                        map[`${o.target_type}:${o.target_id}`] = { allow: BigInt(o.allow || '0'), deny: BigInt(o.deny || '0') };
                      });
                      setPermOverrides(map);
                      setPermDirty(map);
                    }).catch(console.error);
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Edit Permissions
                  </div>
                </>
              )}
              {!canManage && <div className="ctx-menu-item disabled">No permission</div>}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Permissions Editor Modal */}
      {permEditor && (() => {
        const CHANNEL_PERMS: { bit: number; name: string; label: string }[] = [
          { bit: 0, name: 'view_channel', label: 'View Channel' },
          { bit: 1, name: 'send_messages', label: 'Send Messages' },
          { bit: 2, name: 'embed_links', label: 'Embed Links' },
          { bit: 3, name: 'attach_files', label: 'Attach Files' },
          { bit: 4, name: 'add_reactions', label: 'Add Reactions' },
          { bit: 5, name: 'mention_everyone', label: 'Mention @everyone' },
          { bit: 6, name: 'manage_messages', label: 'Manage Messages' },
          { bit: 7, name: 'read_message_history', label: 'Read Message History' },
          { bit: 8, name: 'connect', label: 'Connect (Voice)' },
          { bit: 9, name: 'speak', label: 'Speak (Voice)' },
          { bit: 10, name: 'stream', label: 'Stream' },
          { bit: 14, name: 'use_voice_activity', label: 'Use Voice Activity' },
          { bit: 15, name: 'manage_channels', label: 'Manage Channel' },
          { bit: 25, name: 'manage_threads', label: 'Manage Threads' },
        ];

        // All roles including @everyone
        const allRoles = [...roles].sort((a, b) => b.position - a.position);
        const everyoneRole = allRoles.find((r) => r.name === '@everyone');
        const otherRoles = allRoles.filter((r) => r.name !== '@everyone');
        const roleList = everyoneRole ? [...otherRoles, everyoneRole] : otherRoles;

        // Current selected target
        const selectedTarget = permSelectedRole || (everyoneRole ? `role:${everyoneRole.id}` : null);
        const currentOverride = selectedTarget ? (permDirty[selectedTarget] || { allow: 0n, deny: 0n }) : { allow: 0n, deny: 0n };

        const getState = (bit: number): 'allow' | 'deny' | 'inherit' => {
          const mask = 1n << BigInt(bit);
          if ((currentOverride.allow & mask) !== 0n) return 'allow';
          if ((currentOverride.deny & mask) !== 0n) return 'deny';
          return 'inherit';
        };

        const hasChanges = JSON.stringify(
          Object.fromEntries(Object.entries(permDirty).map(([k, v]) => [k, { allow: v.allow.toString(), deny: v.deny.toString() }]))
        ) !== JSON.stringify(
          Object.fromEntries(Object.entries(permOverrides).map(([k, v]) => [k, { allow: v.allow.toString(), deny: v.deny.toString() }]))
        );

        // Category diff helpers (for channel mode)
        const getCategoryState = (bit: number): 'allow' | 'deny' | 'inherit' | null => {
          if (!permCategoryRef || !selectedTarget) return null;
          const catOverride = permCategoryRef[selectedTarget] || { allow: 0n, deny: 0n };
          const mask = 1n << BigInt(bit);
          if ((catOverride.allow & mask) !== 0n) return 'allow';
          if ((catOverride.deny & mask) !== 0n) return 'deny';
          return 'inherit';
        };

        const handleSyncToCategory = () => {
          if (!permCategoryRef) return;
          setPermDirty({ ...permCategoryRef });
          setPermSynced(true);
        };

        // Recompute sync status when dirty changes
        const isDirtySynced = (() => {
          if (!permCategoryRef) return true;
          const dirtyStr = JSON.stringify(Object.fromEntries(Object.entries(permDirty).map(([k, v]) => [k, { a: v.allow.toString(), d: v.deny.toString() }])));
          const catStr = JSON.stringify(Object.fromEntries(Object.entries(permCategoryRef).map(([k, v]) => [k, { a: v.allow.toString(), d: v.deny.toString() }])));
          return dirtyStr === catStr;
        })();

        const handleSave = async () => {
          setPermSaving(true);
          try {
            // Find what changed
            const allKeys = new Set([...Object.keys(permDirty), ...Object.keys(permOverrides)]);
            for (const key of allKeys) {
              const dirty = permDirty[key];
              const original = permOverrides[key];
              const [targetType, targetId] = key.split(':');
              if (!dirty || (dirty.allow === 0n && dirty.deny === 0n)) {
                // Delete override if it existed
                if (original) {
                  await api.deleteChannelOverride(serverId, permEditor.id, targetType, targetId);
                }
              } else if (!original || dirty.allow !== original.allow || dirty.deny !== original.deny) {
                await api.setChannelOverride(serverId, permEditor.id, targetType, targetId, dirty.allow.toString(), dirty.deny.toString());
              }
            }
            // If category mode, sync to all channels in category
            if (permEditor.type === 'category' && permEditor.categoryId) {
              await api.syncCategoryPermissions(serverId, permEditor.categoryId, permEditor.id);
            }
            setPermOverrides({ ...permDirty });
          } catch (err) {
            console.error('Failed to save permissions:', err);
          }
          setPermSaving(false);
        };

        return createPortal(
          <div className="perm-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPermEditor(null); }}>
            <div className="perm-editor-modal">
              <div className="perm-editor-header">
                <h3>{permEditor.type === 'category' ? '📁' : '#'} {permEditor.name} — Permissions</h3>
                {permEditor.type === 'category' && <span className="perm-editor-subtitle">Changes sync to all channels in this category</span>}
                {permEditor.type === 'channel' && permEditor.categoryId && permCategoryRef && (
                  <div className={`perm-sync-badge ${isDirtySynced ? 'synced' : 'overriding'}`}>
                    {isDirtySynced ? (
                      <span>✓ Synced to category</span>
                    ) : (
                      <>
                        <span>Overriding category</span>
                        <button className="perm-sync-btn" onClick={handleSyncToCategory} title="Reset to match category permissions">
                          Sync to Category
                        </button>
                      </>
                    )}
                  </div>
                )}
                <button className="perm-editor-close" onClick={() => setPermEditor(null)}>✕</button>
              </div>
              <div className="perm-editor-body">
                {/* Role selector sidebar */}
                <div className="perm-editor-roles">
                  <div className="perm-editor-roles-header">Roles / Targets</div>
                  {roleList.map((role) => {
                    const key = `role:${role.id}`;
                    const isSelected = selectedTarget === key;
                    const hasOverride = permDirty[key] && (permDirty[key].allow !== 0n || permDirty[key].deny !== 0n);
                    return (
                      <button
                        key={role.id}
                        className={`perm-role-btn${isSelected ? ' active' : ''}${hasOverride ? ' has-override' : ''}`}
                        onClick={() => setPermSelectedRole(key)}
                        style={role.color ? { borderLeftColor: role.color } : undefined}
                      >
                        {role.name}
                        {hasOverride && <span className="perm-role-dot" />}
                      </button>
                    );
                  })}
                </div>
                {/* Permission toggles */}
                <div className="perm-editor-perms">
                  {selectedTarget ? (
                    <>
                      <div className="perm-editor-perms-header">
                        <span>{roleList.find((r) => `role:${r.id}` === selectedTarget)?.name || 'Unknown'}</span>
                      </div>
                      <div className="perm-grid">
                        {CHANNEL_PERMS.map((p) => {
                          const state = getState(p.bit);
                          const catState = getCategoryState(p.bit);
                          const differsFromCat = catState !== null && catState !== state;
                          return (
                            <div key={p.bit} className={`perm-row${differsFromCat ? ' perm-row-diff' : ''}`}>
                              <div className="perm-label-wrap">
                                <span className="perm-label">{p.label}</span>
                                {differsFromCat && (
                                  <span className="perm-cat-hint" title={`Category: ${catState}`}>
                                    cat: {catState === 'allow' ? '✓' : catState === 'deny' ? '✕' : '─'}
                                  </span>
                                )}
                              </div>
                              <div className="perm-toggle-group">
                                <button
                                  className={`perm-toggle allow${state === 'allow' ? ' active' : ''}`}
                                  onClick={() => {
                                    if (!selectedTarget) return;
                                    const mask = 1n << BigInt(p.bit);
                                    if (state === 'allow') {
                                      setPermDirty((prev) => ({ ...prev, [selectedTarget]: { allow: currentOverride.allow & ~mask, deny: currentOverride.deny } }));
                                    } else {
                                      setPermDirty((prev) => ({ ...prev, [selectedTarget]: { allow: currentOverride.allow | mask, deny: currentOverride.deny & ~mask } }));
                                    }
                                  }}
                                  title="Allow"
                                >✓</button>
                                <button
                                  className={`perm-toggle inherit${state === 'inherit' ? ' active' : ''}`}
                                  onClick={() => {
                                    if (!selectedTarget) return;
                                    const mask = 1n << BigInt(p.bit);
                                    setPermDirty((prev) => ({ ...prev, [selectedTarget]: { allow: currentOverride.allow & ~mask, deny: currentOverride.deny & ~mask } }));
                                  }}
                                  title="Inherit (no override)"
                                >─</button>
                                <button
                                  className={`perm-toggle deny${state === 'deny' ? ' active' : ''}`}
                                  onClick={() => {
                                    if (!selectedTarget) return;
                                    const mask = 1n << BigInt(p.bit);
                                    if (state === 'deny') {
                                      setPermDirty((prev) => ({ ...prev, [selectedTarget]: { allow: currentOverride.allow, deny: currentOverride.deny & ~mask } }));
                                    } else {
                                      setPermDirty((prev) => ({ ...prev, [selectedTarget]: { allow: currentOverride.allow & ~mask, deny: currentOverride.deny | mask } }));
                                    }
                                  }}
                                  title="Deny"
                                >✕</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="perm-editor-empty">Select a role to configure permissions</div>
                  )}
                </div>
              </div>
              {/* Footer with save / reset */}
              <div className="perm-editor-footer">
                <button className="perm-btn-reset" disabled={!hasChanges || permSaving} onClick={() => setPermDirty({ ...permOverrides })}>
                  Reset
                </button>
                <button className="perm-btn-save" disabled={!hasChanges || permSaving} onClick={handleSave}>
                  {permSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── PiP floating video when away from voice channel ── */}
      {(() => {
        const showPip = voiceState.connectionState === 'connected'
          && voiceState.channelId
          && (!activeChannel || activeChannel.id !== voiceState.channelId || activeChannel.type !== 'voice');
        if (!showPip) return null;

        // Find the best video to show
        const localVid = voiceState.selfVideo.camera ? getLocalVideoStream() : null;
        let firstRemote: MediaStream | null = null;
        for (const [, userStreams] of remoteVideoStreams) {
          const first = userStreams.values().next().value;
          if (first) { firstRemote = first as MediaStream; break; }
        }
        const pipStream = localVid || firstRemote;

        // Navigate back to voice channel
        const navigateToVoice = () => {
          const allChans = [...uncategorized, ...categories.flatMap((c) => c.channels)];
          const vChan = allChans.find((ch) => ch.id === voiceState.channelId);
          if (vChan) {
            setActiveChannel(vChan);
            if (vChan.category_id) setActiveCategory(vChan.category_id);
            else setActiveCategory('__uncategorized__');
          }
        };

        const handlePipDown = (e: React.MouseEvent | React.TouchEvent) => {
          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
          pipDrag.current = { startX: clientX, startY: clientY, originX: pipPos.x, originY: pipPos.y };

          const handleMove = (ev: MouseEvent | TouchEvent) => {
            if (!pipDrag.current) return;
            const cx = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
            const cy = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
            const dx = cx - pipDrag.current.startX;
            const dy = cy - pipDrag.current.startY;
            setPipPos({
              x: Math.max(0, Math.min(window.innerWidth - 240, pipDrag.current.originX + dx)),
              y: Math.max(0, Math.min(window.innerHeight - 180, pipDrag.current.originY + dy)),
            });
          };

          const handleUp = () => {
            pipDrag.current = null;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
          };

          window.addEventListener('mousemove', handleMove);
          window.addEventListener('mouseup', handleUp);
          window.addEventListener('touchmove', handleMove);
          window.addEventListener('touchend', handleUp);
        };

        return createPortal(
          <div
            className="voice-pip"
            style={{ left: pipPos.x, top: pipPos.y }}
            onMouseDown={handlePipDown}
            onTouchStart={handlePipDown}
          >
            {pipStream ? (
              <VideoTile stream={pipStream} muted={!!localVid} label="" />
            ) : (
              <div className="voice-pip-placeholder">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>
              </div>
            )}
            <button className="voice-pip-return" onClick={navigateToVoice} title="Return to voice channel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Return
            </button>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
