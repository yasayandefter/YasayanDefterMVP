"use strict";

const ROUTES = new Set(["home", "research", "notebook", "collections", "personal", "profile"]);

async function shellReady(page) {
  const shell = page.locator("#workspaceShell156");
  await shell.waitFor({ state: "visible" });
  return shell;
}

async function navigateTo(page, route) {
  if (!ROUTES.has(route)) throw new Error(`UNKNOWN_SHELL_ROUTE:${route}`);
  await shellReady(page);
  const tab = page.locator(`.yd-shell-nav-item[data-shell-page="${route}"]`);
  await tab.waitFor({ state: "visible" });
  await tab.click();
  await page.waitForFunction(name => {
    const item = document.querySelector(`.yd-shell-nav-item[data-shell-page="${name}"]`);
    const panel = document.querySelector(`[data-shell-panel="${name}"]`);
    return item?.getAttribute("aria-selected") === "true" && panel && !panel.hidden;
  }, route);
  return page.locator(`[data-shell-panel="${route}"]`);
}

async function reloadTo(page, route) {
  await page.reload();
  return navigateTo(page, route);
}

async function bindRoute(page, route) {
  const restore = async () => { try { await navigateTo(page, route); } catch (_) {} };
  page.on("load", restore);
  page.on("response", response => {
    if (response.ok() && /\/api\/auth\/(?:login|session)$/.test(response.url())) restore();
  });
  await navigateTo(page, route);
}

module.exports = { ROUTES, shellReady, navigateTo, reloadTo, bindRoute };
