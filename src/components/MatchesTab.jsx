import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import UserAvatar from './UserAvatar';
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

  useEffect(() => {
    if (!isAdmin && subView === 'manage') {
      setSubView('matches');
    }
  }, [isAdmin, subView]);

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
    if (!isAdmin) return;
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
  }, [groupId, isAdmin]);

  useEffect(() => {
    if (subView === 'matches') fetchDayMatches();
    if (subView === 'leaderboard') fetchLeaderboard();
    if (subView === 'manage' && isAdmin) fetchManualMatches();
  }, [subView, isAdmin, fetchDayMatches, fetchLeaderboard, fetchManualMatches]);

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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
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
      {/* Alt Sekmeler: Yönetici değilse Maç Ekle sekmesi görünmez */}
      <div
        className={`grid ${
          isAdmin ? 'grid-cols-3' : 'grid-cols-2'
        } gap-1 bg-white border border-slate-200/80 p-1 rounded-2xl shadow-sm`}
      >
        <button
          onClick={() => setSubView('matches')}
          className={`py-2 rounded-xl text-xs font-bold transition ${
            subView === 'matches'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Günün Maçları
        </button>
        <button
          onClick={() => setSubView('leaderboard')}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            subView === 'leaderboard'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Puan Tablosu
        </button>
        {isAdmin && (
          <button
            onClick={() => setSubView('manage')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              subView === 'manage'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Maç Ekle
          </button>
        )}
      </div>

      {/* 1) GÜNÜN MAÇLARI */}
      {subView === 'matches' && (
        <div className="space-y-3.5">
          {/* Tarih Seçici */}
          <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-2xl px-3 py-2.5 shadow-sm">
            <button
              onClick={() => setSelectedDate((d) => shiftDateString(d, -1))}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 active:scale-95 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <div className="text-sm font-extrabold text-slate-900">
                {formatTurkishDateLabel(selectedDate)}
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                {selectedDate}
              </div>
            </div>
            <button
              onClick={() => setSelectedDate((d) => shiftDateString(d, 1))}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 active:scale-95 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Puan Kuralı Özeti */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-white border border-slate-200/80 rounded-2xl px-3.5 py-2.5 shadow-sm">
            <span>
              Tam Skor: <strong className="text-emerald-600">3 Puan</strong>
            </span>
            <span>
              Doğru Sonuç (1X2): <strong className="text-blue-600">1 Puan</strong>
            </span>
            <span className="text-slate-400">Maç saatinde kilitlenir</span>
          </div>

          {loadingMatches ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : picks.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 text-center space-y-2 shadow-sm">
              <p className="text-sm font-bold text-slate-800">
                Bu tarih için seçilmiş maç henüz yok.
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? (
                  <>
                    Otomatik maçlar her sabah 09:05&apos;te seçilir. Süper Lig veya özel bir maçı{' '}
                    <button
                      onClick={() => setSubView('manage')}
                      className="text-emerald-600 font-bold underline"
                    >
                      Maç Ekle
                    </button>{' '}
                    sekmesinden hemen ekleyebilirsin.
                  </>
                ) : (
                  'Günün maç programı henüz yayınlanmadı.'
                )}
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
                    className="bg-white border border-slate-200/80 rounded-3xl p-4 space-y-3.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-500 flex-wrap">
                        <span className="font-bold text-slate-700">{compTitle}</span>
                        {m.is_featured && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-semibold">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            Öne Çıkan
                          </span>
                        )}
                        {m.source === 'manual' && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-semibold">
                            Manuel
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.status === 'finished' ? (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-bold">
                            MS {m.home_score} - {m.away_score}
                          </span>
                        ) : m.status === 'live' ? (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 font-bold animate-pulse">
                            Canlı {m.home_score ?? 0}-{m.away_score ?? 0}
                          </span>
                        ) : m.status === 'postponed' || m.status === 'cancelled' ? (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 font-semibold">
                            {m.status === 'postponed' ? 'Ertelendi' : 'İptal'}
                          </span>
                        ) : isStarted ? (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Başladı ({formatIstanbulTime(m.kickoff_at)})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                            {formatIstanbulTime(m.kickoff_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-slate-900 leading-tight">
                          {m.home_team}
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'home', -1)}
                              className="w-7 h-7 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm shadow-2xs active:scale-95 transition"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-base font-extrabold text-slate-900">
                              {draft.home}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'home', 1)}
                              className="w-7 h-7 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm shadow-2xs active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>

                          <span className="text-slate-400 font-extrabold px-0.5">:</span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'away', -1)}
                              className="w-7 h-7 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm shadow-2xs active:scale-95 transition"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-base font-extrabold text-slate-900">
                              {draft.away}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustDraft(m.id, 'away', 1)}
                              className="w-7 h-7 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm shadow-2xs active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                          <div className="text-[10px] font-semibold text-slate-400">
                            Tahminin
                          </div>
                          <div className="text-sm font-extrabold text-slate-900">
                            {myPred ? `${myPred.home_pred} - ${myPred.away_pred}` : '—'}
                          </div>
                        </div>
                      )}

                      <div className="text-left">
                        <div className="text-sm font-extrabold text-slate-900 leading-tight">
                          {m.away_team}
                        </div>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[11px] font-medium text-slate-500">
                          {myPred
                            ? `Kayıtlı tahminin: ${myPred.home_pred} - ${myPred.away_pred}`
                            : 'Henüz tahmin girmedin'}
                        </span>
                        <button
                          type="button"
                          disabled={savingMatchId === m.id}
                          onClick={() => savePrediction(m)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                            savedToastId === m.id
                              ? 'bg-emerald-500 text-white'
                              : myPred
                              ? 'bg-slate-100 hover:bg-slate-200 text-emerald-700 border border-emerald-200'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
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
                      <div className="space-y-2.5 pt-2.5 border-t border-slate-100">
                        {myPred && myPred.points !== null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium">
                              Bu maçtan kazancın:
                            </span>
                            <span
                              className={`font-bold px-2.5 py-1 rounded-xl ${
                                myPred.points === 3
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : myPred.points === 1
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-500'
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

                        {matchPreds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mr-1">
                              <Users className="w-3 h-3" />
                              Grup:
                            </span>
                            {matchPreds.map((pr) => {
                              const member = membersMap[pr.user_id];
                              return (
                                <span
                                  key={pr.id}
                                  className="inline-flex items-center gap-1.5 text-[11px] pl-1 pr-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700"
                                >
                                  <UserAvatar
                                    avatar={member?.avatar}
                                    nickname={member?.nickname || 'Üye'}
                                    size="xs"
                                    className="!w-5 !h-5 !text-[10px]"
                                  />
                                  <span className="font-semibold">
                                    {member?.nickname || 'Üye'}:
                                  </span>
                                  <strong className="text-slate-900">
                                    {pr.home_pred}-{pr.away_pred}
                                  </strong>
                                  {pr.points !== null && (
                                    <span className="text-emerald-600 font-bold">
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
          <div className="grid grid-cols-3 gap-1 bg-white border border-slate-200/80 p-1 rounded-2xl shadow-sm">
            {[
              { id: 'daily', label: 'Günlük' },
              { id: 'weekly', label: 'Bu Hafta' },
              { id: 'overall', label: 'Genel' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setLbPeriod(tab.id)}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  lbPeriod === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loadingLb ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          ) : lbRows.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Bu dönem için henüz sonuçlanmış tahmin puanı yok.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-3xl divide-y divide-slate-100 overflow-hidden shadow-sm">
              {lbRows.map((row) => {
                const member = membersMap[row.user_id];
                const medal =
                  row.rank === 1
                    ? '1.'
                    : row.rank === 2
                    ? '2.'
                    : row.rank === 3
                    ? '3.'
                    : `${row.rank}.`;

                return (
                  <div
                    key={row.user_id}
                    className={`flex items-center justify-between px-4 py-3.5 ${
                      row.user_id === userId ? 'bg-emerald-50/70' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 text-center font-extrabold text-sm ${
                          row.rank === 1
                            ? 'text-amber-500'
                            : row.rank === 2
                            ? 'text-slate-400'
                            : row.rank === 3
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {medal}
                      </span>
                      <UserAvatar
                        avatar={member?.avatar}
                        nickname={row.nickname}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">
                          {row.nickname}
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">
                          {row.exact_count} tam skor
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-extrabold text-emerald-600">
                        {row.total_points} P
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center px-2">
            Eşit puanda önce tam skor sayısı, ardından tahminleri maça ne kadar erken girdiği esas alınır.
          </p>
        </div>
      )}

      {/* 3) YÖNETİCİ MAÇ EKLEME & SKOR GİRİŞİ (Sadece Yöneticide Görünür) */}
      {subView === 'manage' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-3.5 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900">
              Manuel Maç Ekle (Süper Lig / Özel)
            </h3>
            <p className="text-xs text-slate-500">
              Eklediğin maç doğrudan o günün tahmin listesine girer.
            </p>

            <form onSubmit={handleAddManualMatch} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Turnuva / Lig
                </label>
                <input
                  type="text"
                  value={compLabel}
                  onChange={(e) => setCompLabel(e.target.value)}
                  placeholder="Süper Lig"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Ev Sahibi
                  </label>
                  <input
                    type="text"
                    required
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    placeholder="Galatasaray"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Deplasman
                  </label>
                  <input
                    type="text"
                    required
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    placeholder="Fenerbahçe"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SUPER_LIG_QUICK_TEAMS.map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => {
                      if (!homeTeam) setHomeTeam(team);
                      else if (!awayTeam && homeTeam !== team) setAwayTeam(team);
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 transition"
                  >
                    + {team}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Başlama Tarihi ve Saati (Türkiye Saati)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={kickoffLocal}
                  onChange={(e) => setKickoffLocal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>

              {manageMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                  {manageMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={addingMatch}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 transition active:scale-[0.98]"
              >
                {addingMatch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Maçı Listeye Ekle'
                )}
              </button>
            </form>
          </div>

          {manualMatches.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-amber-600 text-xs font-extrabold">
                <ShieldCheck className="w-4 h-4" />
                Yönetici Skor Paneli (Manuel Maçlar)
              </div>

              <div className="space-y-2.5">
                {manualMatches.map((m) => {
                  const sc = adminScores[m.id] || { home: 0, away: 0 };
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          {m.home_team} - {m.away_team}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
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
                          className="w-14 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-center text-sm font-bold text-slate-900"
                        />
                        <span className="text-slate-400 font-bold">-</span>
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
                          className="w-14 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-center text-sm font-bold text-slate-900"
                        />

                        <button
                          type="button"
                          disabled={updatingScoreId === m.id}
                          onClick={() => handleFinishManualMatch(m.id, 'finished')}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition active:scale-95"
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
