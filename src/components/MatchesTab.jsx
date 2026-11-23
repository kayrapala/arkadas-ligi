import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  getIstanbulDateString,
  shiftDateString,
  getIstanbulWeekStartString,
  formatIstanbulTime,
  formatTurkishDateLabel,
  istanbulLocalInputToUTC,
} from '../lib/dateUtils';
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  PlusCircle,
  Lock,
  Check,
  Star,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';

const SUPER_LIG_QUICK_TEAMS = [
  'Galatasaray',
  'Fenerbahçe',
  'Beşiktaş',
  'Trabzonspor',
  'Başakşehir',
  'Samsunspor',
  'Göztepe',
  'Kasımpaşa',
];

export default function MatchesTab({ groupId, userId, isAdmin, membersMap }) {
  const [subView, setSubView] = useState('matches'); // 'matches' | 'leaderboard' | 'manage'
  const [selectedDate, setSelectedDate] = useState(() => getIstanbulDateString());

  // Maçlar & Tahminler state
  const [picks, setPicks] = useState([]);
  const [myPredictions, setMyPredictions] = useState({});
  const [allPredictions, setAllPredictions] = useState({});
  const [draftScores, setDraftScores] = useState({});
  const [savingMatchId, setSavingMatchId] = useState(null);
  const [savedToastId, setSavedToastId] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);

  // Leaderboard state
  const [lbPeriod, setLbPeriod] = useState('daily'); // 'daily' | 'weekly' | 'overall'
  const [lbRows, setLbRows] = useState([]);
  const [loadingLb, setLoadingLb] = useState(false);

  // Manuel maç ekleme state
  const [compLabel, setCompLabel] = useState('Süper Lig');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [kickoffLocal, setKickoffLocal] = useState('');
  const [addingMatch, setAddingMatch] = useState(false);
  const [manageMsg, setManageMsg] = useState('');

  // Yönetici skor güncelleme state
  const [manualMatches, setManualMatches] = useState([]);
  const [adminScores, setAdminScores] = useState({});
  const [updatingScoreId, setUpdatingScoreId] = useState(null);

  const fetchDayMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const { data: pickRows, error } = await supabase
        .from('daily_picks')
        .select(`
          id,
          pick_date,
          display_order,
          matches (
            *,
            leagues (name)
          )
        `)
        .eq('pick_date', selectedDate)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const validPicks = (pickRows || []).filter((p) => p.matches);
      setPicks(validPicks);

      const matchIds = validPicks.map((p) => p.matches.id);
      if (matchIds.length > 0) {
        const { data: preds } = await supabase
          .from('predictions')
          .select('*')
          .in('match_id', matchIds);

        const mine = {};
        const drafts = {};
        const groupedAll = {};

        for (const pr of preds || []) {
          if (!groupedAll[pr.match_id]) groupedAll[pr.match_id] = [];
          groupedAll[pr.match_id].push(pr);

          if (pr.user_id === userId) {
            mine[pr.match_id] = pr;
            drafts[pr.match_id] = {
              home: pr.home_pred,
              away: pr.away_pred,
            };
          }
        }

        // Tahmin girilmemiş maçlara varsayılan 0-0 taslak ata
        for (const mid of matchIds) {
          if (!drafts[mid]) {
            drafts[mid] = { home: 0, away: 0 };
          }
        }

        setMyPredictions(mine);
        setAllPredictions(groupedAll);
        setDraftScores(drafts);
      } else {
        setMyPredictions({});
        setAllPredictions({});
        setDraftScores({});
      }
    } finally {
      setLoadingMatches(false);
    }
  }, [selectedDate, userId]);

  const fetchLeaderboard = useCallback(async () => {
    setLoadingLb(true);
    try {
      if (lbPeriod === 'daily') {
        const { data } = await supabase
          .from('leaderboard_daily')
          .select('*')
          .eq('group_id', groupId)
          .eq('pick_date', selectedDate)
          .order('rank', { ascending: true });
        setLbRows(data || []);
      } else if (lbPeriod === 'weekly') {
        const weekStart = getIstanbulWeekStartString();
        const { data } = await supabase
          .from('leaderboard_weekly')
          .select('*')
          .eq('group_id', groupId)
          .eq('week_start', weekStart)
          .order('rank', { ascending: true });
        setLbRows(data || []);
      } else {
        const { data } = await supabase
          .from('leaderboard_overall')
          .select('*')
          .eq('group_id', groupId)
          .order('rank', { ascending: true });
        setLbRows(data || []);
      }
    } finally {
      setLoadingLb(false);
    }
  }, [groupId, lbPeriod, selectedDate]);

  const fetchManualMatches = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('group_id', groupId)
      .eq('source', 'manual')
      .order('kickoff_at', { ascending: false })
      .limit(25);

    setManualMatches(data || []);
    const initialAdmin = {};
    for (const m of data || []) {
      initialAdmin[m.id] = {
        home: m.home_score ?? 0,
        away: m.away_score ?? 0,
      };
    }
    setAdminScores(initialAdmin);
  }, [groupId]);

  useEffect(() => {
    if (subView === 'matches') fetchDayMatches();
    if (subView === 'leaderboard') fetchLeaderboard();
    if (subView === 'manage') fetchManualMatches();
  }, [subView, fetchDayMatches, fetchLeaderboard, fetchManualMatches]);

  function adjustDraft(matchId, side, delta) {
    setDraftScores((prev) => {
      const curr = prev[matchId] || { home: 0, away: 0 };
      const nextVal = Math.max(0, Math.min(20, Number(curr[side] || 0) + delta));
      return {
        ...prev,
        [matchId]: { ...curr, [side]: nextVal },
      };
    });
  }

  async function savePrediction(match) {
    const draft = draftScores[match.id] || { home: 0, away: 0 };
    setSavingMatchId(match.id);

    try {
      const { error } = await supabase.from('predictions').upsert(
        {
          match_id: match.id,
          user_id: userId,
          home_pred: Number(draft.home),
          away_pred: Number(draft.away),
        },
        { onConflict: 'match_id,user_id' }
      );

      if (error) {
        if (error.message?.includes('row-level security')) {
          alert('Maç başladığı için tahmin süresi doldu.');
        } else {
          alert(error.message);
        }
        return;
      }

      setSavedToastId(match.id);
      setTimeout(() => setSavedToastId(null), 2000);
      await fetchDayMatches();
    } finally {
      setSavingMatchId(null);
    }
  }

  async function handleAddManualMatch(e) {
    e.preventDefault();
    setManageMsg('');
    if (!homeTeam.trim() || !awayTeam.trim() || !kickoffLocal) {
      setManageMsg('Lütfen ev sahibi, deplasman ve maç saatini doldur.');
      return;
    }

    setAddingMatch(true);
    try {
      const kickoffUTC = istanbulLocalInputToUTC(kickoffLocal);
      const { error } = await supabase.from('matches').insert({
        group_id: groupId,
        competition: compLabel.trim() || 'Süper Lig',
        home_team: homeTeam.trim(),
        away_team: awayTeam.trim(),
        kickoff_at: kickoffUTC,
        source: 'manual',
        created_by: userId,
      });

      if (error) throw error;

      setHomeTeam('');
      setAwayTeam('');
      setKickoffLocal('');
      setManageMsg('Maç eklendi ve o günün tahmin listesine otomatik alındı!');
      await fetchManualMatches();
    } catch (err) {
      setManageMsg(err.message || 'Maç eklenemedi.');
    } finally {
      setAddingMatch(false);
    }
  }

  async function handleFinishManualMatch(matchId, newStatus = 'finished') {
    setUpdatingScoreId(matchId);
    try {
      const sc = adminScores[matchId] || { home: 0, away: 0 };
      const payload =
        newStatus === 'finished'
          ? {
              status: 'finished',
              home_score: Number(sc.home),
              away_score: Number(sc.away),
              score_locked: true,
            }
          : {
              status: newStatus,
              home_score: null,
              away_score: null,
            };

      const { error } = await supabase
        .from('matches')
        .update(payload)
        .eq('id', matchId);

      if (error) throw error;
      await fetchManualMatches();
    } catch (err) {
      alert(err.message || 'Skor güncellenemedi.');
    } finally {
      setUpdatingScoreId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Alt Sekmeler */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
        <button
          onClick={() => setSubView('matches')}
          className={`py-2 rounded-lg text-xs font-medium transition ${
            subView === 'matches'
              ? 'bg-emerald-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Günün Maçları
        </button>
        <button
          onClick={() => setSubView('leaderboard')}
          className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition ${
            subView === 'leaderboard'
              ? 'bg-emerald-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Puan Tablosu
        </button>
        <button
          onClick={() => setSubView('manage')}
          className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition ${
            subView === 'manage'
              ? 'bg-emerald-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Maç Ekle
        </button>
      </div>

      {/* 1) GÜNÜN MAÇLARI */}
      {subView === 'matches' && (
        <div className="space-y-3.5">
          {/* Tarih Seçici */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
            <button
              onClick={() => setSelectedDate((d) => shiftDateString(d, -1))}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <div className="text-sm font-bold text-white">
                {formatTurkishDateLabel(selectedDate)}
              </div>
              <div className="text-[11px] text-slate-400">{selectedDate}</div>
            </div>
            <button
              onClick={() => setSelectedDate((d) => shiftDateString(d, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Puan Kuralı Özeti */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/50 border border-slate-800/70 rounded-xl px-3 py-2">
            <span>🎯 Tam Skor: <strong className="text-emerald-400">3 Puan</strong></span>
            <span>✅ Doğru Sonuç (1X2): <strong className="text-sky-400">1 Puan</strong></span>
            <span>🔒 Maç saatinde kilitlenir</span>
          </div>

          {loadingMatches ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : picks.length === 0 ? (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-300">
                Bu tarih için seçilmiş maç henüz yok.
              </p>
              <p className="text-xs text-slate-500">
                Otomatik maçlar her sabah 09:05&apos;te seçilir. Süper Lig veya özel bir maçı{' '}
                <button
                  onClick={() => setSubView('manage')}
                  className="text-emerald-400 underline"
                >
                  Maç Ekle
                </button>{' '}
                sekmesinden hemen ekleyebilirsin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {picks.map(({ matches: m }) => {
                const isStarted = new Date(m.kickoff_at) <= new Date();
                const isOpen = m.status === 'scheduled' && !isStarted;
                const myPred = myPredictions[m.id];
                const draft = draftScores[m.id] || { home: 0, away: 0 };
                const matchPreds = allPredictions[m.id] || [];
                const compTitle = m.competition || m.leagues?.name || 'Maç';

                return (
                  <div
                    key={m.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
                  >
                    {/* Lig & Saat & Durum */}
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="font-medium text-slate-300">{compTitle}</span>
                        {m.is_featured && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium">
                            <Star className="w-3 h-3 fill-amber-300" />
                            Öne Çıkan
                          </span>
                        )}
                        {m.source === 'manual' && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">
                            Manuel
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {m.status === 'finished' ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-semibold">
                            MS {m.home_score} - {m.away_score}
                          </span>
                        ) : m.status === 'live' ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold animate-pulse">
                            Canlı {m.home_score ?? 0}-{m.away_score ?? 0}
                          </span>
                        ) : m.status === 'postponed' || m.status === 'cancelled' ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                            {m.status === 'postponed' ? 'Ertelendi' : 'İptal'}
                          </span>
                        ) : isStarted ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Başladı ({formatIstanbulTime(m.kickoff_at)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-semibold">
                            {formatIstanbulTime(m.kickoff_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Takımlar ve Tahmin Girişi */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm font-bold text-white leading-tight">
                          {m.home_team}
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'home', -1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-base font-bold text-white">
                              {draft.home}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'home', 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-slate-500 font-bold px-0.5">:</span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'away', -1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-base font-bold text-white">
                              {draft.away}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'away', 1)}
                              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                          <div className="text-[10px] text-slate-500">Tahminin</div>
                          <div className="text-sm font-bold text-white">
                            {myPred ? `${myPred.home_pred} - ${myPred.away_pred}` : '—'}
                          </div>
                        </div>
                      )}

                      <div className="text-left">
                        <div className="text-sm font-bold text-white leading-tight">
                          {m.away_team}
                        </div>
                      </div>
                    </div>

                    {/* Kaydet Butonu veya Kazanılan Puan */}
                    {isOpen ? (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400">
                          {myPred
                            ? `Kayıtlı tahminin: ${myPred.home_pred} - ${myPred.away_pred}`
                            : 'Henüz tahmin girmedin'}
                        </span>
                        <button
                          type="button"
                          disabled={savingMatchId === m.id}
                          onClick={() => savePrediction(m)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                            savedToastId === m.id
                              ? 'bg-emerald-400 text-slate-950'
                              : myPred
                              ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {savingMatchId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : savedToastId === m.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Kaydedildi
                            </>
                          ) : myPred ? (
                            'Tahmini Güncelle'
                          ) : (
                            'Tahmini Kaydet'
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        {myPred && myPred.points !== null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Bu maçtan kazancın:</span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded-md ${
                                myPred.points === 3
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : myPred.points === 1
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              +{myPred.points} Puan{' '}
                              {myPred.points === 3
                                ? '(Tam Skor!)'
                                : myPred.points === 1
                                ? '(Doğru Sonuç)'
                                : ''}
                            </span>
                          </div>
                        )}

                        {/* Maç başladıktan sonra arkadaşların tahminleri açılır */}
                        {matchPreds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
                              <Users className="w-3 h-3" />
                              Grup:
                            </span>
                            {matchPreds.map((pr) => {
                              const member = membersMap[pr.user_id];
                              return (
                                <span
                                  key={pr.id}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300"
                                >
                                  {member ? `${member.avatar} ${member.nickname}` : 'Üye'}:{' '}
                                  <strong className="text-white">
                                    {pr.home_pred}-{pr.away_pred}
                                  </strong>
                                  {pr.points !== null && (
                                    <span className="text-emerald-400 ml-1">
                                      (+{pr.points})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2) PUAN TABLOSU */}
      {subView === 'leaderboard' && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            {[
              { id: 'daily', label: 'Günlük' },
              { id: 'weekly', label: 'Bu Hafta' },
              { id: 'overall', label: 'Genel' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setLbPeriod(tab.id)}
                className={`py-1.5 rounded-lg text-xs font-medium transition ${
                  lbPeriod === tab.id
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingLb ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : lbRows.length === 0 ? (
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-400">
                Bu dönem için henüz sonuçlanmış tahmin puanı yok.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 overflow-hidden">
              {lbRows.map((row) => {
                const member = membersMap[row.user_id];
                const medal =
                  row.rank === 1
                    ? '🥇'
                    : row.rank === 2
                    ? '🥈'
                    : row.rank === 3
                    ? '🥉'
                    : `${row.rank}.`;

                return (
                  <div
                    key={row.user_id}
                    className={`flex items-center justify-between px-4 py-3.5 ${
                      row.user_id === userId ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-bold text-sm text-slate-300">
                        {medal}
                      </span>
                      <span className="text-xl">{member?.avatar || '🙂'}</span>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {row.nickname}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {row.exact_count} tam skor
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-400">
                        {row.total_points} P
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-500 text-center">
            Eşit puanda önce tam skor sayısı, ardından tahminleri maça ne kadar erken girdiği esas alınır.
          </p>
        </div>
      )}

      {/* 3) MANUEL MAÇ EKLEME & YÖNETİCİ SKOR GİRİŞİ */}
      {subView === 'manage' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-sm font-bold text-white">
              Manuel Maç Ekle (Süper Lig / Özel)
            </h3>
            <p className="text-xs text-slate-400">
              Eklediğin maç doğrudan o günün tahmin listesine girer.
            </p>

            <form onSubmit={handleAddManualMatch} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Turnuva / Lig</label>
                <input
                  type="text"
                  value={compLabel}
                  onChange={(e) => setCompLabel(e.target.value)}
                  placeholder="Süper Lig"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ev Sahibi</label>
                  <input
                    type="text"
                    required
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    placeholder="Galatasaray"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deplasman</label>
                  <input
                    type="text"
                    required
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    placeholder="Fenerbahçe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Hızlı Takım Seçim Çipleri */}
              <div className="flex flex-wrap gap-1.5">
                {SUPER_LIG_QUICK_TEAMS.map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => {
                      if (!homeTeam) setHomeTeam(team);
                      else if (!awayTeam && homeTeam !== team) setAwayTeam(team);
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-emerald-500/50"
                  >
                    + {team}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Başlama Tarihi ve Saati (Türkiye Saati)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={kickoffLocal}
                  onChange={(e) => setKickoffLocal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {manageMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                  {manageMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={addingMatch}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                {addingMatch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Maçı Listeye Ekle'
                )}
              </button>
            </form>
          </div>

          {/* Grup Yöneticisi Skor Giriş Paneli */}
          {isAdmin && manualMatches.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <ShieldCheck className="w-4 h-4" />
                Yönetici Skor Paneli (Manuel Maçlar)
              </div>

              <div className="space-y-2.5">
                {manualMatches.map((m) => {
                  const sc = adminScores[m.id] || { home: 0, away: 0 };
                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">
                          {m.home_team} - {m.away_team}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {m.status === 'finished'
                            ? `Bitti (${m.home_score}-${m.away_score})`
                            : formatIstanbulTime(m.kickoff_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={sc.home}
                          onChange={(e) =>
                            setAdminScores((prev) => ({
                              ...prev,
                              [m.id]: { ...sc, home: e.target.value },
                            }))
                          }
                          className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-sm text-white"
                        />
                        <span className="text-slate-500 font-bold">-</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={sc.away}
                          onChange={(e) =>
                            setAdminScores((prev) => ({
                              ...prev,
                              [m.id]: { ...sc, away: e.target.value },
                            }))
                          }
                          className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-sm text-white"
                        />

                        <button
                          type="button"
                          disabled={updatingScoreId === m.id}
                          onClick={() => handleFinishManualMatch(m.id, 'finished')}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-1.5 px-2.5 rounded-lg text-xs"
                        >
                          Skoru Kaydet & Puanla
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
