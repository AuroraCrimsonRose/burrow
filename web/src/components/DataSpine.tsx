import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAnimatedEmojis } from '../store';
import { getEmojiEntry, getNotoUrl, getNotoAnimatedUrl, getRecentEmojis, addRecentEmoji, ALL_EMOJIS, type EmojiEntry } from '../emoji';
import EmojiPicker from './EmojiPicker';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import lua from 'highlight.js/lib/languages/lua';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import markdown from 'highlight.js/lib/languages/markdown';
import 'highlight.js/styles/atom-one-dark.css';
import initSqlJs, { type Database } from 'sql.js';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('erlang', erlang);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('markdown', markdown);

const MAX_ANIMATED_IN_VIEW = 15;

const CODE_EXT_MAP: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.pyw': 'python',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.h': 'c',
  '.c': 'c',
  '.java': 'java',
  '.cs': 'csharp',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.sql': 'sql',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.css': 'css', '.scss': 'css', '.less': 'css',
  '.html': 'xml', '.htm': 'xml', '.xml': 'xml', '.svg': 'xml',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'yaml',
  '.lua': 'lua',
  '.ex': 'elixir', '.exs': 'elixir',
  '.erl': 'erlang',
  '.dockerfile': 'dockerfile',
  '.md': 'markdown',
};

function getCodeLang(filename: string): string | null {
  if (!filename) return null;
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = filename.slice(dot).toLowerCase();
  return CODE_EXT_MAP[ext] || null;
}
function getFileExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toUpperCase() : '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Types ──
export interface MessageAttachment {
  key: string;
  filename: string;
  content_type: string;
  size: number;
  url?: string;
  scan_status?: 'pending' | 'scanning' | 'clean' | 'flagged' | 'rejected' | 'error';
  expires_at?: string;
  mime_verified?: string;
  virus_result?: string;
}

export interface SpineMessage {
  id: string;
  content: string;
  author: { id: string; username: string; display_name?: string };
  timestamp: string;
  channel_seq: number;
  edited_at?: string | null;
  status?: 'pending' | 'failed';
  replyTo?: string;
  reactions?: { emoji: string; userIds: string[] }[];
  attachments?: MessageAttachment[];
}

export interface PresenceUser {
  id: string;
  username: string;
  state: 'active' | 'idle' | 'typing';
}

export interface ServerMember {
  user_id: string;
  username: string;
  display_name?: string;
  nickname?: string;
}

interface DataSpineProps {
  messages: SpineMessage[];
  activeChannel: { id: string; name: string; type: string } | null;
  currentUserId: string;
  members: ServerMember[];
  presence: PresenceUser[];
  loading?: boolean;
  onSend: (content: string, replyTo?: string, attachments?: MessageAttachment[]) => void;
  onUploadFile?: (file: File) => Promise<MessageAttachment>;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onMemberClick?: (member: { user_id: string; username: string; nickname?: string; bio?: string; pronouns?: string }) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  messageId: string;
  isOwn: boolean;
  hasReactions: boolean;
}

// ── Mole (bot) command processing ──
const MOLE_AUTHOR = { id: '__mole__', username: 'Mole' };

function processMoleCommand(cmd: string): string | null {
  const name = cmd.toLowerCase().trim();
  if (name === 'time') {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `${time} — ${date} (${tz})`;
  }
  if (name === 'help') {
    return 'Available commands:\n#>time — show your local time\n#>help — show this list';
  }
  return null;
}

// ── Helpers ──
const EMOJI_LIST = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '😢', '😮', '😡', '💀', '🤔', '👏', '✅', '❌', '💯', '🙏', '🫠', '😭', '🥳', '💜'];
const QUICK_REACT = ['👍', '❤️', '😂', '🔥', '👀', '🎉'];

