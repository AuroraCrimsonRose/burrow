import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Easing } from 'react-native';
import { RA_GLYPHS } from './raGlyphs';
import { colors } from '../theme/colors';

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
  common: '#a3a3a3',
  uncommon: '#7ed1a3',
  rare: '#4dc7d2',
  epic: '#9c7dd8',
  legendary: '#ffc85c',
  mythic: '#ff6ec7',
  artifact: '#ff3b3b',
  vanity: '#c47a3a',
};

const FOIL_INTENSITY: Record<string, number> = {
  common: 0, uncommon: 0, rare: 0.15, epic: 0.35,
  legendary: 0.6, mythic: 0.85, artifact: 1, vanity: 0,
};

/** Resolve an RPG Awesome icon name (e.g. 'ra-groundbreaker') to its Unicode character. */
function resolveGlyph(icon: string): string {
  const cp = RA_GLYPHS[icon];
  if (cp) return String.fromCodePoint(cp);
  // Fallback: ra-shield
  return String.fromCodePoint(RA_GLYPHS['ra-shield'] || 0xe9d2);
}

/*
 * Web clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)
 * This is a pointy-top hexagon. Sizes match web exactly.
 */
interface SizeConfig { w: number; h: number; iconSize: number; borderW: number; }
const SIZES: Record<string, SizeConfig> = {
  sm: { w: 22, h: 24, iconSize: 10, borderW: 1.5 },
  md: { w: 32, h: 36, iconSize: 14, borderW: 2 },
  lg: { w: 44, h: 48, iconSize: 20, borderW: 2.5 },
};

/**
 * Render a hexagon matching the web's exact polygon proportions without SVG.
 */
