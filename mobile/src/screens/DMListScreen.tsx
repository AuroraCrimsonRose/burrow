import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DMStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { getDMs, getReadStates } from '../api/client';

interface DMRecipient {
  id: string;
  username: string;
  display_name?: string;
}

interface DMChannel {
  id: string;
  recipients: DMRecipient[];
  last_message_seq?: number;
}

interface DMListItem extends DMChannel {
  unread: boolean;
}

type Props = NativeStackScreenProps<DMStackParamList, 'DMList'>;

export default function DMListScreen({ navigation }: Props) {
  const [conversations, setConversations] = useState<DMListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDMs = useCallback(async () => {
    try {
      const [dmData, readData] = await Promise.all([
        getDMs() as unknown as Promise<DMChannel[]>,
        getReadStates().catch(() => ({})),
      ]);
      const dms = (dmData as unknown as DMChannel[] | { dm_channels: DMChannel[] });
      const dmList = Array.isArray(dms) ? dms : dms.dm_channels;
      const reads = readData as Record<string, { last_read_seq: number }>;

      const items: DMListItem[] = (dmList as DMChannel[]).map(dm => {
        const readState = reads[dm.id];
        const unread = readState
          ? (dm.last_message_seq ?? 0) > readState.last_read_seq
          : false;
        return { ...dm, unread };
      });

      setConversations(items);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchDMs().finally(() => setLoading(false));
  }, [fetchDMs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDMs();
    setRefreshing(false);
  }, [fetchDMs]);

  const getRecipientName = (dm: DMChannel): string => {
    const r = dm.recipients[0];
    return r?.display_name || r?.username || 'Unknown';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptyHint}>Start a conversation with a friend</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
          renderItem={({ item }) => {
            const name = getRecipientName(item);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  navigation.navigate('DMChat', {
                    dmId: item.id,
                    recipientId: item.recipients[0]?.id ?? '',
                    recipientName: name,
                  })
                }
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, item.unread && styles.nameUnread]}>{name}</Text>
                </View>
                {item.unread && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgAccent,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  info: { flex: 1 },
  name: { color: colors.textPrimary, fontSize: 16 },
  nameUnread: { fontWeight: '700' },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet,
  },
});