function timeStr(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayStr(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function userColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0xffffff;
  return `hsl(${h % 360}, 55%, 65%)`;
}

function userInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

// ── Animated inline emoji with IntersectionObserver + budget ──
function AnimatedInlineEmoji({ entry, budgetRef }: { entry: EmojiEntry; budgetRef: React.MutableRefObject<number> }) {
  const elRef = useRef<HTMLImageElement>(null);
  const [inView, setInView] = useState(false);
  const [withinBudget, setWithinBudget] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([e]) => {
        const visible = e.isIntersecting;
        setInView(visible);
        if (visible) {
          if (budgetRef.current < MAX_ANIMATED_IN_VIEW) {
            budgetRef.current++;
            setWithinBudget(true);
          } else {
            setWithinBudget(false);
          }
        } else {
          if (withinBudget) {
            budgetRef.current = Math.max(0, budgetRef.current - 1);
          }
          setWithinBudget(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (withinBudget) {
        budgetRef.current = Math.max(0, budgetRef.current - 1);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const src = inView && withinBudget ? getNotoAnimatedUrl(entry) : getNotoUrl(entry);
  return <img ref={elRef} src={src} alt={entry.name} className="noto-emoji noto-emoji-inline" loading="lazy" />;
}

// ── Component ──
const MAX_VISIBLE_REACTIONS = 6;

export default function DataSpine({
  messages, activeChannel, currentUserId, members,
  presence, loading, onSend, onUploadFile, onReact, onEdit, onDelete, onMemberClick,
}: DataSpineProps) {
  const animatedEmojis = useAnimatedEmojis();
  const [input, setInput] = useState('');
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [sendPulse, setSendPulse] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ uploading: boolean; current: number; total: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(messages.length);
  const inputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);

  // Reaction emoji: recent popup per message
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const [reactionFullPickerMsgId, setReactionFullPickerMsgId] = useState<string | null>(null);
  const [fullPickerAnchor, setFullPickerAnchor] = useState<{ top: number; left: number; above: boolean } | null>(null);

  // Reactions detail popup
  const [reactionsDetailMsgId, setReactionsDetailMsgId] = useState<string | null>(null);

  // Member lookup helper
  const memberMap = useMemo(() => {
    const m = new Map<string, ServerMember>();
    members.forEach((mem) => m.set(mem.user_id, mem));
    return m;
  }, [members]);

  function getMemberName(userId: string) {
    const m = memberMap.get(userId);
    if (!m) return 'Unknown';
    return m.nickname || m.display_name || m.username;
  }

  // Input emoji picker
  const [inputEmojiOpen, setInputEmojiOpen] = useState(false);
  const inputEmojiAnchorRef = useRef<HTMLButtonElement>(null);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStart = useRef<number>(-1);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => {
      const nick = m.nickname?.toLowerCase() || '';
      const dn = m.display_name?.toLowerCase() || '';
      const un = m.username.toLowerCase();
      return un.includes(q) || dn.includes(q) || nick.includes(q);
    }).slice(0, 8);
  }, [mentionQuery, members]);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  // Highlight on reply-scroll
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Local mole (bot) messages
  const [moleMessages, setMoleMessages] = useState<SpineMessage[]>([]);

  // Image lightbox
  const [lightbox, setLightbox] = useState<{ att: MessageAttachment; msg: SpineMessage } | null>(null);
  const [lightboxText, setLightboxText] = useState<string | null>(null);
  const [lightboxTextLoading, setLightboxTextLoading] = useState(false);

  // Database viewer state
  const [lightboxDb, setLightboxDb] = useState<Database | null>(null);
  const [lightboxDbTables, setLightboxDbTables] = useState<string[]>([]);
  const [lightboxDbTable, setLightboxDbTable] = useState<string>('');
  const [lightboxDbCols, setLightboxDbCols] = useState<string[]>([]);
  const [lightboxDbRows, setLightboxDbRows] = useState<(string | number | null)[][]>([]);
  const [lightboxDbLoading, setLightboxDbLoading] = useState(false);
  const [lightboxDbError, setLightboxDbError] = useState<string | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  // Fetch text content when lightbox opens on a text/code file
  useEffect(() => {
    if (!lightbox) { setLightboxText(null); setLightboxDb(null); setLightboxDbTables([]); setLightboxDbTable(''); setLightboxDbCols([]); setLightboxDbRows([]); setLightboxDbError(null); return; }
    const ct = lightbox.att.content_type || '';
    const fn = lightbox.att.filename || '';
    const isTextFile = ct.startsWith('text/') || fn.endsWith('.log') || fn.endsWith('.txt');
    const lang = getCodeLang(fn);

    // Database files
    const isDbFile = fn.endsWith('.db') || fn.endsWith('.sqlite') || fn.endsWith('.sqlite3');
    if (isDbFile && lightbox.att.url) {
      setLightboxDbLoading(true);
      setLightboxDbError(null);
      (async () => {
        try {
          const [SQL, buf] = await Promise.all([
            initSqlJs({ locateFile: () => '/sql-wasm.wasm' }),
            fetch(lightbox.att.url!).then(r => r.arrayBuffer()),
          ]);
          const db = new SQL.Database(new Uint8Array(buf));
          setLightboxDb(db);
          const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
          const names = tables.length ? tables[0].values.map(r => String(r[0])) : [];
          setLightboxDbTables(names);
          if (names.length) setLightboxDbTable(names[0]);
        } catch {
          setLightboxDbError('Failed to load database.');
        } finally {
          setLightboxDbLoading(false);
        }
      })();
      return;
    }

    if (!isTextFile && !lang) return;
    if (!lightbox.att.url) return;
    setLightboxTextLoading(true);
    setLightboxText(null);
    fetch(lightbox.att.url)
      .then(r => r.text())
      .then(text => { setLightboxText(text); setLightboxTextLoading(false); })
      .catch(() => { setLightboxText('Failed to load file content.'); setLightboxTextLoading(false); });
  }, [lightbox]);

  // Query selected table when table changes
  useEffect(() => {
    if (!lightboxDb || !lightboxDbTable) return;
    try {
      const res = lightboxDb.exec(`SELECT * FROM "${lightboxDbTable.replace(/"/g, '""')}" LIMIT 200`);
      if (res.length) {
        setLightboxDbCols(res[0].columns);
        setLightboxDbRows(res[0].values as (string | number | null)[][]);
      } else {
        setLightboxDbCols([]);
        setLightboxDbRows([]);
      }
    } catch {
      setLightboxDbCols([]);
      setLightboxDbRows([]);
    }
  }, [lightboxDb, lightboxDbTable]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerMsgId) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.chat-reaction-popup')) {
        setEmojiPickerMsgId(null);
      }
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [emojiPickerMsgId]);

  // Track which emoji elements are in view for animation budgeting
  const animatedCountRef = useRef(0);

  // Helper to render an emoji as Noto image (animated on hover when enabled)
  function renderEmoji(emoji: string, size: number = 20) {
    const entry = getEmojiEntry(emoji);
    if (!entry) return <span>{emoji}</span>;
    if (animatedEmojis && entry.animated) {
      return (
        <span className="emoji-hover-animate" style={{ width: size, height: size }}>
          <img src={getNotoUrl(entry)} alt={entry.name} className="emoji-img emoji-static" style={{ width: size, height: size }} loading="lazy" />
          <img src={getNotoAnimatedUrl(entry)} alt={entry.name} className="emoji-img emoji-animated" style={{ width: size, height: size }} loading="lazy" />
        </span>
      );
    }
    const src = getNotoUrl(entry);
    return <img src={src} alt={entry.name} className="noto-emoji" style={{ width: size, height: size }} loading="lazy" />;
  }

  // Check if a message contains only emojis (up to 10) and optional whitespace
  function isEmojiOnly(text: string): boolean {
    const emojiChars = ALL_EMOJIS.map((e) => e.emoji).sort((a, b) => b.length - a.length);
    const escaped = emojiChars.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const emojiOnlyRegex = new RegExp(`^\\s*(?:(?:${escaped.join('|')})\\s*){1,10}$`);
    return emojiOnlyRegex.test(text);
  }

  // Render message content — replace known emojis with Noto images inline
  // Animated emojis only play when in viewport and under the max budget
  function renderMessageContent(text: string) {
    // First split on @mentions, then process emojis within non-mention parts
    const mentionRegex = /@(\w{1,32})(?=\s|$)/g;
    const segments: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        segments.push(...renderEmojis(text.slice(lastIdx, match.index), segments.length));
      }
      const username = match[1];
      const mentioned = memberMap.get([...memberMap.values()].find((m) => m.username === username)?.user_id || '');
      segments.push(
        <span key={`m${segments.length}`} className={`chat-mention${mentioned ? '' : ' unknown'}`}>
          @{mentioned ? (mentioned.nickname || mentioned.display_name || mentioned.username) : username}
        </span>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      segments.push(...renderEmojis(text.slice(lastIdx), segments.length));
    }
    return segments.length === 0 ? text : segments;
  }

  function renderEmojis(text: string, keyOffset: number): React.ReactNode[] {
    const emojiChars = ALL_EMOJIS.map((e) => e.emoji).sort((a, b) => b.length - a.length);
    const escaped = emojiChars.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = text.split(regex);
    if (parts.length === 1) return [text];
    return parts.map((part, i) => {
      const entry = getEmojiEntry(part);
      if (entry) {
        if (animatedEmojis && entry.animated) {
          return <AnimatedInlineEmoji key={keyOffset + i} entry={entry} budgetRef={animatedCountRef} />;
        }
        return <img key={keyOffset + i} src={getNotoUrl(entry)} alt={entry.name} className="noto-emoji noto-emoji-inline" loading="lazy" />;
      }
      return part;
    });
  }

  // Focus edit input
  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    setInput('');
    const filesToSend = [...pendingFiles];
    setPendingFiles([]);

    // Mole command: #>command
    if (text.startsWith('#>')) {
      const cmd = text.slice(2);
      const result = processMoleCommand(cmd);
      const moleMsg: SpineMessage = {
        id: `mole-${Date.now()}`,
        content: result ?? `Unknown command: ${cmd}\nType #>help for available commands.`,
        author: MOLE_AUTHOR,
        timestamp: new Date().toISOString(),
        channel_seq: 0,
      };
      setMoleMessages((prev) => [...prev, moleMsg]);
      setSendPulse(true);
      setTimeout(() => setSendPulse(false), 150);
      return;
    }

    // Upload files first, then send message with attachments
    let attachments: MessageAttachment[] | undefined;
    if (filesToSend.length > 0 && onUploadFile) {
      try {
        setUploadStatus({ uploading: true, current: 0, total: filesToSend.length });
        attachments = [];
        for (let i = 0; i < filesToSend.length; i++) {
          setUploadStatus({ uploading: true, current: i + 1, total: filesToSend.length });
          attachments.push(await onUploadFile(filesToSend[i]));
        }
        setUploadStatus(null);
      } catch (err) {
        console.error('File upload failed:', err);
        setUploadStatus({ uploading: false, current: 0, total: 0, error: String(err instanceof Error ? err.message : err) });
        setTimeout(() => setUploadStatus(null), 4000);
        return;
      }
    }

    onSend(text, replyTarget || undefined, attachments);
    setReplyTarget(null);
    setSendPulse(true);
    setTimeout(() => setSendPulse(false), 150);
  }, [input, replyTarget, pendingFiles, onSend, onUploadFile]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const MAX_SIZE = 100 * 1024 * 1024;
    const arr = Array.from(files).slice(0, 10);
    const rejected: string[] = [];
    const valid: File[] = [];
    for (const f of arr) {
      if (f.size > MAX_SIZE) {
        rejected.push(`${f.name}: too large (${formatFileSize(f.size)}, max 100 MB)`);
      } else {
        valid.push(f);
      }
    }
    if (rejected.length > 0) {
      setUploadStatus({ uploading: false, current: 0, total: 0, error: rejected.join('\n') });
      setTimeout(() => setUploadStatus(null), 5000);
    }
    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid].slice(0, 10));
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleReply = useCallback((msgId: string) => {
    setReplyTarget(msgId);
    setCtxMenu(null);
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => setReplyTarget(null), []);

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: SpineMessage) => {
    e.preventDefault();
    const menuH = msg.author.id === currentUserId ? 210 : 100;
    const menuW = 160;
    const y = e.clientY + menuH > window.innerHeight ? Math.max(4, e.clientY - menuH) : e.clientY;
    const x = e.clientX + menuW > window.innerWidth ? Math.max(4, e.clientX - menuW) : e.clientX;
    setCtxMenu({ x, y, messageId: msg.id, isOwn: msg.author.id === currentUserId, hasReactions: !!(msg.reactions && msg.reactions.length > 0) });
    setEmojiPickerMsgId(null);
  }, [currentUserId]);

  const handleStartEdit = useCallback((msg: SpineMessage) => {
    setEditingId(msg.id);
    setEditInput(msg.content);
    setCtxMenu(null);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const text = editInput.trim();
    if (text && onEdit) onEdit(editingId, text);
    setEditingId(null);
    setEditInput('');
  }, [editingId, editInput, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditInput('');
  }, []);

  const handleDelete = useCallback((msgId: string) => {
    if (onDelete) onDelete(msgId);
    setCtxMenu(null);
  }, [onDelete]);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(msgId);
      setTimeout(() => setHighlightId(null), 1500);
    }
  }, []);

  const visiblePresence = useMemo(
    () => presence.filter((u) => u.state !== 'idle' && u.id !== currentUserId),
    [presence, currentUserId],
  );

  const replyPreview = replyTarget ? messages.find((m) => m.id === replyTarget) : null;

  // Merge server messages + local mole messages, sorted by timestamp
  const allMessages = useMemo(() => {
    const merged = [...messages, ...moleMessages];
    merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return merged;
  }, [messages, moleMessages]);

  // Build a lookup for reply parents
  const msgMap = useMemo(() => {
    const map = new Map<string, SpineMessage>();
    for (const m of allMessages) map.set(m.id, m);
    return map;
  }, [allMessages]);

  return (
    <div
      className={`data-spine${dragging ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="spine-drop-overlay">
          <div className="spine-drop-label">Drop files to upload</div>
        </div>
      )}
      <div className="chat-feed" ref={feedRef}>
        {loading && allMessages.length === 0 && (
          <div className="burrow-loading">
            <div className="burrow-loading-spinner" />
            <p>Loading messages…</p>
          </div>
        )}
        {allMessages.map((msg, idx) => {
          const isOwn = msg.author.id === currentUserId;
          const isMole = msg.author.id === '__mole__';
          const replyParent = msg.replyTo ? msgMap.get(msg.replyTo) : null;
          const prev = idx > 0 ? allMessages[idx - 1] : null;

          const msgDate = new Date(msg.timestamp);
          const prevDate = prev ? new Date(prev.timestamp) : null;
          const showDayBreak = !prev || (
            prevDate!.getFullYear() !== msgDate.getFullYear()
            || prevDate!.getMonth() !== msgDate.getMonth()
            || prevDate!.getDate() !== msgDate.getDate()
          );

          const grouped = !showDayBreak && prev
            && prev.author.id === msg.author.id
            && !msg.replyTo
            && (new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()) < 300000;

          return (
            <React.Fragment key={msg.id}>
              {showDayBreak && (
                <div className="chat-day-break">
                  <span className="chat-day-break-text">{dayStr(msg.timestamp)}</span>
                </div>
              )}
              <div
              id={`msg-${msg.id}`}
              className={[
                'chat-msg',
                isOwn ? 'own' : '',
                isMole ? 'mole' : '',
                grouped ? 'grouped' : '',
                msg.status || '',
                highlightId === msg.id ? 'highlight' : '',
              ].filter(Boolean).join(' ')}
              onContextMenu={(e) => !isMole && handleContextMenu(e, msg)}
            >
              {/* Reply tag */}
              {replyParent && (
                <button className="chat-reply-tag" onClick={() => scrollToMessage(replyParent.id)}>
                  <span className="chat-reply-tag-icon">↩</span>
                  <span className="chat-reply-tag-user" style={{ color: userColor(replyParent.author.id) }}>
                    @{replyParent.author.username}
                  </span>
                  <span className="chat-reply-tag-text">{replyParent.content.slice(0, 60)}</span>
                </button>
              )}

              {/* Avatar + bubble */}
              <div className="chat-msg-body">
                {!grouped && (
                  <span
                    className={`chat-avatar${isOwn ? ' own' : ''}${isMole ? ' mole' : ''}${onMemberClick && !isMole ? ' clickable' : ''}`}
                    style={{ background: isMole ? 'var(--violet)' : isOwn ? 'var(--amber)' : userColor(msg.author.id) }}
                    onClick={() => {
                      if (isMole || !onMemberClick) return;
                      const member = members.find(m => m.user_id === msg.author.id);
                      if (member) onMemberClick({ user_id: member.user_id, username: member.username, nickname: member.nickname });
                    }}
                  >
                    {isMole ? '⛏' : userInitial(msg.author.username)}
                  </span>
                )}
                {grouped && <span className="chat-avatar-spacer" />}
                <div className={`chat-bubble-wrap${isOwn ? ' own' : ''}`}>
                  <div className={`chat-bubble${isOwn ? ' own' : ''}${isMole ? ' mole' : ''}${grouped ? ' grouped' : ''}`}>
                    {!grouped && (
                      <div className="chat-bubble-meta">
                        <span
                          className={`chat-author${onMemberClick && !isMole ? ' clickable' : ''}`}
                          style={{ color: isMole ? 'var(--violet)' : isOwn ? 'var(--amber)' : userColor(msg.author.id) }}
                          onClick={() => {
                            if (isMole || !onMemberClick) return;
                            const member = members.find(m => m.user_id === msg.author.id);
                            if (member) onMemberClick({ user_id: member.user_id, username: member.username, nickname: member.nickname });
                          }}
                        >
                          {msg.author.display_name || msg.author.username}
                        </span>
                        {isMole && <span className="chat-mole-badge">MOLE</span>}
                        <span className="chat-time">{timeStr(msg.timestamp)}</span>
                        {isMole && <span className="chat-ephemeral-tag">only you can see this</span>}
                        {isMole && <button className="chat-dismiss-btn" onClick={() => setMoleMessages(prev => prev.filter(m => m.id !== msg.id))} title="Dismiss">×</button>}
                      </div>
                    )}
                    {editingId === msg.id ? (
                      <form className="chat-edit-form" onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
                        <input
                          ref={editRef}
                          className="chat-edit-input"
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Escape') handleCancelEdit(); }}
                        />
                        <div className="chat-edit-actions">
                          <button type="submit" className="chat-edit-save">save</button>
                          <button type="button" className="chat-edit-cancel" onClick={handleCancelEdit}>cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className={`chat-bubble-content${isEmojiOnly(msg.content) ? ' jumbo-emoji' : ''}`}>
                        {renderMessageContent(msg.content)}
                        {msg.edited_at && <span className="chat-edited" title={new Date(msg.edited_at).toLocaleString()}>(edited)</span>}
                      </div>
                    )}
                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="chat-attachments">
                        {msg.attachments.map((att, i) => {
                          const ct = att.content_type || '';
                          const isImage = ct.startsWith('image/');
                          const isVideo = ct.startsWith('video/');
                          const isAudio = ct.startsWith('audio/');
                          const isPdf = ct === 'application/pdf' || att.filename?.endsWith('.pdf');
                          const isText = ct.startsWith('text/') || att.filename?.endsWith('.log') || att.filename?.endsWith('.txt');
                          const codeLang = getCodeLang(att.filename || '');
                          const isCode = !!codeLang && !isPdf;
                          const isDoc = att.filename?.endsWith('.docx') || att.filename?.endsWith('.doc') || att.filename?.endsWith('.rtf') || att.filename?.endsWith('.odt') || ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ct === 'application/msword' || ct === 'application/rtf';
                          const isDb = att.filename?.endsWith('.db') || att.filename?.endsWith('.sqlite') || att.filename?.endsWith('.sqlite3');
                          const scanPending = att.scan_status === 'pending' || att.scan_status === 'scanning';
                          const scanFlagged = att.scan_status === 'flagged' || att.scan_status === 'rejected';

                          // Flagged files: show blocked notice
                          if (scanFlagged) {
                            return (
                              <div key={i} className="chat-attachment-blocked">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                <span>File removed — flagged by safety scan</span>
                              </div>
                            );
                          }

                          // Scanning placeholder
                          if (scanPending) {
                            return (
                              <div key={i} className="chat-attachment-scanning">
                                <div className="scan-spinner" />
                                <div className="scan-info">
                                  <span className="scan-filename">{att.filename}</span>
                                  <span className="scan-label">Scanning...</span>
                                </div>
                              </div>
                            );
                          }

                          // Image
                          if (isImage) {
                            return (
                              <button key={i} className="chat-attachment-image" onClick={() => setLightbox({ att, msg })}>
                                <img src={att.url} alt={att.filename} loading="lazy" />
                              </button>
                            );
                          }

                          // Video
                          if (isVideo) {
                            return (
                              <div key={i} className="chat-attachment-video" onClick={() => setLightbox({ att, msg })}>
                                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                <video controls preload="metadata" src={att.url} onClick={(e) => e.stopPropagation()} />
                                <div className="chat-attachment-video-meta">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Audio
                          if (isAudio) {
                            return (
                              <div key={i} className="chat-attachment-audio" onClick={() => setLightbox({ att, msg })}>
                                <div className="audio-info">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                <audio controls preload="metadata" src={att.url} onClick={(e) => e.stopPropagation()} />
                              </div>
                            );
                          }

                          // PDF
                          if (isPdf) {
                            return (
                              <div key={i} className="chat-attachment-pdf" onClick={() => setLightbox({ att, msg })}>
                                <div className="pdf-icon">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                  <span className="pdf-badge">PDF</span>
                                </div>
                                <div className="pdf-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Code files
                          if (isCode) {
                            return (
                              <div key={i} className="chat-attachment-code" onClick={() => setLightbox({ att, msg })}>
                                <div className="code-icon">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                  <span className="code-badge">{getFileExt(att.filename || '')}</span>
                                </div>
                                <div className="code-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Text / Log files
                          if (isText) {
                            return (
                              <div key={i} className="chat-attachment-text" onClick={() => setLightbox({ att, msg })}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                <div className="text-file-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Database files (.db, .sqlite, .sqlite3)
                          if (isDb) {
                            return (
                              <div key={i} className="chat-attachment-db" onClick={() => setLightbox({ att, msg })}>
                                <div className="db-icon">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                                  <span className="db-badge">DB</span>
                                </div>
                                <div className="db-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Document files (.docx, .doc, .rtf, .odt)
                          if (isDoc) {
                            return (
                              <div key={i} className="chat-attachment-doc" onClick={() => setLightbox({ att, msg })}>
                                <div className="doc-icon">
                                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                  <span className="doc-badge">DOC</span>
                                </div>
                                <div className="doc-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                            );
                          }

                          // Generic file card with metadata
                          return (
                            <div key={i} className="chat-attachment-generic">
                              <div className="generic-file-header">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <div className="generic-file-info">
                                  <span className="chat-attachment-name">{att.filename}</span>
                                  <span className="chat-attachment-size">{formatFileSize(att.size)}</span>
                                </div>
                              </div>
                              <div className="generic-file-meta">
                                <span className="generic-meta-item">Type: {ct || 'unknown'}</span>
                                {att.virus_result && <span className="generic-meta-item">Scan: {att.virus_result === 'clean' ? '✓ Clean' : att.virus_result}</span>}
                                {att.expires_at && <span className="generic-meta-item">Expires: {new Date(att.expires_at).toLocaleDateString()}</span>}
                              </div>
                              <a className="generic-file-download" href={att.url} target="_blank" rel="noopener noreferrer">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Download
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {msg.status === 'failed' && <span className="chat-failed">send failed</span>}

                    {/* Add reaction trigger — floats at top-right of bubble on hover */}
                    {!isMole && (
                      <button
                        className="chat-emoji-trigger"
                        onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id); setReactionFullPickerMsgId(null); }}
                        title="Add reaction"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                          <line x1="9" y1="9" x2="9.01" y2="9" />
                          <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Reactions row — pills below bubble */}
                  {msg.reactions && msg.reactions.length > 0 && (() => {
                    const visible = msg.reactions.slice(0, MAX_VISIBLE_REACTIONS);
                    const overflow = msg.reactions.length - MAX_VISIBLE_REACTIONS;
                    return (
                      <div className="chat-reactions">
                        {visible.map((r) => (
                          <button
                            key={r.emoji}
                            className={`chat-reaction-chip${r.userIds.includes(currentUserId) ? ' mine' : ''}`}
                            onClick={() => onReact?.(msg.id, r.emoji)}
                            title={r.userIds.map((id) => getMemberName(id)).join(', ')}
                          >
                            {renderEmoji(r.emoji, 18)}<span className="chat-reaction-count">{r.userIds.length}</span>
                          </button>
                        ))}
                        {overflow > 0 && (
                          <button
                            className="chat-reaction-overflow"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionsDetailMsgId(msg.id);
                            }}
                          >
                            +{overflow}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Reaction recent popup */}
                  {emojiPickerMsgId === msg.id && (
                    <div className="chat-reaction-popup" onClick={(e) => e.stopPropagation()}>
                      <div className="chat-reaction-quick">
                        {(() => {
                          const recent = getRecentEmojis().slice(0, 6);
                          const emojis = recent.length >= 3 ? recent : QUICK_REACT;
                          return emojis.map((em) => (
                            <button
                              key={em}
                              className="chat-reaction-quick-btn"
                              onClick={() => { addRecentEmoji(em); onReact?.(msg.id, em); setEmojiPickerMsgId(null); }}
                            >
                              {renderEmoji(em, 22)}
                            </button>
                          ));
                        })()}
                      </div>
                      <button
                        className="chat-reaction-show-all"
                        onClick={(e) => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          const pickerH = 390;
                          const pickerW = 340;
                          let top: number;
                          let left = rect.left;
                          let above = true;
                          if (rect.top - pickerH < 8) {
                            top = rect.bottom + 8;
                            above = false;
                          } else {
                            top = rect.top - pickerH;
                            above = true;
                          }
                          if (left + pickerW > window.innerWidth - 8) {
                            left = window.innerWidth - pickerW - 8;
                          }
                          if (left < 8) left = 8;
                          setFullPickerAnchor({ top, left, above });
                          setReactionFullPickerMsgId(msg.id);
                          setEmojiPickerMsgId(null);
                        }}
                      >
                        Show All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </React.Fragment>
          );
        })}
        <div className="chat-end" />
      </div>

      {/* Full emoji picker for reactions — rendered outside chat-feed to avoid overflow clipping */}
      {reactionFullPickerMsgId && fullPickerAnchor && (
        <div className="emoji-picker-portal" style={{ position: 'fixed', top: fullPickerAnchor.top, left: fullPickerAnchor.left, zIndex: 50 }}>
          <EmojiPicker
            animatedEmojis={animatedEmojis}
            onSelect={(emoji) => { onReact?.(reactionFullPickerMsgId, emoji); setReactionFullPickerMsgId(null); setFullPickerAnchor(null); }}
            onClose={() => { setReactionFullPickerMsgId(null); setFullPickerAnchor(null); }}
          />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div className="chat-context-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="chat-ctx-item" onClick={() => handleReply(ctxMenu.messageId)}>
            <svg className="ctx-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 11c0-3.3-2.7-6-6-6H3" /><path d="M6 2 2 5l4 3" /></svg>
            <span>Reply</span>
          </button>
          <button className="chat-ctx-item" onClick={() => { navigator.clipboard.writeText(msgMap.get(ctxMenu.messageId)?.content || ''); setCtxMenu(null); }}>
            <svg className="ctx-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M5 11H3.5A1.5 1.5 0 0 1 2 9.5v-7A1.5 1.5 0 0 1 3.5 1h7A1.5 1.5 0 0 1 12 2.5V5" /></svg>
            <span>Copy</span>
          </button>
          {ctxMenu.hasReactions && (
            <button className="chat-ctx-item" onClick={() => {
              setReactionsDetailMsgId(ctxMenu.messageId);
              setCtxMenu(null);
            }}>
              <svg className="ctx-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5" /><path d="M5.5 9.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5" /><circle cx="6" cy="6.5" r="0.5" fill="currentColor" /><circle cx="10" cy="6.5" r="0.5" fill="currentColor" /></svg>
              <span>Reactions</span>
            </button>
          )}
          {ctxMenu.isOwn && (
            <>
              <div className="chat-ctx-divider" />
              <button className="chat-ctx-item" onClick={() => { const m = msgMap.get(ctxMenu.messageId); if (m) handleStartEdit(m); }}>
                <svg className="ctx-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 1.5 14.5 4.5 5 14H2v-3z" /><path d="M9.5 3.5l3 3" /></svg>
                <span>Edit</span>
              </button>
              <button className="chat-ctx-item danger" onClick={() => handleDelete(ctxMenu.messageId)}>
                <svg className="ctx-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12" /><path d="M5 4V2.5A1.5 1.5 0 0 1 6.5 1h3A1.5 1.5 0 0 1 11 2.5V4" /><path d="M3.5 4l.7 9.1a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4L12.5 4" /></svg>
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Reactions detail popup — shows all reactions + who reacted */}
      {reactionsDetailMsgId && (() => {
        const detailMsg = msgMap.get(reactionsDetailMsgId);
        if (!detailMsg?.reactions?.length) return null;
        return (
          <div
            className="reactions-detail-overlay"
            onClick={() => setReactionsDetailMsgId(null)}
          >
            <div
              className="reactions-detail-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="reactions-detail-header">
                <span>Reactions</span>
                <button className="reactions-detail-close" onClick={() => setReactionsDetailMsgId(null)}>×</button>
              </div>
              <div className="reactions-detail-list">
                {detailMsg.reactions.map((r) => (
                  <div key={r.emoji} className="reactions-detail-row">
                    <div className="reactions-detail-emoji">
                      {renderEmoji(r.emoji, 22)}
                      <span className="reactions-detail-count">{r.userIds.length}</span>
                    </div>
                    <div className="reactions-detail-users">
                      {r.userIds.map((uid) => (
                        <div key={uid} className="reactions-detail-user">
                          <span className="reactions-detail-avatar" style={{ background: userColor(uid) }}>{userInitial(memberMap.get(uid)?.username || getMemberName(uid))}</span>
                          <span className="reactions-detail-name">{getMemberName(uid)}</span>
                          {uid === currentUserId && <span className="reactions-detail-you">you</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Input area */}
      <div className="spine-input-wrap">
        {visiblePresence.length > 0 && (
          <div className="spine-presence-bar">
            {visiblePresence.map((u) => (
              <div
                key={u.id}
                className={`spine-orb ${u.state}`}
                style={{ '--orb-color': userColor(u.id) } as React.CSSProperties}
                title={`${u.username} — ${u.state}`}
              >
                {userInitial(u.username)}
              </div>
            ))}
          </div>
        )}
        {replyPreview && (
          <div className="spine-reply-bar">
            <span className="spine-reply-indicator" />
            <span className="spine-reply-label">↩ <strong>{replyPreview.author.username}</strong></span>
            <span className="spine-reply-preview">{replyPreview.content.slice(0, 80)}</span>
            <button className="spine-reply-cancel" onClick={cancelReply}>✕</button>
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="spine-file-preview">
            {pendingFiles.map((f, i) => {
              const isImage = f.type.startsWith('image/');
              return (
                <div key={i} className="spine-file-item">
                  {isImage ? (
                    <img src={URL.createObjectURL(f)} alt={f.name} className="spine-file-thumb" />
                  ) : (
                    <div className="spine-file-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                  )}
                  <span className="spine-file-name">{f.name}</span>
                  <span className="spine-file-size">{formatFileSize(f.size)}</span>
                  <button type="button" className="spine-file-remove" onClick={() => removeFile(i)} title="Remove">✕</button>
                </div>
              );
            })}
          </div>
        )}
        {uploadStatus && (
          <div className={`spine-upload-status${uploadStatus.error ? ' error' : ''}`}>
            {uploadStatus.uploading ? (
              <>
                <div className="spine-upload-bar">
                  <div className="spine-upload-bar-fill" style={{ width: `${(uploadStatus.current / uploadStatus.total) * 100}%` }} />
                </div>
                <span className="spine-upload-text">Uploading {uploadStatus.current}/{uploadStatus.total}...</span>
              </>
            ) : uploadStatus.error ? (
              <span className="spine-upload-text">{uploadStatus.error}</span>
            ) : null}
          </div>
        )}
        <form className="spine-terminal" onSubmit={handleSubmit}>
          <span className="spine-terminal-prompt">&gt;</span>
          <input
            ref={inputRef}
            className="spine-terminal-input"
            type="text"
            placeholder={activeChannel ? `transmit → #${activeChannel.name}` : 'no tunnel selected'}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              const cursor = e.target.selectionStart ?? val.length;
              // Find the last unmatched @ before cursor
              const before = val.slice(0, cursor);
              const atIdx = before.lastIndexOf('@');
              if (atIdx !== -1 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
                const q = before.slice(atIdx + 1);
                if (!/\s/.test(q)) {
                  mentionStart.current = atIdx;
                  setMentionQuery(q);
                  setMentionIndex(0);
                  return;
                }
              }
              setMentionQuery(null);
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && mentionMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (e.key === 'Tab' || e.key === 'Enter') {
                  e.preventDefault();
                  const m = mentionMatches[mentionIndex];
                  const before = input.slice(0, mentionStart.current);
                  const after = input.slice((inputRef.current?.selectionStart ?? input.length));
                  setInput(before + '@' + m.username + ' ' + after);
                  setMentionQuery(null);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionQuery(null);
                  return;
                }
              }
            }}
            disabled={!activeChannel}
            autoFocus
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
          />
          <div className="spine-terminal-actions">
            <button
              className="spine-terminal-attach"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
              disabled={!activeChannel}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              ref={inputEmojiAnchorRef}
              className="spine-terminal-emoji"
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setInputEmojiOpen(!inputEmojiOpen)}
              title="Emoji"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            <button
              className={`spine-terminal-send${sendPulse ? ' pulse' : ''}`}
              type="submit"
              disabled={(!input.trim() && pendingFiles.length === 0) || !activeChannel}
              title="Send"
            >
              <svg className="send-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.5 1.5l11 6.5-11 6.5V9l7-1-7-1z" />
              </svg>
            </button>
          </div>
        </form>
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="mention-autocomplete">
            {mentionMatches.map((m, i) => {
              const label = m.nickname || m.display_name || m.username;
              return (
                <button
                  key={m.user_id}
                  className={`mention-autocomplete-item${i === mentionIndex ? ' active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const before = input.slice(0, mentionStart.current);
                    const after = input.slice((inputRef.current?.selectionStart ?? input.length));
                    setInput(before + '@' + m.username + ' ' + after);
                    setMentionQuery(null);
                    inputRef.current?.focus();
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span className="mention-autocomplete-avatar" style={{ background: userColor(m.user_id) }}>
                    {(m.display_name || m.username).charAt(0).toUpperCase()}
                  </span>
                  <span className="mention-autocomplete-info">
                    <span className="mention-autocomplete-name">{label}</span>
                    {label !== m.username && <span className="mention-autocomplete-username">@{m.username}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {inputEmojiOpen && (
          <div className="input-emoji-picker-wrap">
            <EmojiPicker
              animatedEmojis={animatedEmojis}
              onSelect={(emoji) => {
                setInput((prev) => prev + emoji);
                setInputEmojiOpen(false);
                inputRef.current?.focus();
              }}
              onClose={() => setInputEmojiOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)} onKeyDown={(e) => { if (e.key === 'Escape') setLightbox(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
          <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)} title="Close">×</button>
            <div className="lightbox-image-wrap">
              {(lightbox.att.content_type || '').startsWith('video/') ? (
                <div className="lightbox-video-wrap">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video controls preload="metadata" src={lightbox.att.url} />
                </div>
              ) : (lightbox.att.content_type || '').startsWith('audio/') ? (
                <div className="lightbox-audio-wrap">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls preload="metadata" src={lightbox.att.url} style={{ width: '100%', maxWidth: 400 }} />
                </div>
              ) : (lightbox.att.content_type === 'application/pdf' || lightbox.att.filename?.endsWith('.pdf')) ? (
                <div className="lightbox-pdf-wrap">
                  <iframe src={lightbox.att.url} title={lightbox.att.filename} />
                </div>
              ) : getCodeLang(lightbox.att.filename || '') ? (
                <div className="lightbox-code-wrap">
                  {lightboxTextLoading ? (
                    <div className="lightbox-text-loading">Loading...</div>
                  ) : (
                    <div className="lightbox-code-content">
                      <div className="code-line-nums">{(lightboxText || '').split('\n').map((_, li) => <div key={li}>{li + 1}</div>)}</div>
                      <pre><code className={`hljs language-${getCodeLang(lightbox.att.filename || '')}`} dangerouslySetInnerHTML={{ __html: hljs.highlight(lightboxText || '', { language: getCodeLang(lightbox.att.filename || '') || '' }).value }} /></pre>
                    </div>
                  )}
                </div>
              ) : ((lightbox.att.content_type || '').startsWith('text/') || lightbox.att.filename?.endsWith('.log') || lightbox.att.filename?.endsWith('.txt')) ? (
                <div className="lightbox-text-wrap">
                  {lightboxTextLoading ? (
                    <div className="lightbox-text-loading">Loading...</div>
                  ) : lightbox.att.filename?.endsWith('.log') ? (
                    <div className="lightbox-log-content">
                      {(lightboxText || '').split('\n').map((line, li) => {
                        let cls = 'log-line';
                        const upper = line.toUpperCase();
                        if (upper.includes('FATAL') || upper.includes('CRITICAL') || upper.includes('PANIC')) cls += ' log-fatal';
                        else if (upper.includes('ERROR') || upper.includes('ERR]') || upper.includes('FAIL')) cls += ' log-error';
                        else if (upper.includes('WARN') || upper.includes('WARNING')) cls += ' log-warn';
                        else if (upper.includes('INFO')) cls += ' log-info';
                        else if (upper.includes('DEBUG') || upper.includes('TRACE') || upper.includes('VERBOSE')) cls += ' log-debug';
                        return <div key={li} className={cls}><span className="log-line-num">{li + 1}</span>{line}</div>;
                      })}
                    </div>
                  ) : (
                    <pre className="lightbox-text-content">{lightboxText}</pre>
                  )}
                </div>
              ) : (lightbox.att.filename?.endsWith('.db') || lightbox.att.filename?.endsWith('.sqlite') || lightbox.att.filename?.endsWith('.sqlite3')) ? (
                <div className="lightbox-db-wrap">
                  {lightboxDbLoading ? (
                    <div className="lightbox-text-loading">Loading database...</div>
                  ) : lightboxDbError ? (
                    <div className="lightbox-text-loading">{lightboxDbError}</div>
                  ) : (
                    <>
                      <div className="db-toolbar">
                        <label>Table:</label>
                        <select value={lightboxDbTable} onChange={e => setLightboxDbTable(e.target.value)}>
                          {lightboxDbTables.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span className="db-row-count">{lightboxDbRows.length}{lightboxDbRows.length === 200 ? '+' : ''} rows</span>
                      </div>
                      <div className="db-table-scroll">
                        <table className="db-table">
                          <thead>
                            <tr>{lightboxDbCols.map(c => <th key={c}>{c}</th>)}</tr>
                          </thead>
                          <tbody>
                            {lightboxDbRows.map((row, ri) => (
                              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell === null ? <span className="db-null">NULL</span> : String(cell)}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : (lightbox.att.filename?.endsWith('.docx') || lightbox.att.filename?.endsWith('.doc') || lightbox.att.filename?.endsWith('.rtf') || lightbox.att.filename?.endsWith('.odt')) ? (
                <div className="lightbox-doc-wrap">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <span className="lightbox-doc-label">Document preview not available</span>
                  <a className="lightbox-doc-download" href={lightbox.att.url} target="_blank" rel="noopener noreferrer">Download to view</a>
                </div>
              ) : (
                <img src={lightbox.att.url} alt={lightbox.att.filename} />
              )}
            </div>
            <div className="lightbox-meta">
              <div className="lightbox-meta-row">
                <span className="lightbox-meta-label">Sent by</span>
                <span className="lightbox-meta-value">{getMemberName(lightbox.msg.author.id)}</span>
                {getMemberName(lightbox.msg.author.id) !== lightbox.msg.author.username && (
                  <span className="lightbox-meta-muted">@{lightbox.msg.author.username}</span>
                )}
              </div>
              <div className="lightbox-meta-row">
                <span className="lightbox-meta-label">File</span>
                <span className="lightbox-meta-value">{lightbox.att.filename}</span>
              </div>
              <div className="lightbox-meta-row">
                <span className="lightbox-meta-label">Size</span>
                <span className="lightbox-meta-value">{formatFileSize(lightbox.att.size)}</span>
              </div>
              <div className="lightbox-meta-row">
                <span className="lightbox-meta-label">Type</span>
                <span className="lightbox-meta-value">{lightbox.att.mime_verified || lightbox.att.content_type}</span>
              </div>
              <div className="lightbox-meta-row">
                <span className="lightbox-meta-label">Date</span>
                <span className="lightbox-meta-value">{new Date(lightbox.msg.timestamp).toLocaleString()}</span>
              </div>
              {lightbox.att.scan_status && (
                <div className="lightbox-meta-row">
                  <span className="lightbox-meta-label">Safety Scan</span>
                  <span className={`lightbox-meta-value scan-badge scan-${lightbox.att.scan_status}`}>
                    {lightbox.att.scan_status === 'clean' ? '✓ Clean' : lightbox.att.scan_status === 'pending' || lightbox.att.scan_status === 'scanning' ? '⏳ Scanning...' : lightbox.att.scan_status}
                  </span>
                </div>
              )}
              {lightbox.att.virus_result && (
                <div className="lightbox-meta-row">
                  <span className="lightbox-meta-label">Virus Scan</span>
                  <span className={`lightbox-meta-value scan-badge ${lightbox.att.virus_result === 'clean' ? 'scan-clean' : 'scan-flagged'}`}>
                    {lightbox.att.virus_result === 'clean' ? '✓ Clean' : lightbox.att.virus_result}
                  </span>
                </div>
              )}
              {lightbox.att.expires_at && (
                <div className="lightbox-meta-row">
                  <span className="lightbox-meta-label">Expires</span>
                  <span className="lightbox-meta-value">{new Date(lightbox.att.expires_at).toLocaleDateString()}</span>
                </div>
              )}
              <a className="lightbox-open-btn" href={lightbox.att.url} target="_blank" rel="noopener noreferrer">Open Original</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
