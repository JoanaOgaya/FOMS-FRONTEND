import { useEffect } from 'react';

/** Brief green outline feedback when pressing Cancel/Close buttons. */
export function useCancelButtonFeedback(): void {
  useEffect(() => {
    const isDismiss = (btn: HTMLButtonElement) => {
      const label = btn.innerText.trim().toLowerCase();
      const title = btn.title.toLowerCase();
      return label === 'cancel' || label === 'close' || title === 'cancel' || title === 'close';
    };
    const clear = (btn: HTMLButtonElement) => {
      btn.style.outline = '';
      btn.style.outlineOffset = '';
      delete btn.dataset.greenOutline;
    };
    const down = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && isDismiss(btn)) {
        btn.style.outline = '2px solid #22C55E';
        btn.style.outlineOffset = '2px';
        btn.dataset.greenOutline = 'true';
      }
    };
    const up = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn?.dataset.greenOutline) setTimeout(() => clear(btn), 150);
    };
    const out = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn?.dataset.greenOutline) clear(btn);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('mouseup', up);
    document.addEventListener('mouseout', out);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('mouseout', out);
    };
  }, []);
}
