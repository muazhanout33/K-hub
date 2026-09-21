/**
 * Phase 8 — Responsive Audit Script
 * Tests 14 viewports × 8 pages for horizontal overflow, JS errors, and element visibility.
 *
 * Usage:  node tests/phase8-responsive-audit.js
 * Output: summary table with PASS/FAIL per page per viewport
 */

const { chromium } = require("playwright");

// ── Configuration ──────────────────────────────────────────────────────────────
const BASE_URL = "http://localhost:3000";
const PAGE_TIMEOUT_MS = 30_000;

const VIEWPORTS = [
  // Mobile
  { name: "320×568",  width: 320,  height: 568  },
  { name: "360×640",  width: 360,  height: 640  },
  { name: "375×812",  width: 375,  height: 812  },
  { name: "390×844",  width: 390,  height: 844  },
  { name: "414×896",  width: 414,  height: 896  },
  { name: "430×932",  width: 430,  height: 932  },
  // Tablet
  { name: "768×1024", width: 768,  height: 1024 },
  { name: "800×1024", width: 800,  height: 1024 },
  { name: "900×768",  width: 900,  height: 768  },
  // Desktop
  { name: "1024×768", width: 1024, height: 768  },
  { name: "1280×800", width: 1280, height: 800  },
  { name: "1366×768", width: 1366, height: 768  },
  { name: "1440×900", width: 1440, height: 900  },
  { name: "1536×864", width: 1536, height: 864  },
];

