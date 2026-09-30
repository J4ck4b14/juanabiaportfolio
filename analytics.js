(() => {
  "use strict";

  const config = window.PORTFOLIO_API_CONFIG || {};
  const endpoint = String(config.endpoint || "").replace(/\/+$/, "");
  const site = String(config.site || "juan-abia-portfolio");
  const invitationCache = new Map();
  const previewCache = new Map();

  const configured = Boolean(endpoint && /^https:\/\//i.test(endpoint));

  async function request(path, payload) {
    if (!configured) throw new Error("Portfolio service is not configured.");

    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Portfolio service returned ${response.status}.`);
    return response.json();
  }

  async function resolveInvitation(token) {
    const value = String(token || "").trim();
    if (!value) return null;
    if (invitationCache.has(value)) return invitationCache.get(value);

    const payload = await request("/resolve", { site, token: value });
    const profile = payload?.profile || null;
    if (profile) invitationCache.set(value, profile);
    return profile;
  }

  async function resolvePreview(proof) {
    const value = String(proof || "").trim();
    if (!value) return null;
    if (previewCache.has(value)) return previewCache.get(value);

    const payload = await request("/preview-resolve", { proof: value });
    const profile = payload?.profile || null;
    if (profile) previewCache.set(value, profile);
    return profile;
  }

  function trackProject(token, project) {
    const invitation = String(token || "").trim();
    const slug = String(project || "").trim();
    if (!invitation || !slug || !configured) return;

    request("/project", { site, token: invitation, project: slug }).catch(() => {
      // Statistics should never interrupt the portfolio itself.
    });
  }

  window.PORTFOLIO_API = Object.freeze({
    configured,
    resolveInvitation,
    resolvePreview,
    trackProject,
  });
})();
