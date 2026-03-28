import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '../api';
import { useStore, clearSession, useAnimations } from '../store';
import { connectSocket, disconnectSocket, joinChannel, leaveChannel, pushChannel } from '../socket';
import { getVoiceState, disconnectVoice, connectDmVoice } from '../voiceEngine';
import { getSocket } from '../socket';
import SettingsMenu from '../components/SettingsMenu';
import ProfileAppearance from '../components/ProfileAppearance';
import Topology, { type Network, type ActivityMetrics, type TopologyFilters, type HeatLayerKey, type HeatMapType } from '../components/Topology';
import BurrowView from '../components/BurrowView';
import FriendsPanel from '../components/FriendsPanel';
import { BadgeRow, type BadgeData } from '../components/Badge';


interface Burrow {
  id: string;
  name: string;
  owner_id: string;
}

// Panel states: closed (topology only), peek (channels+compact chat / home menu), full (fullscreen burrow)
type PanelMode = 'closed' | 'peek' | 'full';

export default function ChatPage() {
  const { user, sessionToken } = useStore();
  const animations = useAnimations();
  const [burrows, setBurrows] = useState<Burrow[]>([]);
  const [topoLoading, setTopoLoading] = useState(true);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('closed');
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileAppearance, setShowProfileAppearance] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('');
  const [quickSwitcherIndex, setQuickSwitcherIndex] = useState(0);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [activeNetworkId, setActiveNetworkId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('burrow_favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [activity, _setActivity] = useState<Record<string, ActivityMetrics>>({});
  const [heatmapDebug, setHeatmapDebugRaw] = useState(() => localStorage.getItem('burrow_heatmap_debug') === 'true');
  const setHeatmapDebug = useCallback((v: boolean) => { localStorage.setItem('burrow_heatmap_debug', String(v)); setHeatmapDebugRaw(v); }, []);
  const [platformStats, setPlatformStats] = useState<{ users: number; servers: number; members: number; messages: number } | null>(null);
  const [topoFilters, setTopoFilters] = useState<TopologyFilters>(() => {
    try {
      const stored = localStorage.getItem('burrow_topo_filters');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          showFavorites: parsed.showFavorites ?? true,
          showDataLines: parsed.showDataLines ?? true,
          heatLayers: new Set(parsed.heatLayers ?? []),
          heatMapType: parsed.heatMapType ?? 'arcs',
          heatRotation: parsed.heatRotation ?? true,
        };
      }
    } catch { /* ignore */ }
    return { showFavorites: true, showDataLines: true, heatLayers: new Set<HeatLayerKey>(), heatMapType: 'arcs' as HeatMapType, heatRotation: true };
  });

  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'invisible'>('online');
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [customStatusMap, setCustomStatusMap] = useState<Record<string, string>>({});
  const [orbMenuOpen, setOrbMenuOpen] = useState(false);
  const [orbMenuTab, setOrbMenuTab] = useState<'status' | 'server'>('status');
  const [orbNickDraft, setOrbNickDraft] = useState('');
  const [orbBioDraft, setOrbBioDraft] = useState('');
  const [orbPronounsDraft, setOrbPronounsDraft] = useState('');
  const [customStatusText, setCustomStatusText] = useState('');
  const [customStatusDraft, setCustomStatusDraft] = useState('');
  const [customStatusDuration, setCustomStatusDuration] = useState('0');
  const [profileDisplay, setProfileDisplay] = useState<{
    userId: string; username: string; displayName?: string; bio?: string; pronouns?: string;
    bannerUrl?: string; trustTier?: number; serverId?: string;
    nickname?: string; serverBio?: string; serverPronouns?: string;
    accentColor?: string; badges?: BadgeData[];
  } | null>(null);
  const [profileTab, setProfileTab] = useState<'public' | 'server'>('public');
  const [profileNote, setProfileNote] = useState('');
  const [profileNoteDraft, setProfileNoteDraft] = useState('');
  const [profileFriendStatus, setProfileFriendStatus] = useState<'none' | 'friend' | 'pending-out' | 'pending-in' | 'loading'>('loading');

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{ dmId: string; callerId: string; callerName: string } | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);

  // Unread DM state: map of channel_id → { lastReadSeq, lastMessageSeq }
  const [dmUnreads, setDmUnreads] = useState<Record<string, { lastReadSeq: number; lastMsgSeq: number }>>({});

  // Unread server channel state: map of channel_id → { serverId, categoryId, lastReadSeq, lastMsgSeq }
  const [channelUnreads, setChannelUnreads] = useState<Record<string, { serverId: string; categoryId: string | null; lastReadSeq: number; lastMsgSeq: number }>>({});

  // Open-DM-from-profile trigger: when set, switch to social view and tell FriendsPanel to open a DM
  const [openDmWithUserId, setOpenDmWithUserId] = useState<string | null>(null);

  // Load friend status when opening a profile
  useEffect(() => {
    if (!profileDisplay || profileDisplay.userId === user?.id) { setProfileFriendStatus('none'); return; }
    setProfileFriendStatus('loading');
    Promise.all([api.listFriends(), api.listFriendRequests()]).then(([fr, rq]) => {
      const friends = (fr as { friends: { id: string }[] }).friends || [];
      const reqs = rq as { incoming: { user: { id: string } }[]; outgoing: { user: { id: string } }[] };
      if (friends.some((f) => f.id === profileDisplay.userId)) { setProfileFriendStatus('friend'); return; }
      if ((reqs.outgoing || []).some((r) => r.user.id === profileDisplay.userId)) { setProfileFriendStatus('pending-out'); return; }
      if ((reqs.incoming || []).some((r) => r.user.id === profileDisplay.userId)) { setProfileFriendStatus('pending-in'); return; }
      setProfileFriendStatus('none');
    }).catch(() => setProfileFriendStatus('none'));
  }, [profileDisplay?.userId]);

  const activeBurrow = (activeView && activeView !== 'home' && !activeView.startsWith('net:'))
    ? burrows.find((s) => s.id === activeView) || null
    : null;

  // Only disconnect voice when navigating to a DIFFERENT burrow (not on view switch / social / home)
  const prevVoiceViewRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevVoiceViewRef.current;
    prevVoiceViewRef.current = activeView;
    if (!prev || !activeView) return;
    // Both are burrow IDs (not 'home', 'social', 'net:*')
    const prevIsBurrow = prev !== 'home' && prev !== 'social' && !prev.startsWith('net:');
    const currIsBurrow = activeView !== 'home' && activeView !== 'social' && !activeView.startsWith('net:');
    if (prevIsBurrow && currIsBurrow && prev !== activeView) {
      const vs = getVoiceState();
      if (vs.connectionState !== 'disconnected') disconnectVoice();
    }
  }, [activeView]);

  // Animated heatmap data for debug mode — values drift over time
  const [debugTick, setDebugTick] = useState(0);
  useEffect(() => {
    if (!heatmapDebug) return;
    const id = setInterval(() => setDebugTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [heatmapDebug]);

  const debugActivity = useMemo<Record<string, ActivityMetrics>>(() => {
    if (!heatmapDebug) return {};
    const result: Record<string, ActivityMetrics> = {};
    burrows.forEach((b, i) => {
      const t = debugTick * 0.3 + i;
      // Each burrow gets a distinct "weight" per category so relative scaling is visible.
      // Some burrows are zero in certain categories, one burrow is the hot leader, others are in between.
      const w = (k: number) => {
        const v = Math.sin(i * 2.3 + k * 1.7);
        return v < -0.3 ? 0 : (v + 0.3) / 1.3; // 0 for ~30% of burrows, 0-1 for the rest
      };
      result[b.id] = {
        overall:        Math.round(w(0) * (20 + 80 * Math.abs(Math.sin(t * 0.7)))),
        voice:          Math.round(w(1) * (15 + 60 * Math.abs(Math.sin(t * 1.1 + 1)))),
        friendActivity: Math.round(w(2) * (10 + 50 * Math.abs(Math.sin(t * 0.9 + 2)))),
        friendVoice:    Math.round(w(3) * (5 + 40 * Math.abs(Math.sin(t * 1.3 + 3)))),
        newMembers:     Math.round(w(4) * (5 + 20 * Math.abs(Math.sin(t * 0.6 + 4)))),
        reactions:      Math.round(w(5) * (10 + 35 * Math.abs(Math.sin(t * 0.8 + 5)))),
      };
    });
    return result;
  }, [heatmapDebug, burrows, debugTick]);

  useEffect(() => {
    if (sessionToken) {
      connectSocket(sessionToken);
    }
    return () => disconnectSocket();
  }, [sessionToken]);

  // Connect presence channel
  useEffect(() => {
    if (!sessionToken) return;
    const ch = joinChannel('presence:lobby', (event, payload) => {
      if (event === 'presence_state') {
        const map: Record<string, string> = {};
        const csMap: Record<string, string> = {};
        for (const p of payload.presences || []) {
          map[p.user_id] = p.status;
          if (p.status_text) csMap[p.user_id] = p.status_text;
        }
        setPresenceMap(map);
        setCustomStatusMap(csMap);
        // Restore own custom status on reconnect
        if (payload.own_custom_status?.text) {
          setCustomStatusText(payload.own_custom_status.text);
          setCustomStatusDraft(payload.own_custom_status.text);
        } else {
          setCustomStatusText('');
          setCustomStatusDraft('');
        }
      } else if (event === 'presence_update') {
        setPresenceMap((prev) => ({ ...prev, [payload.user_id]: payload.status }));
        setCustomStatusMap((prev) => {
          if (payload.status_text) return { ...prev, [payload.user_id]: payload.status_text };
          const next = { ...prev }; delete next[payload.user_id]; return next;
        });
      } else if (event === 'dm_call_ring') {
        // Incoming call notification
        setIncomingCall({ dmId: payload.dm_id, callerId: payload.caller_id, callerName: payload.caller_name });
      } else if (event === 'dm_call_ended') {
        setIncomingCall((prev) => prev?.dmId === payload.dm_id ? null : prev);
      }
    });
    return () => { leaveChannel('presence:lobby'); };
  }, [sessionToken]);

  // ── Ringtone for incoming calls ──
  useEffect(() => {
    if (!incomingCall) {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
      return;
    }
    // Play a repeating ring tone using Web Audio oscillators
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    gain.connect(ctx.destination);
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    const ringOnce = () => {
      if (stopped) return;
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 440;
      o1.connect(gain);
      o1.start();
      o1.stop(ctx.currentTime + 0.25);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 480;
      o2.connect(gain);
      o2.start(ctx.currentTime + 0.35);
      o2.stop(ctx.currentTime + 0.6);
      timeout = setTimeout(ringOnce, 2000);
    };
    ringOnce();
    // Auto-dismiss after 30s
    const autoDismiss = setTimeout(() => setIncomingCall(null), 30000);
    ringtoneRef.current = {
      stop: () => { stopped = true; clearTimeout(timeout); clearTimeout(autoDismiss); ctx.close().catch(() => {}); },
    };
    return () => { ringtoneRef.current?.stop(); ringtoneRef.current = null; };
  }, [incomingCall]);

  // ── Answer / Decline incoming call ──
  const handleAnswerCall = useCallback(async () => {
    if (!incomingCall) return;
    setIncomingCall(null);
    // Navigate to social view and connect the DM voice
    setActiveView('social');
    setPanelMode('full');
    const sock = getSocket();
    if (!sock) return;
    try {
      await connectDmVoice(sock, incomingCall.dmId, user?.id || '', incomingCall.callerId, {
        onStateChange: () => {},
        onVoiceStates: () => {},
        onSpeaking: () => {},
        onError: (err) => console.error('[dm-call-answer]', err),
      });
    } catch (e) {
      console.error('[dm-call-answer] failed:', e);
    }
  }, [incomingCall, user?.id]);

  const handleDeclineCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  // ── Unread tracking (DMs + server channels) ──
  useEffect(() => {
    if (!sessionToken) return;
    const fetchUnreads = () => {
      // Fetch read states, DM channels, and all server channels in parallel
      const serverChannelPromises = burrows.map((b) =>
        api.listChannels(b.id).then((r: any) => {
          const chs: any[] = r.channels || [];
          return chs.map((ch: any) => ({ ...ch, server_id: b.id }));
        }).catch(() => [] as any[])
      );
      Promise.all([
        api.listDMs(),
        api.listReadStates(),
        Promise.all(serverChannelPromises),
      ]).then(([dmRes, rsRes, serverChannelResults]) => {
        const readStates = rsRes.read_states || [];
        const rsMap: Record<string, number> = {};
        for (const rs of readStates) {
          rsMap[rs.channel_id] = rs.last_read_seq;
        }

        // DM unreads
        const dms: any[] = (dmRes as any).dm_channels || (dmRes as any).dms || (dmRes as any).channels || [];
        const dmUnreadMap: Record<string, { lastReadSeq: number; lastMsgSeq: number }> = {};
        for (const dm of dms) {
          const id = String(dm.id);
          const lastMsgSeq = dm.last_message_seq ?? dm.last_seq ?? 0;
          const lastReadSeq = rsMap[id] ?? 0;
          if (lastMsgSeq > lastReadSeq) {
            dmUnreadMap[id] = { lastReadSeq, lastMsgSeq };
          }
        }
        setDmUnreads(dmUnreadMap);

        // Server channel unreads
        const chUnreadMap: Record<string, { serverId: string; categoryId: string | null; lastReadSeq: number; lastMsgSeq: number }> = {};
        for (const channels of serverChannelResults) {
          for (const ch of channels) {
            if (ch.type === 'voice') continue; // skip voice channels
            const id = String(ch.id);
            const lastMsgSeq = ch.last_seq ?? 0;
            const lastReadSeq = rsMap[id] ?? 0;
            if (lastMsgSeq > 0 && lastMsgSeq > lastReadSeq) {
              chUnreadMap[id] = {
                serverId: String(ch.server_id),
                categoryId: ch.category_id ? String(ch.category_id) : null,
                lastReadSeq,
                lastMsgSeq,
              };
            }
          }
        }
        setChannelUnreads(chUnreadMap);
      }).catch(console.error);
    };
    fetchUnreads();
    const id = setInterval(fetchUnreads, 15000);
    return () => clearInterval(id);
  }, [sessionToken, burrows]);

  useEffect(() => {
    setTopoLoading(true);
    // Hydrate from cache first for instant UI
    import('../cache').then(({ getCachedServers }) =>
      getCachedServers().then((cached) => {
        if (cached.length) setBurrows(cached);
      })
    ).catch(() => {});
    Promise.all([
      api.listServers(),
      api.listNetworks(),
      api.getPlatformStats(),
    ]).then(([srvRes, netRes, statsRes]) => {
      const servers = srvRes.servers || [];
      setBurrows(servers);
      setNetworks((netRes.networks || []).map((n: any) => ({
        id: n.id,
        name: n.name,
        burrowIds: n.server_ids || [],
      })));
      setPlatformStats(statsRes);
      // Update cache in background
      import('../cache').then(({ cacheServers }) => cacheServers(servers)).catch(() => {});
    }).catch(console.error)
      .finally(() => setTopoLoading(false));
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      // Don't fire when typing in inputs/textareas (unless it's the quick switcher)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Ctrl+K / Cmd+K — Quick Switcher
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
        setQuickSwitcherQuery('');
        setQuickSwitcherIndex(0);
        return;
      }

      // Ctrl+, — Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings((v) => !v);
        return;
      }

      // Escape — close modals / back out
      if (e.key === 'Escape') {
        if (showQuickSwitcher) { setShowQuickSwitcher(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        if (showProfileAppearance) { setShowProfileAppearance(false); return; }
        if (orbMenuOpen) { setOrbMenuOpen(false); return; }
        if (!isInput && panelMode === 'full') { setPanelMode('peek'); return; }
        if (!isInput && panelMode === 'peek') { setPanelMode('closed'); setActiveView(null); return; }
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [showQuickSwitcher, showSettings, showProfileAppearance, panelMode, orbMenuOpen]);

  const handleCreateBurrow = useCallback(async (name: string) => {
    if (!name.trim()) return;
    try {
      const res = await api.createServer(name.trim());
      const newSrv = res.server || res;
      setBurrows((prev) => [...prev, newSrv]);
      setActiveView(newSrv.id);
      setPanelMode('peek');
    } catch (err) {
      console.error('Failed to create burrow:', err);
    }
  }, []);

  const handleJoinServer = useCallback(async (code: string) => {
    const res = await api.acceptInvite(code);
    const joined = res.server || res;
    // Refresh burrow list
    api.listServers().then((r) => setBurrows(r.servers || [])).catch(console.error);
    if (joined?.id) {
      setActiveView(joined.id);
      setPanelMode('peek');
    }
  }, []);

  function handleLogout() {
    disconnectSocket();
    clearSession();
  }

  function handleTopologySelect(id: string) {
    // Empty click — deselect
    if (!id) {
      setPanelMode('closed');
      setActiveView(null);
      return;
    }

    // Clicking exit-network goes back to main topology
    if (id === 'exit-network') {
      setActiveNetworkId(null);
      setPanelMode('closed');
      setActiveView(null);
      return;
    }

    // Clicking a network parent zooms into it
    if (id.startsWith('net:')) {
      setActiveNetworkId(id.slice(4));
      setPanelMode('closed');
      setActiveView(null);
      return;
    }

    if (id === activeView) {
      // Same node clicked — cycle: peek → full → closed
      if (panelMode === 'closed') {
        setPanelMode('peek');
      } else if (panelMode === 'peek' && id !== 'home') {
        // Only burrows have full view
        setPanelMode('full');
      } else {
        // Full → closed, or home peek → closed
        setPanelMode('closed');
        setActiveView(null);
      }
    } else {
      // Different node — open in peek
      setActiveView(id);
      setPanelMode('peek');
    }
  }

  function handleCreateNetwork(burrowA: string, burrowB: string) {
    const nameA = burrows.find((b) => b.id === burrowA)?.name || '?';
    const nameB = burrows.find((b) => b.id === burrowB)?.name || '?';
    const name = `${nameA} & ${nameB}`;
    api.createNetwork(name, [burrowA, burrowB]).then((res) => {
      setNetworks((prev) => [...prev, {
        id: res.id,
        name: res.name,
        burrowIds: res.server_ids || [burrowA, burrowB],
      }]);
    }).catch(console.error);
  }

  function handleAddToNetwork(networkId: string, burrowId: string) {
    setNetworks((prev) => prev.map((n) =>
      n.id === networkId && !n.burrowIds.includes(burrowId)
        ? { ...n, burrowIds: [...n.burrowIds, burrowId] }
        : n
    ));
    api.addServerToNetwork(networkId, burrowId).catch(console.error);
  }

  function handleRemoveFromNetwork(networkId: string, burrowId: string) {
    setNetworks((prev) => prev.map((n) =>
      n.id === networkId
        ? { ...n, burrowIds: n.burrowIds.filter((id) => id !== burrowId) }
        : n
    ));
    api.removeServerFromNetwork(networkId, burrowId).catch(console.error);
  }

  function handleRenameNetwork(networkId: string, newName: string) {
    setNetworks((prev) => prev.map((n) =>
      n.id === networkId ? { ...n, name: newName } : n
    ));
    api.updateNetwork(networkId, newName).catch(console.error);
  }

  function handleDissolveNetwork(networkId: string) {
    setNetworks((prev) => prev.filter((n) => n.id !== networkId));
    if (activeNetworkId === networkId) {
      setActiveNetworkId(null);
      setPanelMode('closed');
      setActiveView(null);
    }
    api.deleteNetwork(networkId).catch(console.error);
  }

  function handleToggleFavorite(burrowId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(burrowId)) next.delete(burrowId);
      else next.add(burrowId);
      localStorage.setItem('burrow_favorites', JSON.stringify([...next]));
      return next;
    });
  }

  function handleFiltersChange(next: TopologyFilters) {
    setTopoFilters(next);
    localStorage.setItem('burrow_topo_filters', JSON.stringify({
      showFavorites: next.showFavorites,
      showDataLines: next.showDataLines,
      heatLayers: [...next.heatLayers],
      heatMapType: next.heatMapType,
      heatRotation: next.heatRotation,
    }));
  }

  function handleExitNetwork() {
    setActiveNetworkId(null);
  }

  // Compute which servers have unread channels
  const unreadServerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ch of Object.values(channelUnreads)) {
      ids.add(ch.serverId);
    }
    return ids;
  }, [channelUnreads]);

  // Determine layout class
  const layoutClass = [
    'burrow-layout',
    panelMode !== 'closed' ? `panel-${panelMode}` : '',
    activeBurrow && panelMode !== 'closed' ? 'burrow-active' : '',
    activeView === 'home' && panelMode !== 'closed' ? 'home-active' : '',
    activeView === 'social' && panelMode !== 'closed' ? 'social-active' : '',
    !animations ? 'no-animate' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={layoutClass}>
        {/* Topology — always visible */}
        <div className="topology-panel">
          <Topology
            burrows={burrows}
            networks={networks}
            favorites={favorites}
            activity={heatmapDebug ? debugActivity : activity}
            filters={topoFilters}
            loading={topoLoading}
            activeId={activeView}
            activeNetworkId={activeNetworkId}
            platformStats={platformStats}
            onSelect={handleTopologySelect}
            onCreateBurrow={handleCreateBurrow}
            onJoinServer={handleJoinServer}
            onCreateNetwork={handleCreateNetwork}
            onAddToNetwork={handleAddToNetwork}
            onRemoveFromNetwork={handleRemoveFromNetwork}
            onRenameNetwork={handleRenameNetwork}
            onDissolveNetwork={handleDissolveNetwork}
            onToggleFavorite={handleToggleFavorite}
            onFiltersChange={handleFiltersChange}
            onExitNetwork={handleExitNetwork}
            username={user?.username || '?'}
            hasUnreadDMs={Object.keys(dmUnreads).length > 0}
            unreadServerIds={unreadServerIds}
            onMarkServerRead={(serverId) => {
              api.ackServer(serverId).then(() => {
                setChannelUnreads((prev) => {
                  const next = { ...prev };
                  for (const [chId, ch] of Object.entries(next)) {
                    if (ch.serverId === serverId) delete next[chId];
                  }
                  return next;
                });
              }).catch(console.error);
            }}
          />
        </div>

        {/* Side panel — slides in from right */}
        <div className={`side-panel ${panelMode !== 'closed' ? 'open' : ''}`}>
          {activeView === 'home' ? (
            <div className="home-panel">
              <div className="home-header">
                <h2>{user?.username}</h2>
              </div>
              <div className="home-content">
                <div className="home-actions">
                  <button className="home-action-card" onClick={() => setShowProfileAppearance(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span>Profile</span>
                  </button>
                  <button className="home-action-card" onClick={() => setShowSettings(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                    <span>Settings</span>
                  </button>
                </div>
              </div>
            </div>
          ) : activeBurrow ? (
            <div className="burrow-view">
              <BurrowView
                serverId={activeBurrow.id}
                serverName={activeBurrow.name}
                currentUserId={user?.id || ''}
                currentUsername={user?.username || '?'}
                compact={panelMode === 'peek'}
                userStatus={userStatus}
                presenceMap={presenceMap}
                customStatusMap={{ ...customStatusMap, ...(customStatusText ? { [user?.id || '']: customStatusText } : {}) }}
                onMemberClick={(m) => {
                  // Fetch public profile then show with server data
                  Promise.all([
                    api.getUserProfile(m.user_id).catch(() => null),
                    m.user_id !== user?.id ? api.getUserNote(m.user_id).catch(() => ({ content: null })) : Promise.resolve({ content: null }),
                  ]).then(([p, n]: any[]) => {
                    if (!p) return;
                    const hasServerProfile = !!(m.nickname || m.bio || m.pronouns);
                    setProfileDisplay({
                      userId: m.user_id, username: p.username,
                      displayName: p.display_name, bio: p.bio, pronouns: p.pronouns,
                      bannerUrl: p.banner_url, trustTier: p.trust_tier,
                      accentColor: p.accent_color, badges: p.badges || [],
                      serverId: activeBurrow.id, nickname: m.nickname,
                      serverBio: m.bio, serverPronouns: m.pronouns,
                    });
                    setProfileNote(n.content || '');
                    setProfileNoteDraft(n.content || '');
                    setProfileTab(hasServerProfile ? 'server' : 'public');
                  });
                }}
                channelUnreads={channelUnreads}
                onAckChannel={(channelId, messageId) => {
                  api.ackChannel(activeBurrow.id, channelId, messageId).then(() => {
                    setChannelUnreads((prev) => { const next = { ...prev }; delete next[channelId]; return next; });
                  }).catch(console.error);
                }}
              />
            </div>
          ) : activeView === 'social' ? (
            <div className="burrow-view">
              <FriendsPanel
                currentUserId={user?.id || ''}
                username={user?.username || '?'}
                userStatus={userStatus}
                presenceMap={presenceMap}
                customStatusMap={customStatusMap}
                dmUnreads={dmUnreads}
                openDmWithUserId={openDmWithUserId}
                onOpenDmWithUserHandled={() => setOpenDmWithUserId(null)}
                onAckDm={(dmId, msgId) => {
                  api.ackDm(dmId, msgId).then(() => {
                    setDmUnreads((prev) => { const next = { ...prev }; delete next[dmId]; return next; });
                  }).catch(console.error);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* User orb — always rendered, animates to bottom-left in fullscreen */}
      <button
        className={`user-mini-orb status-${userStatus} ${panelMode === 'full' && (activeBurrow || activeView === 'social') ? 'visible' : ''}`}
        onClick={() => { if (panelMode === 'full') setPanelMode('peek'); }}
        onContextMenu={(e) => { e.preventDefault(); if (panelMode === 'full' && (activeBurrow || activeView === 'social')) setOrbMenuOpen((v) => !v); }}
        data-status={userStatus === 'online' ? 'Online' : userStatus === 'idle' ? 'Away' : userStatus === 'dnd' ? 'Do Not Disturb' : 'Invisible'}
        tabIndex={panelMode === 'full' && (activeBurrow || activeView === 'social') ? 0 : -1}
      >
        {user?.username?.charAt(0).toUpperCase() || '?'}
      </button>

      {/* Orb context menu */}
      {orbMenuOpen && (
        <div className="orb-menu" onClick={(e) => e.stopPropagation()}>
          <div className="orb-menu-tabs">
            <button className={`orb-menu-tab${orbMenuTab === 'status' ? ' active' : ''}`} onClick={() => setOrbMenuTab('status')}>Status</button>
            {activeBurrow && <button className={`orb-menu-tab${orbMenuTab === 'server' ? ' active' : ''}`} onClick={() => {
              setOrbMenuTab('server');
              // Load current server profile
              const members = (window as any).__orbMembers;
              if (!members) {
                api.listMembers(activeBurrow.id).then((res) => {
                  const me = (res.members || []).find((m: any) => m.user_id === user?.id);
                  if (me) { setOrbNickDraft(me.nickname || ''); setOrbBioDraft(me.bio || ''); setOrbPronounsDraft(me.pronouns || ''); }
                });
              }
            }}>Server Profile</button>}
          </div>
          <div className="orb-menu-body">
            {orbMenuTab === 'status' && (
              <>
                {(['online', 'idle', 'dnd', 'invisible'] as const).map((s) => (
                  <button
                    key={s}
                    className={`orb-menu-item${userStatus === s ? ' active' : ''}`}
                    onClick={() => {
                      setUserStatus(s);
                      pushChannel('presence:lobby', 'update_status', { status: s });
                    }}
                  >
                    <span className={`status-dot status-${s}`} />
                    {s === 'online' ? 'Online' : s === 'idle' ? 'Away' : s === 'dnd' ? 'Do Not Disturb' : 'Invisible'}
                  </button>
                ))}
                <div className="orb-menu-divider" />
                <div className="orb-menu-field">
                  <label className="orb-menu-label">Custom Status</label>
                  <input
                    className="orb-menu-input"
                    placeholder="What's on your mind?"
                    maxLength={128}
                    value={customStatusDraft}
                    onChange={(e) => setCustomStatusDraft(e.target.value)}
                  />
                </div>
                <div className="orb-menu-field">
                  <label className="orb-menu-label">Clear After</label>
                  <select className="orb-menu-select" value={customStatusDuration} onChange={(e) => setCustomStatusDuration(e.target.value)}>
                    <option value="0">Don't clear</option>
                    <option value="1800">30 minutes</option>
                    <option value="3600">1 hour</option>
                    <option value="14400">4 hours</option>
                    <option value="86400">24 hours</option>
                  </select>
                </div>
                <div className="orb-menu-actions">
                  {customStatusText && (
                    <button className="orb-menu-btn orb-menu-btn-secondary" onClick={() => {
                      setCustomStatusText('');
                      setCustomStatusDraft('');
                      pushChannel('presence:lobby', 'set_custom_status', { clear: true });
                    }}>Clear</button>
                  )}
                  <button className="orb-menu-btn" onClick={() => {
                    if (customStatusDraft.trim()) {
                      setCustomStatusText(customStatusDraft.trim());
                      const dur = parseInt(customStatusDuration);
                      pushChannel('presence:lobby', 'set_custom_status', {
                        text: customStatusDraft.trim(),
                        ...(dur > 0 ? { duration: dur } : {}),
                      });
                    }
                    setOrbMenuOpen(false);
                  }}>Save</button>
                </div>
              </>
            )}
            {orbMenuTab === 'server' && activeBurrow && (
              <>
                <div className="orb-menu-field">
                  <label className="orb-menu-label">Nickname</label>
                  <input className="orb-menu-input" maxLength={32} placeholder={user?.username || ''} value={orbNickDraft} onChange={(e) => setOrbNickDraft(e.target.value)} />
                </div>
                <div className="orb-menu-field">
                  <label className="orb-menu-label">Pronouns</label>
                  <input className="orb-menu-input" maxLength={32} placeholder="e.g. they/them" value={orbPronounsDraft} onChange={(e) => setOrbPronounsDraft(e.target.value)} />
                </div>
                <div className="orb-menu-field">
                  <label className="orb-menu-label">Server Bio</label>
                  <textarea className="orb-menu-textarea" maxLength={256} rows={3} placeholder="About you in this server…" value={orbBioDraft} onChange={(e) => setOrbBioDraft(e.target.value)} />
                </div>
                <div className="orb-menu-actions">
                  <button className="orb-menu-btn orb-menu-btn-secondary" onClick={() => {
                    setOrbMenuOpen(false);
                    api.getProfile().then((p: any) => {
                      const serverMember = activeBurrow ? { nickname: orbNickDraft, serverBio: orbBioDraft, serverPronouns: orbPronounsDraft, serverId: activeBurrow.id } : {};
                      setProfileDisplay({
                        userId: user?.id || '', username: p.username, displayName: p.display_name,
                        bio: p.bio, pronouns: p.pronouns, bannerUrl: p.banner_url, trustTier: p.trust_tier,
                        accentColor: p.accent_color, badges: p.badges || [],
                        ...serverMember,
                      });
                      setProfileNote('');
                      setProfileNoteDraft('');
                      setProfileTab((activeBurrow && (orbNickDraft || orbBioDraft || orbPronounsDraft)) ? 'server' : 'public');
                    });
                  }}>Display Profile</button>
                  <button className="orb-menu-btn" onClick={() => {
                    api.updateServerProfile(activeBurrow.id, {
                      nickname: orbNickDraft || undefined,
                      pronouns: orbPronounsDraft || undefined,
                      bio: orbBioDraft || undefined,
                    }).then(() => setOrbMenuOpen(false)).catch(console.error);
                  }}>Save</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {orbMenuOpen && <div className="orb-menu-backdrop" onClick={() => setOrbMenuOpen(false)} />}

      {/* Profile Display Modal */}
      {profileDisplay && (
        <div className="profile-overlay" onClick={(e) => { if (e.target === e.currentTarget) setProfileDisplay(null); }}>
          <div className="profile-card" style={profileDisplay.accentColor ? { '--profile-accent': profileDisplay.accentColor } as React.CSSProperties : undefined}>
            {profileDisplay.accentColor && <div className="profile-accent-bar" />}
            <button className="profile-close" onClick={() => setProfileDisplay(null)}>&times;</button>
            {profileDisplay.serverId && (profileDisplay.nickname || profileDisplay.serverBio || profileDisplay.serverPronouns) && (
              <div className="profile-tabs">
                <button className={`profile-tab${profileTab === 'public' ? ' active' : ''}`} onClick={() => setProfileTab('public')}>Public Profile</button>
                <button className={`profile-tab${profileTab === 'server' ? ' active' : ''}`} onClick={() => setProfileTab('server')}>Server Profile</button>
              </div>
            )}
            {profileTab === 'public' && (
              <div className="profile-body">
                <div className="profile-header">
                  <div className="profile-avatar" style={profileDisplay.accentColor ? { borderColor: profileDisplay.accentColor } : undefined}>{profileDisplay.username.charAt(0).toUpperCase()}</div>
                  <div className="profile-identity">
                    <div className="profile-display-name">{profileDisplay.displayName || profileDisplay.username}</div>
                    {profileDisplay.displayName && <div className="profile-username">@{profileDisplay.username}</div>}
                  </div>
                </div>
                <div className="profile-badges">
                  {profileDisplay.badges && profileDisplay.badges.length > 0
                    ? <BadgeRow badges={profileDisplay.badges} />
                    : <span className="profile-badges-empty">No badges yet</span>}
                </div>
                {profileDisplay.pronouns && <div className="profile-field"><span className="profile-field-label">Pronouns</span><span>{profileDisplay.pronouns}</span></div>}
                {profileDisplay.bio && <div className="profile-field"><span className="profile-field-label">About</span><span className="profile-bio-text">{profileDisplay.bio}</span></div>}
                {profileDisplay.trustTier != null && <div className="profile-field"><span className="profile-field-label">Trust</span><span>Tier {profileDisplay.trustTier}</span></div>}
                <div className="profile-field">
                  <span className="profile-field-label">Status</span>
                  <span className="profile-status-row">
                    <span className={`status-dot status-${profileDisplay.userId === user?.id ? userStatus : (presenceMap[profileDisplay.userId] || 'offline')}`} />
                    {(() => { const s = profileDisplay.userId === user?.id ? userStatus : (presenceMap[profileDisplay.userId] || 'offline'); return s === 'online' ? 'Online' : s === 'idle' ? 'Away' : s === 'dnd' ? 'DND' : 'Offline'; })()}
                  </span>
                </div>
                {(() => { const ct = profileDisplay.userId === user?.id ? customStatusText : customStatusMap[profileDisplay.userId]; return ct ? <div className="profile-field"><span className="profile-field-label">Custom Status</span><span>{ct}</span></div> : null; })()}
                {profileDisplay.userId !== user?.id && (
                  <div className="profile-note">
                    <span className="profile-field-label">Note</span>
                    <textarea
                      className="profile-note-input"
                      placeholder="Add a note about this user…"
                      maxLength={1024}
                      rows={2}
                      value={profileNoteDraft}
                      onChange={(e) => setProfileNoteDraft(e.target.value)}
                    />
                    {profileNoteDraft !== profileNote && (
                      <div className="profile-note-actions">
                        <button className="profile-note-btn" onClick={() => {
                          if (profileNoteDraft.trim()) {
                            api.setUserNote(profileDisplay.userId, profileNoteDraft.trim()).then(() => setProfileNote(profileNoteDraft.trim()));
                          } else {
                            api.deleteUserNote(profileDisplay.userId).then(() => { setProfileNote(''); setProfileNoteDraft(''); });
                          }
                        }}>Save</button>
                        <button className="profile-note-btn profile-note-cancel" onClick={() => setProfileNoteDraft(profileNote)}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {profileTab === 'server' && profileDisplay.serverId && (
              <div className="profile-body">
                <div className="profile-header">
                  <div className="profile-avatar" style={profileDisplay.accentColor ? { borderColor: profileDisplay.accentColor } : undefined}>{(profileDisplay.nickname || profileDisplay.displayName || profileDisplay.username).charAt(0).toUpperCase()}</div>
                  <div className="profile-identity">
                    <div className="profile-display-name">{profileDisplay.nickname || profileDisplay.displayName || profileDisplay.username}</div>
                    <div className="profile-username">@{profileDisplay.username}</div>
                  </div>
                </div>
                <div className="profile-badges">
                  {profileDisplay.badges && profileDisplay.badges.length > 0
                    ? <BadgeRow badges={profileDisplay.badges} />
                    : <span className="profile-badges-empty">No badges yet</span>}
                </div>
                {(profileDisplay.serverPronouns || profileDisplay.pronouns) && <div className="profile-field"><span className="profile-field-label">Pronouns</span><span>{profileDisplay.serverPronouns || profileDisplay.pronouns}</span></div>}
                {(profileDisplay.serverBio || profileDisplay.bio) && <div className="profile-field"><span className="profile-field-label">About</span><span className="profile-bio-text">{profileDisplay.serverBio || profileDisplay.bio}</span></div>}
                {profileDisplay.trustTier != null && <div className="profile-field"><span className="profile-field-label">Trust</span><span>Tier {profileDisplay.trustTier}</span></div>}
                <div className="profile-field">
                  <span className="profile-field-label">Status</span>
                  <span className="profile-status-row">
                    <span className={`status-dot status-${profileDisplay.userId === user?.id ? userStatus : (presenceMap[profileDisplay.userId] || 'offline')}`} />
                    {(() => { const s = profileDisplay.userId === user?.id ? userStatus : (presenceMap[profileDisplay.userId] || 'offline'); return s === 'online' ? 'Online' : s === 'idle' ? 'Away' : s === 'dnd' ? 'DND' : 'Offline'; })()}
                  </span>
                </div>
                {(() => { const ct = profileDisplay.userId === user?.id ? customStatusText : customStatusMap[profileDisplay.userId]; return ct ? <div className="profile-field"><span className="profile-field-label">Custom Status</span><span>{ct}</span></div> : null; })()}
                {profileDisplay.userId !== user?.id && (
                  <div className="profile-note">
                    <span className="profile-field-label">Note</span>
                    <textarea
                      className="profile-note-input"
                      placeholder="Add a note about this user…"
                      maxLength={1024}
                      rows={2}
                      value={profileNoteDraft}
                      onChange={(e) => setProfileNoteDraft(e.target.value)}
                    />
                    {profileNoteDraft !== profileNote && (
                      <div className="profile-note-actions">
                        <button className="profile-note-btn" onClick={() => {
                          if (profileNoteDraft.trim()) {
                            api.setUserNote(profileDisplay.userId, profileNoteDraft.trim()).then(() => setProfileNote(profileNoteDraft.trim()));
                          } else {
                            api.deleteUserNote(profileDisplay.userId).then(() => { setProfileNote(''); setProfileNoteDraft(''); });
                          }
                        }}>Save</button>
                        <button className="profile-note-btn profile-note-cancel" onClick={() => setProfileNoteDraft(profileNote)}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Friend action button */}
            {profileDisplay.userId !== user?.id && (
              <div className="profile-friend-actions">
                <button className="profile-friend-btn message" onClick={() => {
                  const targetId = profileDisplay.userId;
                  setProfileDisplay(null);
                  setOpenDmWithUserId(targetId);
                  setActiveView('social');
                  setPanelMode('full');
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  Send Message
                </button>
                {profileFriendStatus === 'loading' ? (
                  <button className="profile-friend-btn" disabled>Loading…</button>
                ) : profileFriendStatus === 'friend' ? (
                  <button className="profile-friend-btn remove" onClick={() => {
                    api.removeFriend(profileDisplay.userId).then(() => setProfileFriendStatus('none'));
                  }}>Remove Friend</button>
                ) : profileFriendStatus === 'pending-out' ? (
                  <button className="profile-friend-btn pending" disabled>Request Sent</button>
                ) : profileFriendStatus === 'pending-in' ? (
                  <div className="profile-friend-btn-row">
                    <button className="profile-friend-btn accept" onClick={() => {
                      api.acceptFriendRequest(profileDisplay.userId).then(() => setProfileFriendStatus('friend'));
                    }}>Accept Request</button>
                    <button className="profile-friend-btn decline" onClick={() => {
                      api.declineFriendRequest(profileDisplay.userId).then(() => setProfileFriendStatus('none'));
                    }}>Decline</button>
                  </div>
                ) : (
                  <button className="profile-friend-btn add" onClick={() => {
                    api.sendFriendRequest(profileDisplay.userId).then(() => setProfileFriendStatus('pending-out')).catch(() => {});
                  }}>Add Friend</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsMenu
          user={user}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
          heatmapDebug={heatmapDebug}
          onHeatmapDebugChange={setHeatmapDebug}
        />
      )}

      {showProfileAppearance && (
        <ProfileAppearance
          user={user}
          onClose={() => setShowProfileAppearance(false)}
        />
      )}

      {showQuickSwitcher && (() => {
        const q = quickSwitcherQuery.toLowerCase();
        const results = burrows
          .filter((b) => b.name.toLowerCase().includes(q))
          .slice(0, 8);
        return (
          <div className="quick-switcher-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) setShowQuickSwitcher(false);
          }}>
            <div className="quick-switcher">
              <input
                className="quick-switcher-input"
                autoFocus
                placeholder="Jump to a burrow…"
                value={quickSwitcherQuery}
                onChange={(e) => { setQuickSwitcherQuery(e.target.value); setQuickSwitcherIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setQuickSwitcherIndex((i) => Math.min(i + 1, results.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setQuickSwitcherIndex((i) => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && results[quickSwitcherIndex]) {
                    setActiveView(results[quickSwitcherIndex].id);
                    setPanelMode('peek');
                    setShowQuickSwitcher(false);
                  }
                  if (e.key === 'Escape') setShowQuickSwitcher(false);
                }}
              />
              <div className="quick-switcher-results">
                {results.map((b, i) => (
                  <button
                    key={b.id}
                    className={`quick-switcher-item ${i === quickSwitcherIndex ? 'active' : ''}`}
                    onClick={() => {
                      setActiveView(b.id);
                      setPanelMode('peek');
                      setShowQuickSwitcher(false);
                    }}
                  >
                    <span className="quick-switcher-icon">{b.name.charAt(0).toUpperCase()}</span>
                    <span>{b.name}</span>
                  </button>
                ))}
                {results.length === 0 && quickSwitcherQuery && (
                  <div className="quick-switcher-empty">No burrows found</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Incoming Call Overlay ── */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar">
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </div>
            <div className="incoming-call-info">
              <span className="incoming-call-label">Incoming Call</span>
              <span className="incoming-call-name">{incomingCall.callerName}</span>
            </div>
            <div className="incoming-call-actions">
              <button className="incoming-call-btn answer" onClick={handleAnswerCall} title="Answer">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2z" />
                </svg>
              </button>
              <button className="incoming-call-btn decline" onClick={handleDeclineCall} title="Decline">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
