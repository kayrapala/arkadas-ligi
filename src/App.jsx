import React, { useEffect, useState, useCallback } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import OnboardingScreen from './components/OnboardingScreen';
import ProposalsTab from './components/ProposalsTab';
import MatchesTab from './components/MatchesTab';
import SharesTab from './components/SharesTab';
import {
  Vote,
  Trophy,
  Film,
  Copy,
  Check,
  LogOut,
  Plus,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(
    () => localStorage.getItem('arkadas_ligi_group_id') || null
  );
  const [membersMap, setMembersMap] = useState({});
  const [dataLoading, setDataLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('matches'); // 'proposals' | 'matches' | 'shares'
  const [copiedCode, setCopiedCode] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserContext = useCallback(async (uid) => {
    setDataLoading(true);
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      setProfile(prof || null);

      if (prof) {
        const { data: memberships } = await supabase
          .from('group_members')
          .select(`
            group_id,
            role,
            groups (id, name, invite_code)
          `)
          .eq('user_id', uid);

        const groupList = (memberships || [])
          .filter((m) => m.groups)
          .map((m) => ({
            ...m.groups,
            role: m.role,
          }));

        setGroups(groupList);

        if (groupList.length > 0) {
          const saved = localStorage.getItem('arkadas_ligi_group_id');
          const valid = groupList.find((g) => g.id === saved) || groupList[0];
          setActiveGroupId(valid.id);
          localStorage.setItem('arkadas_ligi_group_id', valid.id);
        } else {
          setActiveGroupId(null);
        }
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      loadUserContext(session.user.id);
    } else {
      setProfile(null);
      setGroups([]);
      setActiveGroupId(null);
    }
  }, [session?.user?.id, loadUserContext]);

  const loadGroupMembers = useCallback(async (gid) => {
    if (!gid) return;
    const { data } = await supabase
      .from('group_members')
      .select(`
        user_id,
        role,
        profiles (id, nickname, avatar)
      `)
      .eq('group_id', gid);

    const map = {};
    for (const row of data || []) {
      if (row.profiles) {
        map[row.user_id] = {
          ...row.profiles,
          role: row.role,
        };
      }
    }
    setMembersMap(map);
  }, []);

  useEffect(() => {
    if (activeGroupId) {
      loadGroupMembers(activeGroupId);
    }
  }, [activeGroupId, loadGroupMembers]);

  // Vercel ortam değişkenleri henüz girilmediyse bilgilendirici kurulum ekranı
  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#090d16]">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <AlertTriangle className="w-5 h-5" />
            Supabase Bağlantı Ayarı Bekleniyor
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Uygulama başarıyla yayına alındı ancak veritabanına bağlanmak için Vercel ayarlarına
            şu iki değişkeni eklemen gerekiyor:
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-400 space-y-1">
            <div>VITE_SUPABASE_URL</div>
            <div>VITE_SUPABASE_ANON_KEY</div>
          </div>
          <p className="text-[11px] text-slate-400">
            Vercel &gt; Settings &gt; Environment Variables bölümünden ekledikten sonra Deployments
            sekmesinden Redeploy yapman yeterli.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading || (session && dataLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (!profile || groups.length === 0 || showAddGroup) {
    return (
      <OnboardingScreen
        user={session.user}
        profile={profile}
        onProfileCreated={(newProf) => setProfile(newProf)}
        onGroupJoined={async (newGroupId) => {
          localStorage.setItem('arkadas_ligi_group_id', newGroupId);
          setActiveGroupId(newGroupId);
          setShowAddGroup(false);
          await loadUserContext(session.user.id);
        }}
      />
    );
  }

  const activeGroup = groups.find((g) => g.id === activeGroupId) || groups[0];
  const isAdmin = activeGroup?.role === 'admin';

  function copyInviteCode() {
    if (!activeGroup?.invite_code) return;
    navigator.clipboard?.writeText(activeGroup.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 pb-24">
      {/* Üst Sabit Başlık */}
      <header className="sticky top-0 z-30 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {groups.length > 1 ? (
              <select
                value={activeGroup.id}
                onChange={(e) => {
                  setActiveGroupId(e.target.value);
                  localStorage.setItem('arkadas_ligi_group_id', e.target.value);
                }}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-sm font-bold text-white focus:outline-none"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="text-base font-bold text-white truncate">
                {activeGroup.name}
              </h1>
            )}

            <button
              onClick={copyInviteCode}
              title="Arkadaşlarını davet etmek için kodu kopyala"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400 hover:border-emerald-500/40 shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3 h-3" />
                  Kopyalandı
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  {activeGroup.invite_code}
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowAddGroup(true)}
              title="Başka gruba katıl veya yeni grup kur"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              title="Çıkış Yap"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Ana İçerik Alanı */}
      <main className="max-w-lg mx-auto px-4 pt-4">
        {activeTab === 'proposals' && (
          <ProposalsTab
            groupId={activeGroup.id}
            userId={session.user.id}
            isAdmin={isAdmin}
            membersMap={membersMap}
          />
        )}

        {activeTab === 'matches' && (
          <MatchesTab
            groupId={activeGroup.id}
            userId={session.user.id}
            isAdmin={isAdmin}
            membersMap={membersMap}
          />
        )}

        {activeTab === 'shares' && (
          <SharesTab
            groupId={activeGroup.id}
            userId={session.user.id}
            isAdmin={isAdmin}
            membersMap={membersMap}
          />
        )}
      </main>

      {/* Alt 3 Sekmeli Mobil Menü */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-[#0d1424]/95 backdrop-blur-md border-t border-slate-800 pb-safe">
        <div className="max-w-lg mx-auto grid grid-cols-3">
          <button
            onClick={() => setActiveTab('proposals')}
            className={`py-3 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              activeTab === 'proposals'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Vote className="w-5 h-5" />
            <span>Karar & Oylama</span>
          </button>

          <button
            onClick={() => setActiveTab('matches')}
            className={`py-3 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              activeTab === 'matches'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-5 h-5" />
            <span>Maç & Tahmin</span>
          </button>

          <button
            onClick={() => setActiveTab('shares')}
            className={`py-3 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              activeTab === 'shares'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-5 h-5" />
            <span>İzle & Öner</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
