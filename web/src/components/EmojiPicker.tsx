import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  EMOJI_CATEGORIES,
  ALL_EMOJIS,
  getRecentEmojis,
  addRecentEmoji,
  getFavoriteEmojis,
  toggleFavoriteEmoji,
  isFavoriteEmoji,
  getNotoUrl,
  getNotoAnimatedUrl,
  type EmojiEntry,
} from '../emoji';

// ── In-memory image cache ──
// Survives across picker open/close; images are blob-URL'd so the browser
// doesn't re-fetch from gstatic on every mount.
const imgCache = new Map<string, string>();
let cacheWarmed = false;

function getCachedUrl(url: string): string {
  return imgCache.get(url) || url;
}

function warmCache() {
  if (cacheWarmed) return;
  cacheWarmed = true;
  // Warm in small batches so we don't flood the network
  const urls = ALL_EMOJIS.map((e) => getNotoUrl(e));
  let i = 0;
  const BATCH = 20;
  function nextBatch() {
    const batch = urls.slice(i, i + BATCH);
    if (batch.length === 0) return;
    i += BATCH;
    batch.forEach((url) => {
      if (imgCache.has(url)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          c.toBlob((blob) => {
            if (blob) imgCache.set(url, URL.createObjectURL(blob));
          });
        } catch { /* cross-origin fallback — just keep the network URL */ }
      };
      img.src = url;
    });
    requestAnimationFrame(nextBatch);
  }
  requestAnimationFrame(nextBatch);
}

