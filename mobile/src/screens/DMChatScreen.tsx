import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DMStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { getDMMessages, sendDMMessage, deleteDMMessage, ackDM } from '../api/client';
import { useAuth } from '../auth/AuthContext';

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
  status?: 'pending' | 'failed';
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 65%)`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

type Props = NativeStackScreenProps<DMStackParamList, 'DMChat'>;

export default function DMChatScreen({ route, navigation }: Props) {
  const { dmId, recipientName } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [menuMessage, setMenuMessage] = useState<DMMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: recipientName });
  }, [navigation, recipientName]);

  const fetchMessages = useCallback(async () => {
    try {
      const raw = await getDMMessages(dmId);
      const msgs = (raw as unknown as DMMessage[]);
      setMessages(msgs.reverse());
      if (msgs.length < 50) setHasMore(false);
      if (msgs.length > 0) {
        ackDM(dmId, msgs[msgs.length - 1].id).catch(() => {});
      }
    } catch {
      // silent
    }
  }, [dmId]);

  // Poll for new messages every 3s (matches web behavior)
  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));

    pollRef.current = setInterval(async () => {
      try {
        if (messages.length === 0) return;
        const lastSeq = messages[messages.length - 1]?.channel_seq;
        const raw = await getDMMessages(dmId, undefined, 50);
        const all = (raw as unknown as DMMessage[]);
        const newMsgs = all.filter(m => m.channel_seq > lastSeq);
        if (newMsgs.length > 0) {
          setMessages(prev => [...prev, ...newMsgs.reverse()]);
          ackDM(dmId, newMsgs[newMsgs.length - 1].id).catch(() => {});
        }
      } catch {
        // silent
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [dmId, fetchMessages]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const raw = await getDMMessages(dmId, oldest.id);
      const older = (raw as unknown as DMMessage[]);
      if (older.length < 50) setHasMore(false);
      setMessages(prev => [...older.reverse(), ...prev]);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, dmId]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: DMMessage = {
      id: tempId,
      channel_id: dmId,
      author: { id: user?.id ?? '', username: user?.username ?? 'You' },
      content,
      type: 'text',
      reply_to_id: null,
      edited_at: null,
      channel_seq: 0,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    setMessages(prev => [...prev, optimistic]);
    setText('');

    try {
      const real = (await sendDMMessage(dmId, content)) as unknown as DMMessage;
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...real, status: undefined } : m)
      );
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
      );
    }
  }, [text, dmId, user]);

  const handleDelete = useCallback(async (msgId: string) => {
    try {
      await deleteDMMessage(dmId, msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch {
      // silent
    }
  }, [dmId]);

  const renderMessage = useCallback(({ item, index }: { item: DMMessage; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const showDay = !prev || formatDay(item.timestamp) !== formatDay(prev.timestamp);
    const showAvatar = !prev || prev.author.id !== item.author.id || showDay;
    const isOwn = item.author.id === user?.id;

    return (
      <View>
        {showDay && (
          <View style={styles.daySep}>
            <View style={styles.dayLine} />
            <Text style={styles.dayText}>{formatDay(item.timestamp)}</Text>
            <View style={styles.dayLine} />
          </View>
        )}
        <TouchableOpacity
          style={[styles.msgRow, item.status === 'failed' && styles.msgFailed]}
          onLongPress={() => { if (!item.status) setMenuMessage(item); }}
          activeOpacity={0.7}
        >
          {showAvatar ? (
            <View style={[styles.msgAvatar, { backgroundColor: avatarColor(item.author.username) }]}>
              <Text style={styles.msgAvatarText}>
                {item.author.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <View style={styles.msgAvatarSpacer} />
          )}
          <View style={styles.msgContent}>
            {showAvatar && (
              <View style={styles.msgHeader}>
                <Text style={styles.msgAuthor}>{item.author.username}</Text>
                <Text style={styles.msgTime}>{formatTime(item.timestamp)}</Text>
                {item.edited_at && <Text style={styles.msgEdited}>(edited)</Text>}
                {item.status === 'pending' && <Text style={styles.msgPending}>sending...</Text>}
                {item.status === 'failed' && <Text style={styles.msgFailedText}>failed</Text>}
              </View>
            )}
            <Text style={styles.msgText}>{item.content}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [messages, user]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListHeaderComponent={loadingMore ? (
          <ActivityIndicator style={{ padding: 8 }} color={colors.textMuted} />
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptyHint}>Say hello!</Text>
          </View>
        }
        contentContainerStyle={messages.length === 0 ? { flex: 1 } : undefined}
        onContentSizeChange={() => {
          if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${recipientName}`}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          disabled={!text.trim()}
          onPress={handleSend}
        >
          <Text style={styles.sendText}>{'\u2191'}</Text>
        </TouchableOpacity>
      </View>

      {/* Long-press action menu */}
      <Modal
        visible={menuMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMessage(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuMessage(null)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {menuMessage?.content}
            </Text>

            {/* Delete (own messages only) */}
            {menuMessage?.author.id === user?.id && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (menuMessage) handleDelete(menuMessage.id);
                  setMenuMessage(null);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Delete Message</Text>
              </TouchableOpacity>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setMenuMessage(null)}
            >
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  emptyMessages: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  daySep: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dayText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },
  msgRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, alignItems: 'flex-start' },
  msgFailed: { opacity: 0.5 },
  msgAvatar: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginTop: 2,
  },
  msgAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  msgAvatarSpacer: { width: 36, marginRight: 8 },
  msgContent: { flex: 1 },
  msgHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 1 },
  msgAuthor: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  msgTime: { color: colors.textMuted, fontSize: 11 },
  msgEdited: { color: colors.textMuted, fontSize: 10, fontStyle: 'italic' },
  msgPending: { color: colors.textMuted, fontSize: 10 },
  msgFailedText: { color: colors.danger, fontSize: 10 },
  msgText: { color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: colors.bgInput,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15,
  },
  sendBtn: {
    marginLeft: 8, width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandPrimary, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: colors.textInverse, fontSize: 18, fontWeight: '700' },
  // Action menu modal
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingHorizontal: 16,
  },
  menuTitle: {
    color: colors.textMuted, fontSize: 13, marginBottom: 12, paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4,
  },
  menuItemText: { color: colors.textPrimary, fontSize: 16 },
});
