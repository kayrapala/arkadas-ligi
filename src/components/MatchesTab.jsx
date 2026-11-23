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
      <div className="grid grid-cols-3 gap-1 bg-white border border-slate-200/80 p-1 rounded-2xl shadow-sm">
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
                Otomatik maçlar her sabah 09:05&apos;te seçilir. Süper Lig veya özel bir maçı{' '}
                <button
                  onClick={() => setSubView('manage')}
                  className="text-emerald-600 font-bold underline"
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
                    className="bg-white border border-slate-200/80 rounded-3xl p-4 space-y-3.5 shadow-sm"
                  >
                    {/* Lig & Saat & Durum */}
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

                    {/* Takımlar ve Tahmin Girişi */}
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
                              className="w-7 h
