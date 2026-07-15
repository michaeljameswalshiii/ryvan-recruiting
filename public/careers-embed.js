/**
 * Turnkey careers embed for Squarespace / WordPress / static sites.
 *
 * Usage (Code block):
 *   <div id="turnkey-careers"></div>
 *   <script
 *     src="https://turnkey-optimization.vercel.app/careers-embed.js"
 *     data-api-base="https://turnkey-optimization.vercel.app"
 *     data-container="turnkey-careers"
 *     data-key=""
 *     data-tenant=""
 *     defer
 *   ></script>
 */
(function () {
  function scriptEl() {
    return document.currentScript || document.querySelector("script[src*='careers-embed']");
  }

  function cfg() {
    var s = scriptEl();
    return {
      apiBase: (s && s.getAttribute("data-api-base")) || "",
      containerId: (s && s.getAttribute("data-container")) || "turnkey-careers",
      key: (s && s.getAttribute("data-key")) || "",
      tenant: (s && s.getAttribute("data-tenant")) || "",
    };
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(jobs, root, apiBase) {
    if (!jobs.length) {
      root.innerHTML =
        '<p style="font-family:system-ui,sans-serif;color:#64748b">No open positions at this time.</p>';
      return;
    }
    var html = '<div style="font-family:system-ui,-apple-system,sans-serif;display:grid;gap:12px">';
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var href = j.detailUrl || j.applyUrl || apiBase + "/careers/" + j.id;
      html +=
        '<a href="' +
        esc(href) +
        '" target="_blank" rel="noopener" style="display:block;padding:16px;border:1px solid #e2e8f0;border-radius:12px;text-decoration:none;color:inherit">' +
        '<div style="font-weight:600;font-size:17px;color:#0f172a">' +
        esc(j.title) +
        "</div>" +
        '<div style="margin-top:6px;font-size:13px;color:#64748b">' +
        [j.companyName, j.location, j.employmentType, j.salaryRange]
          .filter(Boolean)
          .map(esc)
          .join(" · ") +
        "</div>" +
        (j.description
          ? '<p style="margin:10px 0 0;font-size:14px;color:#475569;line-height:1.45">' +
            esc(j.description.slice(0, 180)) +
            (j.description.length > 180 ? "…" : "") +
            "</p>"
          : "") +
        '<div style="margin-top:10px;font-size:13px;font-weight:600;color:#0f172a">View & apply →</div>' +
        "</a>";
    }
    html += "</div>";
    root.innerHTML = html;
  }

  function boot() {
    var c = cfg();
    var root = document.getElementById(c.containerId);
    if (!root) return;

    var base = (c.apiBase || window.location.origin).replace(/\/$/, "");
    var url = base + "/api/public/careers/jobs";
    var qs = [];
    if (c.tenant) qs.push("tenant=" + encodeURIComponent(c.tenant));
    if (c.key) qs.push("key=" + encodeURIComponent(c.key));
    if (qs.length) url += "?" + qs.join("&");

    root.innerHTML =
      '<p style="font-family:system-ui,sans-serif;color:#94a3b8">Loading open roles…</p>';

    fetch(url)
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Failed to load jobs");
          return data;
        });
      })
      .then(function (data) {
        render(data.jobs || [], root, base);
      })
      .catch(function (err) {
        root.innerHTML =
          '<p style="font-family:system-ui,sans-serif;color:#b91c1c">Could not load careers: ' +
          esc(err.message || "error") +
          "</p>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
