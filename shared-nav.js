(function () {
  const HOME_URL = getHomeUrl();
  let isNavigating = false;

  function getHomeUrl() {
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
      window.KimikeaConnectNav.back();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    goHome();
  }

  function handleAction(action) {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBottomNav, { once: true });
  } else {
    mountBottomNav();
  }
})();
