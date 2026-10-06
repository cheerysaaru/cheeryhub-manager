export const PROFILE_EVENT = 'profile-updated';

export function getStoredUserName(): string | null {
  try {
    return localStorage.getItem('userName');
  } catch {
    return null;
  }
}

export function getDisplayName(fallback: string): string {
  return getStoredUserName() || fallback;
}

export function getProfilePic(): string | null {
  try {
    return localStorage.getItem('userProfilePic');
  } catch {
    return null;
  }
}

export function notifyProfileUpdated(): void {
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

const AVATAR_SELECTOR = '.nav-avatar, .settings-avatar';

export function cropAndSaveProfilePic(
  imageSrc: string,
  offsetX: number,
  offsetY: number,
  zoom: number
): Promise<string> {
  const AVATAR_SIZE = 200; // save at 200×200px — enough for a circle avatar

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas is not supported in this browser'));
      return;
    }

    const img = new Image();
    img.onload = function () {
      // Calculate the source crop area based on zoom and pan offset
      const cropSize = Math.min(img.width, img.height) / zoom;
      const srcX = Math.max(
        0,
        Math.min(img.width / 2 - cropSize / 2 + offsetX, img.width - cropSize)
      );
      const srcY = Math.max(
        0,
        Math.min(img.height / 2 - cropSize / 2 + offsetY, img.height - cropSize)
      );

      // Draw circular clip
      ctx.beginPath();
      ctx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();

      // Draw the cropped + zoomed image
      ctx.drawImage(img, srcX, srcY, cropSize, cropSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

      // Export as JPEG at 80% quality to keep localStorage size small
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function () {
      reject(new Error('Could not load the selected image'));
    };
    img.src = imageSrc;
  });
}

export function updateAllAvatars(base64: string | null): void {
  document.querySelectorAll<HTMLElement>(AVATAR_SELECTOR).forEach((el) => {
    const img = el.querySelector<HTMLImageElement>('img.avatar-img');
    if (base64) {
      if (img) {
        img.src = base64;
        img.style.display = '';
      }
      el.style.backgroundImage = `url("${base64}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = '';
      el.style.color = '';
    } else {
      if (img) img.style.display = 'none';
      el.style.backgroundImage = 'none';
      el.style.backgroundColor = '#2D5A1B';
      el.style.color = '#ffffff';
      // Initials text is rendered by React (do not mutate textContent).
    }
  });
}

export function initAvatar(): void {
  const savedPic = getProfilePic();
  const userName = getStoredUserName() || 'U';
  const initial = userName.charAt(0).toUpperCase();

  document.querySelectorAll<HTMLElement>(AVATAR_SELECTOR).forEach((el) => {
    if (savedPic) {
      const img = el.querySelector<HTMLImageElement>('img.avatar-img');
      if (img) {
        img.src = savedPic;
        img.style.display = '';
      }
      el.style.backgroundImage = `url(${savedPic})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      const img = el.querySelector<HTMLImageElement>('img.avatar-img');
      if (img) img.style.display = 'none';
      el.style.backgroundImage = 'none';
      el.style.backgroundColor = '#2D5A1B';
      el.style.color = '#ffffff';
      if (!el.querySelector('.avatar-initials, img.avatar-img') && !el.textContent) {
        el.textContent = initial;
      }
    }
  });
}

export function saveProfilePic(base64: string): void {
  try {
    localStorage.setItem('userProfilePic', base64);
  } catch {
    /* Storage may be unavailable. */
  }
  updateAllAvatars(base64);
  notifyProfileUpdated();
}

export function removeProfilePic(): void {
  try {
    localStorage.removeItem('userProfilePic');
  } catch {
    /* Storage may be unavailable. */
  }
  updateAllAvatars(null);
  notifyProfileUpdated();
}
