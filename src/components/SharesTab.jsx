import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
} from 'lucide-react';

const KINDS = [
  { id: 'all', label: 'Tümü' },
  { id: 'film', label: '🎬 Film' },
  { id: 'dizi', label: '📺 Dizi' },
  { id: 'video', label: '▶️ Video' },
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
        { event: '*', schema: 'public', table: 'shares', filter: `group_id=eq.${groupId}` },
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
        <div className="flex gap-1 overflow-x-auto">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKindFilter(k.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                kindFilter === k.id
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Öner
        </button>
      </div>

      {showCreate && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Film / Dizi / Video Öner</h3>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateShare} className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'film', label: '🎬 Film' },
                { id: 'dizi', label: '📺 Dizi' },
                { id: 'video', label: '▶️ Video' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`py-2 rounded-xl text-xs font-medium border transition ${
                    kind === item.id
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Adı (Örn: Severance, Interstellar, Maç Özeti...)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Link (YouTube, IMDb vb. - isteğe bağlı)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />

            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kısa yorumun / neden izlenmeli? (isteğe bağlı)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gruba Öner'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-400">
            Henüz öneri paylaşılmamış. İlk film, dizi veya videoyu sen öner!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const author = membersMap[item.author_id];
            const canDelete = item.author_id === userId || isAdmin;
            const badge =
              item.kind === 'film'
                ? '🎬 Film'
                : item.kind === 'dizi'
                ? '📺 Dizi'
                : '▶️ Video';

            return (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-medium">
                        {badge}
                      </span>
                      <span>
                        {author ? `${author.avatar} ${author.nickname}` : 'Üye'}
                      </span>
                      <span>•</span>
                      <span>{formatIstanbulDateTime(item.created_at)}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                  </div>

                  {canDelete && (
                    <button
                      onClick={() => handleDeleteShare(item.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {item.note && (
                  <p className="text-xs text-slate-300 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                    {item.note}
                  </p>
                )}

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Bağlantıyı Aç
                  </a>
                )}

                {/* Tepki Butonları */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {REACTIONS.map((r) => {
                    const Icon = r.icon;
                    const count = item.share_reactions.filter(
                      (sr) => sr.reaction === r.id
                    ).length;
                    const active = item.share_reactions.some(
                      (sr) => sr.user_id === userId && sr.reaction === r.id
                    );

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleReaction(item, r.id)}
                        className={`py-2 px-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{r.label}</span>
                        {count > 0 && (
                          <span className="text-[11px] font-bold">({count})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
