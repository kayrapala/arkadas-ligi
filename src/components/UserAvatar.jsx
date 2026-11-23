import React, { useState } from 'react';

export const AVATAR_RINGS = [
  {
    id: 'emerald',
    label: 'Zümrüt',
    ringClass: 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white',
    dotClass: 'bg-emerald-500',
  },
  {
    id: 'gold',
    label: 'Şampiyon',
    ringClass: 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white',
    dotClass: 'bg-amber-500',
  },
  {
    id: 'blue',
    label: 'Kraliyet',
    ringClass: 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white',
    dotClass: 'bg-blue-600',
  },
  {
    id: 'crimson',
    label: 'Ateş',
    ringClass: 'ring-2 ring-rose-500 ring-offset-2 ring-offset-white',
    dotClass: 'bg-rose-500',
  },
  {
    id: 'purple',
    label: 'Elit',
    ringClass: 'ring-2 ring-violet-600 ring-offset-2 ring-offset-white',
    dotClass: 'bg-violet-600',
  },
  {
    id: 'slate',
    label: 'Sade',
    ringClass: 'ring-1 ring-slate-200',
    dotClass: 'bg-slate-400',
  },
];

export const REALISTIC_AVATARS = {
  portrait3d: [
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Kaan&style=circle&backgroundColor=b6e3f4',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Emre&style=circle&backgroundColor=c0aede',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Mert&style=circle&backgroundColor=d1d4f9',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Arda&style=circle&backgroundColor=ffd5dc',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Kerem&style=circle&backgroundColor=ffdfbf',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Burak&style=circle&backgroundColor=bbf7d0',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Zeynep&style=circle&backgroundColor=fbcfe8',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Elif&style=circle&backgroundColor=bae6fd',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Selin&style=circle&backgroundColor=fde68a',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Ece&style=circle&backgroundColor=ddd6fe',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Can&style=circle&backgroundColor=a7f3d0',
    'https://api.dicebear.com/9.x/avataaars/svg?seed=Deniz&style=circle&backgroundColor=fed7aa',
  ],
  badge: [
    'badge:from-emerald-500 to-teal-700',
    'badge:from-slate-800 to-slate-950',
    'badge:from-blue-600 to-indigo-800',
    'badge:from-rose-600 to-red-800',
    'badge:from-amber-500 to-orange-700',
    'badge:from-violet-600 to-purple-800',
    'badge:from-cyan-500 to-blue-700',
    'badge:from-fuchsia-600 to-pink-800',
    'badge:from-lime-500 to-emerald-700',
    'badge:from-yellow-400 to-red-600',
    'badge:from-sky-500 to-indigo-900',
    'badge:from-neutral-700 to-stone-900',
  ],
};

export function parseAvatarValue(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      type: 'image',
      ring: 'slate',
      src: REALISTIC_AVATARS.portrait3d[0],
    };
  }

  if (raw.startsWith('img:')) {
    const firstColon = raw.indexOf(':');
    const secondColon = raw.indexOf(':', firstColon + 1);
    if (secondColon !== -1) {
      const ring = raw.slice(firstColon + 1, secondColon) || 'slate';
      const src = raw.slice(secondColon + 1);
      if (src.startsWith('badge:')) {
        return { type: 'badge', ring, gradient: src.replace('badge:', '') };
      }
      return { type: 'image', ring, src };
    }
  }

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) {
    return { type: 'image', ring: 'slate', src: raw };
  }

  return { type: 'emoji', ring: 'slate', emoji: raw };
}

export function formatAvatarValue(src, ring = 'slate') {
  return `img:${ring}:${src}`;
}

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Lütfen geçerli bir fotoğraf dosyası seç.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 220;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Fotoğraf işlenemedi.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

const SIZE_MAP = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-sm',
  md: 'w-11 h-11 text-base',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

export default function UserAvatar({
  avatar,
  nickname = 'Üye',
  size = 'md',
  className = '',
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const parsed = parseAvatarValue(avatar);
  const ringObj = AVATAR_RINGS.find((r) => r.id === parsed.ring) || AVATAR_RINGS[5];
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const initials = (nickname || 'Ü')
    .trim()
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (parsed.type === 'badge') {
    return (
      <div
        className={`${sizeClass} rounded-full bg-gradient-to-br ${parsed.gradient} ${ringObj.ringClass} flex items-center justify-center font-extrabold tracking-tight text-white shadow-sm shrink-0 select-none ${className}`}
      >
        {initials}
      </div>
    );
  }

  if (parsed.type === 'emoji' || imgFailed) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-slate-100 ${ringObj.ringClass} flex items-center justify-center font-bold text-slate-800 shrink-0 select-none ${className}`}
      >
        {parsed.emoji || initials}
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-slate-100 ${ringObj.ringClass} overflow-hidden shrink-0 shadow-sm ${className}`}
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
