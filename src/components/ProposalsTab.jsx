import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import UserAvatar from './UserAvatar';
import { formatIstanbulDateTime } from '../lib/dateUtils';
import {
  Plus,
  CheckCircle2,
  Clock,
  Lock,
  Scale,
  Trash2,
  X,
  Loader2,
  Award,
} from 'lucide-react';

const CATEGORIES = ['Yemek', 'Buluşma', 'Etkinlik', 'Oyun', 'Diğer'];
const DURATION_OPTIONS = [
  { label: 'Süresiz (Ben kapatana kadar)', hours: null },
  { label: '1 Saat', hours: 1 },
  { label: '3 Saat', hours: 3 },
  { label: '6 Saat', hours: 6 },
  { label: '12 Saat', hours: 12 },
  { label: '24 Saat', hours: 24 },
];

export default function ProposalsTab({ groupId, userId, isAdmin, membersMap }) {
  const [proposals, setProposals] = useState([]);
  const [filter, setFilter] = useState('active'); // 'active' | 'closed'
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Yeni öneri form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Buluşma');
  const [durationHours, setDurationHours] = useState(null);
  const [options, setOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchProposals = useCallback(async () => {
    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        proposal_options (id, label, position),
        votes (proposal_id, option_id, user_id)
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const normalized = data.map((p) => ({
        ...p,
        proposal_options: [...(p.proposal_options || [])].sort(
          (a, b) => a.position - b.position
        ),
        votes: p.votes || [],
      }));
      setProposals(normalized);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchProposals();

    const channel = supabase
      .channel(`proposals-room-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposals',
          filter: `group_id=eq.${groupId}`,
        },
        () => fetchProposals()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes' },
        () => fetchProposals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchProposals]);

  async function handleCreateProposal(e) {
    e.preventDefault();
    setFormError('');

    const cleanTitle = title.trim();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!cleanTitle) {
      setFormError('Lütfen öneri başlığını yaz.');
      return;
    }
    if (cleanOptions.length < 2) {
      setFormError('En az 2 seçenek girmelisin.');
      return;
    }

    setSubmitting(true);
    try {
      const closesAt = durationHours
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : null;

      const { data: prop, error: propErr } = await supabase
        .from('proposals')
        .insert({
          group_id: groupId,
          author_id: userId,
          title: cleanTitle,
          description: description.trim() || null,
          category,
          closes_at: closesAt,
        })
        .select()
        .single();

      if (propErr) throw propErr;

      const optionRows = cleanOptions.map((label, idx) => ({
        proposal_id: prop.id,
        label,
        position: idx,
      }));

      const { error: optErr } = await supabase
        .from('proposal_options')
        .insert(optionRows);

      if (optErr) throw optErr;

      setTitle('');
      setDescription('');
      setCategory('Buluşma');
      setDurationHours(null);
      setOptions(['', '']);
      setShowCreate(false);
      await fetchProposals();
    } catch (err) {
      setFormError(err.message || 'Öneri oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(proposal, optionId) {
    const isExpired =
      proposal.closes_at && new Date(proposal.closes_at) <= new Date();
    if (proposal.status !== 'open' || isExpired) return;

    const myExistingVote = proposal.votes.find((v) => v.user_id === userId);
    setActionLoadingId(proposal.id);

    try {
      if (myExistingVote?.option_id === optionId) {
        await supabase
          .from('votes')
          .delete()
          .eq('proposal_id', proposal.id)
          .eq('user_id', userId);
      } else {
        await supabase.from('votes').upsert(
          {
            proposal_id: proposal.id,
            option_id: optionId,
            user_id: userId,
          },
          { onConflict: 'proposal_id,user_id' }
        );
      }
      await fetchProposals();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCloseProposal(proposalId) {
    setActionLoadingId(proposalId);
    try {
      const { error } = await supabase.rpc('close_proposal', { p_id: proposalId });
      if (error) alert(error.message);
      await fetchProposals();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDecideTie(proposalId, optionId) {
    setActionLoadingId(proposalId);
    try {
      const { error } = await supabase.rpc('decide_proposal', {
        p_id: proposalId,
        p_option: optionId,
      });
      if (error) alert(error.message);
      await fetchProposals();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteProposal(proposalId) {
    if (!window.confirm('Bu öneriyi silmek istediğine emin misin?')) return;
    await supabase.from('proposals').delete().eq('id', proposalId);
    await fetchProposals();
  }

  const visibleProposals = proposals.filter((p) =>
    filter === 'active'
      ? p.status === 'open' || p.status === 'tied'
      : p.status === 'decided' || p.status === 'cancelled'
  );

  return (
    <div className="space-y-4">
      {/* Üst Bar: Filtre + Yeni Öneri */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex bg-white border border-slate-200/80 p-1 rounded-2xl shadow-sm">
          <button
            onClick={() => setFilter('active')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              filter === 'active'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Açık Oylamalar
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              filter === 'closed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Sonuçlananlar
          </button>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Yeni Öneri
        </button>
      </div>

      {/* Yeni Öneri Formu */}
      {showCreate && (
        <div className="bg-white border border-emerald-200 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              Yeni Oylama Başlat
            </h3>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateProposal} className="space-y-3.5">
            <div>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Soru / Başlık (Örn: Cumartesi akşamı ne yapıyoruz?)"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
              />
            </div>

            <div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kısa açıklama (isteğe bağlı)"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                    category === cat
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-600">
                Seçenekler
              </label>
              {options.map((opt, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[index] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Seçenek ${index + 1}`}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((_, i) => i !== index))}
                      className="p-2 text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {options.length < 8 && (
                <button
                  type="button"
                  onClick={() => setOptions([...options, ''])}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Seçenek Ekle
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Oylama Süresi
              </label>
              <select
                value={durationHours ?? ''}
                onChange={(e) =>
                  setDurationHours(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.label} value={d.hours ?? ''}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-600">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 transition active:scale-[0.98]"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Oylamayı Paylaş'
              )}
            </button>
          </form>
        </div>
      )}

      {/* Öneri Kartları */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : visibleProposals.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            {filter === 'active'
              ? 'Şu an açık oylama yok. İlk öneriyi sen başlat!'
              : 'Henüz sonuçlanmış bir oylama bulunmuyor.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {visibleProposals.map((proposal) => {
            const author = membersMap[proposal.author_id];
            const totalVotes = proposal.votes.length;
            const myVote =
