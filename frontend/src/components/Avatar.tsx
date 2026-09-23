import { HTMLAttributes, forwardRef } from 'react';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, name, size = 'md', shape = 'circle', className = '', ...props }, ref) => {
    const sizes = {
      xs: 'w-6 h-6 text-xs',
      sm: 'w-8 h-8 text-sm',
      md: 'w-10 h-10 text-base',
      lg: 'w-12 h-12 text-lg',
      xl: 'w-16 h-16 text-xl',
    };
    const shapeClasses = {
      circle: 'rounded-full',
      square: 'rounded-xl',
    };

    const getInitials = (n: string) =>
      n
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const getColor = (n: string) => {
      const colors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500',
        'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
        'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
        'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500',
      ];
      let hash = 0;
      for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
      return colors[Math.abs(hash) % colors.length];
    };

    if (src) {
      return (
        <div ref={ref} className={`avatar ${sizes[size]} ${shapeClasses[shape]} ${className}`} {...props}>
          <img src={src} alt={alt || name || 'Avatar'} className="w-full h-full object-cover" />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`avatar ${sizes[size]} ${shapeClasses[shape]} ${getColor(name || 'User')} text-white flex items-center justify-center font-semibold ${className}`}
        {...props}
      >
        {name ? getInitials(name) : '?'}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';