// ── Lazy section — only renders emojis when scrolled into view ──
function LazySection({
  id, label, emojis, onSelect, onContextMenu, renderEmoji, sectionRef,
}: {
  id: string;
  label: string;
  emojis: EmojiEntry[];
  onSelect: (entry: EmojiEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: EmojiEntry) => void;
  renderEmoji: (entry: EmojiEntry) => React.ReactNode;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '200px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="emoji-picker-section"
      ref={(el) => { (elRef as React.MutableRefObject<HTMLDivElement | null>).current = el; sectionRef?.(el); }}
      data-section={id}
    >
      <div className="emoji-picker-section-label">{label}</div>
      <div className="emoji-picker-emojis" style={visible ? undefined : { minHeight: Math.ceil(emojis.length / 9) * 36 }}>
        {visible && emojis.map((entry) => (
          <button
            key={entry.cp}
            className="emoji-picker-btn"
            onClick={() => onSelect(entry)}
            onContextMenu={(ev) => onContextMenu(ev, entry)}
            title={entry.name}
          >
            {renderEmoji(entry)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Size preference ──
const SIZE_KEY = 'emoji_picker_size';
type PickerSize = 'compact' | 'normal' | 'large';
const SIZES: PickerSize[] = ['compact', 'normal', 'large'];

function getStoredSize(): PickerSize {
  const v = localStorage.getItem(SIZE_KEY);
  if (v === 'compact' || v === 'normal' || v === 'large') return v;
  return 'normal';
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  animatedEmojis: boolean;
}

export default function EmojiPicker({ onSelect, onClose, animatedEmojis }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('faces');
  const [pickerSize, setPickerSize] = useState<PickerSize>(getStoredSize);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: EmojiEntry } | null>(null);
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Start warming image cache on first mount
  useEffect(() => { warmCache(); }, []);

  // Close on outside click (delayed by a frame so the opening click doesn't close it)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const rafId = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClick);
    });
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const favoriteEmojis = useMemo(() => {
    void favoritesVersion; // re-derive when toggled
    const favs = getFavoriteEmojis();
    return favs
      .map((ch) => ALL_EMOJIS.find((e) => e.emoji === ch))
      .filter((e): e is EmojiEntry => !!e);
  }, [favoritesVersion]);

  const recentEmojis = useMemo(() => {
    const recent = getRecentEmojis();
    return recent
      .map((ch) => ALL_EMOJIS.find((e) => e.emoji === ch))
      .filter((e): e is EmojiEntry => !!e);
  }, []);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matches = ALL_EMOJIS.filter((e) => e.name.toLowerCase().includes(q) || e.emoji.includes(q));
    return matches;
  }, [search]);

  const handleSelect = useCallback((entry: EmojiEntry) => {
    addRecentEmoji(entry.emoji);
    onSelect(entry.emoji);
  }, [onSelect]);

  function scrollToCategory(catId: string) {
    setActiveCategory(catId);
    const el = sectionRefs.current.get(catId);
    if (el && gridRef.current) {
      gridRef.current.scrollTo({ top: el.offsetTop - gridRef.current.offsetTop, behavior: 'smooth' });
    }
  }

  function cycleSize() {
    const idx = SIZES.indexOf(pickerSize);
    const next = SIZES[(idx + 1) % SIZES.length];
    setPickerSize(next);
    localStorage.setItem(SIZE_KEY, next);
  }

  function handleContextMenu(e: React.MouseEvent, entry: EmojiEntry) {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, entry });
  }

  function handleToggleFavorite() {
    if (!contextMenu) return;
    toggleFavoriteEmoji(contextMenu.entry.emoji);
    setFavoritesVersion((v) => v + 1);
    setContextMenu(null);
  }

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    function dismiss() { setContextMenu(null); }
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [contextMenu]);

  const renderEmoji = useCallback((entry: EmojiEntry) => {
    if (animatedEmojis && entry.animated) {
      return (
        <span className="emoji-hover-animate">
          <img
            src={getCachedUrl(getNotoUrl(entry))}
            alt={entry.name}
            className="emoji-img emoji-static"
            loading="lazy"
          />
          <img
            src={getCachedUrl(getNotoAnimatedUrl(entry))}
            alt={entry.name}
            className="emoji-img emoji-animated"
            loading="lazy"
          />
        </span>
      );
    }
    return (
      <img
        src={getCachedUrl(getNotoUrl(entry))}
        alt={entry.name}
        className="emoji-img"
        loading="lazy"
      />
    );
  }, [animatedEmojis]);

  const sizeIcon = pickerSize === 'compact' ? '⊕' : pickerSize === 'normal' ? '⊖' : '⊙';
  const sizeTitle = pickerSize === 'compact' ? 'Enlarge' : pickerSize === 'normal' ? 'Shrink' : 'Normal';

  return (
    <div className={`emoji-picker emoji-picker-${pickerSize}`} ref={panelRef} onClick={(e) => e.stopPropagation()}>
      {/* Header: Search + resize */}
      <div className="emoji-picker-header">
        <div className="emoji-picker-search">
          <svg className="emoji-picker-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="emoji-picker-search-input"
            placeholder="Search emoji…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <button className="emoji-picker-resize" onClick={cycleSize} title={sizeTitle}>
          {sizeIcon}
        </button>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="emoji-picker-tabs">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`emoji-picker-tab${activeCategory === cat.id ? ' active' : ''}`}
              onClick={() => scrollToCategory(cat.id)}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="emoji-picker-grid" ref={gridRef}>
        {filteredCategories ? (
          filteredCategories.length > 0 ? (
            <div className="emoji-picker-section">
              <div className="emoji-picker-section-label">Results</div>
              <div className="emoji-picker-emojis">
                {filteredCategories.map((entry) => (
                  <button
                    key={entry.cp}
                    className="emoji-picker-btn"
                    onClick={() => handleSelect(entry)}
                    onContextMenu={(ev) => handleContextMenu(ev, entry)}
                    title={entry.name}
                  >
                    {renderEmoji(entry)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="emoji-picker-empty">No emoji found</div>
          )
        ) : (
          <>
            {favoriteEmojis.length > 0 && (
              <div className="emoji-picker-section">
                <div className="emoji-picker-section-label">⭐ Favorites</div>
                <div className="emoji-picker-emojis">
                  {favoriteEmojis.map((entry) => (
                    <button
                      key={`fav-${entry.cp}`}
                      className="emoji-picker-btn"
                      onClick={() => handleSelect(entry)}
                      onContextMenu={(ev) => handleContextMenu(ev, entry)}
                      title={entry.name}
                    >
                      {renderEmoji(entry)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recentEmojis.length > 0 && (
              <div className="emoji-picker-section">
                <div className="emoji-picker-section-label">Recent</div>
                <div className="emoji-picker-emojis">
                  {recentEmojis.map((entry) => (
                    <button
                      key={`recent-${entry.cp}`}
                      className="emoji-picker-btn"
                      onClick={() => handleSelect(entry)}
                      onContextMenu={(ev) => handleContextMenu(ev, entry)}
                      title={entry.name}
                    >
                      {renderEmoji(entry)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <LazySection
                key={cat.id}
                id={cat.id}
                label={cat.label}
                emojis={cat.emojis}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
                renderEmoji={renderEmoji}
                sectionRef={(el) => { if (el) sectionRefs.current.set(cat.id, el); }}
              />
            ))}
          </>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="emoji-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="emoji-context-item" onClick={handleToggleFavorite}>
            {isFavoriteEmoji(contextMenu.entry.emoji) ? '★ Unfavorite' : '☆ Favorite'}
          </button>
        </div>
      )}
    </div>
  );
}
