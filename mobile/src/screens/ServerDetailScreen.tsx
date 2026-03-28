import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ServerStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { getCategories, getChannels } from '../api/client';

interface Channel {
  id: string;
  name: string;
  type: string;
  category_id: string | null;
  position: number | null;
}

interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

interface Section {
  title: string;
  data: Channel[];
}

const CHANNEL_ICON_NAMES: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'chatbubble-outline',
  voice: 'volume-high-outline',
  announcement: 'megaphone-outline',
  stage: 'mic-outline',
  forum: 'chatbubbles-outline',
  gallery: 'images-outline',
  events: 'calendar-outline',
};

type Props = NativeStackScreenProps<ServerStackParamList, 'ServerDetail'>;

export default function ServerDetailScreen({ route, navigation }: Props) {
  const { serverId, serverName } = route.params;
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: serverName });
  }, [navigation, serverName]);

  const fetchChannels = useCallback(async () => {
    try {
      const catData = await getCategories(serverId) as any;
      const categories: Category[] = catData?.categories ?? catData ?? [];
      const uncategorized: Channel[] = catData?.uncategorized ?? [];

      const secs: Section[] = [];

      if (uncategorized.length > 0) {
        secs.push({
          title: 'Channels',
          data: uncategorized.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        });
      }

      for (const cat of categories.sort((a, b) => a.position - b.position)) {
        if (cat.channels && cat.channels.length > 0) {
          secs.push({
            title: cat.name,
            data: cat.channels.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
          });
        }
      }

      // Fallback: if categories returns empty, try flat channel list
      if (secs.length === 0) {
        const channels = await getChannels(serverId) as Channel[];
        if (channels.length > 0) {
          secs.push({ title: 'Channels', data: channels });
        }
      }

      setSections(secs);
    } catch {
      // silently fail
    }
  }, [serverId]);

  useEffect(() => {
    fetchChannels().finally(() => setLoading(false));
  }, [fetchChannels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchChannels();
    setRefreshing(false);
  }, [fetchChannels]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No channels yet</Text>
        <Text style={styles.emptyHint}>Create a channel to get started</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.channelRow}
            onPress={() => {
              if (item.type === 'text' || item.type === 'announcement') {
                navigation.navigate('Channel', {
                  serverId,
                  channelId: item.id,
                  channelName: item.name,
                });
              }
            }}
          >
            <Ionicons
              name={CHANNEL_ICON_NAMES[item.type] || 'chatbubble-outline'}
              size={18}
              color={colors.textMuted}
              style={styles.channelIcon}
            />
            <Text style={styles.channelName}>{item.name}</Text>
            {item.type === 'voice' && (
              <Text style={styles.voiceBadge}>Voice</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyText: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  sectionHeader: {
    backgroundColor: colors.bgPrimary, paddingHorizontal: 16, paddingVertical: 8, paddingTop: 16,
  },
  sectionTitle: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
  },
  channelRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  channelIcon: { width: 28, textAlign: 'center' },
  channelName: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  voiceBadge: {
    color: colors.statusOnline, fontSize: 11, fontWeight: '600',
    backgroundColor: colors.bgAccent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
});
