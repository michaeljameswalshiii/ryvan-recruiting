/**
 * Trio Recruiting multi-tenant careers embed.
 *
 * Required: data-tenant="ryvan" (or your tenant subdomain/slug)
 *
 *   <div id="turnkey-careers"></div>
 *   <script
 *     src="https://turnkey-optimization.vercel.app/careers-embed.js"
 *     data-api-base="https://turnkey-optimization.vercel.app"
 *     data-tenant="ryvan"
 *     data-container="turnkey-careers"
 *     defer
 *   ></script>
 */
(function () {
  function scriptEl() {
    return (
      document.currentScript ||
      document.querySelector("script[src*='careers-embed']")
    );
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

  function preview(desc) {
    if (!desc) return "";
    var t = String(desc)
      .replace(/<\s*br\s*\/?>/gi, " ")
      .replace(/<\s*li[^>]*>/gi, " • ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[•·▪◦\-–—]\s*/g, "• ")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length > 160) t = t.slice(0, 159).trim() + "…";
    return t;
  }

  function render(jobs, root, apiBase, tenantSlug) {
    var html =
      '<div style="font-family:system-ui,-apple-system,sans-serif">' +
      '<input id="tk-careers-q" type="search" placeholder="Search roles…" ' +
      'style="width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;' +
      "border:1px solid #e2e8f0;border-radius:10px;font-size:14px\" />" +
      '<div id="tk-careers-list"></div></div>';
    root.innerHTML = html;

    var input = root.querySelector("#tk-careers-q");
    var list = root.querySelector("#tk-careers-list");

    function paint(filter) {
      var q = (filter || "").toLowerCase().trim();
      var shown = jobs.filter(function (j) {
        if (!q) return true;
        var hay = [j.title, j.description, j.location, j.employmentType, j.salaryRange]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.indexOf(q) !== -1;
      });

      if (!shown.length) {
        list.innerHTML =
          '<p style="color:#64748b;font-size:14px">No roles match your search.</p>';
        return;
      }

      var out = '<div style="display:grid;gap:12px">';
      for (var i = 0; i < shown.length; i++) {
        var j = shown[i];
        var slug = j.tenantSlug || tenantSlug;
        var href =
          j.detailUrl ||
          j.applyUrl ||
          apiBase + "/careers/" + encodeURIComponent(slug) + "/" + j.id;
        var meta = [j.location, j.employmentType, j.salaryRange]
          .filter(Boolean)
          .map(esc)
          .join(" · ");
        var prev = preview(j.description);
        out +=
          '<a href="' +
          esc(href) +
          '" target="_blank" rel="noopener" style="display:block;padding:16px;border:1px solid #e2e8f0;' +
          'border-radius:12px;text-decoration:none;color:inherit">' +
          '<div style="font-weight:600;font-size:17px;color:#0f172a">' +
          esc(j.title) +
          "</div>" +
          (meta
            ? '<div style="margin-top:6px;font-size:13px;color:#64748b">' +
              meta +
              "</div>"
            : "") +
          (prev
            ? '<p style="margin:10px 0 0;font-size:14px;color:#475569;line-height:1.45">' +
              esc(prev) +
              "</p>"
            : "") +
          '<div style="margin-top:10px;font-size:13px;font-weight:600;color:#0f172a">View & apply →</div>' +
          "</a>";
      }
      out += "</div>";
      list.innerHTML = out;
    }

    paint("");
    if (input) {
      input.addEventListener("input", function () {
        paint(input.value);
      });
    }
  }

  function boot() {
    var c = cfg();
    var root = document.getElementById(c.containerId);
    if (!root) return;

    if (!c.tenant) {
      root.innerHTML =
        '<p style="font-family:system-ui,sans-serif;color:#b91c1c">Missing data-tenant on embed script (e.g. data-tenant="ryvan").</p>';
      return;
    }

    var base = (c.apiBase || window.location.origin).replace(/\/$/, "");
    var url =
      base +
      "/api/public/careers/jobs?tenant=" +
      encodeURIComponent(c.tenant);
    if (c.key) url += "&key=" + encodeURIComponent(c.key);

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
        var slug = (data.tenant && data.tenant.slug) || c.tenant;
        render(data.jobs || [], root, base, slug);
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
