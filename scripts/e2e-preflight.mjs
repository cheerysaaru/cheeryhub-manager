import fetch from "node-fetch";
async function check() {
  try {
    const api = await fetch("http://localhost:8787/api/health");
    if (api.status !== 200) throw new Error(`API health check failed with status ${api.status}`);
    const web = await fetch("http://localhost:4173");
    if (web.status >= 400) throw new Error(`Web server check failed with status ${web.status}`);
    console.log("Preflight passed: API and Web are healthy.");
    process.exit(0);
  } catch (e) {
    console.error("Preflight failed:", e.message);
    process.exit(1);
  }
}
check();