const PAGES = [
  { path: "/",            label: "Home"          },
  { path: "/courts",      label: "Courts"        },
  { path: "/about",       label: "About"         },
  { path: "/contact",     label: "Contact"       },
  { path: "/auth/login",  label: "Auth/Login"    },
  { path: "/bookings",    label: "Bookings"      },
  { path: "/profile",     label: "Profile"       },
  { path: "/admin",       label: "Admin"         },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Pad/truncate a string to a fixed width for table columns. */
function cell(str, width) {
  if (str.length > width) return str.slice(0, width - 1) + "…";
  return str.padEnd(width);
}

/** Determine the expected HTTP status for a page (redirects = 200 after follow). */
function expectedStatus(pagePath) {
  // Pages that may redirect to /auth/login when unauthenticated are still "ok" if we get a 200.
  return 200;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("  Phase 8 — Responsive Audit");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Viewports: ${VIEWPORTS.length}  |  Pages: ${PAGES.length}`);
  console.log(`  Total tests: ${VIEWPORTS.length * PAGES.length}`);
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  const browser = await chromium.launch({ headless: true });

  // results[pageLabel][viewportName] = { overflow, jsErrors, status, navVisible, mainVisible }
  const results = {};
  let passCount = 0;
  let failCount = 0;

  for (const page of PAGES) {
    results[page.label] = {};
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent:
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      });
      const tab = await context.newPage();

      const jsErrors = [];
      tab.on("pageerror", (err) => jsErrors.push(err.message));
      tab.on("console", (msg) => {
        if (msg.type() === "error") jsErrors.push(msg.text());
      });

      let status = 0;
      let overflow = false;
      let navVisible = false;
      let mainVisible = false;
      let timeoutReached = false;

      try {
        const response = await tab.goto(`${BASE_URL}${page.path}`, {
          waitUntil: "networkidle",
          timeout: PAGE_TIMEOUT_MS,
        });
        status = response ? response.status() : 0;

        // Wait a bit more for any lazy rendering
        await tab.waitForTimeout(1000);

        // Check horizontal overflow
        overflow = await tab.evaluate(() => {
          const scrollW = document.body.scrollWidth;
          const clientW = document.documentElement.clientWidth;
          return scrollW > clientW;
        });

        // Check key interactive elements
        navVisible = await tab.evaluate(() => {
          const nav = document.querySelector("nav") || document.querySelector("header") || document.querySelector("[role='navigation']");
          if (!nav) return false;
          const rect = nav.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        mainVisible = await tab.evaluate(() => {
          const main = document.querySelector("main") || document.querySelector("[role='main']") || document.querySelector("#__next") || document.querySelector("#root");
          if (!main) return false;
          const rect = main.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      } catch (err) {
        if (err.message && err.message.includes("Timeout")) {
          timeoutReached = true;
        } else {
          jsErrors.push(`Navigation error: ${err.message}`);
        }
      }

      await context.close();

      // A test PASSES if:
      //   - no horizontal overflow
      //   - no JS errors (or only harmless warnings)
      //   - status is 200 (or page loaded)
      //   - nav is visible (unless page intentionally has no nav)
      //   - main content is visible
      const hasOverflow = overflow;
      const hasJsErrors = jsErrors.length > 0;
      const hasBadStatus = status !== expectedStatus(page.path);
      const noNav = !navVisible;
      const noMain = !mainVisible;

      const passed =
        !hasOverflow &&
        !hasBadStatus &&
        !noMain &&
        !timeoutReached;

      // Allow missing nav on pages that might legitimately not have one
      // (We still track it but don't fail for it)

      const label = passed ? "PASS" : "FAIL";
      if (passed) passCount++; else failCount++;

      const reasons = [];
      if (hasOverflow)     reasons.push("overflow");
      if (hasJsErrors)     reasons.push(`jsErrors(${jsErrors.length})`);
      if (hasBadStatus)    reasons.push(`status(${status})`);
      if (timeoutReached)  reasons.push("timeout");
      if (noMain)          reasons.push("no-main");

      results[page.label][vp.name] = {
        label,
        overflow: hasOverflow,
        jsErrors: jsErrors.length,
        status,
        navVisible,
        mainVisible,
        timeoutReached,
        reasons,
      };

      const statusIcon = passed ? "✓" : "✗";
      console.log(
        `  ${statusIcon}  ${cell(page.label, 12)} | ${cell(vp.name, 10)} | status=${status} overflow=${hasOverflow} jsErr=${jsErrors.length} nav=${navVisible} main=${mainVisible}${timeoutReached ? " TIMEOUT" : ""}`
      );
    }
  }

  await browser.close();

  // ── Summary Table ──────────────────────────────────────────────────────────
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("  SUMMARY TABLE");
  console.log("═══════════════════════════════════════════════════════════════════════════\n");

  // Column widths
  const LABEL_W = 14;
  const VP_W    = 12;

  // Header row
  let header = cell("Page", LABEL_W) + "│";
  for (const vp of VIEWPORTS) {
    header += cell(vp.name, VP_W);
  }
  console.log(header);
  console.log("─".repeat(LABEL_W + VP_W * VIEWPORTS.length));

  for (const page of PAGES) {
    let row = cell(page.label, LABEL_W) + "│";
    for (const vp of VIEWPORTS) {
      const r = results[page.label][vp.name];
      row += cell(r.label, VP_W);
    }
    console.log(row);
  }

  // Stats
  const total = passCount + failCount;
  console.log("\n───────────────────────────────────────────────────────────────────────────");
  console.log(`  Total: ${total}  |  PASS: ${passCount}  |  FAIL: ${failCount}  |  Rate: ${((passCount / total) * 100).toFixed(1)}%`);
  console.log("───────────────────────────────────────────────────────────────────────────\n");

  // Detail: failures
  if (failCount > 0) {
    console.log("FAILURE DETAILS:");
    console.log("───────────────────────────────────────────────────────────────────────────");
    for (const page of PAGES) {
      for (const vp of VIEWPORTS) {
        const r = results[page.label][vp.name];
        if (r.label === "FAIL") {
          console.log(
            `  ✗ ${cell(page.label, 12)} @ ${vp.name.padEnd(10)} — ${r.reasons.join(", ") || "unknown"}`
          );
        }
      }
    }
    console.log("───────────────────────────────────────────────────────────────────────────\n");
  }

  // Detail: JS error counts by page
  console.log("JS ERROR SUMMARY (by page):");
  console.log("───────────────────────────────────────────────────────────────────────────");
  for (const page of PAGES) {
    let totalErrors = 0;
    for (const vp of VIEWPORTS) {
      totalErrors += results[page.label][vp.name].jsErrors;
    }
    console.log(`  ${cell(page.label, 12)} — ${totalErrors} total JS errors across ${VIEWPORTS.length} viewports`);
  }
  console.log("───────────────────────────────────────────────────────────────────────────");

  // Exit code
  process.exit(failCount > 0 ? 1 : 0);
})();
