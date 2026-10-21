const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
function functionSource(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
function context(names, extra = {}) {
  const elements = {};
  const ctx = vm.createContext({
    URLSearchParams, window: { location: { search: '' }, scrollTo() {} },
    document: { getElementById: id => elements[id] ||= { hidden: true } },
    state: { sessionToken: '', orderUnlocked: false, products: [{}] },
    currentPublicPageKey: '', blockExtensionSimulatorNavigation: () => false,
    rememberKimikeaRoute() {}, notifyKimikeaNavigationState() {},
    setKimikeaUrlForRoute() {}, switchTab() {},
    ...extra,
  });
  vm.runInContext(names.map(functionSource).join('\n'), ctx);
  return { ctx, elements };
}
test('inline JavaScript parses', () => {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
test('existing order URL opens selection; partner URL remains protected', () => {
  const { ctx } = context(['normalizeKimikeaView', 'routeFromKimikeaUrl', 'isLoginRequiredKimikeaRoute']);
  ctx.window.location.search = '?view=order';
  assert.equal(ctx.routeFromKimikeaUrl().key, 'orderEntry');
  assert.equal(ctx.isLoginRequiredKimikeaRoute(ctx.routeFromKimikeaUrl()), false);
  ctx.window.location.search = '?view=partner-order';
  assert.equal(ctx.isLoginRequiredKimikeaRoute(ctx.routeFromKimikeaUrl()), true);
});
test('home and search order actions open selection without invoking login', () => {
  const seen = [];
  const { ctx } = context(['openOrbitMenu', 'openSearchResult'], { openPublicPage: key => seen.push(key) });
  ctx.openOrbitMenu('order'); ctx.openSearchResult('order');
  assert.deepEqual(seen, ['orderEntry', 'orderEntry']);
});
test('anonymous partner selection requests existing order login', () => {
  const seen = [];
  const { ctx, elements } = context(['isAuthenticatedSessionActive', 'openOrderPage'], {
    requireKimikeaLogin: route => seen.push(route.name),
  });
  ctx.openOrderPage();
  assert.deepEqual(seen, ['order']);
  assert.equal(elements.orderWorkspace, undefined);
});
test('authenticated partner selection opens orders without requesting login', () => {
  const { ctx, elements } = context(['isAuthenticatedSessionActive', 'openOrderPage'], {
    requireKimikeaLogin() { assert.fail('unexpected login'); },
  });
  ctx.state.sessionToken = 'local-test-session'; ctx.state.orderUnlocked = true;
  ctx.openOrderPage();
  assert.equal(elements.orderWorkspace.hidden, false);
  assert.equal(elements.loginView.hidden, true);
  assert.equal(elements.portalView.hidden, false);
});
test('member link opens a separate context without sharing opener', () => {
  const { ctx } = context(['isAuthenticatedSessionActive', 'renderOrderEntry']);
  assert.match(ctx.renderOrderEntry(), /href="https:\/\/kimikea.team-hair.jp" target="_blank" rel="noopener noreferrer"/);
  assert.match(ctx.renderOrderEntry(), /月額500円/);
});
