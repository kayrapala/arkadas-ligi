import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import OnboardingScreen from './components/OnboardingScreen';
import ProposalsTab from './components/ProposalsTab';
import MatchesTab from './components/MatchesTab';
import SharesTab from './components/SharesTab';
import UserAvatar, {
  AVATAR_RINGS,
  REALISTIC_AVATARS,
  parseAvatarValue,
  formatAvatarValue,
  compressImageFile,
} from './components/UserAvatar';
import {
  Vote,
  Trophy,
  Film,
  User,
  Copy,
  Check,
  LogOut,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  Camera,
  Share2,
  KeyRound,
  Mail,
  Users,
  Info,
} from 'lucide-react';

function getNicknameCooldownStatus(prof) {
  if (!prof) {
    return { canChange: true, message: '', remainingDays: 0 };
  }

  const now = Date.now();
  const createdAt = new Date(prof.created_at || prof.nickname_updated_at || now).getTime();
  const lastChange = new Date(prof.nickname_updated_at || prof.created_at || now).getTime();
  const hoursSinceCreate = (now - createdAt) / (1000 * 60 * 60);

  if (!prof.initial_grace_used && hoursSinceCreate <= 24) {
    const hoursLeft = Math.max(1, Math.ceil(24 - hoursSinceCreate));
    return {
      canChange: true,
      remainingDays: 0,
      message: `İlk kayıt af hakkın aktif (${hoursLeft} saat içinde 1 kez ücretsiz düzeltme yapabilirsin).`,
    };
  }

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const elapsedMs = now - lastChange;

  if (elapsedMs < thirtyDaysMs) {
    const remainingDays = Math.max(
      1,
      Math.ceil((thirtyDaysMs - elapsedMs) / (24 * 60 * 60 * 1000))
    );
    return {
      canChange: false,
      remainingDays,
      message: `İsim ve soyisim 30 günde bir değiştirilebilir. Kalan süre: ${remainingDays} gün.`,
    };
  }

  return {
    canChange: true,
    remainingDays: 0,
    message: '30 günlük bekleme süresi doldu; isim ve soyismini 1 kez güncelleyebilirsin.',
  };
}

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

  const [activeTab, setActiveTab] = useState('matches');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);

  const [editNickname, setEditNickname] = useState('');
  const [editAvatarSrc, setEditAvatarSrc] = useState(REALISTIC_AVATARS.portrait3d[0]);
  const [editRingColor, setEditRingColor] = useState('emerald');
  const [editAvatarTab, setEditAvatarTab] = useState('portrait3d');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const editFileRef = useRef(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });

  const [deletingGroup, setDeletingGroup] = useState(false);

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
        const parsed = parseAvatarValue(prof.avatar);
        setEditNickname(prof.nickname || '');
        setEditRingColor(parsed.ring || 'emerald');
        if (parsed.type === 'image') {
          setEditAvatarSrc(parsed.src);
          setEditAvatarTab(
            REALISTIC_AVATARS.badge.includes(parsed.src) ? 'badge' : 'portrait3d'
          );
        } else {
          setEditAvatarSrc(REALISTIC_AVATARS.portrait3d[0]);
          setEditAvatarTab('portrait3d');
        }

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

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 pt-16 bg-[#f8fafc] text-slate-900">
        <div className="max-w-md w-full bg-white border border-amber-300 rounded-3xl p-6 shadow-lg space-y-3">
          <div className="flex items-center gap-2 text-amber-600 font-bold">
            <AlertTriangle className="w-5 h-5" />
            Supabase Bağlantı Ayarı Bekleniyor
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Vercel ayarlarına <strong>VITE_SUPABASE_URL</strong> ve{' '}
            <strong>VITE_SUPABASE_ANON_KEY</strong> değişkenlerini ekleyip Redeploy yap.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading || (session && dataLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
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
        onCancel={
          profile && groups.length > 0 ? () => setShowAddGroup(false) : undefined
        }
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
  const membersList = Object.values(membersMap);
  const nicknameStatus = getNicknameCooldownStatus(profile);
  const normalizedEditNickname = editNickname.trim().toLocaleLowerCase('tr-TR');
  const isNicknameChanged = normalizedEditNickname !== (profile.nickname || '');

  function copyInviteCode() {
    if (!activeGroup?.invite_code) return;
    navigator.clipboard?.writeText(activeGroup.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function copyFullInviteMessage() {
    if (!activeGroup?.invite_code) return;
    const text = `🏆 ${activeGroup.name} lobisine katıl!\nLink: ${window.location.origin}\nDavet Kodu: ${activeGroup.invite_code}`;
    navigator.clipboard?.writeText(text);
    setCopiedInviteLink(true);
    setTimeout(() => setCopiedInviteLink(false), 2500);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileMsg({ type: '', text: '' });
    try {
      const compressed = await compressImageFile(file);
      setEditAvatarSrc(compressed);
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.message || 'Fotoğraf yüklenemedi.',
      });
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });

    if (normalizedEditNickname.length < 2 || normalizedEditNickname.length > 24) {
      setProfileMsg({
        type: 'error',
        text: 'İsim ve soyisim 2 ile 24 karakter arasında olmalı.',
      });
      return;
    }

    if (isNicknameChanged && !nicknameStatus.canChange) {
      setProfileMsg({
        type: 'error',
        text: nicknameStatus.message,
      });
      return;
    }

    const formattedAvatar = formatAvatarValue(editAvatarSrc, editRingColor);

    setSavingProfile(true);
    try {
      const { data, error: updErr } = await supabase
        .from('profiles')
        .update({
          nickname: normalizedEditNickname,
          avatar: formattedAvatar,
        })
        .eq('id', session.user.id)
        .select()
        .single();

      if (updErr) {
        if (updErr.code === '23505') {
          throw new Error('Bu isim zaten kayıtlı, lütfen farklı bir ad veya soyad dene.');
        }
        throw updErr;
      }

      setProfile(data);
      setEditNickname(data.nickname);
      await loadGroupMembers(activeGroup.id);
      setProfileMsg({
        type: 'success',
        text: isNicknameChanged
          ? 'İsim/soyisim ve profil görünümün güncellendi.'
          : 'Fotoğrafın ve profil görünümün güncellendi.',
      });
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.message || 'Profil güncellenemedi.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });

    if (newPassword.length < 6) {
      setPasswordMsg({
        type: 'error',
        text: 'Yeni şifre en az 6 karakter olmalı.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({
        type: 'error',
        text: 'Girdiğin iki şifre birbiriyle eşleşmiyor.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (pwErr) throw pwErr;

      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({
        type: 'success',
        text: 'Hesap şifren başarıyla güncellendi.',
      });
    } catch (err) {
      setPasswordMsg({
        type: 'error',
        text: err.message || 'Şifre güncellenemedi.',
      });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteActiveGroup() {
    if (!isAdmin || !activeGroup) return;
    const confirmed = window.confirm(
      `"${activeGroup.name}" lobisini kalıcı olarak silmek istediğine emin misin?`
    );
    if (!confirmed) return;

    setDeletingGroup(true);
    try {
      await supabase.from('group_members').delete().eq('group_id', activeGroup.id);
      const { error: delErr } = await supabase
        .from('groups')
        .delete()
        .eq('id', activeGroup.id);
      if (delErr) throw delErr;

      localStorage.removeItem('arkadas_ligi_group_id');
      await loadUserContext(session.user.id);
    } catch (err) {
      alert('Lobi silinirken hata oluştu: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setDeletingGroup(false);
    }
  }

  const previewAvatar = formatAvatarValue(editAvatarSrc, editRingColor);

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-900 pt-14 pb-28">
      <header className="bg-white border-b border-slate-200/80">
        <div className="max-w-lg mx-auto px-4 min-h-[4rem] py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shadow-emerald-600/20 shrink-0">
              {activeGroup.name.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[15px] font-extrabold text-slate-900 truncate">
                  {activeGroup.name}
                </h1>
                {isAdmin && (
                  <ShieldCheck
                    className="w-4 h-4 text-emerald-600 shrink-0"
                    title="Lobi Yöneticisi"
                  />
                )}
              </div>

              <button
                onClick={copyInviteCode}
                className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-500 hover:text-emerald-600 transition"
              >
                {copiedCode ? (
                  <span className="text-emerald-600 flex items-center gap-1 font-sans font-bold">
                    <Check className="w-3 h-3" />
                    Kod kopyalandı
                  </span>
                ) : (
                  <>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                      {activeGroup.invite_code}
                    </span>
                    <Copy className="w-3 h-3 text-slate-400" />
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('profile')}
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/90 active:scale-95 transition shrink-0"
          >
            <UserAvatar
              avatar={profile.avatar}
              nickname={profile.nickname}
              size="xs"
            />
            <span className="text-xs font-bold text-slate-800 max-w-[78px] truncate">
              {profile.nickname}
            </span>
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4">
        {activeTab === 'matches' && (
          <MatchesTab
            groupId={activeGroup.id}
            userId={session.user.id}
            isAdmin={isAdmin}
            membersMap={membersMap}
          />
        )}

        {activeTab === 'proposals' && (
          <ProposalsTab
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

        {activeTab === 'profile' && (
          <div className="space-y-4 pb-4">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900 mb-4">
                Profil & Fotoğrafım
              </h2>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <UserAvatar
                      avatar={previewAvatar}
                      nickname={editNickname || 'Üye'}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <div className="text-base font-extrabold text-slate-900 truncate">
                        {normalizedEditNickname || 'ad soyad'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {isAdmin ? 'Lobi Yöneticisi' : 'Lobi Üyesi'}
                      </div>
                    </div>
                  </div>

                  <input
                    ref={editFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => editFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm active:scale-95 transition shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Fotoğraf Yükle</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">
                    Profil Çerçeve Rengi
                  </label>
                  <div className="flex items-center gap-2.5">
                    {AVATAR_RINGS.map((ring) => (
                      <button
                        key={ring.id}
                        type="button"
                        onClick={() => setEditRingColor(ring.id)}
                        title={ring.label}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition ${
                          editRingColor === ring.id
                            ? 'border-slate-900 scale-110 bg-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded-full ${ring.dotClass}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-bold text-slate-600">
                      veya Hazır Avatar Seç
                    </label>
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEditAvatarTab('portrait3d')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          editAvatarTab === 'portrait3d'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Karakter
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAvatarTab('badge')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          editAvatarTab === 'badge'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Forma Rozeti
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-2.5">
                    {REALISTIC_AVATARS[editAvatarTab].map((item) => {
                      const selected = editAvatarSrc === item;
                      const initials = (editNickname.trim() || 'Ü')
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setEditAvatarSrc(item)}
                          className={`aspect-square rounded-full overflow-hidden border-2 transition active:scale-95 flex items-center justify-center ${
                            selected
                              ? 'border-emerald-600 scale-105 shadow-md'
                              : 'border-transparent opacity-85 hover:opacity-100'
                          }`}
                        >
                          {item.startsWith('badge:') ? (
                            <div
                              className={`w-full h-full bg-gradient-to-br ${item.replace(
                                'badge:',
                                ''
                              )} flex items-center justify-center text-xs font-extrabold text-white`}
                            >
                              {initials}
                            </div>
                          ) : (
                            <img
                              src={item}
                              alt="Avatar"
                              className="w-full h-full object-cover bg-slate-100"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-600">
                      İsim ve Soyisim
                    </label>
                    {!nicknameStatus.canChange && (
                      <span className="text-[11px] font-bold text-amber-600">
                        {nicknameStatus.remainingDays} gün kaldı
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={24}
                    disabled={!nicknameStatus.canChange}
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    className="w-full bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                  />

                  <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-[11px] font-medium text-amber-800 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      {nicknameStatus.message} İsim ve soyismini daima{' '}
                      <strong>küçük harflerle</strong> yazmalısın.
                    </span>
                  </div>
                </div>

                {profileMsg.text && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold ${
                      profileMsg.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : 'bg-rose-50 border border-rose-200 text-rose-600'
                    }`}
                  >
                    {profileMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                >
                  {savingProfile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Profil Değişikliklerini Kaydet'
                  )}
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Hesap & Şifre Güvenliği
              </h3>

              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Kayıtlı E-posta Adresi
                  </div>
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {session.user.email}
                  </div>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Yeni Şifre Belirle
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <input
                    type="password"
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Yeni şifreyi tekrar yaz"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>

                {passwordMsg.text && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold ${
                      passwordMsg.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : 'bg-rose-50 border border-rose-200 text-rose-600'
                    }`}
                  >
                    {passwordMsg.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingPassword || !newPassword}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2 transition"
                >
                  {savingPassword ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Şifreyi Güncelle'
                  )}
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">
                  Lobi & Kadro ({membersList.length} Üye)
                </h3>
                <button
                  onClick={copyFullInviteMessage}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copiedInviteLink ? 'Kopyalandı!' : 'Davet Et'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {membersList.map((m) => (
                  <div
                    key={m.id}
                    className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-slate-50 border border-slate-200"
                  >
                    <UserAvatar avatar={m.avatar} nickname={m.nickname} size="xs" />
                    <span className="text-xs font-bold text-slate-800">
                      {m.nickname}
                    </span>
                    {m.role === 'admin' && (
                      <span className="text-[10px] font-bold text-emerald-600">
                        Yönetici
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Kayıtlı Lobilerim
                </div>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setActiveGroupId(g.id);
                      localStorage.setItem('arkadas_ligi_group_id', g.id);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold border transition ${
                      g.id === activeGroup.id
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {g.id === activeGroup.id && (
                      <Check className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                ))}

                {isAdmin && (
                  <button
                    onClick={() => setShowAddGroup(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-400 transition"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" />
                    Yeni Lobi Kur
                  </button>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                {isAdmin && (
                  <button
                    onClick={handleDeleteActiveGroup}
                    disabled={deletingGroup}
                    className="flex-1 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-100 flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingGroup ? 'Siliniyor...' : 'Lobiyi Sil'}
                  </button>
                )}

                <button
                  onClick={() => supabase.auth.signOut()}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-4 inset-x-4 z-30 max-w-md mx-auto">
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-xl shadow-slate-900/10 rounded-3xl p-1.5 grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab('matches')}
            className={`py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition active:scale-95 ${
              activeTab === 'matches'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Maçlar</span>
          </button>

          <button
            onClick={() => setActiveTab('proposals')}
            className={`py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition active:scale-95 ${
              activeTab === 'proposals'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Vote className="w-4 h-4" />
            <span>Oylamalar</span>
          </button>

          <button
            onClick={() => setActiveTab('shares')}
            className={`py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition active:scale-95 ${
              activeTab === 'shares'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Öneriler</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition active:scale-95 ${
              activeTab === 'profile'
                ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
