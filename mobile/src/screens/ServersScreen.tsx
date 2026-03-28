import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput, Alert, Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ServerStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { getServers, createServer, acceptInvite } from '../api/client';

interface Server {
  id: string;
  name: string;
  owner_id: string;
}

type Props = NativeStackScreenProps<ServerStackParamList, 'ServerList'>;

export default function ServersScreen({ navigation }: Props) {
  const [servers, setServers] = useState<Server[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'join'>('create');
  const [inputValue, setInputValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const data = await getServers();
      setServers(data as Server[]);
    } catch {
      // silently fail, show empty
    }
  }, []);

  useEffect(() => {
    fetchServers().finally(() => setLoading(false));
  }, [fetchServers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServers();
    setRefreshing(false);
  }, [fetchServers]);

  const handleCreate = async () => {
    if (!inputValue.trim()) return;
    setSubmitting(true);
    try {
      await createServer(inputValue.trim());
      setModalVisible(false);
      setInputValue('');
      await fetchServers();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!inputValue.trim()) return;
    setSubmitting(true);
    try {
      await acceptInvite(inputValue.trim());
      setModalVisible(false);
      setInputValue('');
      await fetchServers();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openModal = (mode: 'create' | 'join') => {
    setModalMode(mode);
    setInputValue('');
    setModalVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading servers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openModal('create')}>
          <Text style={styles.actionBtnText}>+ Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.joinBtn]} onPress={() => openModal('join')}>
          <Text style={styles.actionBtnText}>Join</Text>
        </TouchableOpacity>
      </View>

      {servers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No servers yet</Text>
          <Text style={styles.emptyHint}>Create or join a server to get started</Text>
        </View>
      ) : (
        <FlatList
          data={servers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('ServerDetail', { serverId: item.id, serverName: item.name })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {modalMode === 'create' ? 'Create Server' : 'Join Server'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={modalMode === 'create' ? 'Server name' : 'Invite code'}
              placeholderTextColor={colors.textMuted}
              value={inputValue}
              onChangeText={setInputValue}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, (!inputValue.trim() || submitting) && styles.submitDisabled]}
                disabled={!inputValue.trim() || submitting}
                onPress={modalMode === 'create' ? handleCreate : handleJoin}
              >
                <Text style={styles.submitText}>
                  {submitting ? '...' : modalMode === 'create' ? 'Create' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  actionRow: { flexDirection: 'row', padding: 12, gap: 8 },
  actionBtn: {
    flex: 1, backgroundColor: colors.brandPrimary, borderRadius: 8,
    padding: 10, alignItems: 'center',
  },
  joinBtn: { backgroundColor: colors.moss },
  actionBtnText: { color: colors.textInverse, fontWeight: '600', fontSize: 14 },
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
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 20 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    backgroundColor: colors.bgInput, borderRadius: 8, padding: 12,
    color: colors.textPrimary, fontSize: 16, marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { padding: 10 },
  cancelText: { color: colors.textMuted, fontSize: 15 },
  submitBtn: { backgroundColor: colors.brandPrimary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: colors.textInverse, fontWeight: '600', fontSize: 15 },
});
