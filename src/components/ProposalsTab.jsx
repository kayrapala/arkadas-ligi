import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
        { event: '*', schema: 'public', table: 'proposals', filter: `group_id=eq.${groupId}` },
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
    const isExpired = proposal.closes_at && new Date(proposal.closes_at) <= new Date();
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
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === 'active'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Açık Oylamalar
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === 'closed'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sonuçlananlar
          </button>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/15 transition"
        >
          <Plus className="w-4 h-4" />
          Yeni Öneri
        </button>
      </div>

      {/* Yeni Öneri Formu */}
      {showCreate && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Yeni Oylama Başlat</h3>
            <button
              onClick={() => setShowCreate(false)}
              className="p-1 text-slate-400 hover:text-white"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kısa açıklama (isteğe bağlı)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                    category === cat
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-medium'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-400">Seçenekler</label>
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
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions(options.filter((_, i) => i !== index))}
                      className="p-2 text-slate-500 hover:text-rose-400"
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
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Seçenek Ekle
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Oylama Süresi</label>
              <select
                value={durationHours ?? ''}
                onChange={(e) =>
                  setDurationHours(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.label} value={d.hours ?? ''}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Oylamayı Paylaş'}
            </button>
          </form>
        </div>
      )}

      {/* Öneri Kartları */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : visibleProposals.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-400">
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
            const myVote = proposal.votes.find((v) => v.user_id === userId);
            const isExpired =
              proposal.closes_at && new Date(proposal.closes_at) <= new Date();
            const canVote = proposal.status === 'open' && !isExpired;
            const canClose =
              proposal.status === 'open' &&
              (proposal.author_id === userId || isAdmin);
            const canDelete = proposal.author_id === userId || isAdmin;

            // Beraberlikte en yüksek oyu alan seçenekleri bul
            const optionCounts = proposal.proposal_options.map((opt) => ({
              ...opt,
              voters: proposal.votes.filter((v) => v.option_id === opt.id),
            }));
            const maxVoteCount = Math.max(0, ...optionCounts.map((o) => o.voters.length));

            return (
              <div
                key={proposal.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5"
              >
                {/* Kart Üst Bilgi */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {proposal.category && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                          {proposal.category}
                        </span>
                      )}
                      {proposal.status === 'open' && !isExpired && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
                          Açık
                        </span>
                      )}
                      {proposal.status === 'tied' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 flex items-center gap-1">
                          <Scale className="w-3 h-3" />
                          Berabere — Karar Bekleniyor
                        </span>
                      )}
                      {proposal.status === 'decided' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Sonuçlandı
                        </span>
                      )}
                      {(proposal.status === 'cancelled' || (proposal.status === 'open' && isExpired)) && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                          Süresi Doldu
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white leading-snug">
                      {proposal.title}
                    </h3>
                    {proposal.description && (
                      <p className="text-xs text-slate-400">{proposal.description}</p>
                    )}
                  </div>

                  {canDelete && (
                    <button
                      onClick={() => handleDeleteProposal(proposal.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                      title="Öneriyi Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Seçenekler */}
                <div className="space-y-2">
                  {optionCounts.map((opt) => {
                    const count = opt.voters.length;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isSelected = myVote?.option_id === opt.id;
                    const isWinner = proposal.winning_option_id === opt.id;
                    const isTiedTop =
                      proposal.status === 'tied' && count === maxVoteCount && maxVoteCount > 0;

                    return (
                      <div key={opt.id} className="space-y-1">
                        <button
                          type="button"
                          disabled={!canVote || actionLoadingId === proposal.id}
                          onClick={() => handleVote(proposal, opt.id)}
                          className={`w-full text-left relative overflow-hidden rounded-xl border p-3 transition ${
                            isWinner
                              ? 'border-emerald-400 bg-emerald-500/15'
                              : isTiedTop
                              ? 'border-amber-400/70 bg-amber-500/10'
                              : isSelected
                              ? 'border-emerald-500/80 bg-slate-950'
                              : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                          }`}
                        >
                          {/* Doluluk Barı */}
                          <div
                            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                              isWinner
                                ? 'bg-emerald-500/20'
                                : isSelected
                                ? 'bg-emerald-500/15'
                                : 'bg-slate-800/50'
                            }`}
                            style={{ width: `${pct}%` }}
                          />

                          <div className="relative flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isWinner ? (
                                <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : isSelected ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                              )}
                              <span className="text-sm font-medium text-white">
                                {opt.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-semibold text-slate-300">
                                {count} oy
                              </span>
                              <span className="text-[11px] text-slate-400 w-9 text-right">
                                %{pct}
                              </span>
                            </div>
                          </div>

                          {/* Oy verenlerin rozetleri */}
                          {opt.voters.length > 0 && (
                            <div className="relative flex flex-wrap gap-1 mt-2 pl-6">
                              {opt.voters.map((v) => {
                                const m = membersMap[v.user_id];
                                return (
                                  <span
                                    key={v.user_id}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300"
                                  >
                                    {m ? `${m.avatar} ${m.nickname}` : 'Üye'}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </button>

                        {/* Beraberlikte Öneri Sahibinin Nihai Karar Butonu */}
                        {isTiedTop && proposal.author_id === userId && (
                          <button
                            type="button"
                            disabled={actionLoadingId === proposal.id}
                            onClick={() => handleDecideTie(proposal.id, opt.id)}
                            className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
                          >
                            Bu Seçeneği Kazanan İlan Et
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Kart Alt Bilgi & Kapatma Butonu */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>
                      {author ? `${author.avatar} ${author.nickname}` : 'Üye'}
                    </span>
                    <span>•</span>
                    <span>{totalVotes} oy</span>
                    {proposal.closes_at && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatIstanbulDateTime(proposal.closes_at)}
                        </span>
                      </>
                    )}
                  </div>

                  {canClose && (
                    <button
                      type="button"
                      disabled={actionLoadingId === proposal.id}
                      onClick={() => handleCloseProposal(proposal.id)}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      Oylamayı Kapat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
