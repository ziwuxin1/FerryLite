const transitionKey = 'ferry-enter-tool';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function installToolTransition(root: HTMLElement): void {
  let leaving = false;
  let timer: number | undefined;
  const restore = () => {
    window.clearTimeout(timer);
    leaving = false;
    root.classList.remove('page-leaving');
    root.removeAttribute('aria-busy');
    root.inert = false;
  };
  // A browser Back navigation can restore the outgoing document from bfcache.
  window.addEventListener('pageshow', restore);
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !/^\/app\/?$/.test(url.pathname) || reducedMotion()) return;
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem(transitionKey, String(Date.now())); } catch { /* Navigation also works without storage. */ }
    root.setAttribute('aria-busy', 'true');
    root.inert = true;
    root.classList.add('page-leaving');
    timer = window.setTimeout(() => {
      try { location.assign(url.href); } catch { restore(); }
    }, 180);
  });
}

export function enterTool(root: HTMLElement): void {
  let recent = false;
  try {
    const started = Number(sessionStorage.getItem(transitionKey));
    sessionStorage.removeItem(transitionKey);
    recent = started > 0 && Date.now() - started < 30_000;
  } catch { recent = true; }
  if (!recent || reducedMotion()) return;
  root.classList.add('page-entering');
  const finish = () => root.classList.remove('page-entering');
  root.addEventListener('animationend', finish, { once: true });
  window.setTimeout(finish, 600);
}
