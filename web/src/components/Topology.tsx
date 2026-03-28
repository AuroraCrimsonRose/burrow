import { useMemo, useState, useRef, useCallback, useEffect } from 'react';

export interface Network {
  id: string;
  name: string;
  burrowIds: string[];
}

/** Per-server activity metrics for heat map layers */
export interface ActivityMetrics {
  overall: number;
  voice: number;
  friendActivity: number;
  friendVoice: number;
  newMembers: number;
  reactions: number;
}

export const HEAT_LAYERS = [
  { key: 'overall',        label: 'Overall Activity', color: '255, 200, 92' },   // amber
  { key: 'voice',          label: 'Voice Activity',   color: '156, 125, 216' },  // violet
  { key: 'friendActivity', label: 'Friend Activity',  color: '77, 199, 210' },   // teal
  { key: 'friendVoice',    label: 'Friends in Voice',  color: '126, 209, 163' },  // moss
  { key: 'newMembers',     label: 'New Members',      color: '255, 158, 92' },   // flame
  { key: 'reactions',      label: 'Reactions',        color: '214, 195, 161' },  // beige
] as const;

export type HeatLayerKey = typeof HEAT_LAYERS[number]['key'];

export type HeatMapType = 'arcs' | 'aura';

export interface TopologyFilters {
  showFavorites: boolean;
  showDataLines: boolean;
  heatLayers: Set<HeatLayerKey>;
  heatMapType: HeatMapType;
  heatRotation: boolean;
}

interface TopologyProps {
  burrows: { id: string; name: string }[];
  networks: Network[];
  favorites: Set<string>;
  activity: Record<string, ActivityMetrics>;
  filters: TopologyFilters;
  activeId: string | null;
  activeNetworkId: string | null;
  loading?: boolean;
  platformStats: { users: number; servers: number; members: number; messages: number } | null;
  onSelect: (id: string) => void;
  onCreateBurrow: (name: string) => void;
  onJoinServer: (code: string) => Promise<void>;
  onCreateNetwork: (burrowA: string, burrowB: string) => void;
  onAddToNetwork: (networkId: string, burrowId: string) => void;
  onRemoveFromNetwork: (networkId: string, burrowId: string) => void;
  onRenameNetwork: (networkId: string, name: string) => void;
  onDissolveNetwork: (networkId: string) => void;
  onToggleFavorite: (burrowId: string) => void;
  onFiltersChange: (filters: TopologyFilters) => void;
  onExitNetwork: () => void;
  username: string;
  hasUnreadDMs?: boolean;
  unreadServerIds?: Set<string>;
  onMarkServerRead?: (serverId: string) => void;
}

type AddMode = 'closed' | 'choose' | 'create' | 'join';

const CX = 50;
const CY = 50;
const RADIUS = 32;
const FAVORITE_RADIUS = 20; // favorites orbit closer
const SUB_NODE_RADIUS = 8;

function orbitPositions(
  ids: string[], cx: number, cy: number, r: number,
  favoriteIds?: Set<string>, favR?: number,
) {
  const pos: Record<string, { x: number; y: number }> = {};
  const count = ids.length;
  if (count === 0) return pos;
  const offset = -Math.PI / 2;
  ids.forEach((id, i) => {
    const angle = offset + (2 * Math.PI * i) / count;
    const actualR = (favoriteIds?.has(id) && favR) ? favR : r;
    pos[id] = { x: cx + actualR * Math.cos(angle), y: cy + actualR * Math.sin(angle) };
  });
  return pos;
}

/** Sub-node positions orbiting a parent, pushed away from home center */
function subNodePositions(
  ids: string[], parentX: number, parentY: number, homeCx: number, homeCy: number,
) {
  const pos: Record<string, { x: number; y: number }> = {};
  const count = ids.length;
  if (count === 0) return pos;
  const awayAngle = Math.atan2(parentY - homeCy, parentX - homeCx);
  const spread = Math.PI * 0.8;
  ids.forEach((id, i) => {
    const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
    const angle = awayAngle + t * spread;
    pos[id] = {
      x: parentX + SUB_NODE_RADIUS * Math.cos(angle),
      y: parentY + SUB_NODE_RADIUS * Math.sin(angle),
    };
  });
  return pos;
}

/**
 * Sub-topology: distribute burrows evenly around center, starting from the right (0°).
 */
