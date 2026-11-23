import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpErr) throw signUpErr;
        if (!data.session) {
          setInfo('Kayıt oluşturuldu! E-posta onayı açıksa kutunu kontrol et, kapalıysa giriş yapabilirsin.');
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;
      }
    } catch (err) {
      const msg = err?.message || 'Bir hata oluştu.';
      if (msg.includes('Invalid login credentials')) {
        setError('E-posta veya şifre hatalı.');
      } else if (msg.includes('User already registered')) {
        setError('Bu e-posta zaten kayıtlı. Giriş Yap sekmesini kullan.');
      } else if (msg.includes('Password should be at least')) {
        setError('Şifre en az 6 karakter olmalı.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-5 py-10 bg-gradient-to-b from-[#090d16] via-[#0d1424] to-[#090d16]">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/10">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Arkadaş Ligi</h1>
          <p className="text-sm text-slate-400 mt-1">
            Ortak kararlar, günlük maç tahminleri ve öneri panosu
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setError(''); setInfo(''); }}
              className={`py-2 text-sm font-medium rounded-lg transition ${
                !isSignUp
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setError(''); setInfo(''); }}
              className={`py-2 text-sm font-medium rounded-lg transition ${
                isSignUp
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kayıt Ol
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                E-posta Adresi
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@mail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {error}
              </div>
            )}

            {info && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'Hesap Oluştur' : 'Giriş Yap'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
