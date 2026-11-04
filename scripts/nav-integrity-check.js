const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

const requiredRoutes = ["home", "customer", "technician", "admin", "about", "how-it-works", "help", "contact", "terms", "privacy"];
const requiredFooter = ["about", "how-it-works", "technician", "help", "contact", "terms", "privacy"];
const problems = [];

function fail(message) {
  problems.push(message);
}

function extractAll(regex, source) {
  return Array.from(source.matchAll(regex), (match) => match[1]);
}

function hasView(route) {
  const view = route.startsWith("profile-") ? "profile" : route;
  return html.includes(`id="${view}-view"`);
}

function routeSetFromApp() {
  const match = app.match(/const ROUTES = new Set\(\[([^\]]+)\]\)/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

const routes = routeSetFromApp();
if (!routes.length) fail("ROUTES registry was not found in public/app.js.");

requiredRoutes.forEach((route) => {
  if (!routes.includes(route)) fail(`Missing route in ROUTES registry: #${route}`);
  if (!hasView(route)) fail(`Missing view section for route: #${route}`);
});

requiredFooter.forEach((route) => {
  const hasFooterLink = new RegExp(`<a[^>]+href="#${route}"[^>]+data-view-link="${route}"`).test(html);
  if (!hasFooterLink) fail(`Footer link is missing or incorrectly wired: #${route}`);
});

extractAll(/data-view-link="([^"]+)"/g, html).forEach((route) => {
  if (!routes.includes(route)) fail(`data-view-link points to an unknown route: ${route}`);
  if (!hasView(route)) fail(`data-view-link has no matching view: ${route}`);
});

const ids = extractAll(/id="([^"]+)"/g, html);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
[...new Set(duplicateIds)].forEach((id) => fail(`Duplicate HTML id found: ${id}`));

extractAll(/href="([^"]+)"/g, html).forEach((href) => {
  if (href.startsWith("#")) {
    const route = href.slice(1);
    if (!routes.includes(route)) fail(`Hash link points to an unknown route: ${href}`);
    if (!hasView(route)) fail(`Hash link has no matching view: ${href}`);
    return;
  }
  if (href.startsWith("/api/reports/")) return;
  if (href.startsWith("/styles.css")) return;
  if (href.startsWith("tel:")) return;
  if (href.startsWith("mailto:")) return;
  if (href.startsWith("https://wa.me/")) return;
  fail(`Unreviewed href destination: ${href}`);
});

const requiredCodeSignals = [
  "function isKnownRoute",
  "function routeTab",
  "window.addEventListener(\"hashchange\"",
  "document.body.dataset.view",
];
requiredCodeSignals.forEach((signal) => {
  if (!app.includes(signal)) fail(`Navigation code signal missing: ${signal}`);
});

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: "localhost", port: 4173, path: pathname, timeout: 2500 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function runHttpSmoke() {
  try {
    for (const route of requiredRoutes) {
      const status = await request(`/?navIntegrity=1#${route}`);
      if (status !== 200) fail(`Route smoke failed for #${route}: HTTP ${status}`);
    }
  } catch (error) {
    fail(`Local route smoke could not reach http://localhost:4173 (${error.message}). Start the app before completing navigation QA.`);
  }
}

(async () => {
  await runHttpSmoke();
  if (problems.length) {
    console.error("Navigation integrity check failed:");
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }
  console.log("Navigation integrity check passed.");
  console.log(`Checked routes: ${requiredRoutes.map((route) => `#${route}`).join(", ")}`);
})();
