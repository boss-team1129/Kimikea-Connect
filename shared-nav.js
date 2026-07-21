(function () {
  const HOME_URL = getHomeUrl();
  let isNavigating = false;

  function getHomeUrl() {
    if (window.location.hostname === 'boss-team1129.github.io') {
      return '/Kimikea-Connect/';
    }
    const path = window.location.pathname;
    return path.includes('/stylebook/') ? '../index.html' : './index.html';
  }

  function safeVibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (error) {
      // Haptics are optional. Unsupported devices should stay silent.
    }
  }

  function goHome() {
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.home === 'function') {
      window.KimikeaConnectNav.home();
      return;
    }
    window.location.href = HOME_URL;
  }

  function goSearch() {
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.search === 'function') {
      window.KimikeaConnectNav.search();
      return;
    }
    window.location.href = `${HOME_URL}?view=search`;
  }

  function goMyPage() {
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.mypage === 'function') {
      window.KimikeaConnectNav.mypage();
      return;
    }
    window.location.href = `${HOME_URL}?view=mypage`;
  }

  function goBack() {
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.back === 'function') {
      const handled = window.KimikeaConnectNav.back();
      if (handled !== false) return;
    }
    setBackEnabled(false);
  }

  function setBackEnabled(enabled) {
    const button = document.querySelector('[data-kc-nav-action="back"]');
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.classList.toggle('is-disabled', !enabled);
  }

  function refreshBackState() {
    const nav = document.querySelector('[data-kc-bottom-nav]');
    const locked = Boolean(window.KimikeaConnectNav && typeof window.KimikeaConnectNav.isLocked === 'function' && window.KimikeaConnectNav.isLocked());
    if (nav) nav.classList.toggle('is-locked', locked);
    if (locked) {
      document.querySelectorAll('.kc-bottom-nav__button').forEach((button) => {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.classList.remove('is-disabled');
      });
      return;
    }
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.canGoBack === 'function') {
      setBackEnabled(Boolean(window.KimikeaConnectNav.canGoBack()));
      document.querySelectorAll('.kc-bottom-nav__button:not([data-kc-nav-action="back"])').forEach((button) => {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
        button.classList.remove('is-disabled');
      });
      return;
    }
    setBackEnabled(false);
  }

  function handleAction(action) {
    if (window.KimikeaConnectNav && typeof window.KimikeaConnectNav.isLocked === 'function' && window.KimikeaConnectNav.isLocked()) {
      refreshBackState();
      return;
    }
    if (isNavigating) return;
    isNavigating = true;
    safeVibrate();
    window.setTimeout(() => {
      isNavigating = false;
    }, 380);

    if (action === 'back') goBack();
    if (action === 'home') goHome();
    if (action === 'search') goSearch();
    if (action === 'mypage') goMyPage();
  }

  function createButton(action, icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kc-bottom-nav__button';
    button.dataset.kcNavAction = action;
    button.setAttribute('aria-label', label);
    button.innerHTML = `
      <span class="kc-bottom-nav__icon" aria-hidden="true">${icon}</span>
      <span class="kc-bottom-nav__label">${label}</span>
    `;
    button.addEventListener('click', () => handleAction(action));
    return button;
  }

  function mountBottomNav() {
    if (document.querySelector('[data-kc-bottom-nav]')) return;
    document.body.classList.add('kc-has-bottom-nav');
    const nav = document.createElement('nav');
    nav.className = 'kc-bottom-nav';
    nav.dataset.kcBottomNav = 'true';
    nav.setAttribute('aria-label', 'Kimikea Connect 共通ナビゲーション');
    nav.append(
      createButton('back', '←', '戻る'),
      createButton('home', '⌂', 'ホーム'),
      createButton('search', '⌕', '検索'),
      createButton('mypage', '○', 'マイページ')
    );
    document.body.appendChild(nav);
    refreshBackState();
    window.addEventListener('kimikea:navigation-state', refreshBackState);
    window.addEventListener('popstate', () => window.setTimeout(refreshBackState, 0));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBottomNav, { once: true });
  } else {
    mountBottomNav();
  }
})();
