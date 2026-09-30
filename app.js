(() => {
  "use strict";

  const app = document.getElementById("app");
  const data = window.PORTFOLIO_DATA;
  const api = window.PORTFOLIO_API;
  const cleanups = [];
  let renderRevision = 0;
  let basePath = normalizeBase(new URL(".", document.baseURI).pathname);

  function normalizeBase(path) {
    if (!path || path === "/") return "";
    return path.replace(/\/+$/, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function asset(path) {
    const clean = String(path || "").replace(/^\/+/, "");
    return `${basePath}/${clean}`.replace(/\/{2,}/g, "/");
  }

  function routeUrl(route) {
    const clean = route === "/" ? "" : `/${String(route).replace(/^\/+|\/+$/g, "")}`;
    return `${basePath}${clean}` || "/";
  }

  function logicalRoute() {
    const params = new URLSearchParams(location.search);
    const recovered = params.get("route");
    if (recovered) {
      const target = routeUrl(recovered);
      history.replaceState({}, "", target + location.hash);
      return recovered.startsWith("/") ? recovered : `/${recovered}`;
    }

    let path = location.pathname;
    if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length);
    return path || "/";
  }

  function clearActiveWork() {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      try { cleanup(); } catch {}
    }
  }

  function navigate(route, { replace = false } = {}) {
    clearActiveWork();
    history[replace ? "replaceState" : "pushState"]({}, "", routeUrl(route));
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function link(route, label, className = "", attrs = "") {
    return `<a href="${escapeHtml(routeUrl(route))}" data-route="${escapeHtml(route)}" class="${escapeHtml(className)}" ${attrs}>${label}</a>`;
  }

  function installInternalLinks() {
    app.querySelectorAll("[data-route]").forEach((element) => {
      element.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || element.target === "_blank") return;
        event.preventDefault();
        navigate(element.dataset.route || "/");
      });
    });
  }

  function contextRoute(context) {
    return context.kind === "preview"
      ? `/preview/${encodeURIComponent(context.proof)}`
      : `/${encodeURIComponent(context.token)}`;
  }

  function projectRoute(context, slug) {
    return `${contextRoute(context)}/project/${encodeURIComponent(slug)}`;
  }

  function renderResolving() {
    document.title = "Opening portfolio — Juan Abia Merino";
    app.innerHTML = `
      <main class="terminal-page">
        <section class="terminal-window" aria-live="polite">
          <div class="terminal-titlebar"><span>profile-loader — bash</span><span aria-hidden="true">[ _ ] [ □ ] [ × ]</span></div>
          <div class="terminal-body boot-body">
            <p class="terminal-command no-margin">juan@portfolio:~$ ./identify --invitation</p>
            <p><span class="timestamp">[00:00]</span> Verifying invitation<span class="terminal-ellipsis" aria-hidden="true">...</span></p>
          </div>
        </section>
      </main>`;
  }

  function renderServiceError() {
    document.title = "Portfolio unavailable — Juan Abia Merino";
    app.innerHTML = `
      <main class="not-found">
        <p class="eyebrow green">Service unavailable</p>
        <h1>The portfolio could not verify this invitation.</h1>
        <p>Please try again in a moment.</p>
        <button id="retry-portfolio" class="button button-outline" type="button">Retry</button>
      </main>`;
    document.getElementById("retry-portfolio")?.addEventListener("click", render);
  }

  function renderAccess(invalidKey = false) {
    document.title = "Portfolio Access — Juan Abia Merino";
    app.innerHTML = `
      <main class="terminal-page">
        <section class="terminal-window" aria-labelledby="access-title">
          <div class="terminal-titlebar">
            <span>juan@portfolio:~</span>
            <span aria-hidden="true">[ _ ] [ □ ] [ × ]</span>
          </div>
          <div class="terminal-body access-body">
            <p>Portfolio Access Terminal</p>
            <p>Copyright (c) Juan Abia Merino. All rights reserved.</p>
            <p class="terminal-command">$ portfolio --open private</p>
            <p id="access-title" class="terminal-heading">${invalidKey ? "ERROR: no invitation match found." : "Authentication required."}</p>
            <p class="${invalidKey ? "error" : "muted"}">
              ${invalidKey
                ? "Check the invitation exactly as provided, then try again."
                : "Enter the invitation included with the application."}
            </p>

            <form id="access-form" class="access-form" novalidate>
              <span aria-hidden="true" class="shell-prompt">juan@portfolio:~$</span>
              <label for="access-key" class="sr-only">Application invitation</label>
              <input id="access-key" name="access-key" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="invitation" autofocus />
              <button type="submit" class="sr-only">Enter</button>
            </form>
            <p id="access-error" role="alert" class="error access-error"></p>
            <p class="terminal-note">Tip: paste the complete path from the application, or type the invitation and press Enter.</p>
          </div>
        </section>
      </main>`;

    const form = document.getElementById("access-form");
    const input = document.getElementById("access-key");
    const error = document.getElementById("access-error");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = input.value.trim();
      if (!token) {
        error.textContent = "stderr: Enter the invitation included with the application.";
        return;
      }
      if (!api?.configured) {
        error.textContent = "stderr: Portfolio service is unavailable.";
        return;
      }

      input.disabled = true;
      error.textContent = "Verifying invitation…";
      try {
        const profile = await api.resolveInvitation(token);
        if (!profile) {
          error.textContent = "stderr: No matching invitation was found.";
          input.disabled = false;
          input.focus();
          return;
        }
        navigate(`/${encodeURIComponent(token)}`);
      } catch {
        error.textContent = "stderr: Could not verify the invitation. Try again.";
        input.disabled = false;
        input.focus();
      }
    });
    input.focus();
  }

  function renderBoot(context, profile) {
    document.title = `${profile.role} — Juan Abia Merino`;
    const featured = profile.featuredProjects.map(data.getProject).filter(Boolean);

    app.innerHTML = `
      <main class="terminal-page">
        <section class="terminal-window" aria-live="polite" aria-atomic="false">
          <div class="terminal-titlebar">
            <span>profile-loader — bash</span>
            <span aria-hidden="true">[ _ ] [ □ ] [ × ]</span>
          </div>
          <div class="terminal-body boot-body">
            <p class="terminal-command no-margin">juan@portfolio:~$ ./identify --invitation [accepted]</p>
            <div id="boot-lines" class="boot-lines">
              <p><span class="timestamp">[00:00]</span> Identifying<span class="terminal-ellipsis" aria-hidden="true">...</span></p>
            </div>
            <div class="progress-wrap" role="progressbar" aria-label="Portfolio loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="18">
              <div class="progress-row">
                <span class="timestamp">load</span>
                <span class="progress-track"><span id="progress-bar" class="progress-bar" style="width:18%"></span></span>
                <span id="progress-value" class="progress-value">18%</span>
              </div>
            </div>
            <div id="boot-ready"></div>
          </div>
        </section>
      </main>`;

    const lines = document.getElementById("boot-lines");
    const bar = document.getElementById("progress-bar");
    const value = document.getElementById("progress-value");
    const progressWrap = document.querySelector(".progress-wrap");
    const ready = document.getElementById("boot-ready");

    const states = [
      { delay: 2800, progress: 46, html: `<p><span class="timestamp">[00:03]</span> <span class="green">Profile found.</span> ${escapeHtml(profile.role)}</p>` },
      { delay: 5600, progress: 73, html: `<p><span class="timestamp">[00:06]</span> Loading ${featured.length} selected project records and related evidence...</p>` },
      { delay: 8100, progress: 96, html: `<p><span class="timestamp">[00:08]</span> <span class="green">Welcome, ${escapeHtml(profile.company)}.</span></p>` },
      { delay: 10000, progress: 100, html: "" },
    ];

    let done = false;
    const openPortfolio = () => {
      if (!done) return;
      clearActiveWork();
      renderProfile(context, profile);
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    states.forEach((state, index) => {
      const timer = window.setTimeout(() => {
        if (state.html) lines.insertAdjacentHTML("beforeend", state.html);
        bar.style.width = `${state.progress}%`;
        value.textContent = `${state.progress}%`;
        progressWrap.setAttribute("aria-valuenow", String(state.progress));

        if (index === states.length - 1) {
          done = true;
          ready.innerHTML = `
            <div class="boot-ready">
              <p class="green">Portfolio ready.</p>
              <button id="enter-portfolio" class="terminal-enter" autofocus>
                <span aria-hidden="true" class="shell-prompt">juan@portfolio:~$</span>
                Press Enter to access<span class="terminal-cursor" aria-hidden="true">█</span>
              </button>
            </div>`;
          document.getElementById("enter-portfolio").addEventListener("click", openPortfolio);
          document.getElementById("enter-portfolio").focus();
        }
      }, state.delay);
      cleanups.push(() => clearTimeout(timer));
    });

    const onKeydown = (event) => {
      if (event.key === "Enter" && done) openPortfolio();
    };
    window.addEventListener("keydown", onKeydown);
    cleanups.push(() => window.removeEventListener("keydown", onKeydown));
  }

  function projectVisual(project, compact = false) {
    const sizeClass = compact ? "visual-compact" : "visual-large";

    if (project.image) {
      return `
        <figure class="project-visual project-image ${sizeClass}">
          <img src="${escapeHtml(asset(project.image))}" alt="${escapeHtml(project.imageAlt || `${project.title} project capture`)}" />
          <div class="image-fade"></div>
          <figcaption>${escapeHtml(project.imageCaption || "Project capture")}</figcaption>
        </figure>`;
    }

    if (project.sourcePreview) {
      const lines = compact ? project.sourcePreview.lines.slice(0, 8) : project.sourcePreview.lines;
      return `
        <figure class="source-evidence ${sizeClass}" aria-label="Actual source from ${escapeHtml(project.sourcePreview.file)}">
          <div class="source-header">
            <span>actual source / ${escapeHtml(project.sourcePreview.file)}</span>
            <span>${escapeHtml(project.sourcePreview.language)}</span>
          </div>
          <pre><code>${lines.map((line, index) => {
            const trimmed = line.trim();
            const special = trimmed.startsWith("//") || trimmed.startsWith("#");
            const keyword = line.includes("while") || line.includes("for ") || line.includes("try:") || line.includes("except ") || line.includes("public static");
            const cls = special ? "code-comment" : keyword ? "code-keyword" : "";
            return `<span class="code-line"><span class="line-number">${String(index + 1).padStart(2, "0")}</span><span class="${cls}">${escapeHtml(line || " ")}</span></span>`;
          }).join("")}</code></pre>
          <figcaption class="sr-only">An excerpt taken from the project source, not a reconstructed interface.</figcaption>
        </figure>`;
    }

    const labels = project.visualLabels || [project.tags[0], project.tags[1], project.tags[2]];
    return `
      <figure class="project-record ${sizeClass}" aria-label="${escapeHtml(project.title)} evidence summary">
        <div class="record-panel">
          <div class="record-header"><span>verified project record</span><span>${escapeHtml(project.state)}</span></div>
          <dl class="record-grid">
            <div><dt>Working stack</dt><dd>${escapeHtml(project.tools.slice(0, 4).join(" / "))}</dd></div>
            <div><dt>System focus</dt><dd>${escapeHtml(labels.filter(Boolean).join(" / "))}</dd></div>
            <div><dt>Evidence</dt><dd>${escapeHtml(project.evidence[0])}</dd></div>
          </dl>
        </div>
        <figcaption class="sr-only">A factual project record is shown because no presentation capture is attached.</figcaption>
      </figure>`;
  }


  function projectMedia(project) {
    const images = Array.isArray(project.media) ? project.media : [];
    const hasVideo = Boolean(project.video?.src);

    if (!hasVideo && images.length === 0) return "";

    const video = hasVideo ? `
      <figure class="project-video-card">
        <video
          controls
          playsinline
          preload="metadata"
          ${project.video.poster ? `poster="${escapeHtml(asset(project.video.poster))}"` : ""}
          aria-label="${escapeHtml(project.video.caption || `${project.title} project video`)}"
        >
          <source src="${escapeHtml(asset(project.video.src))}" type="video/mp4" />
          Your browser does not support embedded MP4 video.
        </video>
        <figcaption>${escapeHtml(project.video.caption || "Project video")}</figcaption>
      </figure>` : "";

    const gallery = images.length ? `
      <div class="project-media-grid">
        ${images.map((item) => `
          <a class="project-media-card" href="${escapeHtml(asset(item.src))}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(item.caption || project.title)} image">
            <img src="${escapeHtml(asset(item.src))}" alt="${escapeHtml(item.alt || `${project.title} project capture`)}" loading="lazy" />
            <span>${escapeHtml(item.caption || "Project capture")} <span aria-hidden="true">↗</span></span>
          </a>
        `).join("")}
      </div>` : "";

    return `
      <section class="project-media-section">
        <div class="wrap">
          <div class="project-media-heading">
            <div>
              <p class="eyebrow dim">Captured evidence</p>
              <h2>Project media</h2>
            </div>
            ${project.mediaIntro ? `<p>${escapeHtml(project.mediaIntro)}</p>` : ""}
          </div>
          ${video}
          ${gallery}
        </div>
      </section>`;
  }


  function renderProfile(context, profile) {
    clearActiveWork();
    document.title = `${profile.role} — Juan Abia Merino`;
    const featured = profile.featuredProjects.map(data.getProject).filter(Boolean);
    const contact = profile.contact || {};
    const emailHref = contact.email
      ? `mailto:${encodeURIComponent(contact.email)}${contact.emailSubject ? `?subject=${encodeURIComponent(contact.emailSubject)}` : ""}`
      : "";

    app.innerHTML = `
      <main class="scanline fade-up site-shell">
        <header class="site-header">
          <div class="wrap header-inner">
            <div>
              <p class="eyebrow dim">Application profile</p>
              <h1 class="profile-name">${escapeHtml(profile.displayName)}</h1>
              <p class="role-title">${escapeHtml(profile.role)}</p>
            </div>
            <nav aria-label="Page sections" class="section-nav">
              <a href="#work">Selected work</a>
              <a href="#about">About</a>
              <a href="#contact">Contact</a>
            </nav>
          </div>
        </header>

        <div class="wrap page-content">
          <section class="profile-status">
            <p>${escapeHtml(profile.status)}</p>
            <ul class="tag-list">${profile.keywords.map((keyword) => `<li>${escapeHtml(keyword)}</li>`).join("")}</ul>
          </section>

          <section id="work" class="section-block">
            <div class="section-heading-row">
              <h2>Selected work</h2>
              <span>${String(featured.length).padStart(2, "0")} projects</span>
            </div>
            <div class="project-grid project-grid-${featured.length}">
              ${featured.map((project, index) => `
                <article class="project-card">
                  ${link(projectRoute(context, project.slug), `
                    ${projectVisual(project, true)}
                    <div class="project-card-copy">
                      <div class="card-title-row">
                        <div>
                          <p class="eyebrow purple">0${index + 1} / ${escapeHtml(project.eyebrow)}</p>
                          <h3>${escapeHtml(project.title)}</h3>
                        </div>
                        <span class="arrow" aria-hidden="true">↗</span>
                      </div>
                      <p class="card-summary">${escapeHtml(project.cardSummary)}</p>
                      <p class="card-state">${escapeHtml(project.state)} · open record</p>
                    </div>
                  `, "project-card-link", `aria-label="Open ${escapeHtml(project.title)} case study"`)}
                </article>
              `).join("")}
            </div>
          </section>

          <section class="tools-section">
            <div>
              <p class="eyebrow dim">Relevant to this profile</p>
              <h2>Tools of the trade</h2>
            </div>
            <ul class="tools-grid">${profile.tools.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>
          </section>

          <section id="about" class="section-block">
            <h2>A little context</h2>
            <div class="about-grid">
              ${profile.about.map((paragraph) => `
                <article>
                  <h3>${escapeHtml(paragraph.label)}</h3>
                  <p>${escapeHtml(paragraph.text)}</p>
                </article>
              `).join("")}
            </div>
          </section>

          <section id="contact" class="contact-panel">
            <div class="contact-inner">
              <div>
                <p class="eyebrow green">Open channel</p>
                <h2>Let’s talk about the work.</h2>
                ${contact.summary ? `<p>${escapeHtml(contact.summary)}</p>` : ""}
              </div>
              <div class="contact-links">
                ${emailHref ? `<a class="button button-primary" href="${escapeHtml(emailHref)}">✉ Email</a>` : ""}
                ${contact.github ? `<a class="button button-outline" href="${escapeHtml(contact.github)}" target="_blank" rel="noreferrer">⌘ GitHub</a>` : ""}
                ${contact.linkedin ? `<a class="button button-outline" href="${escapeHtml(contact.linkedin)}" target="_blank" rel="noreferrer">▣ LinkedIn</a>` : ""}
              </div>
            </div>
          </section>
        </div>

        <footer class="site-footer">Juan Abia Merino · Selected work · ${new Date().getFullYear()}</footer>
      </main>`;

    installInternalLinks();
  }

  function renderProject(context, slug, profile) {
    clearActiveWork();
    const project = data.getProject(slug);
    if (!project) {
      renderNotFound(context);
      return;
    }

    if (context.kind === "invitation") api?.trackProject(context.token, slug);
    document.title = `${project.title} — Juan Abia Merino`;
    const related = data.getRelatedProjects(project, 3);

    app.innerHTML = `
      <main class="scanline site-shell">
        <header class="project-header">
          <div class="wrap project-header-inner">
            ${link(contextRoute(context), `← Back to profile`, "back-link")}
            <p class="eyebrow dim">Canonical project record</p>
          </div>
        </header>

        <article>
          <div class="wrap project-intro">
            <p class="eyebrow green">${escapeHtml(project.eyebrow)}</p>
            <div class="project-intro-grid">
              <div>
                <h1>${escapeHtml(project.title)}</h1>
                <p class="project-summary">${escapeHtml(project.summary)}</p>
              </div>
              <dl class="project-meta">
                <dt>State</dt>
                <dd class="green">${escapeHtml(project.state)}</dd>
                <dt>Role</dt>
                <dd>${escapeHtml(project.role)}</dd>
              </dl>
            </div>
          </div>

          <div class="visual-strip"><div class="visual-wrap">${projectVisual(project, false)}</div></div>

          ${projectMedia(project)}

          <div class="wrap project-body-grid">
            <div>
              <section>
                <h2>What I built</h2>
                <ul class="feature-list">
                  ${project.highlights.map((item) => `<li><span aria-hidden="true">›</span>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>

              <section class="evidence-section">
                <h2>Evidence, not adjectives</h2>
                <ul class="evidence-list">
                  ${project.evidence.map((item) => `<li><span aria-hidden="true">✓</span>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </section>

              ${project.children && project.children.length ? `
                <section class="collection-section">
                  <h2>Projects in this progression</h2>
                  <p>Each exercise keeps its own compact record. Together, they show the progression without pretending every piece has flagship weight.</p>
                  <div class="collection-grid">
                    ${project.children.map((childSlug, index) => {
                      const child = data.getProject(childSlug);
                      if (!child) return "";
                      const match = childSlug.match(/^fundae-(\d+)-/);
                      const recordNumber = match ? match[1] : String(index + 1).padStart(2, "0");
                      return link(projectRoute(context, childSlug), `
                        <span class="record-number">${recordNumber}</span>
                        <span class="collection-title">${escapeHtml(child.title)}</span>
                        <span class="collection-copy">${escapeHtml(child.cardSummary)}</span>
                      `, "collection-card");
                    }).join("")}
                  </div>
                </section>` : ""}

              ${project.boundary ? `
                <aside class="boundary">
                  <p class="eyebrow green">○ Honest boundary</p>
                  <p>${escapeHtml(project.boundary)}</p>
                </aside>` : ""}
            </div>

            <aside class="stack-aside">
              <section>
                <h2>Working stack</h2>
                <ul class="tag-list stack-tags">${project.tools.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>
              </section>
              <div class="project-actions">
                ${project.live ? `<a class="button button-primary full-width" href="${escapeHtml(project.live)}" target="_blank" rel="noreferrer">Open live project <span aria-hidden="true">↗</span></a>` : ""}
                ${project.repository ? `<a class="button button-repo" href="${escapeHtml(project.repository)}" target="_blank" rel="noreferrer">View repository <span aria-hidden="true">↗</span></a>` : ""}
              </div>
            </aside>
          </div>

          <section class="related-section">
            <div class="wrap">
              <h2>Might interest you…</h2>
              <div class="related-grid">
                ${related.map((item) => link(projectRoute(context, item.slug), `
                  <span>
                    <span class="related-title">${escapeHtml(item.title)}</span>
                    <span class="related-copy">${escapeHtml(item.eyebrow)}</span>
                  </span>
                  <span class="arrow" aria-hidden="true">↗</span>
                `, "related-card")).join("")}
              </div>
            </div>
          </section>
        </article>
      </main>`;

    installInternalLinks();
  }

  function renderNotFound(context = null) {
    document.title = "Not found — Juan Abia Merino";
    const back = context ? contextRoute(context) : "/";
    app.innerHTML = `
      <main class="not-found">
        <p class="eyebrow green">404 / record unavailable</p>
        <h1>Nothing lives at this path.</h1>
        <p>The invitation or project record may have changed.</p>
        ${link(back, "Return to portfolio", "button button-outline")}
      </main>`;
    installInternalLinks();
  }

  async function render() {
    clearActiveWork();
    const revision = ++renderRevision;
    const route = logicalRoute().replace(/\/+$/, "") || "/";
    const parts = route.split("/").filter(Boolean);

    if (parts.length === 0) {
      renderAccess(false);
      return;
    }

    let context;
    let projectSlug = "";
    let validShape = false;

    if (parts[0] === "preview") {
      if (parts.length !== 2 && !(parts.length === 4 && parts[2] === "project")) {
        renderNotFound();
        return;
      }
      context = { kind: "preview", proof: decodeURIComponent(parts[1]) };
      projectSlug = parts.length === 4 ? decodeURIComponent(parts[3]) : "";
      validShape = true;
    } else {
      if (parts.length !== 1 && !(parts.length === 3 && parts[1] === "project")) {
        renderAccess(true);
        return;
      }
      context = { kind: "invitation", token: decodeURIComponent(parts[0]) };
      projectSlug = parts.length === 3 ? decodeURIComponent(parts[2]) : "";
      validShape = true;
    }

    if (!validShape || !api?.configured) {
      renderServiceError();
      return;
    }

    renderResolving();

    try {
      const profile = context.kind === "preview"
        ? await api.resolvePreview(context.proof)
        : await api.resolveInvitation(context.token);

      if (revision !== renderRevision) return;
      if (!profile) {
        if (context.kind === "invitation") renderAccess(true);
        else renderNotFound();
        return;
      }

      if (projectSlug) renderProject(context, projectSlug, profile);
      else renderBoot(context, profile);
    } catch {
      if (revision !== renderRevision) return;
      renderServiceError();
    }
  }

  window.addEventListener("popstate", render);
  render();
})();