function HexShape({ w, h, color, opacity = 1 }: { w: number; h: number; color: string; opacity?: number }) {
  /*
   * 3 overlapping rounded-rect "slabs" whose intersection forms the hex,
   * with proportions matching the web's pointy-top clip-path polygon.
   * Slab width = 86% of hex width (the 7%-93% span), height = 50% of hex height.
   */
  const slabW = w * 0.86;
  const slabH = h * 0.50;

  return (
    <View style={[StyleSheet.absoluteFill, styles.hexCenter]}>
      {[0, 60, -60].map(angle => (
        <View
          key={angle}
          style={[
            styles.hexSlab,
            {
              width: slabW,
              height: slabH,
              backgroundColor: color,
              opacity,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

interface HexBadgeProps {
  badge: BadgeData;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

/**
 * Hexagonal badge matching the web's clip-path polygon.
 * 3 overlapping rectangles at 0°/60°/-60° whose intersection forms a
 * pointy-top hex with the same proportions as the web's CSS clip-path.
 *
 * Foil shimmer: a diagonal white band sweeps across the badge (like the
 * web's background-position animation on a 135° gradient).
 */
export function HexBadge({ badge, size = 'md', showTooltip = true }: HexBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const rarityColor = badge.color || RARITY_COLORS[badge.rarity] || '#a3a3a3';
  const foil = FOIL_INTENSITY[badge.rarity] ?? 0;
  const sz = SIZES[size];

  // Diagonal sweep shimmer — animate a band from bottom-left to top-right
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (foil > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 3000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 3000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [foil]);

  const renderHex = (w: number, h: number, iconSz: number, bw: number) => {
    const tintOpacity = foil > 0 ? 0.25 : 0.15;
    const innerW = w - bw * 2;
    const innerH = h - bw * 2;

    // Shimmer band travel distance — diagonal of the badge
    const diag = Math.sqrt(w * w + h * h);

    // Animated translateX for the diagonal sweep band
    const shimmerTranslateX = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-diag, diag],
    });

    return (
      <View style={[styles.hexContainer, { width: w, height: h }]}>
        {/* Outer hex (rarity tint border) */}
        <HexShape w={w} h={h} color={rarityColor} opacity={tintOpacity} />

        {/* Inner hex (dark fill) */}
        <View style={[StyleSheet.absoluteFill, styles.hexCenter]}>
          <View style={{ width: innerW, height: innerH }}>
            <HexShape w={innerW} h={innerH} color={colors.bgTertiary} />
          </View>
        </View>

        {/* Foil shimmer — diagonal band clipped to hex via 3 overlapping slabs.
             Each slab has overflow:'hidden' and contains the same animated band,
             so the band is only visible in the intersection of all 3 = the hex. */}
        {foil > 0 && (
          <View style={[StyleSheet.absoluteFill, styles.hexCenter]} pointerEvents="none">
            {[0, 60, -60].map((angle, i) => (
              <View
                key={`foil-${angle}`}
                style={[
                  styles.hexSlab,
                  {
                    width: innerW * 0.86,
                    height: innerH * 0.50,
                    backgroundColor: 'transparent',
                    overflow: 'hidden',
                    transform: [{ rotate: `${angle}deg` }],
                    // Stack all 3 slabs on top of each other
                    zIndex: i,
                  },
                ]}
              >
                {/* Counter-rotate the band so it stays diagonal (135°) regardless of slab rotation */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: -h * 1.5,
                    left: -w * 1.5,
                    width: w * 4,
                    height: h * 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: `${-angle}deg` }],
                  }}
                >
                  <Animated.View
                    style={{
                      width: Math.max(w * 0.4, 6),
                      height: h * 4,
                      backgroundColor: rarityColor,
                      opacity: 0.12 * foil,
                      transform: [
                        { rotate: '135deg' },
                        { translateX: shimmerTranslateX },
                      ],
                    }}
                  />
                </Animated.View>
              </View>
            ))}
          </View>
        )}

        {/* Icon — real RPG Awesome font glyph */}
        <Text
          style={[
            styles.hexIcon,
            {
              fontFamily: 'RPGAwesome',
              fontSize: iconSz,
              color: rarityColor,
            },
          ]}
        >
          {resolveGlyph(badge.icon)}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Pressable onPress={showTooltip ? () => setTooltipVisible(true) : undefined}>
        {renderHex(sz.w, sz.h, sz.iconSize, sz.borderW)}
      </Pressable>

      {/* Tooltip modal */}
      {showTooltip && (
        <Modal visible={tooltipVisible} transparent animationType="fade" statusBarTranslucent>
          <Pressable style={styles.tooltipOverlay} onPress={() => setTooltipVisible(false)}>
            <Pressable style={styles.tooltipCard} onPress={() => {}}>
              <View style={{ alignSelf: 'center', marginBottom: 10 }}>
                {renderHex(SIZES.lg.w, SIZES.lg.h, SIZES.lg.iconSize, SIZES.lg.borderW)}
              </View>
              <Text style={styles.tooltipName}>{badge.name}</Text>
              {badge.granted_at && (
                <Text style={styles.tooltipDate}>
                  Issued: {new Date(badge.granted_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </Text>
              )}
              <Text style={[styles.tooltipRarity, { color: rarityColor }]}>
                {badge.rarity.toUpperCase()}
              </Text>
              {badge.description ? (
                <Text style={styles.tooltipDesc}>{badge.description}</Text>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

/** Row of badges with max limit + overflow indicator (matches web BadgeRow). */
export function BadgeRow({ badges, max = 3 }: { badges: BadgeData[]; max?: number }) {
  const visible = badges.slice(0, max);
  const overflow = badges.length - max;
  return (
    <View style={styles.badgeRow}>
      {visible.map(b => <HexBadge key={b.id} badge={b} />)}
      {overflow > 0 && (
        <View style={styles.overflowChip}>
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hexContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexSlab: {
    position: 'absolute',
    borderRadius: 2,
  },
  hexIcon: {
    zIndex: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  overflowChip: {
    backgroundColor: colors.bgTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overflowText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  // Tooltip
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipCard: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: 220,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tooltipName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  tooltipDate: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  tooltipRarity: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  tooltipDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
});
