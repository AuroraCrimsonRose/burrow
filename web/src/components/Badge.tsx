import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface BadgeData {
  id: number;
  name: string;
  icon: string;
  description?: string;
  rarity: string;
  color?: string;
  granted_at?: string;
}

const RARITY_COLORS: Record<string, string> = {
  common:    '#a3a3a3',
  uncommon:  '#7ed1a3',
  rare:      '#4dc7d2',
  epic:      '#9c7dd8',
  legendary: '#ffc85c',
  mythic:    '#ff6ec7',
  artifact:  '#ff3b3b',
  vanity:    '#c47a3a',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic',
  legendary: 'Legendary', mythic: 'Mythic', artifact: 'Artifact', vanity: 'Vanity',
};

// Foil intensity by rarity (0 = matte, 1 = full foil shimmer)
const FOIL_INTENSITY: Record<string, number> = {
  common: 0, uncommon: 0, rare: 0.15, epic: 0.35,
  legendary: 0.6, mythic: 0.85, artifact: 1, vanity: 0,
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Badge({ badge, size = 'md' }: { badge: BadgeData; size?: 'sm' | 'md' | 'lg' }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);

  const rarityColor = badge.color || RARITY_COLORS[badge.rarity] || RARITY_COLORS.common;
  const foil = FOIL_INTENSITY[badge.rarity] || 0;

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const above = rect.top > 120;
      const left = rect.left + rect.width / 2;
      setTooltipStyle(above
        ? { bottom: window.innerHeight - rect.top + 8, left, transform: 'translateX(-50%)' }
        : { top: rect.bottom + 8, left, transform: 'translateX(-50%)' }
      );
    }
  }, []);

  const sizeClass = `badge-hex badge-hex-${size}`;
  const foilClass = foil > 0 ? ' badge-foil' : '';

  return (
    <div
      ref={ref}
      className={`badge-container${hovered ? ' badge-hovered' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`${sizeClass}${foilClass}`}
        style={{
          '--badge-color': rarityColor,
          '--foil-intensity': foil,
        } as React.CSSProperties}
      >
        <i className={`ra ${badge.icon}`} />
      </div>

      {hovered && createPortal(
        <div className="badge-tooltip" style={tooltipStyle}>
          <div className="badge-tooltip-name">{badge.name}</div>
          {badge.granted_at && (
            <div className="badge-tooltip-date">Issued: {formatDate(badge.granted_at)}</div>
          )}
          <div className="badge-tooltip-rarity" style={{ color: rarityColor }}>
            {RARITY_LABELS[badge.rarity] || badge.rarity}
          </div>
          {badge.description && (
            <div className="badge-tooltip-desc">{badge.description}</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function BadgeRow({ badges, max = 3, onOverflowClick }: {
  badges: BadgeData[];
  max?: number;
  onOverflowClick?: () => void;
}) {
  const visible = badges.slice(0, max);
  const overflow = badges.length - max;

  return (
    <div className="badge-row">
      {visible.map(b => <Badge key={b.id} badge={b} />)}
      {overflow > 0 && (
        <button className="badge-overflow" onClick={onOverflowClick}>
          +{overflow}
        </button>
      )}
    </div>
  );
}

/** Compact single badge for member lists — just the hex icon, small size */
export function BadgeCompact({ badge }: { badge: BadgeData }) {
  return <Badge badge={badge} size="sm" />;
}
