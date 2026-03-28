import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ServerStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import {
  getMessages, sendMessage, deleteMessage, editMessage, addReaction, removeReaction, ackChannel,
  getUserProfile, getUserNote, setUserNote,
} from '../api/client';
import { BadgeRow } from '../components/HexBadge';
import { useAuth } from '../auth/AuthContext';
import { joinChannel, leaveChannel, updateLastSeq } from '../socket';

interface MessageAuthor {
  id: string;
  username: string;
  display_name?: string;
}

interface Reaction {
  emoji: string;
  userIds: string[];
}

interface Message {
  id: string;
  content: string;
  author: MessageAuthor;
  timestamp: string;
  channel_seq: number;
  edited_at?: string | null;
  reply_to_id?: string | null;
  reactions?: Reaction[];
  status?: 'pending' | 'failed';
}

const QUICK_REACTIONS = ['\u{1F44D}', '\u{2764}', '\u{1F602}', '\u{1F525}', '\u{1F440}', '\u{1F389}'];

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

type Props = NativeStackScreenProps<ServerStackParamList, 'Channel'>;

export default function ChannelScreen({ route, navigation }: Props) {
  const { serverId, channelId, channelName } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [profileUser, setProfileUser] = useState<Record<string, any> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileNote, setProfileNote] = useState('');
  const [profileNoteDraft, setProfileNoteDraft] = useState('');
  const flatListRef = useRef<FlatList>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: `#${channelName}` });
  }, [navigation, channelName]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const raw = await getMessages(serverId, channelId);
      const data = raw as unknown as Message[] | { messages: Message[] };
      const msgs = (Array.isArray(data) ? data : data.messages) as Message[];
      setMessages(msgs.reverse()); // newest last
      if (msgs.length < 50) setHasMore(false);
      // ack last message
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        ackChannel(serverId, channelId, last.id).catch(() => {});
        updateLastSeq(`channel:${channelId}`, last.channel_seq);
      }
    } catch {
      // silent
    }
  }, [serverId, channelId]);

  // Subscribe to real-time channel events
  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));

    try {
      joinChannel(`channel:${channelId}`, (event, payload) => {
        switch (event) {
          case 'message_create':
            setMessages(prev => {
              // Dedupe against optimistic messages
              const filtered = prev.filter(m => m.id !== payload.id && m.id !== payload.tempId);
              return [...filtered, payload];
            });
            if (payload.id) {
              ackChannel(serverId, channelId, payload.id).catch(() => {});
            }
            break;
          case 'message_edit':
            setMessages(prev =>
              prev.map(m => m.id === payload.id ? { ...m, content: payload.content, edited_at: payload.edited_at } : m)
            );
            break;
          case 'message_delete':
            setMessages(prev => prev.filter(m => m.id !== payload.id));
            break;
          case 'reaction_add':
            setMessages(prev =>
              prev.map(m => {
                if (m.id !== payload.message_id) return m;
                const reactions = [...(m.reactions ?? [])];
                const existing = reactions.find(r => r.emoji === payload.emoji);
                if (existing) {
                  if (!existing.userIds.includes(payload.user_id)) {
                    existing.userIds = [...existing.userIds, payload.user_id];
                  }
                } else {
                  reactions.push({ emoji: payload.emoji, userIds: [payload.user_id] });
                }
                return { ...m, reactions };
              })
            );
            break;
          case 'reaction_remove':
            setMessages(prev =>
              prev.map(m => {
                if (m.id !== payload.message_id) return m;
                const reactions = (m.reactions ?? [])
                  .map(r => r.emoji === payload.emoji
                    ? { ...r, userIds: r.userIds.filter(id => id !== payload.user_id) }
                    : r)
                  .filter(r => r.userIds.length > 0);
                return { ...m, reactions };
              })
            );
            break;
        }
      });
    } catch {
      // socket not connected yet
    }

    return () => {
      leaveChannel(`channel:${channelId}`);
    };
  }, [channelId, serverId, fetchMessages]);

  // Load older messages
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const raw = await getMessages(serverId, channelId, oldest.id);
      const data = raw as unknown as Message[] | { messages: Message[] };
      const older = (Array.isArray(data) ? data : data.messages) as Message[];
      if (older.length < 50) setHasMore(false);
      setMessages(prev => [...older.reverse(), ...prev]);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, serverId, channelId]);

  // Send message
  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      content,
      author: { id: user?.id ?? '', username: user?.username ?? 'You' },
      timestamp: new Date().toISOString(),
      channel_seq: 0,
      reply_to_id: replyTo?.id ?? null,
      status: 'pending',
    };

    setMessages(prev => [...prev, optimistic]);
    setText('');
    setReplyTo(null);

    try {
      const real = await sendMessage(serverId, channelId, { content, reply_to_id: replyTo?.id });
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, ...(real as any), status: undefined } : m)
      );
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
      );
    }
  }, [text, replyTo, serverId, channelId, user]);

  // React to message
  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    setReactingTo(null);
    try {
      const msg = messages.find(m => m.id === messageId);
      const existing = msg?.reactions?.find(r => r.emoji === emoji);
      const hasReacted = existing?.userIds.includes(user?.id ?? '');
      if (hasReacted) {
        await removeReaction(serverId, channelId, messageId, emoji);
      } else {
        await addReaction(serverId, channelId, messageId, emoji);
      }
    } catch {
      // silent
    }
  }, [messages, serverId, channelId, user]);

  // Delete message
  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(serverId, channelId, messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch {
      // silent
    }
  }, [serverId, channelId]);

  // Edit message
  const handleEdit = useCallback(async () => {
    if (!editingMessage || !editText.trim()) return;
    const newContent = editText.trim();
    try {
      await editMessage(serverId, channelId, editingMessage.id, newContent);
      setMessages(prev =>
        prev.map(m => m.id === editingMessage.id ? { ...m, content: newContent, edited_at: new Date().toISOString() } : m)
      );
    } catch {
      // silent
    } finally {
      setEditingMessage(null);
      setEditText('');
    }
  }, [editingMessage, editText, serverId, channelId]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const showDay = !prev || formatDay(item.timestamp) !== formatDay(prev.timestamp);
    const showAvatar = !prev || prev.author.id !== item.author.id || showDay;

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
                {(item.author.display_name || item.author.username).charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <View style={styles.msgAvatarSpacer} />
          )}
          <View style={styles.msgContent}>
            {showAvatar && (
              <View style={styles.msgHeader}>
                <Text style={styles.msgAuthor}>
                  {item.author.display_name || item.author.username}
                </Text>
                <Text style={styles.msgTime}>{formatTime(item.timestamp)}</Text>
                {item.edited_at && <Text style={styles.msgEdited}>(edited)</Text>}
                {item.status === 'pending' && <Text style={styles.msgPending}>sending...</Text>}
                {item.status === 'failed' && <Text style={styles.msgFailedText}>failed</Text>}
              </View>
            )}
            {item.reply_to_id && (
              <Text style={styles.replyRef} numberOfLines={1}>
                Replying to a message
              </Text>
            )}
            <Text style={styles.msgText}>{item.content}</Text>
            {item.reactions && item.reactions.length > 0 && (
              <View style={styles.reactionsRow}>
                {item.reactions.map(r => (
                  <TouchableOpacity
                    key={r.emoji}
                    style={[
                      styles.reactionChip,
                      r.userIds.includes(user?.id ?? '') && styles.reactionChipActive,
                    ]}
                    onPress={() => handleReaction(item.id, r.emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    <Text style={styles.reactionCount}>{r.userIds.length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [messages, user, handleReaction]);

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
        onEndReachedThreshold={0.1}
        inverted={false}
        onStartReached={() => loadMore()}
        onStartReachedThreshold={0.1}
        ListHeaderComponent={loadingMore ? (
          <ActivityIndicator style={{ padding: 8 }} color={colors.textMuted} />
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptyHint}>Start the conversation!</Text>
          </View>
        }
        contentContainerStyle={messages.length === 0 ? { flex: 1 } : undefined}
        onContentSizeChange={() => {
          if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      {replyTo && (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarText} numberOfLines={1}>
            Replying to {replyTo.author.username}: {replyTo.content}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={styles.replyBarClose}>{"\u00D7"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {editingMessage && (
        <View style={styles.editBar}>
          <View style={styles.editBarHeader}>
            <Ionicons name="pencil-outline" size={14} color={colors.brandPrimary} />
            <Text style={styles.editBarLabel}>Editing message</Text>
            <TouchableOpacity onPress={() => { setEditingMessage(null); setEditText(''); }}>
              <Text style={styles.editBarClose}>{"\u00D7"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.editInputRow}>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              maxLength={4000}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sendBtn, !editText.trim() && styles.sendBtnDisabled]}
              disabled={!editText.trim()}
              onPress={handleEdit}
            >
              <Ionicons name="checkmark" size={20} color={colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!editingMessage && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={`Message #${channelName}`}
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
            <Text style={styles.sendText}>{"\u2191"}</Text>
          </TouchableOpacity>
        </View>
      )}

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

            {/* Quick reactions row */}
            <View style={styles.menuReactions}>
              {QUICK_REACTIONS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.menuReactionBtn}
                  onPress={() => {
                    if (menuMessage) handleReaction(menuMessage.id, emoji);
                    setMenuMessage(null);
                  }}
                >
                  <Text style={styles.menuReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.menuDivider} />

            {/* View Profile (other users only) */}
            {menuMessage?.author.id !== user?.id && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={async () => {
                  if (!menuMessage) return;
                  const authorId = menuMessage.author.id;
                  const authorUsername = menuMessage.author.username;
                  const authorDisplay = menuMessage.author.display_name;
                  setProfileLoading(true);
                  setMenuMessage(null);
                  try {
                    const [data, noteData] = await Promise.all([
                      getUserProfile(authorId) as Promise<Record<string, any>>,
                      getUserNote(authorId).catch(() => ({ content: '' })) as Promise<{ content: string }>,
                    ]);
                    const note = noteData?.content ?? '';
                    setProfileNote(note);
                    setProfileNoteDraft(note);
                    setProfileUser({
                      ...data,
                      userId: authorId,
                      username: authorUsername,
                      display_name: authorDisplay,
                    });
                  } catch {
                    setProfileNote('');
                    setProfileNoteDraft('');
                    setProfileUser({
                      userId: authorId,
                      username: authorUsername,
                      display_name: authorDisplay,
                    });
                  } finally {
                    setProfileLoading(false);
                  }
                }}
              >
                <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>View Profile</Text>
              </TouchableOpacity>
            )}

            {/* Reply */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuMessage) setReplyTo(menuMessage);
                setMenuMessage(null);
              }}
            >
              <Ionicons name="arrow-undo-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            {/* Edit (own messages only) */}
            {menuMessage?.author.id === user?.id && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (menuMessage) {
                    setEditingMessage(menuMessage);
                    setEditText(menuMessage.content);
                  }
                  setMenuMessage(null);
                }}
              >
                <Ionicons name="pencil-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Edit Message</Text>
              </TouchableOpacity>
            )}

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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Profile modal */}
      <Modal
        visible={profileUser !== null || profileLoading}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileUser(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setProfileUser(null)}>
          <Pressable style={styles.profileSheet} onPress={() => {}}>
            {profileLoading ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ padding: 24 }} />
            ) : profileUser ? (
              <>
                {/* Accent color bar */}
                {profileUser.accent_color ? (
                  <View style={[styles.profileAccentBar, { backgroundColor: profileUser.accent_color }]} />
                ) : null}

                {/* Header: avatar + identity */}
                <View style={styles.profileBody}>
                  <View style={styles.profileHeader}>
                    <View style={[
                      styles.profileAvatar,
                      { backgroundColor: avatarColor(profileUser.username ?? '') },
                      profileUser.accent_color ? { borderColor: profileUser.accent_color } : {},
                    ]}>
                      <Text style={styles.profileAvatarText}>
                        {(profileUser.display_name || profileUser.username || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={styles.profileDisplayName}>
                        {profileUser.display_name || profileUser.username}
                      </Text>
                      {profileUser.display_name ? (
                        <Text style={styles.profileUsername}>@{profileUser.username}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Badges */}
                  <View style={styles.profileBadges}>
                    {profileUser.badges && profileUser.badges.length > 0 ? (
                      <BadgeRow badges={profileUser.badges} />
                    ) : (
                      <Text style={styles.profileBadgesEmpty}>No badges yet</Text>
                    )}
                  </View>

                  {/* Pronouns */}
                  {profileUser.pronouns ? (
                    <View style={styles.profileField}>
                      <Text style={styles.profileFieldLabel}>PRONOUNS</Text>
                      <Text style={styles.profileFieldValue}>{profileUser.pronouns}</Text>
                    </View>
                  ) : null}

                  {/* Bio */}
                  {profileUser.bio ? (
                    <View style={styles.profileField}>
                      <Text style={styles.profileFieldLabel}>ABOUT</Text>
                      <Text style={styles.profileBioText}>{profileUser.bio}</Text>
                    </View>
                  ) : null}

                  {/* Trust tier */}
                  {profileUser.trust_tier != null ? (
                    <View style={styles.profileField}>
                      <Text style={styles.profileFieldLabel}>TRUST</Text>
                      <Text style={styles.profileFieldValue}>Tier {profileUser.trust_tier}</Text>
                    </View>
                  ) : null}

                  {/* Member since */}
                  {profileUser.inserted_at ? (
                    <View style={styles.profileField}>
                      <Text style={styles.profileFieldLabel}>MEMBER SINCE</Text>
                      <Text style={styles.profileFieldValue}>
                        {new Date(profileUser.inserted_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ) : null}

                  {/* Note */}
                  <View style={styles.profileNoteSection}>
                    <Text style={styles.profileFieldLabel}>NOTE</Text>
                    <TextInput
                      style={styles.profileNoteInput}
                      value={profileNoteDraft}
                      onChangeText={setProfileNoteDraft}
                      placeholder="Add a note about this user\u2026"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      maxLength={1024}
                    />
                    {profileNoteDraft !== profileNote && (
                      <View style={styles.profileNoteActions}>
                        <TouchableOpacity
                          style={styles.profileNoteSaveBtn}
                          onPress={async () => {
                            if (!profileUser?.userId) return;
                            try {
                              await setUserNote(profileUser.userId, profileNoteDraft.trim());
                              setProfileNote(profileNoteDraft.trim());
                            } catch { /* silent */ }
                          }}
                        >
                          <Text style={styles.profileNoteSaveBtnText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setProfileNoteDraft(profileNote)}>
                          <Text style={styles.profileNoteCancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {/* Close button */}
                <TouchableOpacity
                  style={styles.profileCloseBtn}
                  onPress={() => setProfileUser(null)}
                >
                  <Text style={styles.profileCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
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
  daySep: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8,
  },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dayText: {
    color: colors.textMuted, fontSize: 11, fontWeight: '600', paddingHorizontal: 8,
  },
  msgRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, alignItems: 'flex-start' },
  msgFailed: { opacity: 0.5 },
  msgAvatar: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 8, marginTop: 2,
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
  replyRef: {
    color: colors.brandLight, fontSize: 12, marginBottom: 2,
    borderLeftWidth: 2, borderLeftColor: colors.brandPrimary, paddingLeft: 6,
  },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgAccent,
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  reactionChipActive: { backgroundColor: colors.brandMuted },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: colors.textSecondary, fontSize: 11, marginLeft: 3 },
  deleteBtn: { padding: 4, marginLeft: 4 },
  deleteBtnText: { color: colors.textMuted, fontSize: 18 },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary,
    paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  replyBarText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  replyBarClose: { color: colors.textMuted, fontSize: 20, paddingLeft: 8 },
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
  // Edit bar
  editBar: {
    backgroundColor: colors.bgSecondary, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border, padding: 8,
  },
  editBarHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingHorizontal: 4,
  },
  editBarLabel: { flex: 1, color: colors.brandPrimary, fontSize: 12, fontWeight: '600' },
  editBarClose: { color: colors.textMuted, fontSize: 20, paddingLeft: 8 },
  editInputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  editInput: {
    flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: colors.bgInput,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15,
  },
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
  menuReactions: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8,
  },
  menuReactionBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgAccent,
    justifyContent: 'center', alignItems: 'center',
  },
  menuReactionEmoji: { fontSize: 22 },
  menuDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4,
  },
  menuItemText: { color: colors.textPrimary, fontSize: 16 },
  // Profile modal
  profileSheet: {
    backgroundColor: colors.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  profileAccentBar: {
    height: 6, borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  profileBody: { paddingHorizontal: 20, paddingTop: 20 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
    marginRight: 14, borderWidth: 2, borderColor: colors.brandMuted,
  },
  profileAvatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileDisplayName: { color: colors.textHeading, fontSize: 18, fontWeight: '700' },
  profileUsername: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  profileBadges: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },

  profileBadgesEmpty: {
    color: colors.textMuted, fontSize: 12, fontStyle: 'italic',
  },
  profileField: {
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(61,53,50,0.4)',
  },
  profileFieldLabel: {
    color: colors.textMuted, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
  },
  profileFieldValue: { color: colors.textSecondary, fontSize: 14 },
  profileBioText: {
    color: colors.textSecondary, fontSize: 14, lineHeight: 20, whiteSpace: 'pre-wrap',
  },
  profileNoteSection: {
    marginTop: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  profileNoteInput: {
    backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 6, color: colors.textPrimary, fontSize: 13, padding: 8,
    marginTop: 6, minHeight: 48, textAlignVertical: 'top',
  },
  profileNoteActions: {
    flexDirection: 'row', gap: 10, marginTop: 6, justifyContent: 'flex-end', alignItems: 'center',
  },
  profileNoteSaveBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 4,
  },
  profileNoteSaveBtnText: { color: colors.textInverse, fontSize: 12, fontWeight: '600' },
  profileNoteCancelText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  profileCloseBtn: {
    alignSelf: 'stretch', paddingVertical: 12, borderRadius: 8,
    backgroundColor: colors.bgAccent, alignItems: 'center', marginTop: 12, marginHorizontal: 20,
  },
  profileCloseBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
});
