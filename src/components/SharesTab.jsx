import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import UserAvatar from './UserAvatar';
import { formatIstanbulDateTime } from '../lib/dateUtils';
import {
  Plus,
  ExternalLink,
  Trash2,
  X,
  Loader2,
  Bookmark,
  CheckCircle,
  Heart,
  Film,
  Tv,
  PlayCircle,
} from 'lucide-react';

const KINDS = [
  { id: 'all', label: 'Tümü', icon: null },
  { id: 'film', label: 'Film', icon: Film },
  { id: 'dizi', label: 'Dizi', icon: Tv },
  { id: 'video', label: 'Video', icon: PlayCircle },
];

const REACTIONS = [
  { id: 'want', label: 'İzlerim', icon: Bookmark },
  { id: 'watched', label: 'İzledim', icon: CheckCircle },
  { id: 'liked', label: 'Beğendim', icon: Heart },
];

export default function SharesTab({ groupId, userId, isAdmin, membersMap }) {
  const [shares, setShares] = useState([]);
  const [kindFilter, setKindFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [kind, setKind] = useState('film');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchShares = useCallback(async () => {
    const { data, error } = await supabase
      .from('shares')
      .select(`
        *,
        share_reactions (share_id, user_id, reaction)
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setShares(
        data.map((s) => ({
          ...s,
          share_reactions: s.share_reactions || [],
        }))
      );
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchShares();

    const channel = supabase
      .channel(`shares-room-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shares',
          filter: `group_id=eq.${groupId}`,
        },
        () => fetchShares()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'share_reactions' },
        () => fetchShares()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchShares]);

  async function handleCreateShare(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    try {
      let cleanUrl = url.trim();
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }

      const { error } = await supabase.from('shares').insert({
        group_id: groupId,
        author_id: userId,
        kind,
        title: title.trim(),
        url: cleanUrl || null,
        note: note.trim() || null,
      });

      if (error) throw error;

      setTitle('');
      setUrl('');
      setNote('');
      setShowCreate(false);
      await fetchShares();
    } catch (err) {
      alert(err.message || 'Öneri paylaşılamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleReaction(share, reactionType) {
    const exists = share.share_reactions.some(
      (r) => r.user_id === userId && r.reaction === reactionType
    );

    if (exists) {
      await supabase
        .from('share_reactions')
        .delete()
        .eq('share_id', share.id)
        .eq('user_id', userId)
        .eq('reaction', reactionType);
    } else {
      await supabase.from('share_reactions').insert({
        share_id: share.id,
        user_id: userId,
        reaction: reactionType,
      });
    }
    await fetchShares();
  }

  async function handleDeleteShare(shareId) {
    if (!window.confirm('Bu paylaşımı silmek istiyor musun?')) return;
    await supabase.from('shares').delete().eq('id', shareId);
    await fetchShares();
  }

  const filtered =
    kindFilter === 'all' ? shares : shares.filter((s) => s.kind === kindFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const active = kindFilter === k.id;
            return (
              <button
                key={k.id}
                onClick={() => setKindFilter(k.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{k.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 shrink-0 active:scale-95 transition"
        >
          <Plus className="w-4 h-4" />
          Öner
        </button>
      </div>

      {showCreate && (
        <div className="bg-white border border-emerald-200 rounded-3xl p-5 shadow-lg space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              Film / Dizi / Video Öner
            </h3>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-
