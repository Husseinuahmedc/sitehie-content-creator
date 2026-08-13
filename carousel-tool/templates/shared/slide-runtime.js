(function () {
  const dataEl = document.getElementById("slide-data");
  if (!dataEl) return;

  let payload;
  try {
    payload = JSON.parse(dataEl.textContent || "{}");
  } catch {
    console.error("Invalid slide-data JSON");
    return;
  }

  const { slide, meta, theme } = payload;
  if (!slide || !theme) return;

  // Latin run: "Node.js", "MySQL.Client", "C++", "C#", ".NET" …
  // Number run: "99.9%", "10x", "1M+", "3,000" …
  // (Declared before first use: renderByType runs synchronously below.)
  const LATIN_RUN_RE =
    /\.?[A-Za-z][A-Za-z0-9]*(?:[._\-/#][A-Za-z0-9]+)*[+#]{0,2}|\d[\d.,:]*(?:%|[A-Za-z]+\+?)?/g;

  applyPositions();
  renderByType(slide, meta || {}, theme);

  window.__slideReady = fitAllText().then((warnings) => {
    window.__fitWarnings = warnings;
    document.documentElement.setAttribute("data-ready", "true");
    return warnings;
  });

  function applyPositions() {
    document.querySelectorAll("[data-pos]").forEach((el) => {
      const path = el.getAttribute("data-pos");
      const pos = getPath(theme.layout, path);
      if (!pos) return;

      if (pos.top != null) el.style.top = pos.top;
      if (pos.right != null) el.style.right = pos.right;
      if (pos.bottom != null) el.style.bottom = pos.bottom;
      if (pos.left != null) el.style.left = pos.left;
      if (pos.width != null) el.style.width = pos.width;
      if (pos.height != null) el.style.height = pos.height;

      if (pos.center || pos.centerX) el.setAttribute("data-center", "true");
      if (pos.centerY) el.setAttribute("data-center-y", "true");

      if (pos.center && !pos.left && !pos.right) {
        el.style.left = "50%";
        el.style.transform = "translateX(-50%)";
      }
    });
  }

  function renderByType(slide, meta, theme) {
    switch (slide.type) {
      case "quote":
        renderQuote(slide, theme);
        break;
      case "code":
        renderCode(slide, meta, theme);
        break;
      case "cover":
        renderCover(slide, meta, theme);
        break;
      case "outro":
        renderOutro(slide, meta, theme);
        break;
      case "comparison":
        renderComparison(slide, meta, theme);
        break;
      case "stat":
        renderStat(slide, meta, theme);
        break;
      case "canvas":
        renderCanvas(slide, meta, theme);
        break;
      default:
        console.warn("Unknown slide type:", slide.type);
    }
    renderTechBadges(slide);
    renderWatermark(slide, meta, theme);
    renderImages(slide);
  }

  /** Fill every [data-tech-icons] slot with SVG badges from slide.techIcons. */
  function renderTechBadges(slide) {
    const containers = document.querySelectorAll("[data-tech-icons]");
    if (!containers.length) return;
    const names = Array.isArray(slide.techIcons) ? slide.techIcons.filter(Boolean) : [];
    const lib = window.TECH_ICONS || {};
    containers.forEach((el) => {
      if (!names.length) {
        el.classList.add("hidden");
        return;
      }
      el.classList.remove("hidden");
      el.innerHTML = names
        .map((raw) => {
          const key = String(raw).toLowerCase().trim();
          const entry = lib[key];
          if (entry) {
            return `<span class="tech-badge" dir="ltr">${entry.svg}<span class="tech-badge-label">${escapeHtml(entry.label)}</span></span>`;
          }
          // Unknown tech: generic labeled chip fallback.
          return `<span class="tech-badge" dir="ltr"><span class="tech-badge-label">${escapeHtml(String(raw))}</span></span>`;
        })
        .join("");
    });
  }

  /** Brand watermark from theme.brand.handle (slot: [data-watermark]). */
  function renderWatermark(slide, meta, theme) {
    const el = document.querySelector("[data-watermark]");
    if (!el) return;
    const handle = theme.brand?.handle || meta.handle || "";
    el.textContent = handle;
    if (!handle) el.classList.add("hidden");
  }

  function renderOutro(slide, meta, theme) {
    const q = document.getElementById("outro-question");
    const handle = document.getElementById("outro-handle");
    const cta = document.getElementById("outro-follow-cta");
    const img = document.getElementById("outro-image");
    const ph = document.getElementById("outro-image-placeholder");

    if (q) q.innerHTML = formatMixedBidi(slide.question || "");
    if (handle) handle.textContent = slide.handle || theme.brand?.handle || meta.handle || "@sitehie";
    if (cta) cta.textContent = slide.cta || "احفظ • شارك • تابع";

    if (img && slide.imageAsset) {
      img.src = slide.imageAsset;
      img.alt = slide.handle || theme.brand?.handle || "avatar";
      img.classList.remove("hidden");
      if (ph) ph.classList.add("hidden");
      img.onerror = () => {
        img.classList.add("hidden");
        if (ph) ph.classList.remove("hidden");
      };
    }
  }

  function renderComparison(slide, meta, theme) {
    const num = document.getElementById("slide-number");
    const title = document.getElementById("comparison-title");
    const verdict = document.getElementById("comparison-verdict");

    if (num) num.textContent = String(meta.slideIndex ?? 1).padStart(2, "0");
    if (title) title.innerHTML = formatMixedBidi(slide.title || "");

    const fillSide = (prefix, side) => {
      const labelEl = document.getElementById(`${prefix}-label`);
      const pointsEl = document.getElementById(`${prefix}-points`);
      if (labelEl) labelEl.innerHTML = formatMixedBidi(side?.label || "");
      if (pointsEl) {
        const pts = Array.isArray(side?.points) ? side.points : [];
        pointsEl.innerHTML = pts.map((p) => `<li>${formatMixedBidi(p)}</li>`).join("");
      }
    };
    fillSide("side-a", slide.sideA);
    fillSide("side-b", slide.sideB);

    if (verdict) {
      if (slide.verdict) {
        verdict.innerHTML = formatMixedBidi(slide.verdict);
      } else {
        verdict.classList.add("hidden");
      }
    }
  }

  function renderStat(slide, meta, theme) {
    const num = document.getElementById("slide-number");
    const value = document.getElementById("stat-value");
    const label = document.getElementById("stat-label");
    const subtext = document.getElementById("stat-subtext");

    if (num) num.textContent = String(meta.slideIndex ?? 1).padStart(2, "0");
    if (value) value.textContent = slide.value || "";
    if (label) label.innerHTML = formatMixedBidi(slide.label || "");
    if (subtext) {
      if (slide.subtext) {
        subtext.innerHTML = formatMixedBidi(slide.subtext);
      } else {
        subtext.classList.add("hidden");
      }
    }
  }

  function renderQuote(slide, theme) {
    const el = document.getElementById("quote-content");
    if (!el) return;
    const style = theme.layout?.quoteSlide?.highlightMarkerStyle || "underline";
    const paragraphs = slide.paragraphs ||
      (slide.text != null
        ? [{ text: slide.text, highlights: slide.highlights || [], cyanWords: slide.cyanWords || [] }]
        : []);
    el.innerHTML = paragraphs
      .map(
        (p) =>
          `<p>${formatHighlightedText(p.text || "", {
            highlights: p.highlights || [],
            cyanWords: p.cyanWords || [],
            markerStyle: style,
          })}</p>`
      )
      .join("");
  }

  function renderCode(slide, meta, theme) {
    const num = document.getElementById("slide-number");
    const title = document.getElementById("slide-title");
    const subtitle = document.getElementById("slide-subtitle");
    const code = document.getElementById("code-content");
    const explanation = document.getElementById("explanation");
    const annotations = document.getElementById("annotations");
    const handle = document.getElementById("footer-handle");
    const footerMeta = document.getElementById("footer-meta");
    const progressFill = document.getElementById("progress-fill");

    if (num) {
      const idx = String(meta.slideIndex ?? 1).padStart(2, "0");
      num.textContent = idx;
    }
    if (title) title.textContent = slide.titleEn || slide.title || "";
    if (subtitle) {
      subtitle.textContent = slide.subtitleEn || slide.subtitle || "";
      if (!subtitle.textContent) subtitle.classList.add("hidden");
    }

    if (code) {
      const targets = (slide.annotations || []).map((a) => a.target).filter(Boolean);
      if (slide.codeHtml) {
        // Pre-highlighted at build time (Prism); only annotation targets remain.
        code.innerHTML = markTargets(slide.codeHtml, targets);
      } else {
        code.innerHTML = highlightCode(slide.code || "", targets);
      }
    }

    if (explanation) {
      explanation.innerHTML = formatMixedBidi(slide.explanation || "");
    }

    if (annotations) {
      const list = slide.annotations || [];
      if (!list.length) {
        annotations.classList.add("hidden");
      } else {
        annotations.innerHTML = list
          .map((a) => `<span class="annotation">${escapeHtml(a.text || a.target || "")}</span>`)
          .join("");
      }
    }

    if (handle) handle.textContent = theme.brand?.handle || "@sitehie";
    if (footerMeta) {
      const parts = [];
      if (meta.readingTime) {
        parts.push(`${meta.readingTime} ${theme.brand?.readingTimeSuffix || "min read"}`);
      }
      if (meta.series) parts.push(meta.series);
      footerMeta.textContent = parts.join(" · ");
    }

    if (progressFill) {
      const pct = meta.progressPct ?? 0;
      progressFill.style.width = `${pct}%`;
      document.documentElement.style.setProperty("--progress-pct", `${pct}%`);
    }
  }

  function renderImages(slide) {
    const container = document.getElementById("slide-images");
    if (!container) return;
    const images = slide.images || [];
    if (!images.length) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    container.innerHTML = images
      .map(
        (img, i) =>
          `<img
            class="slide-image"
            id="slide-image-${i}"
            src="${escapeHtml(img.asset || "")}"
            alt=""
            style="
              position: absolute;
              ${img.top != null ? `top: ${img.top};` : ""}
              ${img.left != null ? `left: ${img.left};` : ""}
              ${img.width != null ? `width: ${img.width};` : "width: 40%;"}
              ${img.height != null && img.height !== "auto" ? `height: ${img.height};` : "height: 30%;"}
              ${img.zIndex != null ? `z-index: ${img.zIndex};` : "z-index: 0;"}
              ${img.scale != null && img.scale !== 1 ? `transform: scale(${img.scale}); transform-origin: top left;` : ""}
              object-fit: contain;
            "
          />`
      )
      .join("");
  }

  function renderCover(slide, meta, theme) {
    const series = document.getElementById("series");
    const title = document.getElementById("cover-title");
    const img = document.getElementById("icon-img");
    const placeholder = document.getElementById("icon-placeholder");
    const dots = document.getElementById("hint-dots");

    if (series) {
      series.textContent = slide.series || meta.series || "";
      if (!series.textContent) series.classList.add("hidden");
    }

    if (title) {
      title.innerHTML = formatMixedBidi(slide.title || "");
    }

    if (img && slide.iconAsset) {
      img.src = slide.iconAsset;
      img.alt = slide.title || "icon";
      img.classList.remove("hidden");
      if (placeholder) placeholder.classList.add("hidden");
      const scale = slide.iconScale != null ? Number(slide.iconScale) : 1;
      const ox = slide.iconOffsetX != null ? Number(slide.iconOffsetX) : 0;
      const oy = slide.iconOffsetY != null ? Number(slide.iconOffsetY) : 0;
      if (scale !== 1 || ox !== 0 || oy !== 0) {
        img.style.transform = `translate(${ox}%, ${oy}%) scale(${scale})`;
        img.style.transformOrigin = "center center";
      }
      img.onerror = () => {
        img.classList.add("hidden");
        if (placeholder) {
          placeholder.classList.remove("hidden");
          placeholder.textContent = (slide.title || "◆").slice(0, 1);
        }
      };
    } else if (placeholder) {
      placeholder.textContent = (slide.iconEmoji || slide.title || "◆").toString().slice(0, 2);
    }

    if (dots) {
      const total = meta.totalSlides || 3;
      const active = Math.max(0, (meta.slideIndex || 1) - 1);
      dots.innerHTML = Array.from({ length: Math.min(total, 6) }, (_, i) => {
        return `<span class="${i === active ? "active" : ""}"></span>`;
      }).join("");
    }
  }

  function renderCanvas(slide, meta, theme) {
    const frame = slide.frame || {};
    const svg = document.getElementById("canvas-svg");
    if (!svg) return;

    const w = frame.width || 1080;
    const h = frame.height || 1350;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    // Background
    const bg = frame.background || "#0D1117";
    const bgType = frame.backgroundType || "solid";
    let bgFill = bg;
    if (bgType === "linear" && frame.backgroundTo) {
      const id = "canvasBgGrad";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", id);
      grad.setAttribute("x1", "0%");
      grad.setAttribute("y1", "0%");
      grad.setAttribute("x2", "100%");
      grad.setAttribute("y2", "100%");
      const angle = (frame.backgroundAngle || 135) * (Math.PI / 180);
      grad.setAttribute("x1", `${50 + 50 * Math.cos(angle + Math.PI)}%`);
      grad.setAttribute("y1", `${50 + 50 * Math.sin(angle + Math.PI)}%`);
      grad.setAttribute("x2", `${50 + 50 * Math.cos(angle)}%`);
      grad.setAttribute("y2", `${50 + 50 * Math.sin(angle)}%`);
      const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      s1.setAttribute("offset", "0%");
      s1.setAttribute("stop-color", bg);
      const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      s2.setAttribute("offset", "100%");
      s2.setAttribute("stop-color", frame.backgroundTo);
      grad.appendChild(s1);
      grad.appendChild(s2);
      defs.appendChild(grad);
      svg.appendChild(defs);
      bgFill = `url(#${id})`;
    }

    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("width", w);
    bgRect.setAttribute("height", h);
    bgRect.setAttribute("rx", frame.borderRadius || 0);
    bgRect.setAttribute("fill", bgFill);
    svg.appendChild(bgRect);

    // Objects (skip layers hidden via `visible:false` or a hidden parent group)
    const objects = slide.objects || [];
    const groupsById = {};
    for (const g of slide.groups || []) groupsById[g.id] = g;
    for (const obj of objects) {
      if (obj.visible === false) continue;
      if (obj.parentId && groupsById[obj.parentId] && groupsById[obj.parentId].visible === false) continue;
      const el = renderCanvasObject(obj, w, h);
      if (el) svg.appendChild(el);
    }

    // Brand handle watermark (bottom-right)
    const handle = theme.brand?.handle || meta.handle || "";
    if (handle) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", w - 24);
      text.setAttribute("y", h - 20);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("fill", "rgba(255,255,255,0.35)");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-family", "JetBrains Mono, monospace");
      text.setAttribute("font-weight", "500");
      text.textContent = handle;
      svg.appendChild(text);
    }
  }

  function renderCanvasObject(obj, fw, fh) {
    if (obj.type === "rect") {
      const g = createTransformGroup(obj.x, obj.y, obj.w, obj.h, obj.rotation);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", obj.w);
      rect.setAttribute("height", obj.h);
      rect.setAttribute("rx", obj.borderRadius || 0);
      rect.setAttribute("fill", obj.fill || "none");
      if (obj.stroke) {
        rect.setAttribute("stroke", obj.stroke);
        rect.setAttribute("stroke-width", obj.strokeWidth || 1);
      }
      g.appendChild(rect);
      return g;
    }
    if (obj.type === "circle") {
      const g = createTransformGroup(obj.x, obj.y, obj.w, obj.h, obj.rotation);
      const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      ellipse.setAttribute("cx", obj.w / 2);
      ellipse.setAttribute("cy", obj.h / 2);
      ellipse.setAttribute("rx", obj.w / 2);
      ellipse.setAttribute("ry", obj.h / 2);
      ellipse.setAttribute("fill", obj.fill || "none");
      if (obj.stroke) {
        ellipse.setAttribute("stroke", obj.stroke);
        ellipse.setAttribute("stroke-width", obj.strokeWidth || 1);
      }
      g.appendChild(ellipse);
      return g;
    }
    if (obj.type === "polygon") {
      const g = createTransformGroup(obj.x, obj.y, obj.w, obj.h, obj.rotation);
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const cx = obj.w / 2;
      const cy = obj.h / 2;
      const rx = obj.w / 2;
      const ry = obj.h / 2;
      const sides = obj.sides || 3;
      const pts = [];
      const radOffset = 0;
      for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 * i) / sides - Math.PI / 2 + radOffset;
        pts.push(`${cx + rx * Math.cos(a)},${cy + ry * Math.sin(a)}`);
      }
      polygon.setAttribute("points", pts.join(" "));
      polygon.setAttribute("fill", obj.fill || "none");
      if (obj.stroke) {
        polygon.setAttribute("stroke", obj.stroke);
        polygon.setAttribute("stroke-width", obj.strokeWidth || 1);
      }
      g.appendChild(polygon);
      return g;
    }
    if (obj.type === "text") {
      const g = createTransformGroup(obj.x, obj.y, obj.w, obj.h, obj.rotation);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const size = obj.fontSize || 48;
      const lineHeight = obj.lineHeight || 1.2;
      const anchor = obj.align === "center" ? "middle" : obj.align === "right" ? "end" : "start";
      const anchorX = obj.align === "center" ? obj.w / 2 : obj.align === "right" ? obj.w : 0;
      text.setAttribute("x", anchorX);
      text.setAttribute("y", size); // baseline at top of the box (plus small cap descent)
      text.setAttribute("text-anchor", anchor);
      text.setAttribute("font-size", size);
      text.setAttribute("font-family", obj.fontFamily || "Inter, system-ui, sans-serif");
      text.setAttribute("font-weight", obj.fontWeight || "normal");
      text.setAttribute("fill", obj.fill || "#ffffff");
      text.setAttribute("stroke", "none");
      const lines = String(obj.text || "").split("\n");
      lines.forEach((line, i) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.setAttribute("x", anchorX);
        tspan.setAttribute("dy", i === 0 ? 0 : Math.round(size * lineHeight));
        tspan.textContent = line;
        text.appendChild(tspan);
      });
      g.appendChild(text);
      return g;
    }
    if (obj.type === "path") {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", buildCanvasPathD(obj.points || [], obj.closed));
      path.setAttribute("fill", obj.closed ? (obj.fill || "none") : "none");
      path.setAttribute("stroke", obj.stroke || "#3D52D5");
      path.setAttribute("stroke-width", obj.strokeWidth || 3);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      return path;
    }
    return null;
  }

  function createTransformGroup(x, y, w, h, rotation) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const cx = x + w / 2;
    const cy = y + h / 2;
    let transform = `translate(${x},${y})`;
    if (rotation) {
      transform = `translate(${cx},${cy}) rotate(${rotation}) translate(${-w / 2},${-h / 2})`;
    }
    g.setAttribute("transform", transform);
    return g;
  }

  function buildCanvasPathD(points, closed) {
    if (!points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const c1x = prev.x + (prev.handleOut?.x ?? 0);
      const c1y = prev.y + (prev.handleOut?.y ?? 0);
      const c2x = cur.x + (cur.handleIn?.x ?? 0);
      const c2y = cur.y + (cur.handleIn?.y ?? 0);
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${cur.x} ${cur.y}`;
    }
    if (closed && points.length > 1) {
      const last = points[points.length - 1];
      const first = points[0];
      const c1x = last.x + (last.handleOut?.x ?? 0);
      const c1y = last.y + (last.handleOut?.y ?? 0);
      const c2x = first.x + (first.handleIn?.x ?? 0);
      const c2y = first.y + (first.handleIn?.y ?? 0);
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${first.x} ${first.y} Z`;
    }
    return d;
  }

  function formatHighlightedText(text, { highlights, cyanWords, markerStyle }) {
    let result = escapeHtml(text);
    const cls =
      markerStyle === "underline-sketch"
        ? "hl-underline-sketch"
        : markerStyle === "background"
          ? "hl-background"
          : markerStyle === "none"
            ? "hl-none"
            : "hl-underline";

    const sortedHl = [...highlights].sort((a, b) => b.length - a.length);
    for (const word of sortedHl) {
      if (!word) continue;
      const re = new RegExp(escapeRegExp(escapeHtml(word)), "g");
      result = result.replace(re, `<span class="${cls}">$&</span>`);
    }

    const sortedCyan = [...cyanWords].sort((a, b) => b.length - a.length);
    for (const word of sortedCyan) {
      if (!word) continue;
      const re = new RegExp(escapeRegExp(escapeHtml(word)), "g");
      result = result.replace(re, `<span class="cyan-word">$&</span>`);
    }

    // BiDi-isolate inline Latin runs after span wrapping (text nodes only).
    result = wrapLatinRuns(result);
    return result.replace(/\n/g, "<br/>");
  }

  /**
   * Mixed Arabic + English text:
   *  - `backtick` spans → <code class="inline-code"> (strictly LTR)
   *  - Latin / number runs inside RTL text → <bdi dir="ltr"> isolates so
   *    Arabic punctuation and ordering are never corrupted.
   */
  function formatMixedBidi(text) {
    let result = escapeHtml(text);
    result = result.replace(/`([^`\n]+)`/g, '<code class="inline-code" dir="ltr">$1</code>');
    result = wrapLatinRuns(result);
    return result.replace(/\n/g, "<br/>");
  }

  /**
   * Wrap Latin/number runs in <bdi> isolates. Splits on HTML tags AND
   * HTML entities first so markup and &quot;/&amp; etc. are never touched.
   */
  function wrapLatinRuns(html) {
    const parts = String(html).split(/(<[^>]+>|&[a-z]+;)/gi);
    return parts
      .map((part) => {
        if (!part || part.startsWith("<") || part.startsWith("&")) return part;
        return part.replace(LATIN_RUN_RE, '<bdi dir="ltr" class="tech-inline">$&</bdi>');
      })
      .join("");
  }

  function highlightCode(code, targets) {
    let html = escapeHtml(code);

    // Syntax color first (plain text only), then mark annotation targets.
    html = replaceOutsideTags(
      html,
      /(\/\/.*)$/gm,
      '<span class="tok-comment">$1</span>'
    );
    html = replaceOutsideTags(
      html,
      /(&quot;|&#39;|`)(?:\\.|(?!\1).)*\1/g,
      '<span class="tok-string">$&</span>'
    );
    // Also plain quotes after escapeHtml (quotes stay as " and ')
    html = replaceOutsideTags(
      html,
      /(["'`])(?:\\.|(?!\1).)*\1/g,
      '<span class="tok-string">$&</span>'
    );
    html = replaceOutsideTags(
      html,
      /\b(const|let|var|function|return|if|else|async|await|import|export|from|class|new|typeof|interface|type)\b/g,
      '<span class="tok-keyword">$1</span>'
    );
    html = replaceOutsideTags(
      html,
      /\b(\d+\.?\d*)\b/g,
      '<span class="tok-number">$1</span>'
    );

    return markTargets(html, targets);
  }

  /** Wrap annotation targets in tok-target spans (text nodes only). */
  function markTargets(html, targets) {
    const sortedTargets = [...targets].sort((a, b) => b.length - a.length);
    for (const t of sortedTargets) {
      if (!t) continue;
      const re = new RegExp(escapeRegExp(escapeHtml(t)), "g");
      html = replaceOutsideTags(html, re, '<span class="tok-target">$&</span>');
    }
    return html;
  }

  /** Apply regex replace only to text nodes (never inside HTML tags). */
  function replaceOutsideTags(html, regex, replacement) {
    const parts = String(html).split(/(<[^>]+>)/g);
    return parts
      .map((part) => {
        if (!part || part.startsWith("<")) return part;
        return part.replace(regex, replacement);
      })
      .join("");
  }

  async function fitAllText() {
    const warnings = [];
    const nodes = document.querySelectorAll("[data-fit]");
    for (const el of nodes) {
      const key = el.getAttribute("data-fit");
      const typeConf = theme.typography?.[key];
      if (!typeConf) continue;

      // Per-slide font size override acts as preferred/max
      const override = slide.fontSizes?.[key];
      const max = override ?? typeConf.fontSizeMax ?? typeConf.fontSize ?? 32;
      const min = typeConf.fontSizeMin ?? Math.min(18, max);
      const cssVar = typographySizeVar(key);

      let size = max;
      el.style.fontSize = `${size}px`;
      if (cssVar) document.documentElement.style.setProperty(cssVar, `${size}px`);

      await document.fonts.ready;
      await nextFrame();

      const fitStep = window.__fontFitStep > 0 ? window.__fontFitStep : 1;
      let guard = 0;
      const maxIterations = 500;
      while (size > min && isOverflowing(el, size) && guard < maxIterations) {
        size = Math.max(min, size - fitStep);
        el.style.fontSize = `${size}px`;
        if (cssVar) document.documentElement.style.setProperty(cssVar, `${size}px`);
        const codeEl = el.querySelector("code");
        if (codeEl) codeEl.style.fontSize = `${size}px`;
        guard++;
        await nextFrame();
      }

      if (guard >= maxIterations) {
        console.warn(`[slide-runtime] fitAllText: hit max iterations for element "${key}". Text may be too long for the slide.`);
      }

      const floor = window.__readabilityFloor ?? 28;
      if (size < floor) {
        warnings.push({
          element: key,
          fontSize: size,
          floor,
        });
      }
    }
    return warnings;
  }

  function typographySizeVar(key) {
    const map = {
      quoteSlide: "--type-quote-font-size",
      codeSlideTitle: "--type-code-title-font-size",
      codeSlideSubtitle: "--type-code-subtitle-font-size",
      codeSlideCode: "--type-code-code-font-size",
      codeSlideExplanation: "--type-code-explanation-font-size",
      coverSlideTitle: "--type-cover-title-font-size",
      outroSlideQuestion: "--type-outro-question-font-size",
      comparisonSlideTitle: "--type-comparison-title-font-size",
      comparisonSlideBody: "--type-comparison-body-font-size",
      statSlideValue: "--type-stat-value-font-size",
      statSlideLabel: "--type-stat-label-font-size",
      statSlideSubtext: "--type-stat-subtext-font-size",
    };
    return map[key] || null;
  }

  function isOverflowing(el, size) {
    // Font-metric overshoot: some fonts (e.g. Qahwa Arabic Black) have an
    // intrinsic line box ~12% taller than the CSS line-height, so their ink
    // always spills a few px past the element box. That is harmless — a real
    // extra line adds ~100% of line-height. Tolerate up to 25% of line-height
    // vertically (and 10% of font-size horizontally) before calling it overflow.
    const cs = getComputedStyle(el);
    const base = size || parseFloat(cs.fontSize) || 16;
    const lineH = parseFloat(cs.lineHeight) || base * 1.2;
    const vSlop = Math.max(2, lineH * 0.25);
    const hSlop = Math.max(2, base * 0.1);
    if (el.scrollHeight > el.clientHeight + vSlop) return true;
    if (el.scrollWidth > el.clientWidth + hSlop) return true;
    const code = el.querySelector("code, pre, p");
    if (code) {
      if (code.scrollHeight > el.clientHeight + vSlop) return true;
      if (code.scrollWidth > el.clientWidth + hSlop) return true;
    }
    // Auto-height elements grow with their content, so their own box never
    // meaningfully "overflows". Guard the slide canvas instead: the element's
    // box must stay inside the slide (small margin for ink overshoot).
    const slide = document.getElementById("slide");
    if (slide) {
      const sr = slide.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const overY = Math.max(r.bottom - sr.bottom, sr.top - r.top, 0);
      const overX = Math.max(r.right - sr.right, sr.left - r.left, 0);
      if (overY > 8) return true;
      if (overX > 8) return true;
    }
    return false;
  }

  function getPath(obj, path) {
    if (!obj || !path) return null;
    // path like "quoteSlide.textPosition" relative to layout already passed,
    // or full "quoteSlide.textPosition"
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return null;
      cur = cur[p];
    }
    return cur;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
})();
