import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import UserAvatar, {
  AVATAR_RINGS,
  REALISTIC_AVATARS,
  formatAvatarValue,
  compressImageFile,
} from './UserAvatar';
import {
  PlusCircle,
  KeyRound,
  Loader2,
  LogOut,
  ArrowLeft,
  Camera,
  Info,
} from 'lucide-react';

export default function OnboardingScreen({
  user,
  profile,
  onProfileCreated,
  onGroupJoined,
  onCancel,
}) {
  const [nickname, setNickname] = useState('');
  const [avatarSrc, setAvatarSrc] = useState(REALISTIC_AVATARS.portrait3d[0]);
  const [ringColor, setRingColor] = useState('emerald');
  const [avatarTab, setAvatarTab] = useState('portrait3d');
  const [groupMode, setGroupMode] = useState('join');
  const [inviteCode, setInviteCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const combinedAvatar = formatAvatarValue(avatarSrc, ringColor);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const compressed = await compressImageFile(file);
      setAvatarSrc(compressed);
    } catch (err) {
      setError(err.message || 'Fotoğraf yüklenemedi.');
    }
  }

  async function handleCreateProfile(e) {
    e.preventDefault();
    setError('');
    const formattedName = nickname.trim().toLocaleLowerCase('tr-TR');
    if (formattedName.length < 2 || formattedName.length > 24) {
      setError('İsim ve soyisim 2 ile 24 karakter arasında olmalı.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: insErr } = await supabase
        .from('profiles')
        .insert({ id: user.id, nickname: formattedName, avatar: combinedAvatar })
        .select()
        .single();

      if (insErr) {
        if (insErr.code === '23505') {
          throw new Error('Bu isim zaten kayıtlı, lütfen farklı bir ad veya soyad gir.');
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
        if (!name) throw new Error('Lütfen bir lobi adı yaz.');
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
    <div className="min-h-screen flex flex-col justify-center px-4 py-8 bg-[#f8fafc] text-slate-900">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          {onCancel ? (
            <button
              onClick={onCancel}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm active:scale-95 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Lobiye Dön
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-sm active:scale-95 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Çıkış Yap
          </button>
        </div>

        {!profile ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/50">
            <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-1">
              Adım 1 / 2
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Profilini Oluştur</h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Kendi fotoğrafını yükle, karakterini seç veya forma rozetini belirle.
            </p>

            {/* Canlı Önizleme Kartı */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80 mb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <UserAvatar
                  avatar={combinedAvatar}
                  nickname={nickname || 'Üye'}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="text-base font-bold text-slate-900 truncate">
                    {nickname.trim().toLocaleLowerCase('tr-TR') || 'ad soyad'}
                  </div>
                  <div className="text-xs text-emerald-600 font-medium">
                    Canlı Profil Önizlemesi
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200 shadow-sm active:scale-95 transition shrink-0"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fotoğraf</span>
              </button>
            </div>

            <form onSubmit={handleCreateProfile} className="space-y-5">
              {/* Çerçeve Rengi */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Çerçeve Rengi
                </label>
                <div className="flex items-center gap-2.5">
                  {AVATAR_RINGS.map((ring) => (
                    <button
                      key={ring.id}
                      type="button"
                      onClick={() => setRingColor(ring.id)}
                      title={ring.label}
                      className={`w-8 h-8 rounded-full flex items-center justify-center border transition ${
                        ringColor === ring.id
                          ? 'border-slate-900 scale-110 bg-white shadow-sm'
                          : 'border-slate-200 bg-slate-50 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${ring.dotClass}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar Sekmeleri */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Görünüm Seç
                  </label>
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAvatarTab('portrait3d')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        avatarTab === 'portrait3d'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Karakter
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarTab('badge')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        avatarTab === 'badge'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Forma Rozeti
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-2.5">
                  {REALISTIC_AVATARS[avatarTab].map((item) => {
                    const selected = avatarSrc === item;
                    const initials = (nickname.trim() || 'Ü')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAvatarSrc(item)}
                        className={`aspect-square rounded-full overflow-hidden border-2 transition active:scale-95 flex items-center justify-center ${
                          selected
                            ? 'border-emerald-500 scale-105 shadow-md'
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

              {/* İsim & Soyisim Alanı + Küçük Harf Uyarı Mesajı */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  İsim ve Soyisim
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="örnek: ahmet yılmaz"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
                />
                <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-[11px] font-medium text-amber-800 leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Lütfen kendi <strong>isim ve soyismini</strong>, tamamı{' '}
                    <strong>küçük harflerle</strong> olacak şekilde gir (örnek: <em>ahmet yılmaz</em>).
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-600 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Devam Et'}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/50">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <UserAvatar avatar={profile.avatar} nickname={profile.nickname} size="md" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  Hoş geldin
                </div>
                <div className="text-base font-extrabold text-slate-900">
                  {profile.nickname}
                </div>
              </div>
            </div>

            <h2 className="text-lg font-extrabold text-slate-900">
              Lobiye Katıl veya Yeni Kur
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Arkadaşlarının davet kodunu gir ya da kendi lobini oluştur.
            </p>

            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl mb-5">
              <button
                type="button"
                onClick={() => {
                  setGroupMode('join');
                  setError('');
                }}
                className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  groupMode === 'join'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Kodla Katıl
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupMode('create');
                  setError('');
                }}
                className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
                  groupMode === 'create'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Yeni Lobi Kur
              </button>
            </div>

            <form onSubmit={handleGroupAction} className="space-y-4">
              {groupMode === 'join' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    6 Haneli Davet Kodu
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="A1B2C3"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-center text-lg font-mono tracking-widest uppercase text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Lobi Adı
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Örn: Lobi, Karargah, Bizim Ekip..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-600 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : groupMode === 'join' ? (
                  'Lobiye Katıl'
                ) : (
                  'Lobiyi Oluştur'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
