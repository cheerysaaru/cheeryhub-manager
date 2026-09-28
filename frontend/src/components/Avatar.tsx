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
      xs: 'avatar-xs',
      sm: 'avatar-sm',
      md: 'avatar-md',
      lg: 'avatar-lg',
      xl: 'avatar-xl',
    };
    const shapeClasses = {
      circle: 'avatar-circle',
      square: 'avatar-square',
    };

    const getInitials = (n: string) =>
      n
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    if (src) {
      return (
        <div ref={ref} className={`avatar ${sizes[size]} ${shapeClasses[shape]} ${className}`} {...props}>
          <img src={src} alt={alt || name || 'Avatar'} className="avatar-img" />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`avatar ${sizes[size]} ${shapeClasses[shape]} avatar-initials ${className}`}
        {...props}
      >
        {name ? getInitials(name) : '?'}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';