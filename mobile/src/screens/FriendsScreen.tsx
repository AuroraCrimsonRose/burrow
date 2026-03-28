import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput, Alert, SectionList,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  getFriends, getFriendRequests, getFriendPresence,
  sendFriendRequest, acceptFriend, declineFriend, removeFriend,
  createDM,
} from '../api/client';
import { useNavigation } from '@react-navigation/native';

interface Friend {
  id: string;
  username: string;
  display_name?: string;
}

interface FriendRequest {
  id: string;
  user: { id: string; username: string };
}

interface Presence {
  user_id: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  status_text?: string;
}

type Tab = 'friends' | 'requests' | 'add';

const STATUS_COLORS: Record<string, string> = {
  online: colors.statusOnline,
  idle: colors.statusIdle,
  dnd: colors.statusDnd,
  offline: colors.statusOffline,
};

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [presence, setPresence] = useState<Map<string, Presence>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addInput, setAddInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [fData, rData, pData] = await Promise.all([
        getFriends() as unknown as Promise<Friend[]>,
        getFriendRequests() as unknown as Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>,
        getFriendPresence().catch(() => ({ presences: [] })) as unknown as Promise<{ presences: Presence[] }>,
      ]);
      const fl = fData as unknown as Friend[] | { friends: Friend[] };
      setFriends(Array.isArray(fl) ? fl : fl.friends);
      setIncoming(rData.incoming ?? []);
      setOutgoing(rData.outgoing ?? []);
      const pMap = new Map<string, Presence>();
      for (const p of (pData.presences ?? pData as any)) {
        pMap.set(p.user_id, p);
      }
      setPresence(pMap);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleAddFriend = async () => {
    if (!addInput.trim()) return;
    setSubmitting(true);
    try {
      await sendFriendRequest(addInput.trim());
      setAddInput('');
      Alert.alert('Sent', 'Friend request sent!');
      await fetchAll();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      await acceptFriend(userId);
      await fetchAll();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDecline = async (userId: string) => {
    try {
      await declineFriend(userId);
      await fetchAll();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRemove = async (userId: string) => {
    Alert.alert('Remove Friend', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(userId);
            await fetchAll();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleOpenDM = async (friendId: string, friendName: string) => {
    try {
      const data = await createDM(friendId) as { id: string };
      navigation.navigate('DMs', {
        screen: 'DMChat',
        params: { dmId: data.id, recipientId: friendId, recipientName: friendName },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const onlineFriends = friends.filter(f => {
    const p = presence.get(f.id);
    return p && p.status !== 'offline';
  });
  const offlineFriends = friends.filter(f => {
    const p = presence.get(f.id);
    return !p || p.status === 'offline';
  });

  const renderFriendsList = () => {
    const sections = [
      ...(onlineFriends.length > 0 ? [{ title: `ONLINE \u2014 ${onlineFriends.length}`, data: onlineFriends }] : []),
      ...(offlineFriends.length > 0 ? [{ title: `OFFLINE \u2014 ${offlineFriends.length}`, data: offlineFriends }] : []),
    ];

    if (sections.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No friends yet</Text>
          <Text style={styles.emptyHint}>Add friends by their user ID</Text>
        </View>
      );
    }

    return (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const p = presence.get(item.id);
          const statusColor = STATUS_COLORS[p?.status ?? 'offline'];
          const name = item.display_name || item.username;
          return (
            <TouchableOpacity
              style={styles.friendRow}
              onPress={() => handleOpenDM(item.id, name)}
              onLongPress={() => handleRemove(item.id)}
            >
              <View style={styles.friendAvatar}>
                <Text style={styles.friendAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              </View>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{name}</Text>
                {p?.status_text ? (
                  <Text style={styles.friendStatus} numberOfLines={1}>{p.status_text}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  };

  const renderRequests = () => (
    <FlatList
      data={[...incoming.map(r => ({ ...r, type: 'incoming' as const })), ...outgoing.map(r => ({ ...r, type: 'outgoing' as const }))]}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No pending requests</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.requestRow}>
          <View style={styles.requestAvatar}>
            <Text style={styles.friendAvatarText}>{item.user.username.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{item.user.username}</Text>
            <Text style={styles.requestType}>{item.type === 'incoming' ? 'Incoming' : 'Outgoing'}</Text>
          </View>
          {item.type === 'incoming' ? (
            <View style={styles.requestActions}>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.user.id)}>
                <Text style={styles.actionBtnText}>{'\u2713'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.user.id)}>
                <Text style={styles.actionBtnText}>{'\u2717'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.user.id)}>
              <Text style={styles.actionBtnText}>{'\u2717'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    />
  );

  const renderAdd = () => (
    <View style={styles.addContainer}>
      <Text style={styles.addTitle}>Add Friend</Text>
      <Text style={styles.addHint}>Enter a user ID to send a friend request</Text>
      <TextInput
        style={styles.addInput}
        placeholder="User ID"
        placeholderTextColor={colors.textMuted}
        value={addInput}
        onChangeText={setAddInput}
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={[styles.addBtn, (!addInput.trim() || submitting) && styles.addBtnDisabled]}
        disabled={!addInput.trim() || submitting}
        onPress={handleAddFriend}
      >
        <Text style={styles.addBtnText}>{submitting ? 'Sending...' : 'Send Friend Request'}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {(['friends', 'requests', 'add'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'friends' ? 'Friends' : t === 'requests' ? `Requests${incoming.length > 0 ? ` (${incoming.length})` : ''}` : 'Add'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'friends' && renderFriendsList()}
      {tab === 'requests' && renderRequests()}
      {tab === 'add' && renderAdd()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.brandPrimary },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.textPrimary },
  sectionHeader: { backgroundColor: colors.bgPrimary, paddingHorizontal: 16, paddingVertical: 8, paddingTop: 16 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  friendAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgAccent,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  friendAvatarText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bgPrimary,
  },
  friendInfo: { flex: 1 },
  friendName: { color: colors.textPrimary, fontSize: 15 },
  friendStatus: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  requestAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgAccent,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  requestType: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  requestActions: { flexDirection: 'row', gap: 6 },
  acceptBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.statusOnline,
    justifyContent: 'center', alignItems: 'center',
  },
  declineBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.danger,
    justifyContent: 'center', alignItems: 'center',
  },
  actionBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '700' },
  addContainer: { padding: 20 },
  addTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  addHint: { color: colors.textSecondary, fontSize: 14, marginBottom: 20 },
  addInput: {
    backgroundColor: colors.bgInput, borderRadius: 8, padding: 14,
    color: colors.textPrimary, fontSize: 16, marginBottom: 16,
  },
  addBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: 8, padding: 14, alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: colors.textInverse, fontWeight: '600', fontSize: 16 },
});
