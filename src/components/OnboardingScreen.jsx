import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, PlusCircle, KeyRound, Loader2, Sparkles, LogOut } from 'lucide-react';

const AVATARS = ['⚽', '🔥', '🦁', '🦅', '💛', '💙', '👑', '😎', '🎬', '🍕', '🎮', '🚀'];

export default function OnboardingScreen({ user, profile, onProfileCreated, onGroupJoined }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('⚽');
  const [groupMode, setGroupMode] = useState('join'); // 'join' | 'create'
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreateProfile(e) {
    e.preventDefault();
    setError('');
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError('Takma ad 2 ile 24 karakter arasında olmalı.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: insErr } = await supabase
        .from('profiles')
        .insert({ id: user.id, nickname: trimmed, avatar })
        .select()
        .single();

      if (insErr) {
        if (insErr.code === '23505') {
          throw new Error('Bu takma ad zaten kullanılıyor, lütfen başka bir isim seç.');
        }
        throw insErr;
      }
      onProfileCreated(data);
    } catch (err) {
      setError(err.message || 'Profil oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGroupAction(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (groupMode === 'create') {
        const name = groupName.trim();
        if (!name) throw new Error('Lütfen bir grup adı yaz.');
        const { data: gid, error: rpcErr } = await supabase.rpc('create_group', {
          p_name: name,
        });
        if (rpcErr) throw rpcErr;
        onGroupJoined(gid);
      } else {
        const code = inviteCode.trim().toUpperCase();
        if (!code) throw new Error('Lütfen 6 haneli davet kodunu gir.');
        const { data: gid, error: rpcErr } = await supabase.rpc('join_group', {
          p_code: code,
        });
        if (rpcErr) throw rpcErr;
        onGroupJoined(gid);
      }
    } catch (err) {
      setError(err.message || 'İşlem başarısız oldu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-5 py-10 bg-[#090d16]">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
          >
            <LogOut className="w-3.5 h-3.5" />
            Çıkış Yap
          </button>
        </div>

        {!profile ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              Adım 1 / 2
            </div>
            <h2 className="text-xl font-bold text-white">Profilini Oluştur</h2>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Arkadaşlarının puan tablosunda ve oylamalarda göreceği adını ve simgeni seç.
            </p>

            <form onSubmit={handleCreateProfile} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Avatar Seç
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVATARS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setAvatar(item)}
                      className={`h-11 rounded-xl text-xl flex items-center justify-center border transition ${
                        avatar === item
                          ? 'bg-emerald-500/20 border-emerald-500 scale-105'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Takma Ad (Nickname)
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Örn: Ahmet, Kral10..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Devam Et'}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Users className="w-4 h-4" />
              Hoş geldin, {profile.avatar} {profile.nickname}
            </div>
            <h2 className="text-xl font-bold text-white">Bir Gruba Katıl veya Kur</h2>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Arkadaşlarının davet kodunu gir ya da yeni bir grup kurup kodu onlara gönder.
            </p>

            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => { setGroupMode('join'); setError(''); }}
                className={`py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                  groupMode === 'join'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Kodla Katıl
              </button>
              <button
                type="button"
                onClick={() => { setGroupMode('create'); setError(''); }}
                className={`py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
                  groupMode === 'create'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Yeni Grup Kur
              </button>
            </div>

            <form onSubmit={handleGroupAction} className="space-y-4">
              {groupMode === 'join' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    6 Haneli Davet Kodu
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Örn: A1B2C3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest uppercase text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Grup Adı
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Örn: Bizim Tayfa FC"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : groupMode === 'join' ? (
                  'Gruba Katıl'
                ) : (
                  'Grubu Oluştur'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