function subTopologyPositions(ids: string[], cx: number, cy: number, r: number) {
  const pos: Record<string, { x: number; y: number }> = {};
  const count = ids.length;
  if (count === 0) return pos;
  const startAngle = 0; // start at right (3 o'clock)
  ids.forEach((id, i) => {
    const angle = startAngle + (2 * Math.PI * i) / count;
    pos[id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  return pos;
}

function twoLetterLabel(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const EMPTY_METRICS: ActivityMetrics = { overall: 0, voice: 0, friendActivity: 0, friendVoice: 0, newMembers: 0, reactions: 0 };

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function aggregateNetworkMetrics(burrowIds: string[], activity: Record<string, ActivityMetrics>): ActivityMetrics {
  const result = { ...EMPTY_METRICS };
  let count = 0;
  for (const id of burrowIds) {
    const m = activity[id];
    if (!m) continue;
    count++;
    result.overall += m.overall;
    result.voice += m.voice;
    result.friendActivity += m.friendActivity;
    result.friendVoice += m.friendVoice;
    result.newMembers += m.newMembers;
    result.reactions += m.reactions;
  }
  if (count > 1) {
    result.overall /= count;
    result.voice /= count;
    result.friendActivity /= count;
    result.friendVoice /= count;
    result.newMembers /= count;
    result.reactions /= count;
  }
  return result;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'network' | 'burrow';
  targetId: string;
}

export default function Topology({
  burrows, networks, favorites, activity, filters, loading, activeId, activeNetworkId, platformStats,
  onSelect, onCreateBurrow, onJoinServer, onCreateNetwork, onAddToNetwork, onRemoveFromNetwork, onRenameNetwork, onDissolveNetwork,
  onToggleFavorite, onFiltersChange, onExitNetwork, username, hasUnreadDMs, unreadServerIds, onMarkServerRead,
}: TopologyProps) {

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean; grabX: number; grabY: number } | null>(null);
  const pendingDragId = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statsCardOpen, setStatsCardOpen] = useState(true);
  const [statsEntered, setStatsEntered] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('closed');
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [viewTransition, setViewTransition] = useState<'zoom-in' | 'zoom-out' | null>(null);
  const [zoomOrigin, setZoomOrigin] = useState<string>('50% 50%');
  const [twistAngle, setTwistAngle] = useState<number>(0);
  const prevNetworkRef = useRef<string | null>(null);
  const [viewEnter, setViewEnter] = useState<'enter-sub' | 'enter-main' | null>(null);

  // Detect view changes to trigger entry animations
  useEffect(() => {
    const prevNet = prevNetworkRef.current;
    const curNet = activeNetworkId;
    if (prevNet !== curNet) {
      if (curNet && !prevNet) {
        // Entered sub-topology
        setViewEnter('enter-sub');
        const t = setTimeout(() => setViewEnter(null), 300);
        prevNetworkRef.current = curNet;
        return () => clearTimeout(t);
      } else if (!curNet && prevNet) {
        // Returned to main topology
        setViewEnter('enter-main');
        const t = setTimeout(() => setViewEnter(null), 300);
        prevNetworkRef.current = curNet;
        return () => clearTimeout(t);
      }
      prevNetworkRef.current = curNet;
    }
  }, [activeNetworkId]);
  const networkedBurrowIds = useMemo(() => {
    const set = new Set<string>();
    networks.forEach((n) => n.burrowIds.forEach((id) => set.add(id)));
    return set;
  }, [networks]);

  const activeNetwork = activeNetworkId ? networks.find((n) => n.id === activeNetworkId) : null;

  const topLevelBurrows = useMemo(
    () => burrows.filter((b) => !networkedBurrowIds.has(b.id)),
    [burrows, networkedBurrowIds],
  );

  const mainOrbitIds = useMemo(() => {
    const burrowIds = topLevelBurrows.map((b) => b.id);
    const netIds = networks.map((n) => `net:${n.id}`);
    // Interleave: place networks at evenly spaced positions among burrows
    // so they spread to outer ring slots symmetrically
    if (netIds.length === 0) return burrowIds;
    if (burrowIds.length === 0) return netIds;
    const total = burrowIds.length + netIds.length;
    const result: string[] = new Array(total);
    // Distribute network slots evenly
    const netSlots = netIds.map((_, i) =>
      Math.round((i + 1) * total / (netIds.length + 1))
    );
    const netSlotSet = new Set(netSlots);
    let bi = 0, ni = 0;
    for (let i = 0; i < total; i++) {
      if (netSlotSet.has(i) && ni < netIds.length) {
        result[i] = netIds[ni++];
      } else if (bi < burrowIds.length) {
        result[i] = burrowIds[bi++];
      } else {
        result[i] = netIds[ni++];
      }
    }
    return result;
  }, [topLevelBurrows, networks]);

  const effectiveFavorites = useMemo(
    () => filters.showFavorites ? favorites : new Set<string>(),
    [filters.showFavorites, favorites],
  );

  const mainPositions = useMemo(
    () => orbitPositions(mainOrbitIds, CX, CY, RADIUS),
    [mainOrbitIds],
  );

  const networkSubPositions = useMemo(() => {
    const all: Record<string, Record<string, { x: number; y: number }>> = {};
    networks.forEach((n) => {
      const parentPos = mainPositions[`net:${n.id}`];
      if (parentPos) {
        all[n.id] = subNodePositions(n.burrowIds, parentPos.x, parentPos.y, CX, CY);
      }
    });
    return all;
  }, [networks, mainPositions]);

  // Sub-topology: use safe positions that avoid the upward home path
  const subBurrows = useMemo(
    () => activeNetwork ? burrows.filter((b) => activeNetwork.burrowIds.includes(b.id)) : [],
    [activeNetwork, burrows],
  );
  const subPositions = useMemo(
    () => subTopologyPositions(subBurrows.map((b) => b.id), CX, CY, RADIUS),
    [subBurrows],
  );

  // ── Compute max metrics for normalization (per-burrow only) ──
  const maxMetrics = useMemo(() => {
    const max = { ...EMPTY_METRICS };
    for (const m of Object.values(activity)) {
      for (const k of Object.keys(max) as (keyof ActivityMetrics)[]) {
        if (m[k] > max[k]) max[k] = m[k];
      }
    }
    return max;
  }, [activity]);

  // ── Activity spike ripple detection ──
  const prevActivityRef = useRef<Record<string, number>>({});
  const [rippleNodes, setRippleNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevActivityRef.current;
    const spiking = new Set<string>();
    const selectedKeys = filters.heatLayers.size > 0
      ? [...filters.heatLayers] as (keyof ActivityMetrics)[]
      : ['overall' as keyof ActivityMetrics];
    const sumSelected = (m: ActivityMetrics) =>
      selectedKeys.reduce((s, k) => s + m[k], 0);
    // Check each node for a large spike (>50% increase from previous snapshot)
    for (const [id, metrics] of Object.entries(activity)) {
      const prevVal = prev[id] || 0;
      const curVal = sumSelected(metrics);
      if (prevVal > 0 && curVal > prevVal * 1.5) {
        spiking.add(id);
      }
      prev[id] = curVal;
    }
    // Also check aggregated network metrics
    for (const n of networks) {
      const agg = aggregateNetworkMetrics(n.burrowIds, activity);
      const nid = `net:${n.id}`;
      const prevVal = prev[nid] || 0;
      const curVal = sumSelected(agg);
      if (prevVal > 0 && curVal > prevVal * 1.5) {
        spiking.add(nid);
      }
      prev[nid] = curVal;
    }
    prevActivityRef.current = prev;

    if (spiking.size > 0) {
      setRippleNodes(spiking);
      const timer = setTimeout(() => setRippleNodes(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [activity, networks, filters.heatLayers]);

  /** Get the effective position of a node, accounting for drag offset */
  const getEffectivePos = useCallback((id: string, basePos: { x: number; y: number }) => {
    if (dragId === id && dragOffset) {
      // dragOffset stores absolute position in %, use directly
      return { x: dragOffset.dx, y: dragOffset.dy };
    }
    return basePos;
  }, [dragId, dragOffset]);

  // ── Drag handlers ──
  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    const btn = (e.target as HTMLElement).closest('.topology-node') as HTMLElement | null;
    if (btn) btn.setPointerCapture(e.pointerId);
    let grabX = 0, grabY = 0;
    if (btn) {
      const r = btn.getBoundingClientRect();
      grabX = e.clientX - (r.left + r.width / 2);
      grabY = e.clientY - (r.top + r.height / 2);
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, grabX, grabY };
    pendingDragId.current = id;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      dragRef.current.moved = true;
      // Only activate drag state once movement threshold is reached
      if (pendingDragId.current) {
        setDragId(pendingDragId.current);
        setDragOffset(null);
      }
    }
    if (!dragRef.current.moved) return;
    const id = pendingDragId.current;

    // Convert absolute mouse position to container %, subtract grab offset
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const mouseXPct = ((e.clientX - dragRef.current.grabX - rect.left) / rect.width) * 100;
      const mouseYPct = ((e.clientY - dragRef.current.grabY - rect.top) / rect.height) * 100;
      // dragOffset is added to the node's base position, so compute the diff
      // We need to find the base position of the dragged node to compute the offset
      // For simplicity, track absolute position and convert in getEffectivePos
      setDragOffset({ dx: mouseXPct, dy: mouseYPct });
    }

    const el = (() => {
      const btn = (e.target as HTMLElement).closest('.topology-node') as HTMLElement | null;
      if (btn) {
        btn.style.pointerEvents = 'none';
        const under = document.elementFromPoint(e.clientX, e.clientY);
        btn.style.pointerEvents = '';
        return under;
      }
      return document.elementFromPoint(e.clientX, e.clientY);
    })();
    const nodeEl = el?.closest<HTMLElement>('[data-node-id]');
    const targetId = nodeEl?.dataset.nodeId || null;
    setDropTarget(targetId && targetId !== id ? targetId : null);
  }, []);

  const wasDraggingRef = useRef(false);

  const handlePointerUp = useCallback(() => {
    if (dragRef.current?.moved) {
      wasDraggingRef.current = true;
      const id = pendingDragId.current;
      if (id && dropTarget) {
        const isTargetNetwork = dropTarget.startsWith('net:');
        if (isTargetNetwork) {
          // In sub-topology: dropping on center network node = remove from network
          if (activeNetworkId && dropTarget === `net:${activeNetworkId}`) {
            onRemoveFromNetwork(activeNetworkId, id);
          } else {
            onAddToNetwork(dropTarget.slice(4), id);
          }
        } else {
          onCreateNetwork(id, dropTarget);
        }
      }
    }
    dragRef.current = null;
    pendingDragId.current = null;
    setDragId(null);
    setDropTarget(null);
    setDragOffset(null);
  }, [dropTarget, activeNetworkId, onCreateNetwork, onAddToNetwork, onRemoveFromNetwork]);

  // ── Context menu (unified for network + burrow) ──
  const handleContextMenu = useCallback((e: React.MouseEvent, type: 'network' | 'burrow', targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, targetId });
  }, []);

  const handleRenameStart = useCallback(() => {
    if (!contextMenu || contextMenu.type !== 'network') return;
    const net = networks.find((n) => n.id === contextMenu.targetId);
    setRenaming(contextMenu.targetId);
    setRenameValue(net?.name || '');
    setContextMenu(null);
  }, [contextMenu, networks]);

  const handleRenameSubmit = useCallback(() => {
    if (renaming && renameValue.trim()) {
      onRenameNetwork(renaming, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue('');
  }, [renaming, renameValue, onRenameNetwork]);

  const handleDissolve = useCallback(() => {
    if (!contextMenu) return;
    onDissolveNetwork(contextMenu.targetId);
    setContextMenu(null);
  }, [contextMenu, onDissolveNetwork]);

  const handleFavoriteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    onToggleFavorite(contextMenu.targetId);
    setContextMenu(null);
  }, [contextMenu, onToggleFavorite]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); e.stopPropagation(); }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [contextMenu]);

  // ── Filter dropdown helpers ──
  const toggleHeatLayer = useCallback((key: HeatLayerKey) => {
    if (filters.heatMapType === 'aura') {
      // Aura mode: radio-style — toggle off if already selected, otherwise switch to this one
      const next = filters.heatLayers.has(key) ? new Set<HeatLayerKey>() : new Set<HeatLayerKey>([key]);
      onFiltersChange({ ...filters, heatLayers: next });
    } else {
      const next = new Set(filters.heatLayers);
      if (next.has(key)) next.delete(key); else next.add(key);
      onFiltersChange({ ...filters, heatLayers: next });
    }
  }, [filters, onFiltersChange]);

  const toggleShowFavorites = useCallback(() => {
    onFiltersChange({ ...filters, showFavorites: !filters.showFavorites });
  }, [filters, onFiltersChange]);

  // ── Heat map rendering ──
  function getNodeMetrics(nodeId: string): ActivityMetrics {
    if (nodeId.startsWith('net:')) {
      const net = networks.find((n) => n.id === nodeId.slice(4));
      return net ? aggregateNetworkMetrics(net.burrowIds, activity) : EMPTY_METRICS;
    }
    return activity[nodeId] || EMPTY_METRICS;
  }

  function renderHeatVis(nodeId: string, pos: { x: number; y: number }, baseRadius: number) {
    if (filters.heatLayers.size === 0 && !rippleNodes.has(nodeId)) return null;
    const metrics = getNodeMetrics(nodeId);
    const enabledLayers = HEAT_LAYERS.filter((l) => filters.heatLayers.has(l.key));

    // Filter to layers with actual data
    const activeLayers = enabledLayers.filter((l) => {
      const v = metrics[l.key];
      const m = maxMetrics[l.key];
      return m > 0 && v > 0;
    });
    if (activeLayers.length === 0 && !rippleNodes.has(nodeId)) return null;

    const elements: React.ReactNode[] = [];
    const type = filters.heatMapType;

    if (type === 'arcs') {
      // ── Segmented arcs via stroke-dasharray (smoothly transitionable) ──
      const GAP_DEG = 8;
      const segDeg = activeLayers.length > 0 ? (360 - activeLayers.length * GAP_DEG) / activeLayers.length : 360;
      const orbitR = baseRadius + 1.8;
      const circumference = 2 * Math.PI * orbitR;
      activeLayers.forEach((layer, i) => {
        const intensity = metrics[layer.key] / maxMetrics[layer.key];
        // Arc length in SVG units
        const sweepDeg = segDeg * (0.4 + intensity * 0.6);
        const arcLen = (sweepDeg / 360) * circumference;
        const gapLen = circumference - arcLen;
        // Position each arc via dashoffset (SVG circles start at 3 o'clock = 0°)
        const segCenterDeg = i * (segDeg + GAP_DEG) + segDeg / 2 - 90;
        const offsetDeg = -sweepDeg / 2;
        const rotDeg = segCenterDeg + offsetDeg;
        const dashShift = -(rotDeg / 360) * circumference;
        const alpha = 0.15 + intensity * 0.35;
        const strokeW = 0.25 + intensity * 0.35;
        elements.push(
          <circle key={`arc-${nodeId}-${layer.key}`}
            cx={0} cy={0} r={orbitR}
            fill="none" stroke={`rgba(${layer.color}, ${alpha})`}
            strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={`${arcLen} ${gapLen}`}
            strokeDashoffset={dashShift}
            className="topology-heat-arc" />
        );
      });
    } else if (type === 'aura') {
      // ── Soft colored aura — one smooth gradient-like glow per layer ──
      activeLayers.forEach((layer, i) => {
        const intensity = metrics[layer.key] / maxMetrics[layer.key];
        const outerR = baseRadius + 1.5 + intensity * 3 + i * 0.5;
        const innerR = outerR * 0.6;
        // Create gradient-like falloff with 3 concentric fills
        const alphaBase = 0.02 + intensity * 0.06;
        elements.push(
          <circle key={`aura-o-${nodeId}-${layer.key}`}
            cx={0} cy={0} r={outerR}
            fill={`rgba(${layer.color}, ${alphaBase})`}
            stroke="none" className="topology-heat-aura" />,
          <circle key={`aura-m-${nodeId}-${layer.key}`}
            cx={0} cy={0} r={(outerR + innerR) / 2}
            fill={`rgba(${layer.color}, ${alphaBase * 1.5})`}
            stroke="none" className="topology-heat-aura" />,
          <circle key={`aura-i-${nodeId}-${layer.key}`}
            cx={0} cy={0} r={innerR}
            fill={`rgba(${layer.color}, ${alphaBase * 2})`}
            stroke="none" className="topology-heat-aura" />
        );
      });
    }

    // Activity spike ripple
    if (rippleNodes.has(nodeId)) {
      elements.push(
        <circle key={`ripple-${nodeId}`}
          cx={0} cy={0} r={baseRadius}
          fill="none" stroke="rgba(255, 200, 92, 0.7)"
          strokeWidth="0.4" className="topology-ripple" />
      );
    }

    const rotClass = filters.heatRotation ? ' topology-heat-rotating' : '';
    return <g key={`heat-${nodeId}`} transform={`translate(${pos.x},${pos.y})`}
      className="topology-heat-group">
      <g className={rotClass ? rotClass.trim() : undefined}>
        {elements}
      </g>
    </g>;
  }

  // Intercept selection to add zoom transitions for networks
  const handleSelect = useCallback((id: string) => {
    if (id.startsWith('net:') && !activeNetwork) {
      // Zoom into network
      const pos = mainPositions[id];
      if (pos) {
        setZoomOrigin(`${pos.x}% ${pos.y}%`);
        // Compute angle from center to network node, then rotation so that direction becomes "up"
        const angleDeg = Math.atan2(pos.y - CY, pos.x - CX) * (180 / Math.PI);
        // In sub-topology, home is straight up (-90°). Rotate so network's angle aligns with down (90°)
        const twist = -(angleDeg - 90);
        setTwistAngle(twist);
        setViewTransition('zoom-in');
        setTimeout(() => {
          setZoomOrigin('50% 50%');
          onSelect(id);
          setViewTransition(null);
        }, 250);
        return;
      }
    }
    if (id === 'exit-network' && activeNetwork) {
      // Zoom out of network — reverse the zoom-in rotation
      const pos = mainPositions[`net:${activeNetwork.id}`];
      if (pos) {
        const angleDeg = Math.atan2(pos.y - CY, pos.x - CX) * (180 / Math.PI);
        const twist = -(angleDeg - 90);
        setTwistAngle(twist);
        setZoomOrigin('50% 50%');
      }
      setViewTransition('zoom-out');
      setTimeout(() => {
        if (pos) setZoomOrigin(`${pos.x}% ${pos.y}%`);
        onSelect(id);
        setViewTransition(null);
      }, 250);
      return;
    }
    onSelect(id);
  }, [onSelect, activeNetwork, mainPositions]);

  // ── Render helpers ──
  /** Offset a line slightly perpendicular to its direction */
  function offsetLine(x1: number, y1: number, x2: number, y2: number, dist: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = (-dy / len) * dist;
    const py = (dx / len) * dist;
    return { x1: x1 + px, y1: y1 + py, x2: x2 + px, y2: y2 + py };
  }

  /** Deterministic pseudo-random from seed (0-1 range) */
  function seeded(seed: number) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Render multiple individual data-travel lines for one connection arm */
  function renderDataLines(x1: number, y1: number, x2: number, y2: number, armSeed: number) {
    const lines: React.ReactNode[] = [];
    // 2 "to" lines + 2 "from" lines, each at a fixed random offset within the connection
    for (let j = 0; j < 2; j++) {
      const st = seeded(armSeed * 7 + j * 13 + 1);
      const sf = seeded(armSeed * 7 + j * 13 + 5);
      const ot = seeded(armSeed * 7 + j * 13 + 9);
      const of_ = seeded(armSeed * 7 + j * 13 + 11);
      const offsetTo = (ot - 0.5) * 0.24;
      const offsetFrom = (of_ - 0.5) * 0.24;
      const tl = offsetLine(x1, y1, x2, y2, offsetTo);
      const fl = offsetLine(x2, y2, x1, y1, offsetFrom);
      lines.push(
        <line key={`dt-${armSeed}-t${j}`} x1={tl.x1} y1={tl.y1} x2={tl.x2} y2={tl.y2}
          className="topology-data-line data-to"
          style={{ animationDuration: `${3 + st * 3}s`, animationDelay: `${-st * 6}s` }} />,
        <line key={`dt-${armSeed}-f${j}`} x1={fl.x1} y1={fl.y1} x2={fl.x2} y2={fl.y2}
          className="topology-data-line data-from"
          style={{ animationDuration: `${3.5 + sf * 3.5}s`, animationDelay: `${-sf * 7}s` }} />,
      );
    }
    return lines;
  }

  function renderLine(fromX: number, fromY: number, toX: number, toY: number, key: string, cls: string) {
    return <line key={key} x1={fromX} y1={fromY} x2={toX} y2={toY} className={`topology-line ${cls}`} />;
  }

  function renderNode(
    id: string, label: string, pos: { x: number; y: number },
    cls: string, isActive: boolean, title: string, draggable: boolean,
    onContext?: (e: React.MouseEvent) => void,
    staggerIndex?: number,
  ) {
    const isDragging = dragId === id && dragRef.current?.moved;
    const isTarget = dropTarget === id;
    const isFav = effectiveFavorites.has(id);
    const effectivePos = getEffectivePos(id, pos);
    return (
      <button
        key={id}
        data-node-id={id}
        className={`topology-node ${cls}${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${isTarget ? ' drop-target' : ''}${isFav ? ' favorite' : ''}`}
        style={{ left: `${effectivePos.x}%`, top: `${effectivePos.y}%`, animationDelay: staggerIndex != null ? `${staggerIndex * 60}ms` : undefined }}
        onClick={(e) => {
          e.stopPropagation();
          if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            return;
          }
          if (!dragRef.current?.moved) handleSelect(id);
        }}
        onPointerDown={draggable ? (e) => handlePointerDown(e, id) : undefined}
        onPointerMove={draggable ? handlePointerMove : undefined}
        onPointerUp={draggable ? handlePointerUp : undefined}
        onContextMenu={onContext}
        title={title}
      >
        <span className="topology-node-label">{label}</span>
        {cls === 'home' && <span className="topology-node-ring" />}
        {cls === 'burrow' && unreadServerIds?.has(id) && <span className="topo-unread-dot" />}
      </button>
    );
  }

  // ── Filter dropdown ──
  const HEAT_MAP_TYPES: { value: HeatMapType; label: string }[] = [
    { value: 'arcs', label: 'Arcs' },
    { value: 'aura', label: 'Aura' },
  ];

  function renderFilterDropdown() {
    return (
      <div className="topology-filter-btn-wrap">
        <button
          className="topology-filter-btn"
          onClick={(e) => { e.stopPropagation(); setFilterOpen(!filterOpen); }}
          title="Topology filters"
        >
          <span className="filter-icon">
            <span /><span /><span />
          </span>
        </button>
        {filterOpen && (
          <div className="topology-filter-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="topology-filter-section">
              <span className="topology-filter-heading">Display</span>
              <label className="topology-filter-item">
                <input type="checkbox" checked={filters.showFavorites} onChange={toggleShowFavorites} />
                <span className="topology-filter-swatch" style={{ background: 'var(--amber)' }} />
                Favorites
              </label>
              <label className="topology-filter-item">
                <input type="checkbox" checked={filters.showDataLines} onChange={() => onFiltersChange({ ...filters, showDataLines: !filters.showDataLines })} />
                <span className="topology-filter-swatch" style={{ background: 'var(--teal)' }} />
                Data Flow
              </label>
            </div>
            <div className="topology-filter-divider" />
            <div className="topology-filter-section">
              <span className="topology-filter-heading">Activity Layers</span>
              {HEAT_LAYERS.map((layer) => (
                <label key={layer.key} className="topology-filter-item">
                  <input
                    type={filters.heatMapType === 'aura' ? 'radio' : 'checkbox'}
                    name={filters.heatMapType === 'aura' ? 'aura-layer' : undefined}
                    checked={filters.heatLayers.has(layer.key)}
                    onChange={() => toggleHeatLayer(layer.key)}
                  />
                  <span className="topology-filter-swatch" style={{ background: `rgb(${layer.color})` }} />
                  {layer.label}
                </label>
              ))}
            </div>
            {filters.heatLayers.size > 0 && (<>
              <div className="topology-filter-divider" />
              <div className="topology-filter-section">
                <span className="topology-filter-heading">Heat Map Style</span>
                <select
                  className="topology-filter-select"
                  value={filters.heatMapType}
                  onChange={(e) => {
                    const next = e.target.value as HeatMapType;
                    // Switching to aura with multiple layers → keep only the first
                    let layers = filters.heatLayers;
                    if (next === 'aura' && layers.size > 1) {
                      layers = new Set<HeatLayerKey>([layers.values().next().value!]);
                    }
                    onFiltersChange({ ...filters, heatMapType: next, heatLayers: layers });
                  }}
                >
                  {HEAT_MAP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <label className="topology-filter-item" style={{ marginTop: '4px' }}>
                  <input type="checkbox" checked={filters.heatRotation} onChange={() => onFiltersChange({ ...filters, heatRotation: !filters.heatRotation })} />
                  Rotation
                </label>
              </div>
            </>)}
          </div>
        )}
      </div>
    );
  }

  const topologyClick = useCallback(() => {
    if (contextMenu) { setContextMenu(null); return; }
    if (filterOpen) { setFilterOpen(false); return; }
    if (addMode !== 'closed') { setAddMode('closed'); setCreateName(''); setJoinCode(''); setJoinError(''); return; }
    if (activeNetwork) { handleSelect('exit-network'); return; }
    onSelect('');
  }, [contextMenu, filterOpen, addMode, activeNetwork, handleSelect, onSelect]);


  // Compute transition class for the topology container
  const transitionClass = viewTransition === 'zoom-in' ? ' topo-zoom-in'
    : viewTransition === 'zoom-out' ? ' topo-zoom-out'
    : viewEnter === 'enter-sub' ? ' topo-enter-sub'
    : viewEnter === 'enter-main' ? ' topo-enter-main'
    : '';

  // ════════════════════════════════════════════
  // SUB-TOPOLOGY VIEW
  // ════════════════════════════════════════════
  if (activeNetwork) {
    return (
      <div className="topology-wrap topo-loaded" onClick={topologyClick}>
        {renderFilterDropdown()}
        <div className={`topology sub-topology${transitionClass}`} ref={containerRef} style={{ transformOrigin: zoomOrigin, '--twist': `${twistAngle}deg` } as React.CSSProperties}>
        <svg className="topology-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Heat vis (below connections, children only) */}
          {subBurrows.map((b) => {
            const pos = subPositions[b.id];
            if (!pos) return null;
            const ePos = getEffectivePos(b.id, pos);
            return renderHeatVis(b.id, ePos, 3.5);
          })}
          {/* Connection lines (above heat rings) */}
          {subBurrows.map((b, i) => {
            const to = subPositions[b.id];
            if (!to) return null;
            const effectiveTo = getEffectivePos(b.id, to);
            const centerPos = getEffectivePos(`net:${activeNetwork.id}`, { x: CX, y: CY });
            return (
              <g key={b.id}>
                {renderLine(centerPos.x, centerPos.y, effectiveTo.x, effectiveTo.y, `line-${b.id}`, activeId === b.id ? 'active' : '')}
                {filters.showDataLines && renderDataLines(centerPos.x, centerPos.y, effectiveTo.x, effectiveTo.y, i + 100)}
              </g>
            );
          })}
        </svg>

        {renderNode(`net:${activeNetwork.id}`, twoLetterLabel(activeNetwork.name),
          { x: CX, y: CY }, 'network center', true, activeNetwork.name, true,
          (e) => handleContextMenu(e, 'network', activeNetwork.id), 0)}

        {subBurrows.map((b, i) => {
          const pos = subPositions[b.id];
          if (!pos) return null;
          return renderNode(b.id, b.name.slice(0, 3).toUpperCase(), pos,
            'burrow', activeId === b.id, b.name, true,
            undefined, i + 1);
        })}

        {/* Rename form for network center */}
        {renaming === activeNetwork.id && (
          <form
            className="topology-rename"
            style={{ left: `${CX}%`, top: `${CY + 5}%` }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(); }}
          >
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => { if (e.key === 'Escape') { setRenaming(null); } }}
            />
          </form>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className="topology-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'network' ? (
              <>
                <button onClick={handleRenameStart}>Rename Network</button>
                <button onClick={() => {
                  handleDissolve();
                  onExitNetwork();
                }} className="danger">Dissolve Network</button>
              </>
            ) : (
              <button onClick={handleFavoriteFromMenu}>
                {favorites.has(contextMenu.targetId) ? '★ Unfavorite' : '☆ Favorite'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="topology-hints">
        <span>Click a node to enter</span>
        <span>Drag a burrow onto the center to remove it</span>
        <span>Click the background to go back</span>
        <span>Right-click for options</span>
      </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // MAIN TOPOLOGY VIEW
  // ════════════════════════════════════════════
  const totalNodes = mainOrbitIds.length;

  return (
    <div className={`topology-wrap${!loading ? ' topo-loaded' : ''}`} onClick={topologyClick}>
      {loading && (
        <div className="topology-loading">
          <div className="topology-spinner" />
        </div>
      )}
      {renderFilterDropdown()}
      <div className={`topology${transitionClass}${!loading ? ' topo-loaded' : ''}`} ref={containerRef} style={{ transformOrigin: zoomOrigin, '--twist': `${twistAngle}deg` } as React.CSSProperties}>
      <svg className="topology-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Heat rings (above grid, below all connections) */}
        {mainOrbitIds.map((id) => {
          const pos = mainPositions[id];
          if (!pos) return null;
          const effectivePos = getEffectivePos(id, pos);
          const isNet = id.startsWith('net:');
          return renderHeatVis(id, effectivePos, isNet ? 3 : 3.5);
        })}
        {/* Network parent → tiny sub-nodes (above heat rings) */}
        {networks.map((n) => {
          const parentPos = mainPositions[`net:${n.id}`];
          const subs = networkSubPositions[n.id];
          if (!parentPos || !subs) return null;
          return n.burrowIds.map((bId) => {
            const to = subs[bId];
            if (!to) return null;
            return renderLine(parentPos.x, parentPos.y, to.x, to.y, `sub-${n.id}-${bId}`, 'dim');
          });
        })}
        {/* Home → top-level items (lines follow dragged nodes) */}
        {mainOrbitIds.map((id, i) => {
          const to = mainPositions[id];
          if (!to) return null;
          const effectiveTo = getEffectivePos(id, to);
          return (
            <g key={`line-group-${id}`}>
              {renderLine(CX, CY, effectiveTo.x, effectiveTo.y, `line-${id}`, activeId === id ? 'active' : '')}
              {filters.showDataLines && renderDataLines(CX, CY, effectiveTo.x, effectiveTo.y, i + 200)}
            </g>
          );
        })}
      </svg>

      {/* Home node */}
      {renderNode('home', username.charAt(0).toUpperCase(),
        { x: CX, y: CY }, 'home', activeId === 'home', 'Home', false,
        undefined, 0)}

      {/* Social / Friends node — anchored below home */}
      <button
        data-node-id="social"
        className={`topology-node social${activeId === 'social' ? ' active' : ''}`}
        style={{ left: `${CX}%`, top: `${CY + 12}%`, animationDelay: '60ms' }}
        onClick={(e) => { e.stopPropagation(); handleSelect('social'); }}
        title="Friends & DMs"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        {hasUnreadDMs && <span className="topo-unread-dot" />}
      </button>

      {/* Top-level burrows */}
      {topLevelBurrows.map((b, i) => {
        const pos = mainPositions[b.id];
        if (!pos) return null;
        return renderNode(b.id, b.name.slice(0, 3).toUpperCase(), pos,
          'burrow', activeId === b.id, b.name, true,
          (e) => handleContextMenu(e, 'burrow', b.id), i + 1);
      })}

      {/* Network parent nodes + their tiny sub-nodes */}
      {networks.map((n, ni) => {
        const pos = mainPositions[`net:${n.id}`];
        if (!pos) return null;
        const subs = networkSubPositions[n.id] || {};
        const stagger = topLevelBurrows.length + ni + 1;
        return (
          <div key={`net-group-${n.id}`}>
            {n.burrowIds.map((bId) => {
              const subPos = subs[bId];
              const b = burrows.find((bb) => bb.id === bId);
              if (!subPos || !b) return null;
              return (
                <div
                  key={`sub-${bId}`}
                  className="topology-sub-node"
                  style={{ left: `${subPos.x}%`, top: `${subPos.y}%`, animationDelay: `${(stagger + 1) * 60}ms` }}
                  title={b.name}
                >
                  {b.name.charAt(0).toUpperCase()}
                </div>
              );
            })}
            {renderNode(`net:${n.id}`, twoLetterLabel(n.name), pos,
              'network', activeId === `net:${n.id}`, n.name, false,
              (e) => handleContextMenu(e, 'network', n.id), stagger)}
            {renaming === n.id && (
              <form
                className="topology-rename"
                style={{ left: `${pos.x}%`, top: `${pos.y + 5}%` }}
                onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(); }}
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setRenaming(null); } }}
                />
              </form>
            )}
          </div>
        );
      })}

      {/* Add / Create / Join nodes */}
      {totalNodes < 10 && (
        <div className="topology-add-group" style={{ left: `${CX}%`, top: `${CY + RADIUS + 12}%` }} onClick={(e) => e.stopPropagation()}>
          {/* Backdrop pill */}
          <div className={`topology-add-backdrop${addMode !== 'closed' ? ' visible' : ''}`} />
          {/* Create node — slides left */}
          <button
            className={`topology-node add add-create${addMode === 'choose' ? ' visible' : ''}`}
            onClick={() => setAddMode('create')}
            title="Create Burrow"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="topology-add-label">Create</span>
          </button>
          {/* Join node — slides right */}
          <button
            className={`topology-node add add-join${addMode === 'choose' ? ' visible' : ''}`}
            onClick={() => setAddMode('join')}
            title="Join Burrow"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="topology-add-label">Join</span>
          </button>
          {/* Center +/X toggle */}
          <button
            className={`topology-node add add-toggle${addMode !== 'closed' ? ' open' : ''}`}
            onClick={() => {
              if (addMode === 'closed') {
                setAddMode('choose');
              } else {
                setAddMode('closed');
                setCreateName('');
                setJoinCode('');
                setJoinError('');
              }
            }}
            title={addMode === 'closed' ? 'Add Burrow' : 'Cancel'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {addMode === 'create' && (
        <div className="topology-add-card" style={{ left: `${CX}%`, top: `${CY + RADIUS + 8}%` }} onClick={(e) => e.stopPropagation()}>
          <h4 className="topology-add-card-title">Create Burrow</h4>
          <form
            className="topology-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (createName.trim()) {
                onCreateBurrow(createName.trim());
                setCreateName('');
                setAddMode('closed');
              }
            }}
          >
            <input
              autoFocus
              placeholder="Burrow name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAddMode('closed'); setCreateName(''); } }}
            />
            <div className="topology-add-card-actions">
              <button type="submit" className="btn-sm">Create</button>
              <button type="button" className="btn-sm btn-ghost" onClick={() => { setAddMode('closed'); setCreateName(''); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {addMode === 'join' && (
        <div className="topology-add-card" style={{ left: `${CX}%`, top: `${CY + RADIUS + 8}%` }} onClick={(e) => e.stopPropagation()}>
          <h4 className="topology-add-card-title">Join Burrow</h4>
          <form
            className="topology-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!joinCode.trim()) return;
              setJoinError('');
              try {
                await onJoinServer(joinCode.trim());
                setJoinCode('');
                setAddMode('closed');
              } catch (err: any) {
                setJoinError(err?.message || 'Invalid invite code');
              }
            }}
          >
            <input
              autoFocus
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAddMode('closed'); setJoinCode(''); setJoinError(''); } }}
            />
            {joinError && <span className="topology-add-error">{joinError}</span>}
            <div className="topology-add-card-actions">
              <button type="submit" className="btn-sm">Join</button>
              <button type="button" className="btn-sm btn-ghost" onClick={() => { setAddMode('closed'); setJoinCode(''); setJoinError(''); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="topology-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'network' ? (
            <>
              <button onClick={handleRenameStart}>Rename Network</button>
              <button onClick={handleDissolve} className="danger">Dissolve Network</button>
            </>
          ) : (
            <>
              <button onClick={handleFavoriteFromMenu}>
                {favorites.has(contextMenu.targetId) ? '★ Unfavorite' : '☆ Favorite'}
              </button>
              {unreadServerIds?.has(contextMenu.targetId) && onMarkServerRead && (
                <button onClick={() => { onMarkServerRead(contextMenu.targetId); setContextMenu(null); }}>
                  Mark as Read
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>

      {!activeNetwork && (
        <div
          className={`topology-stats-wrap${statsEntered ? (statsCardOpen ? ' open' : ' closed') : ''}${!loading && !statsEntered ? ' entering' : ''}`}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={() => setStatsEntered(true)}
        >
          <button className="topology-stats-tab" onClick={() => setStatsCardOpen(!statsCardOpen)} title={statsCardOpen ? 'Hide stats' : 'Show stats'}>
            <span className="topology-stats-tab-icon">{statsCardOpen ? '‹' : '›'}</span>
          </button>
          <div className="topology-stats-card">
            <div className="topology-stats-header">
              <span className="topology-stats-logo">⬡</span>
              <h3 className="topology-stats-title">Burrow</h3>
            </div>
            <div className="topology-stats-divider" />
            <div className="topology-stats-grid">
              <div className="topology-stat">
                <span className="topology-stat-value">{platformStats ? formatCount(platformStats.users) : '—'}</span>
                <span className="topology-stat-label">Users</span>
              </div>
              <div className="topology-stat">
                <span className="topology-stat-value">{platformStats ? formatCount(platformStats.servers) : '—'}</span>
                <span className="topology-stat-label">Servers</span>
              </div>
              <div className="topology-stat">
                <span className="topology-stat-value">{platformStats ? formatCount(platformStats.messages) : '—'}</span>
                <span className="topology-stat-label">Messages</span>
              </div>
              <div className="topology-stat">
                <span className="topology-stat-value">{platformStats ? formatCount(platformStats.members) : '—'}</span>
                <span className="topology-stat-label">Members</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!activeNetwork && (
        <div className="topology-hints">
          <span>Click a node to enter</span>
          <span>Drag a burrow onto another to create a network</span>
          <span>Drag a burrow onto a network to add it</span>
          <span>Right-click for options</span>
        </div>
      )}
    </div>
  );
}
