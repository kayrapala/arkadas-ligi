import React, { useState } from 'react';

export const AVATAR_RINGS = [
  {
    id: 'emerald',
    label: 'Zümrüt',
    ringClass: 'ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.35)]',
    dotClass: 'bg-emerald-400',
  },
  {
    id: 'gold',
    label: 'Şampiyon',
    ringClass: 'ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.35)]',
    dotClass: 'bg-amber-400',
  },
  {
    id: 'blue',
    label: 'Kraliyet',
    ringClass: 'ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.35)]',
    dotClass: 'bg-sky-400',
  },
  {
    id: 'crimson',
    label: 'Ateş',
    ringClass: 'ring-2 ring-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.35)]',
    dotClass: 'bg-rose-500',
  },
  {
    id: 'purple',
    label: 'Elit',
    ringClass: 'ring-2 ring-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.35)]',
    dotClass: 'bg-violet-400',
  },
  {
    id: 'slate',
    label: 'Karbon',
    ringClass: 'ring-2 ring-slate-400/80',
    dotClass: 'bg-slate-400',
  },
];

export const REALISTIC_AVATARS = {
  portrait: [
    'https://api.dicebear.com/9.x/personas/svg?seed=Kaan&backgroundColor=0f172a',
    'https://api.dicebear.com/9.x/personas/svg?seed=Emre&backgroundColor=1e293b',
    'https://api.dicebear.com/9.x/personas/svg?seed=Mert&backgroundColor=064e3b',
    'https://api.dicebear.com/9.x/personas/svg?seed=Arda&backgroundColor=172554',
    'https://api.dicebear.com/9.x/personas/svg?seed=Kerem&backgroundColor=311042',
    'https://api.dicebear.com/9.x/personas/svg?seed=Burak&backgroundColor=3f1d1d',
    'https://api.dicebear.com/9.x/personas/svg?seed=Zeynep&backgroundColor=0f172a',
    'https://api.dicebear.com/9.x/personas/svg?seed=Elif&backgroundColor=064e3b',
    'https://api.dicebear.com/9.x/personas/svg?seed=Selin&backgroundColor=172554',
    'https://api.dicebear.com/9.x/personas/svg?seed=Ece&backgroundColor=311042',
    'https://api.dicebear.com/9.x/personas/svg?seed=Can&backgroundColor=1e293b',
    'https://api.dicebear.com/9.x/personas/svg?seed=Deniz&backgroundColor=0f172a',
  ],
  studio: [
    'https://api.dicebear.com/9.x/micah/svg?seed=Kaptan&backgroundColor=0f172a',
    'https://api.dicebear.com/9.x/micah/svg?seed=Maestro&backgroundColor=064e3b',
    'https://api.dicebear.com/9.x/micah/svg?seed=Golcu&backgroundColor=172554',
    'https://api.dicebear.com/9.x/micah/svg?seed=Taktisyen&backgroundColor=311042',
    'https://api.dicebear.com/9.x/micah/svg?seed=Lider&backgroundColor=1e293b',
    'https://api.dicebear.com/9.x/micah/svg?seed=Efsane&backgroundColor=3f1d1d',
    'https://api.dicebear.com/9.x/micah/svg?seed=Aslan&backgroundColor=0f172a',
    'https://api.dicebear.com/9.x/micah/svg?seed=Kartal&backgroundColor=064e3b',
    'https://api.dicebear.com/9.x/micah/svg?seed=Yildiz&backgroundColor=172554',
    'https://api.dicebear.com/9.x/micah/svg?seed=Firtina&backgroundColor=311042',
    'https://api.dicebear.com/9.x/micah/svg?seed=Atlas&backgroundColor=1e293b',
    'https://api.dicebear.com/9.x/micah/svg?seed=Vega&backgroundColor=0f172a',
  ],
};

export function parseAvatarValue(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      type: 'image',
      ring: 'emerald',
      src: REALISTIC_AVATARS.portrait[0],
    };
  }

  if (raw.startsWith('img:')) {
    const firstColon = raw.indexOf(':');
    const secondColon = raw.indexOf(':', firstColon + 1);
    if (secondColon !== -1) {
      const ring = raw.slice(firstColon + 1, secondColon) || 'emerald';
      const src = raw.slice(secondColon + 1);
      return { type: 'image', ring, src };
    }
  }

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) {
    return { type: 'image', ring: 'emerald', src: raw };
  }

  // Eski emoji kayıtları için geriye dönük uyumluluk
  return { type: 'emoji', ring: 'emerald', emoji: raw };
}

export function formatAvatarValue(src, ring = 'emerald') {
  return `img:${ring}:${src}`;
}

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Lütfen geçerli bir görsel dosyası seç.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 180;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Fotoğraf işlenemedi.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-14 h-14 text-xl',
  xl: 'w-16 h-16 text-2xl',
};

export default function UserAvatar({
  avatar,
  nickname = 'Üye',
  size = 'md',
  className = '',
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const parsed = parseAvatarValue(avatar);
  const ringObj = AVATAR_RINGS.find((r) => r.id === parsed.ring) || AVATAR_RINGS[0];
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  if (parsed.type === 'emoji' || imgFailed) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-slate-800/90 ${ringObj.ringClass} flex items-center justify-center font-bold text-white shrink-0 select-none ${className}`}
      >
        {parsed.emoji || nickname.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-slate-900 ${ringObj.ringClass} overflow-hidden shrink-0 ${className}`}
    >
      <img
        src={parsed.src}
        alt={nickname}
        onError={() => setImgFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
