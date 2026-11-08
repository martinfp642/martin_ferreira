/* =====================================================================
   Editor de bitácora · docs/editor.md
   Escribe entradas con la estructura de la guía, comprime imágenes y
   publica directo al repositorio con la API de GitHub (un solo commit).
   Solo funciona con un token personal del dueño del repositorio.
   ===================================================================== */
(function () {
  "use strict";

  var API = "https://api.github.com";
  var MARKED_SRC = "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js";
  var KEY_TOKEN = "bitacora.token";
  var KEY_DRAFT = "bitacora.borrador";
  var MAX_SIDE = 1600;

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }

  function slugify(s) {
    return (s || "")
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    return bytesToB64(bytes);
  }

  function bytesToB64(bytes) {
    var bin = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function yamlQuote(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function relToImages(pagePath) {
    // pagePath: docs/tecnicos/entrada.md → "../" por cada carpeta debajo de docs
    var parts = pagePath.replace(/^docs\//, "").split("/");
    var depth = parts.length - 1;
    return new Array(depth + 1).join("../");
  }

  function dirname(p) {
    var i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function loadMarked() {
    if (window.marked) return Promise.resolve(window.marked);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = MARKED_SRC;
      s.onload = function () { resolve(window.marked); };
      s.onerror = function () { reject(new Error("No pude cargar la vista previa (sin conexión)")); };
      document.head.appendChild(s);
    });
  }

  function renderMd(md, images, baseUrl) {
    return loadMarked().then(function (marked) {
      var body = md.replace(/^---[\s\S]*?---\n/, "");
      var html = marked.parse(body);
      (images || []).forEach(function (im) {
        html = html.split(im.rel).join(im.url);
      });
      if (baseUrl) {
        // Las rutas relativas (../images/…) se resuelven contra la página en el sitio
        html = html.replace(/(<img[^>]*\ssrc=")([^"]+)(")/g, function (m, a, src, c) {
          if (/^(https?:|blob:|data:|\/)/.test(src)) return m;
          try { return a + new URL(src, baseUrl).href + c; } catch (e) { return m; }
        });
      }
      return html;
    });
  }

  function pageUrl(site, path) {
    return site + path.replace(/^docs\//, "").replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "/");
  }

  /* ------------------------------------------------------------------ */
  /* Barra de formato y bloques                                          */
  /* ------------------------------------------------------------------ */
  function selection(ta) {
    return { s: ta.selectionStart, e: ta.selectionEnd, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) };
  }

  function replaceSelection(ta, text, selStart, selEnd) {
    var sel = selection(ta);
    ta.value = ta.value.slice(0, sel.s) + text + ta.value.slice(sel.e);
    ta.selectionStart = sel.s + (selStart == null ? text.length : selStart);
    ta.selectionEnd = sel.s + (selEnd == null ? text.length : selEnd);
    ta.focus();
    ta.dispatchEvent(new Event("input"));
  }

  function wrap(ta, before, after, placeholder) {
    var sel = selection(ta);
    var inner = sel.text || placeholder;
    replaceSelection(ta, before + inner + after, before.length, before.length + inner.length);
  }

  function linePrefix(ta, prefix, numbered) {
    var sel = selection(ta);
    var v = ta.value;
    var ls = v.lastIndexOf("\n", sel.s - 1) + 1;
    var le = v.indexOf("\n", sel.e); if (le < 0) le = v.length;
    var lines = v.slice(ls, le).split("\n");
    var out = lines.map(function (l, i) { return (numbered ? (i + 1) + ". " : prefix) + l; }).join("\n");
    ta.value = v.slice(0, ls) + out + v.slice(le);
    ta.selectionStart = ls; ta.selectionEnd = ls + out.length;
    ta.focus(); ta.dispatchEvent(new Event("input"));
  }

  function blockText(ta, text) {
    var sel = selection(ta);
    var v = ta.value;
    var pre = sel.s > 0 && v[sel.s - 1] !== "\n" ? "\n\n" : (sel.s > 1 && v[sel.s - 2] !== "\n" ? "\n" : "");
    replaceSelection(ta, pre + text + "\n\n");
  }

  function applyFormat(ta, fmt) {
    switch (fmt) {
      case "bold": return wrap(ta, "**", "**", "texto");
      case "italic": return wrap(ta, "_", "_", "texto");
      case "h2": return linePrefix(ta, "## ");
      case "h3": return linePrefix(ta, "### ");
      case "ul": return linePrefix(ta, "- ");
      case "ol": return linePrefix(ta, "", true);
      case "link": {
        var sel = selection(ta);
        var url = prompt("Dirección del enlace", "https://");
        if (!url) return;
        return replaceSelection(ta, "[" + (sel.text || "texto del enlace") + "](" + url + ")");
      }
      case "code": return selection(ta).text.indexOf("\n") >= 0 ? wrap(ta, "```\n", "\n```", "código") : wrap(ta, "`", "`", "código");
      case "quote": return linePrefix(ta, "> ");
      case "table": return blockText(ta, "| Parámetro | Valor | Nota |\n| --- | --- | --- |\n| … | … | … |");
    }
  }

  function blockSnippet(kind, images) {
    var imgs = images && images.length ? images : null;
    var ph = function (n, cap) { return "![" + cap + "](../images/carpeta/foto-" + n + ".jpg)"; };
    var list = function (n, cap) {
      return imgs ? imgs.map(function (im) { return "![" + (im.caption || im.name) + "](" + im.rel + ")"; }).join("\n")
        : Array.apply(null, Array(n)).map(function (_, i) { return ph(i + 1, cap + " " + (i + 1)); }).join("\n");
    };
    switch (kind) {
      case "carrete": return '<div class="carrete" markdown>\n\n' + list(3, "Paso") + "\n\n</div>";
      case "galeria": return '<div class="galeria tres" markdown>\n\n' + list(3, "Foto") + "\n\n</div>";
      case "comparar": return '<div class="comparar" markdown>\n\n' + (imgs && imgs.length >= 2
        ? "![Antes](" + imgs[0].rel + ")\n![Después](" + imgs[1].rel + ")"
        : ph(1, "Antes") + "\n" + ph(2, "Después")) + "\n\n</div>";
      case "hero": return '<figure class="hero-shot" markdown>\n' + (imgs ? "![" + (imgs[0].caption || "Resultado final") + "](" + imgs[0].rel + ")" : ph(1, "Resultado final")) + "\n</figure>";
      case "datos": return '<div class="datos" markdown>\n\n- **Máquina / técnica**: …\n- **Materiales**: …\n- **Software**: …\n- **Tiempo**: …\n\n</div>';
      case "linea": return '<div class="linea" markdown>\n\n- **Semana 1** · …\n- **Semana 2** · …\n- **Semana 3** · …\n\n</div>';
      case "video": {
        var u = prompt("Dirección del video (YouTube o Vimeo)", "https://www.youtube.com/watch?v=");
        if (!u) return null;
        var m = u.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
        var src = m ? "https://www.youtube.com/embed/" + m[1] : (u.match(/vimeo\.com\/(\d+)/) ? "https://player.vimeo.com/video/" + u.match(/vimeo\.com\/(\d+)/)[1] : u);
        return '<div class="video"><iframe src="' + src + '" title="Video" allowfullscreen></iframe></div>';
      }
      case "ok": return '<span class="ok">éxito</span> …';
      case "fail": return '<span class="fail">falló</span> …';
      case "nota": return '!!! note "Título"\n    Texto de la nota.';
      case "stl": return '<div class="stl" data-src="../files/carpeta/pieza.stl" data-nombre="pieza.stl" data-pie="Qué es la pieza"></div>';
    }
    return null;
  }

  function bindToolbar(tb, ta, getImages) {
    if (!tb) return;
    tb.querySelectorAll("button[data-fmt]").forEach(function (b) {
      b.addEventListener("click", function () { applyFormat(ta, b.dataset.fmt); });
    });
    tb.querySelectorAll("button[data-block]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = blockSnippet(b.dataset.block, getImages ? getImages() : null);
        if (t == null) return;
        if (b.dataset.block === "ok" || b.dataset.block === "fail") wrap(ta, t.replace(" …", " "), "", "…");
        else blockText(ta, t);
      });
    });
    ta.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); applyFormat(ta, "bold"); }
      else if (k === "i") { e.preventDefault(); applyFormat(ta, "italic"); }
      else if (k === "k") { e.preventDefault(); applyFormat(ta, "link"); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Imágenes: redimensionar y comprimir en el navegador                 */
  /* ------------------------------------------------------------------ */
  function processImage(file) {
    var keepOriginal = /gif|svg/.test(file.type);
    if (keepOriginal) {
      return file.arrayBuffer().then(function (buf) {
        return { name: safeName(file.name), bytes: new Uint8Array(buf), type: file.type, url: URL.createObjectURL(file) };
      });
    }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var isPng = file.type === "image/png";
        var mime = isPng ? "image/png" : "image/jpeg";
        c.toBlob(function (blob) {
          if (!blob) return reject(new Error("No pude procesar " + file.name));
          blob.arrayBuffer().then(function (buf) {
            var base = safeName(file.name).replace(/\.[^.]+$/, "");
            resolve({
              name: base + (isPng ? ".png" : ".jpg"),
              bytes: new Uint8Array(buf),
              type: mime,
              url: URL.createObjectURL(blob),
              w: c.width, h: c.height
            });
          });
        }, mime, 0.85);
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { reject(new Error("Formato no soportado: " + file.name)); };
      img.src = url;
    });
  }

  function safeName(name) {
    var ext = (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    var base = slugify(name.replace(/\.[^.]+$/, "")) || "imagen";
    return base + ext;
  }

  function fmtSize(n) {
    return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }

  /* ------------------------------------------------------------------ */
  /* GitHub API                                                          */
  /* ------------------------------------------------------------------ */
  function GitHub(cfg) {
    this.cfg = cfg;
    this.token = null;
    this.user = null;
  }

  GitHub.prototype.api = function (path, opts) {
    opts = opts || {};
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 204) return {};
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var msg = (data && data.message) || r.statusText;
          if (r.status === 403 && /not accessible by personal access token/i.test(msg)) {
            msg += ". El token puede leer pero no escribir: en github.com/settings/personal-access-tokens abrí el token, marcá el repositorio en Repository access y poné Contents en \u201cRead and write\u201d. Después, Mi cuenta → Conectar.";
          } else if (r.status === 403 && /rate limit/i.test(msg)) {
            msg += ". GitHub limita las lecturas sin cuenta: conectá tu token o esperá unos minutos.";
          } else if (r.status === 401) {
            msg += ". El token venció o está mal copiado: generá uno nuevo y pegalo en Mi cuenta.";
          }
          var err = new Error(r.status + " · " + msg);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  };

  GitHub.prototype.repoPath = function () {
    return "/repos/" + this.cfg.owner + "/" + this.cfg.repo;
  };

  GitHub.prototype.verify = function () {
    var self = this;
    return self.api("/user").then(function (u) {
      self.user = u.login;
      return self.api(self.repoPath());
    }).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error("El token no tiene permiso de escritura sobre " + self.cfg.owner + "/" + self.cfg.repo);
      }
      return self.user;
    });
  };

  GitHub.prototype.getText = function (path) {
    return this.api(this.repoPath() + "/contents/" + encodePath(path) + "?ref=" + this.cfg.branch)
      .then(function (f) { return { text: b64ToUtf8(f.content), sha: f.sha }; });
  };

  GitHub.prototype.exists = function (path) {
    return this.api(this.repoPath() + "/contents/" + encodePath(path) + "?ref=" + this.cfg.branch)
      .then(function () { return true; }, function (e) { if (e.status === 404) return false; throw e; });
  };

  GitHub.prototype.treeFull = function () {
    return this.api(this.repoPath() + "/git/trees/" + this.cfg.branch + "?recursive=1")
      .then(function (t) { return t.tree.filter(function (e) { return e.type === "blob"; }).map(function (e) { return { path: e.path, size: e.size || 0 }; }); });
  };

  GitHub.prototype.tree = function () {
    return this.api(this.repoPath() + "/git/trees/" + this.cfg.branch + "?recursive=1")
      .then(function (t) { return t.tree.filter(function (e) { return e.type === "blob"; }).map(function (e) { return e.path; }); });
  };

  /* files: [{path, text} | {path, bytes} | {path, remove:true}] → un commit.
     Si la rama avanzó mientras tanto (422 "not a fast forward"), reintenta
     sobre el estado nuevo reutilizando los blobs ya subidos. */
  GitHub.prototype.commit = function (files, message, onStep) {
    var self = this, base = self.repoPath(), entries = [];
    onStep = onStep || function () {};
    var subirBlobs = files.reduce(function (p, f) {
      return p.then(function () {
        if (f.remove) { entries.push({ path: f.path, mode: "100644", type: "blob", sha: null }); return; }
        onStep("Subiendo " + f.path);
        var body = f.bytes
          ? { content: bytesToB64(f.bytes), encoding: "base64" }
          : { content: f.text, encoding: "utf-8" };
        return self.api(base + "/git/blobs", { method: "POST", body: body }).then(function (b) {
          entries.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha });
        });
      });
    }, Promise.resolve());

    function intentar(n) {
      var parentSha;
      onStep(n > 1 ? "La rama cambió; reintento (" + n + ")…" : "Armando el commit");
      return self.api(base + "/git/ref/heads/" + self.cfg.branch).then(function (ref) {
        parentSha = ref.object.sha;
        return self.api(base + "/git/commits/" + parentSha);
      }).then(function (c) {
        return self.api(base + "/git/trees", { method: "POST", body: { base_tree: c.tree.sha, tree: entries } });
      }).then(function (t) {
        return self.api(base + "/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [parentSha] } });
      }).then(function (c) {
        return self.api(base + "/git/refs/heads/" + self.cfg.branch, { method: "PATCH", body: { sha: c.sha, force: false } })
          .then(function () { return c; });
      }).catch(function (e) {
        if (n < 4 && e.status === 422 && /fast forward/i.test(e.message)) {
          return new Promise(function (r) { setTimeout(r, 800 * n); }).then(function () { return intentar(n + 1); });
        }
        throw e;
      });
    }

    return subirBlobs.then(function () { return intentar(1); });
  };

  function encodePath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
  }

  /* ------------------------------------------------------------------ */
  /* mkdocs.yml: leer secciones del nav e insertar páginas               */
  /* ------------------------------------------------------------------ */
  function navBlock(yaml) {
    var lines = yaml.split("\n");
    var start = -1, end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (start < 0 && /^nav:\s*$/.test(lines[i])) { start = i; continue; }
      if (start >= 0 && i > start && /^\S/.test(lines[i])) { end = i; break; }
    }
    // el bloque termina en la última línea con contenido (sin las vacías del final)
    while (end > start + 1 && /^\s*$/.test(lines[end - 1])) end--;
    return { lines: lines, start: start, end: end };
  }

  function navGroups(yaml) {
    var nb = navBlock(yaml), groups = [];
    if (nb.start < 0) return groups;
    for (var i = nb.start + 1; i < nb.end; i++) {
      var m = nb.lines[i].match(/^  - (.+?):\s*$/);
      if (!m) continue;
      var name = m[1].replace(/^["']|["']$/g, "");
      var folder = null;
      for (var j = i + 1; j < nb.end; j++) {
        if (!/^ {6}/.test(nb.lines[j])) break;
        var c = nb.lines[j].match(/^ {6}- .+?:\s*(\S+)\s*$/);
        if (c) { folder = dirname(c[1]); break; }
      }
      groups.push({ name: name, line: i, folder: folder });
    }
    return groups;
  }

  /* Páginas de una sección (o del nivel principal si groupName es null) */
  function navItems(yaml, groupName) {
    var nb = navBlock(yaml), out = [];
    if (nb.start < 0) return out;
    if (groupName == null) {
      for (var i = nb.start + 1; i < nb.end; i++) {
        var m = nb.lines[i].match(/^  - (.+?):\s*(\S*)\s*$/);
        if (m) out.push({ title: m[1].replace(/^["']|["']$/g, ""), path: m[2] || null, line: i, group: !m[2] });
      }
      return out;
    }
    var g = navGroups(yaml).filter(function (x) { return x.name === groupName; })[0];
    if (!g) return out;
    for (var j = g.line + 1; j < nb.end; j++) {
      if (!/^ {6}/.test(nb.lines[j])) break;
      var c = nb.lines[j].match(/^ {6}- (.+?):\s*(\S+)\s*$/);
      if (c) out.push({ title: c[1].replace(/^["']|["']$/g, ""), path: c[2], line: j });
    }
    return out;
  }

  /* Inserta una página en el menú en la posición pedida.
     opts: { group: nombre|null (nivel principal), title, relPath,
             position: "end" | "start" | "after:<path o título>",
             newGroupBefore: título de nivel principal antes del cual va la sección nueva (opcional) } */
  function navInsertAt(yaml, opts) {
    var nb = navBlock(yaml);
    if (nb.start < 0) throw new Error("No encontré el bloque nav: en mkdocs.yml");
    if (yaml.indexOf(": " + opts.relPath) >= 0) return yaml;
    var lines = nb.lines, pos = opts.position || "end";
    var afterKey = pos.indexOf("after:") === 0 ? pos.slice(6) : null;

    if (opts.group == null) {
      var tops = navItems(yaml, null);
      var entry = "  - " + yamlQuote(opts.title) + ": " + opts.relPath;
      var at = nb.end;
      if (pos === "start") at = nb.start + 1;
      else if (afterKey) {
        var t = tops.filter(function (x) { return x.path === afterKey || x.title === afterKey; })[0];
        if (t) { at = t.line + 1; while (at < nb.end && /^ {4,}/.test(lines[at])) at++; }
      }
      lines.splice(at, 0, entry);
      return lines.join("\n");
    }

    var child = "      - " + yamlQuote(opts.title) + ": " + opts.relPath;
    var g = navGroups(yaml).filter(function (x) { return x.name === opts.group; })[0];
    if (g) {
      var items = navItems(yaml, opts.group);
      var k;
      if (pos === "start") k = g.line + 1;
      else if (afterKey) {
        var it = items.filter(function (x) { return x.path === afterKey || x.title === afterKey; })[0];
        k = it ? it.line + 1 : null;
      }
      if (k == null) { k = g.line + 1; while (k < nb.end && /^ {6}/.test(lines[k])) k++; }
      lines.splice(k, 0, child);
    } else {
      var where = nb.end;
      var tops2 = navItems(yaml, null);
      if (opts.newGroupBefore) {
        var b = tops2.filter(function (x) { return x.title === opts.newGroupBefore; })[0];
        if (b) where = b.line;
      } else {
        for (var i = nb.start + 1; i < nb.end; i++) { if (/^  - Editor:/.test(lines[i])) { where = i; break; } }
      }
      lines.splice(where, 0, "  - " + yamlQuote(opts.group) + ":", child);
    }
    return lines.join("\n");
  }

  function navInsert(yaml, groupName, title, relPath) {
    var nb = navBlock(yaml);
    if (nb.start < 0) throw new Error("No encontré el bloque nav: en mkdocs.yml");
    if (yaml.indexOf(": " + relPath) >= 0) return yaml; // ya está en el menú
    var entry = "      - " + yamlQuote(title) + ": " + relPath;
    var groups = navGroups(yaml);
    var g = groups.filter(function (x) { return x.name === groupName; })[0];
    var lines = nb.lines;
    if (g) {
      var k = g.line + 1;
      while (k < nb.end && /^ {6}/.test(lines[k])) k++;
      lines.splice(k, 0, entry);
    } else {
      // sección nueva: antes de "Editor" si existe, si no al final del nav
      var pos = nb.end;
      for (var i = nb.start + 1; i < nb.end; i++) {
        if (/^  - Editor:/.test(lines[i])) { pos = i; break; }
      }
      lines.splice(pos, 0, "  - " + yamlQuote(groupName) + ":", entry);
    }
    return lines.join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* Markdown de la entrada                                              */
  /* ------------------------------------------------------------------ */
  function buildMarkdown(f, images, pagePath) {
    var rel = relToImages(pagePath);
    var out = [];
    out.push("---");
    out.push("title: " + yamlQuote(f.titulo));
    out.push("---");
    out.push("");
    out.push("# " + f.titulo);
    out.push("");
    var meta = [f.semana, f.fecha, f.seccion].filter(Boolean).join(" · ");
    if (meta) { out.push('<p class="meta">' + escapeHtml(meta) + "</p>"); out.push(""); }

    var proceso = f.proceso || "";
    var used = {};
    images.forEach(function (im) { if (proceso.indexOf(im.rel) >= 0) used[im.rel] = true; });
    var sueltas = images.filter(function (im) { return !used[im.rel]; });

    function section(h, body) {
      if (!body || !body.trim()) return;
      out.push("## " + h); out.push(""); out.push(body.trim()); out.push("");
    }

    section("Introducción", f.intro);
    section("Investigación y referencias", f.investigacion);
    if (proceso.trim() || sueltas.length) {
      out.push("## Proceso paso a paso"); out.push("");
      if (proceso.trim()) { out.push(proceso.trim()); out.push(""); }
      if (f.carrete && sueltas.length >= 2) {
        out.push(carrete(sueltas)); out.push("");
      } else {
        sueltas.forEach(function (im) { out.push(figure(im)); out.push(""); });
      }
    }
    if ((f.ok || "").trim() || (f.fail || "").trim()) {
      out.push("## Resultados"); out.push("");
      if ((f.ok || "").trim()) { out.push("### Lo que funcionó"); out.push(""); out.push(f.ok.trim()); out.push(""); }
      if ((f.fail || "").trim()) { out.push("### Lo que falló"); out.push(""); out.push(f.fail.trim()); out.push(""); }
    }
    section("Reflexión", f.reflexion);
    section("Archivos", f.archivos);
    section("Atribución y uso de IA", f.ia);
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function carrete(list, clase) {
    return '<div class="' + (clase || "carrete") + '" markdown>\n\n' +
      list.map(function (im) { return "![" + (im.caption || im.name) + "](" + im.rel + ")"; }).join("\n") +
      "\n\n</div>";
  }

  function figure(im) {
    return '<figure markdown>\n  ![' + (im.caption || im.name) + "](" + im.rel + ")\n  <figcaption>" + escapeHtml(im.caption || "") + "</figcaption>\n</figure>";
  }

  /* ------------------------------------------------------------------ */
  /* Ubicación en el menú: sección + posición + nombre de archivo        */
  /* ------------------------------------------------------------------ */
  function makeUbicacion(box, ctx) {
    // ctx: { groups(), navYaml(), getTitle(), onChange() }
    box.innerHTML =
      '<div class="be-row">' +
      '<div class="be-field"><label>Sección <small>Dónde aparece en el menú</small></label><select class="ubic-seccion"></select>' +
      '<input type="text" class="ubic-seccion-nueva" placeholder="Nombre de la sección nueva" style="display:none;margin-top:.4rem"></div>' +
      '<div class="be-field"><label>Posición <small>Dentro de la sección</small></label><select class="ubic-posicion"></select></div>' +
      '<div class="be-field"><label>Nombre del archivo <small>Se genera solo desde el título</small></label><input type="text" class="ubic-slug" placeholder="nombre-de-la-pagina"><span class="hint be-kv ubic-ruta"></span></div>' +
      "</div>";
    var sel = box.querySelector(".ubic-seccion"), nueva = box.querySelector(".ubic-seccion-nueva"),
        posSel = box.querySelector(".ubic-posicion"), slugIn = box.querySelector(".ubic-slug"), ruta = box.querySelector(".ubic-ruta");
    var manual = false;

    function fillSections() {
      var prev = sel.value;
      sel.innerHTML = "";
      ctx.groups().forEach(function (g) { var o = document.createElement("option"); o.value = g.name; o.textContent = g.name; sel.appendChild(o); });
      var top = document.createElement("option"); top.value = "__top__"; top.textContent = "Nivel principal (sin sección)"; sel.appendChild(top);
      var n = document.createElement("option"); n.value = "__nueva__"; n.textContent = "Sección nueva…"; sel.appendChild(n);
      if (prev) sel.value = prev;
      if (!sel.value && ctx.groups().length) sel.value = ctx.groups()[0].name;
      fillPositions();
    }
    function fillPositions() {
      var prev = posSel.value;
      posSel.innerHTML = "";
      var add = function (v, t) { var o = document.createElement("option"); o.value = v; o.textContent = t; posSel.appendChild(o); };
      var yaml = ctx.navYaml();
      if (sel.value === "__nueva__") {
        add("end", "Al final del menú");
        if (yaml) navItems(yaml, null).forEach(function (t) { add("before:" + t.title, "Antes de \u201c" + t.title + "\u201d"); });
      } else {
        add("end", "Al final");
        add("start", "Al principio");
        if (yaml) navItems(yaml, sel.value === "__top__" ? null : sel.value).forEach(function (it) { add("after:" + (it.path || it.title), "Después de \u201c" + it.title + "\u201d"); });
      }
      if (prev) posSel.value = prev;
      if (!posSel.value) posSel.value = "end";
    }
    function group() {
      var v = sel.value;
      if (v === "__top__") return { name: null, folder: "", top: true };
      if (v === "__nueva__") { var name = nueva.value.trim(); return { name: name, folder: slugify(name) || "seccion", nueva: true }; }
      return ctx.groups().filter(function (g) { return g.name === v; })[0] || { name: v, folder: slugify(v) };
    }
    function slug() { return slugIn.value.trim() || slugify(ctx.getTitle()) || "pagina"; }
    function path() { var g = group(); return "docs/" + (g.folder ? g.folder + "/" : "") + slug() + ".md"; }
    function refresh() {
      if (!manual) slugIn.value = slugify(ctx.getTitle());
      ruta.textContent = path();
    }
    function insertOpts(title, relPath) {
      var g = group(), p = posSel.value || "end";
      var o = { group: g.name, title: title, relPath: relPath, position: p };
      if (g.nueva && p.indexOf("before:") === 0) { o.newGroupBefore = p.slice(7); o.position = "end"; }
      return o;
    }
    sel.addEventListener("change", function () { nueva.style.display = sel.value === "__nueva__" ? "block" : "none"; fillPositions(); refresh(); ctx.onChange && ctx.onChange(); });
    nueva.addEventListener("input", function () { refresh(); ctx.onChange && ctx.onChange(); });
    posSel.addEventListener("change", function () { ctx.onChange && ctx.onChange(); });
    slugIn.addEventListener("input", function () { manual = !!slugIn.value; refresh(); ctx.onChange && ctx.onChange(); });
    fillSections();
    return {
      group: group, slug: slug, path: path, refresh: refresh, fillSections: fillSections, insertOpts: insertOpts,
      set: function (name, slugValue) {
        fillSections();
        if (name == null) sel.value = "__top__";
        else if (ctx.groups().some(function (g) { return g.name === name; })) sel.value = name;
        else { sel.value = "__nueva__"; nueva.value = name; nueva.style.display = "block"; }
        if (slugValue) { slugIn.value = slugValue; manual = true; }
        fillPositions(); refresh();
      },
      value: function () { return { seccion: sel.value, nueva: nueva.value, posicion: posSel.value, slug: manual ? slugIn.value : "" }; },
      restore: function (v) {
        if (!v) return;
        fillSections();
        if (v.seccion) sel.value = v.seccion;
        if (v.nueva) { nueva.value = v.nueva; nueva.style.display = sel.value === "__nueva__" ? "block" : "none"; }
        fillPositions();
        if (v.posicion) posSel.value = v.posicion;
        if (v.slug) { slugIn.value = v.slug; manual = true; }
        refresh();
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Interfaz                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    var root = $("bitacora-editor");
    if (document.body) document.body.classList.toggle("be-page", !!root);
    if (!root || root.dataset.ready) return;
    root.dataset.ready = "1";

    var cfg = {
      owner: root.dataset.owner,
      repo: root.dataset.repo,
      branch: root.dataset.branch || "main",
      site: root.dataset.site || ""
    };
    var gh = new GitHub(cfg);
    var navYaml = null;       // texto de mkdocs.yml
    var groups = [];          // secciones del menú
    var imgsNueva = [];       // imágenes de la entrada nueva
    var imgsEdit = [];        // imágenes para el archivo en edición
    var editFile = null;      // {path, sha}
    var treePaths = [];

    /* --- paneles --- */
    root.querySelectorAll(".be-toolbar [data-panel]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll(".be-toolbar [data-panel]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        root.querySelectorAll(".be-panel").forEach(function (p) { p.classList.toggle("active", p.dataset.panel === b.dataset.panel); });
      });
    });

    function log(id, msg, err) {
      var el = $(id);
      el.textContent = msg;
      el.classList.toggle("err", !!err);
    }

    function setStatus(txt, on) {
      var s = $("be-status");
      s.textContent = txt;
      s.classList.toggle("on", !!on);
    }

    $("be-status").addEventListener("click", function () {
      root.querySelector('.be-toolbar [data-panel="cuenta"]').click();
      $("be-token").focus();
    });

    /* --- token --- */
    function storedToken() {
      try { return localStorage.getItem(KEY_TOKEN) || sessionStorage.getItem(KEY_TOKEN); } catch (e) { return null; }
    }
    function storeToken(t, remember) {
      try {
        localStorage.removeItem(KEY_TOKEN); sessionStorage.removeItem(KEY_TOKEN);
        (remember ? localStorage : sessionStorage).setItem(KEY_TOKEN, t);
      } catch (e) { /* modo privado */ }
    }

    function connect(token) {
      gh.token = token;
      setStatus("Conectando…", false);
      return gh.verify().then(function (login) {
        setStatus("Conectado · " + login, true);
        log("be-log3", "Conectado como " + login + " con permiso de escritura en " + cfg.owner + "/" + cfg.repo + ".");
        return loadNav().then(loadTree);
      }).catch(function (e) {
        gh.token = null;
        setStatus("Sin conexión", false);
        log("be-log3", "No pude conectar: " + e.message, true);
      });
    }

    $("be-conectar").addEventListener("click", function () {
      var t = $("be-token").value.trim();
      if (!t) { log("be-log3", "Pegá el token primero.", true); return; }
      storeToken(t, $("be-recordar").checked);
      connect(t);
    });

    $("be-olvidar").addEventListener("click", function () {
      try { localStorage.removeItem(KEY_TOKEN); sessionStorage.removeItem(KEY_TOKEN); } catch (e) { /* nada */ }
      gh.token = null; gh.user = null;
      $("be-token").value = "";
      setStatus("Sin conexión", false);
      log("be-log3", "Token borrado de este navegador.");
    });

    /* --- nav / secciones --- */
    function fillSections() {
      var sel = $("be-seccion");
      var prev = sel.value;
      sel.innerHTML = "";
      groups.forEach(function (g) {
        var o = document.createElement("option");
        o.value = g.name; o.textContent = g.name; sel.appendChild(o);
      });
      var n = document.createElement("option");
      n.value = "__nueva__"; n.textContent = "Sección nueva…"; sel.appendChild(n);
      if (prev) sel.value = prev;
      if (!sel.value && groups.length) sel.value = groups[0].name;
      updateRuta();
    }

    var onNavLoaded = [];
    function loadNav() {
      return gh.getText("mkdocs.yml").then(function (f) {
        navYaml = f.text;
        groups = navGroups(navYaml).filter(function (g) { return g.folder; });
        fillSections();
        onNavLoaded.forEach(function (fn) { try { fn(); } catch (e) { /* nada */ } });
      });
    }

    // Sin conexión, igual ofrecemos las secciones conocidas del sitio
    groups = [
      { name: "Tecnología y Fabricación", folder: "tecnicos" },
      { name: "Diseño", folder: "diseno" },
      { name: "Innovación", folder: "innovacion" },
      { name: "Proyecto Integrador", folder: "proyecto" },
      { name: "Referencias", folder: "ref" }
    ];
    fillSections();

    $("be-seccion").addEventListener("change", function () {
      $("be-seccion-nueva").style.display = this.value === "__nueva__" ? "block" : "none";
      updateRuta();
      aplicarPistas();
    });
    aplicarPistas();
    $("be-seccion-nueva").addEventListener("input", updateRuta);

    function currentGroup() {
      var v = $("be-seccion").value;
      if (v === "__nueva__") {
        var name = $("be-seccion-nueva").value.trim();
        return { name: name, folder: slugify(name), nueva: true };
      }
      return groups.filter(function (g) { return g.name === v; })[0] || { name: v, folder: slugify(v) };
    }

    function pagePath() {
      var g = currentGroup();
      var slug = $("be-slug").value.trim() || slugify($("be-titulo").value) || "entrada";
      return "docs/" + (g.folder || "bitacora") + "/" + slug + ".md";
    }

    function updateRuta() {
      $("be-ruta").textContent = pagePath();
      // actualizar rutas relativas de las imágenes
      imgsNueva.forEach(function (im) { im.rel = imageRel(im, pagePath(), currentGroup()); });
    }

    function imageRel(im, pPath, g) {
      var slug = pPath.replace(/^.*\//, "").replace(/\.md$/, "");
      im.repoPath = "docs/images/" + (g.folder || "bitacora") + "/" + slug + "/" + im.name;
      return relToImages(pPath) + im.repoPath.replace(/^docs\//, "");
    }

    /* --- borrador --- */
    var fields = ["titulo", "fecha", "semana", "slug", "intro", "investigacion", "proceso", "ok", "fail", "reflexion", "archivos", "ia", "seccion-nueva"];
    function readForm() {
      var f = {};
      fields.forEach(function (k) { f[k] = $("be-" + k).value; });
      f.seccion = currentGroup().name;
      f.carrete = $("be-carrete").checked;
      return f;
    }

    /* Pistas (placeholder) según la sección elegida */
    function PISTAS() { return {
      tec: {
        intro: "Qué quería fabricar o probar, con qué máquina y por qué.",
        investigacion: "Manual de la máquina, parámetros que encontré, trabajos de compañeros, videos. Si usé IA, qué le pedí.",
        proceso: "- Diseñé … en …\n- Preparé el archivo: …\n- Parámetros: potencia …, velocidad …\n- Primer intento: …",
        ok: "Qué quedó bien: medidas, encastre, acabado.",
        fail: "Qué falló: material quemado, pieza que no encaja… y qué creo que pasó.",
        reflexion: "Qué cambiaría en los parámetros o en el diseño la próxima vez.",
        archivos: "- [pieza.f3d](../files/pieza.f3d) · editable\n- [pieza.stl](../files/pieza.stl) · exportación"
      },
      dis: {
        intro: "Para quién es el diseño, qué problema resuelve y qué restricciones tiene.",
        investigacion: "Referencias e inspiración, con fuente y licencia de cada imagen.",
        proceso: "- Boceto a mano: …\n- Primer modelo: …\n- Cambios entre la versión 1 y la 2: …",
        ok: "Qué funcionó del diseño.",
        fail: "Qué no funcionó y por qué lo descarté.",
        reflexion: "Qué aprendí del proceso de diseño.",
        archivos: "- [diseno.f3d](../files/diseno.f3d) · editable\n- [diseno.pdf](../files/diseno.pdf) · visualizable"
      },
      inn: {
        intro: "Qué problema o pregunta quería explorar y en qué contexto.",
        investigacion: "Qué leí, a quién consulté, qué datos junté. Enlaces y citas.",
        proceso: "- Ideas que surgieron (incluidas las descartadas): …\n- Qué probé, con quién y cómo lo medí: …",
        ok: "Lo que confirmó la prueba.",
        fail: "Lo que no salió como esperaba.",
        reflexion: "Qué aprendí y cuál sería el próximo paso.",
        archivos: "- [notas.pdf](../files/notas.pdf)"
      },
      pro: {
        intro: "Resumen de dos o tres frases para alguien que llega hoy al proyecto. Estado actual.",
        investigacion: "Qué consulté esta semana.",
        proceso: "- Lunes: …\n- Miércoles: …\n- Viernes: …\n- Decisiones y alternativas descartadas: …",
        ok: "Avances concretos.",
        fail: "Bloqueos y lo que falló.",
        reflexion: "Qué sigue la semana que viene.",
        archivos: "- [proyecto.f3d](../files/proyecto.f3d)\n- [codigo.ino](../files/codigo.ino)"
      },
      ref: {
        intro: "Qué es el recurso, de quién es y con qué licencia.",
        investigacion: "Enlace y cómo lo encontré.",
        proceso: "Cómo lo usé, paso a paso si hace falta.",
        ok: "Para qué me sirvió.",
        fail: "Limitaciones o lo que no funcionó.",
        reflexion: "En qué entrada lo usé.",
        archivos: ""
      }
    }; }
    function aplicarPistas() {
      var n = (currentGroup().name || "").toLowerCase();
      var k = /tecnolog|fabric/.test(n) ? "tec" : /dise/.test(n) ? "dis" : /innov/.test(n) ? "inn" : /proyecto/.test(n) ? "pro" : /refer/.test(n) ? "ref" : "tec";
      var p = PISTAS()[k];
      Object.keys(p).forEach(function (key) { $("be-" + key).placeholder = p[key]; });
    }
    function saveDraft() {
      try {
        var f = readForm(); f.seccionSel = $("be-seccion").value;
        localStorage.setItem(KEY_DRAFT, JSON.stringify(f));
      } catch (e) { /* nada */ }
    }
    function restoreDraft() {
      try {
        var f = JSON.parse(localStorage.getItem(KEY_DRAFT) || "null");
        if (!f) return;
        fields.forEach(function (k) { if (f[k] != null) $("be-" + k).value = f[k]; });
        if (f.seccionSel) { $("be-seccion").value = f.seccionSel; $("be-seccion").dispatchEvent(new Event("change")); }
      } catch (e) { /* nada */ }
    }
    fields.forEach(function (k) { $("be-" + k).addEventListener("input", saveDraft); });
    $("be-seccion").addEventListener("change", saveDraft);
    $("be-titulo").addEventListener("input", function () {
      if (!$("be-slug").dataset.manual) $("be-slug").value = slugify(this.value);
      updateRuta();
    });
    $("be-slug").addEventListener("input", function () { this.dataset.manual = this.value ? "1" : ""; updateRuta(); });
    if (!$("be-fecha").value) $("be-fecha").value = today();
    restoreDraft();
    updateRuta();

    $("be-limpiar").addEventListener("click", function () {
      if (!confirm("¿Borrar el formulario y las imágenes cargadas?")) return;
      fields.forEach(function (k) { $("be-" + k).value = ""; });
      $("be-slug").dataset.manual = "";
      $("be-fecha").value = today();
      imgsNueva = []; renderImages("be-images", imgsNueva, "be-proceso");
      try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* nada */ }
      $("be-preview").style.display = "none";
      log("be-log", "Formulario vacío.");
    });

    /* --- imágenes --- */
    function setupDrop(dropId, inputId, list, listId, textareaId, relFn) {
      var drop = $(dropId), input = $(inputId);
      drop.addEventListener("click", function () { input.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault(); drop.classList.remove("over");
        addFiles(e.dataTransfer.files);
      });
      input.addEventListener("change", function () { addFiles(input.files); input.value = ""; });

      function addFiles(files) {
        Array.prototype.forEach.call(files, function (file) {
          if (!/^image\//.test(file.type)) return;
          processImage(file).then(function (im) {
            im.caption = "";
            im.original = file.size;
            if (list.some(function (x) { return x.name === im.name; })) {
              im.name = im.name.replace(/(\.[^.]+)$/, "-" + Date.now().toString(36) + "$1");
            }
            im.rel = relFn(im);
            list.push(im);
            renderImages(listId, list, textareaId);
          }).catch(function (e) { alert(e.message); });
        });
      }
    }

    function renderImages(listId, list, textareaId) {
      var box = $(listId);
      box.innerHTML = "";
      list.forEach(function (im, i) {
        var fig = document.createElement("figure");
        fig.innerHTML =
          '<img src="' + im.url + '" alt="">' +
          "<figcaption>" + escapeHtml(im.name) + " · " + fmtSize(im.bytes.length) +
          (im.original ? " (antes " + fmtSize(im.original) + ")" : "") + "</figcaption>" +
          '<input type="text" placeholder="Pie de foto" value="' + escapeHtml(im.caption || "") + '" style="margin-top:.4rem">' +
          '<button type="button" class="small">Insertar en el texto</button>' +
          '<button type="button" class="small">Quitar</button>';
        var inp = fig.querySelector("input");
        inp.addEventListener("input", function () { im.caption = inp.value; });
        var btns = fig.querySelectorAll("button");
        btns[0].addEventListener("click", function () { insertAtCursor($(textareaId), "\n" + figure(im) + "\n"); });
        btns[1].addEventListener("click", function () { list.splice(i, 1); renderImages(listId, list, textareaId); });
        box.appendChild(fig);
      });
    }

    function insertAtCursor(ta, text) {
      var s = ta.selectionStart || ta.value.length, e = ta.selectionEnd || s;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.focus();
      ta.dispatchEvent(new Event("input"));
    }

    setupDrop("be-drop", "be-files", imgsNueva, "be-images", "be-proceso", function (im) {
      return imageRel(im, pagePath(), currentGroup());
    });
    function bindInsert(id, list, textareaId, clase) {
      $(id).addEventListener("click", function () {
        if (list.length < 1) { alert("Primero cargá fotos."); return; }
        insertAtCursor($(textareaId), "\n" + carrete(list, clase) + "\n");
      });
    }
    bindToolbar($("be-tb-proceso"), $("be-proceso"), function () { return imgsNueva; });
    bindInsert("be-ins-carrete", imgsNueva, "be-proceso", "carrete");
    bindInsert("be-ins-galeria", imgsNueva, "be-proceso", "galeria tres");
    bindInsert("be-ins-carrete2", imgsEdit, "be-contenido", "carrete");
    bindInsert("be-ins-galeria2", imgsEdit, "be-contenido", "galeria tres");
    setupDrop("be-drop2", "be-files2", imgsEdit, "be-images2", "be-contenido", function (im) {
      var p = editFile ? editFile.path : "docs/x.md";
      var dir = dirname(p).replace(/^docs\/?/, "") || "inicio";
      im.repoPath = "docs/images/" + dir + "/" + im.name;
      return relToImages(p) + im.repoPath.replace(/^docs\//, "");
    });

    /* --- vista previa / copiar / descargar --- */
    function currentMarkdown() {
      return buildMarkdown(readForm(), imgsNueva, pagePath());
    }

    $("be-previsualizar").addEventListener("click", function () {
      var box = $("be-preview");
      renderMd(currentMarkdown(), imgsNueva).then(function (html) {
        box.innerHTML = html; box.style.display = "block";
        box.scrollIntoView({ behavior: "smooth", block: "start" });
      }).catch(function (e) { log("be-log", e.message, true); });
    });

    $("be-copiar").addEventListener("click", function () {
      navigator.clipboard.writeText(currentMarkdown()).then(function () {
        log("be-log", "Markdown copiado. Pegalo en " + pagePath() + " y agregá la página al nav de mkdocs.yml.");
      }, function () { log("be-log", "No pude copiar; usá Descargar .md.", true); });
    });

    $("be-descargar").addEventListener("click", function () {
      var blob = new Blob([currentMarkdown()], { type: "text/markdown" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = pagePath().replace(/^.*\//, "");
      a.click();
      log("be-log", "Descargado. Las imágenes cargadas no van en el .md: subilas a mano a " + (imgsNueva[0] ? dirname(imgsNueva[0].repoPath) : "docs/images/…") + ".");
    });

    /* --- publicar entrada nueva --- */
    $("be-publicar").addEventListener("click", function () {
      var f = readForm();
      if (!f.titulo.trim()) { log("be-log", "Falta el título.", true); return; }
      if (!gh.token) { log("be-log", "Primero conectá tu cuenta (pestaña Mi cuenta). Mientras tanto podés copiar o descargar el Markdown.", true); return; }
      var g = currentGroup();
      if (!g.name) { log("be-log", "Poné el nombre de la sección nueva.", true); return; }
      var path = pagePath();
      var btn = this; btn.disabled = true;
      log("be-log", "Revisando el repositorio…");

      var chain = loadNav().then(function () { return gh.exists(path); }).then(function (exists) {
        if (exists && !confirm("Ya existe " + path + ". ¿La reemplazo?")) throw new Error("Cancelado.");
        updateRuta();
        var md = buildMarkdown(f, imgsNueva, path);
        var files = [{ path: path, text: md }];
        imgsNueva.forEach(function (im) { files.push({ path: im.repoPath, bytes: im.bytes }); });
        var newYaml = navInsert(navYaml, g.name, f.titulo.trim(), path.replace(/^docs\//, ""));
        if (newYaml !== navYaml) files.push({ path: "mkdocs.yml", text: newYaml });
        var msg = (exists ? "Actualizo" : "Nueva entrada") + ": " + f.titulo.trim() + "\n\nPublicado desde el editor de la bitácora.";
        return gh.commit(files, msg, function (s) { log("be-log", s + "…"); });
      });

      chain.then(function (c) {
        navYaml = null;
        var url = cfg.site + path.replace(/^docs\//, "").replace(/\.md$/, "/");
        log("be-log", "Publicado en el commit " + c.sha.slice(0, 7) + ". GitHub Actions reconstruye el sitio en uno o dos minutos.\n→ " + url + "\n→ https://github.com/" + cfg.owner + "/" + cfg.repo + "/actions");
        try { localStorage.removeItem(KEY_DRAFT); } catch (e) { /* nada */ }
        imgsNueva.splice(0, imgsNueva.length); renderImages("be-images", imgsNueva, "be-proceso");
        return loadTree();
      }).catch(function (e) {
        log("be-log", "No se publicó: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    /* --- editar archivo existente --- */
    var EDITABLE = /\.(md|yml|yaml|css|js|txt|html|csv|svg)$/i;
    var dirty = false;
    var previewTimer = null;

    function setDirty(v) {
      dirty = v;
      $("be-dirty").textContent = v ? "Cambios sin guardar" : "";
    }
    window.addEventListener("beforeunload", function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });

    function loadTree() {
      return gh.tree().then(function (paths) {
        treePaths = paths.filter(function (p) { return (p.indexOf("docs/") === 0 || p === "mkdocs.yml") && EDITABLE.test(p); }).sort();
        var sel = $("be-archivo");
        var prev = sel.value;
        sel.innerHTML = '<option value="">Elegí una página…</option>';
        var groupsByDir = {};
        treePaths.forEach(function (p) {
          var dir = p === "mkdocs.yml" ? "Configuración" : (dirname(p).replace(/^docs\/?/, "") || "Inicio");
          (groupsByDir[dir] = groupsByDir[dir] || []).push(p);
        });
        Object.keys(groupsByDir).sort().forEach(function (dir) {
          var og = document.createElement("optgroup");
          og.label = dir;
          groupsByDir[dir].forEach(function (p) {
            var o = document.createElement("option");
            o.value = p; o.textContent = p.replace(/^docs\//, ""); og.appendChild(o);
          });
          sel.appendChild(og);
        });
        if (prev && treePaths.indexOf(prev) >= 0) sel.value = prev;
      }).catch(function (e) { if (gh.token) log("be-log2", "No pude listar los archivos: " + e.message, true); });
    }

    $("be-recargar").addEventListener("click", function () {
      loadTree().then(function () { log("be-log2", "Lista actualizada."); });
    });

    $("be-nueva-md").addEventListener("click", function () {
      if (dirty && !confirm("Hay cambios sin guardar. ¿Empezar una página nueva igual?")) return;
      $("be-np").style.display = "none";
      $("be-archivo").value = "";
      editFile = null;
      ubicEditar.fillSections(); ubicEditar.refresh();
      openFile(ubicEditar.path(), "# Título de la página\n\nPegá o escribí acá el Markdown.\n", null, true);
      $("be-contenido").focus(); $("be-contenido").select();
      log("be-log2", "Página nueva. Pegá el Markdown, elegí la ubicación en el menú y guardá.");
    });
    $("be-contenido").addEventListener("input", function () {
      if (editFile && editFile.nuevo) { ubicEditar.refresh(); editFile.path = ubicEditar.path(); }
    });

    var ubicEditar = makeUbicacion($("be-ubic-editar"), {
      groups: function () { return groups; },
      navYaml: function () { return navYaml; },
      getTitle: function () { return tituloDe($("be-contenido").value) || $("be-np-titulo").value; },
      onChange: function () { if (editFile && editFile.nuevo) { editFile.path = ubicEditar.path(); schedulePreview(0); } }
    });
    function tituloDe(md) {
      var m = md.match(/^---\n[\s\S]*?\btitle:\s*(.+)\n[\s\S]*?---/) || md.match(/^#\s+(.+)$/m);
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    }
    function showUbic(show) { $("be-ubic-editar").style.display = show ? "block" : "none"; }

    function openFile(p, text, sha, nuevo) {
      editFile = { path: p, sha: sha || null, nuevo: !!nuevo };
      showUbic(!!nuevo);
      $("be-contenido").value = text;
      $("be-al-constructor").style.display = /<!-- bloques:/.test(text) ? "inline-block" : "none";
      $("be-mensaje").value = (nuevo ? "Nueva página: " : "Edito ") + p.replace(/^docs\//, "");
      if (/^docs\/.*\.md$/.test(p)) {
        $("be-ver").href = pageUrl(cfg.site, p); $("be-ver").style.display = nuevo ? "none" : "inline-block";
      } else {
        $("be-ver").style.display = "none";
      }
      imgsEdit.splice(0, imgsEdit.length); renderImages("be-images2", imgsEdit, "be-contenido");
      setDirty(!!nuevo);
      schedulePreview(0);
    }

    $("be-archivo").addEventListener("change", function () {
      var p = this.value;
      if (dirty && !confirm("Hay cambios sin guardar. ¿Cambiar de página igual?")) { this.value = editFile ? editFile.path : ""; return; }
      editFile = null; $("be-contenido").value = ""; $("be-ver").style.display = "none"; setDirty(false);
      if (!p) { schedulePreview(0); return; }
      log("be-log2", "Cargando " + p + "…");
      gh.getText(p).then(function (f) {
        openFile(p, f.text, f.sha, false);
        log("be-log2", p + " cargado (" + fmtSize(new TextEncoder().encode(f.text).length) + ").");
      }).catch(function (e) { log("be-log2", "No pude cargar: " + e.message, true); });
    });

    /* vista previa en vivo */
    function schedulePreview(delay) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, delay == null ? 400 : delay);
    }
    function renderPreview() {
      var box = $("be-preview2");
      var p = editFile ? editFile.path : null;
      var md = $("be-contenido").value;
      if (!md.trim()) { box.innerHTML = '<p class="be-kv">La vista previa aparece acá mientras escribís.</p>'; return; }
      if (p && !/\.md$/i.test(p)) { box.innerHTML = '<p class="be-kv">Sin vista previa para este tipo de archivo.</p>'; return; }
      renderMd(md, imgsEdit, p ? pageUrl(cfg.site, p) : null).then(function (html) {
        box.innerHTML = html;
      }).catch(function (e) { box.innerHTML = '<p class="be-kv">' + escapeHtml(e.message) + "</p>"; });
    }
    $("be-contenido").addEventListener("input", function () {
      if (editFile) setDirty(true);
      schedulePreview();
    });

    /* vista: texto, dividido, vista previa */
    function setView(v) {
      $("be-work").dataset.view = v;
      $("be-tb").querySelectorAll("button[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.view === v ? "true" : "false"); });
      try { localStorage.setItem("bitacora.vista", v); } catch (e) { /* nada */ }
    }
    $("be-tb").querySelectorAll("button[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.view); });
    });
    try { setView(localStorage.getItem("bitacora.vista") || "dividido"); } catch (e) { setView("dividido"); }

    $("be-full").addEventListener("click", function () {
      var on = root.classList.toggle("be-fullscreen");
      document.body.classList.toggle("be-fullscreen-body", on);
      $("be-full").setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("be-fullscreen")) $("be-full").click();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && root.querySelector('.be-panel[data-panel="editar"]').classList.contains("active")) {
        e.preventDefault(); $("be-guardar").click();
      }
    });

    bindToolbar($("be-tb"), $("be-contenido"), function () { return imgsEdit; });

    /* página nueva desde plantilla */
    function fillNpSections() {
      var sel = $("be-np-seccion");
      sel.innerHTML = "";
      groups.forEach(function (g) {
        var o = document.createElement("option"); o.value = g.name; o.textContent = g.name; sel.appendChild(o);
      });
      var n = document.createElement("option"); n.value = "__nueva__"; n.textContent = "Sección nueva…"; sel.appendChild(n);
    }
    function npGroup() {
      var v = $("be-np-seccion").value;
      if (v === "__nueva__") {
        var name = prompt("Nombre de la sección nueva");
        if (!name) return null;
        return { name: name, folder: slugify(name), nueva: true };
      }
      return groups.filter(function (g) { return g.name === v; })[0];
    }
    function npPath() {
      var g = groups.filter(function (g) { return g.name === $("be-np-seccion").value; })[0];
      var slug = slugify($("be-np-titulo").value) || "pagina";
      return "docs/" + (g ? g.folder : "seccion") + "/" + slug + ".md";
    }
    $("be-nueva-pagina").addEventListener("click", function () {
      fillNpSections();
      var np = $("be-np");
      np.style.display = np.style.display === "none" ? "block" : "none";
      $("be-np-ruta").textContent = npPath();
      $("be-np-titulo").focus();
    });
    $("be-np-cancelar").addEventListener("click", function () { $("be-np").style.display = "none"; });
    $("be-np-titulo").addEventListener("input", function () { $("be-np-ruta").textContent = npPath(); });
    $("be-np-seccion").addEventListener("change", function () { $("be-np-ruta").textContent = npPath(); });
    $("be-np-plantilla").addEventListener("change", function () {
      var map = { tecnologia: "Tecnología y Fabricación", diseno: "Diseño", innovacion: "Innovación", proyecto: "Proyecto Integrador", referencia: "Referencias" };
      var want = map[this.value];
      if (want && groups.some(function (g) { return g.name === want; })) { $("be-np-seccion").value = want; $("be-np-ruta").textContent = npPath(); }
    });
    $("be-np-crear").addEventListener("click", function () {
      var titulo = $("be-np-titulo").value.trim();
      if (!titulo) { log("be-log2", "Poné un título para la página nueva.", true); return; }
      var g = npGroup();
      if (!g) return;
      var path = "docs/" + g.folder + "/" + (slugify(titulo) || "pagina") + ".md";
      var tpl = $("be-np-plantilla").value;
      var btn = this; btn.disabled = true;
      log("be-log2", "Preparando " + path + "…");
      var getTpl = tpl ? gh.getText("docs/plantillas/" + tpl + ".md").then(function (f) { return f.text; })
        : Promise.resolve("---\ntitle: " + yamlQuote(titulo) + "\n---\n\n# " + titulo + "\n\n<p class=\"meta\">" + escapeHtml(g.name) + " · " + today() + "</p>\n\n");
      Promise.all([getTpl, gh.exists(path)]).then(function (r) {
        var text = r[0], exists = r[1];
        if (exists) { log("be-log2", "Ya existe " + path + ". Elegila en la lista para editarla.", true); return; }
        text = text.replace(/^---\ntitle: .*\n---\n/, "---\ntitle: " + yamlQuote(titulo) + "\n---\n");
        text = text.replace(/^# .*$/m, "# " + titulo);
        text = text.replace(/AAAA-MM-DD/g, today());
        editFile = null;
        $("be-archivo").value = "";
        ubicEditar.set(g.name, slugify(titulo));
        openFile(ubicEditar.path(), text, null, true);
        editFile.titulo = titulo;
        $("be-np").style.display = "none";
        log("be-log2", "Página nueva lista. Reemplazá los textos en cursiva y las fotos de ejemplo, y guardá.");
      }).catch(function (e) { log("be-log2", "No pude preparar la página: " + e.message, true); }).then(function () { btn.disabled = false; });
    });

    $("be-guardar").addEventListener("click", function () {
      if (!editFile) { log("be-log2", "Elegí una página primero.", true); return; }
      if (!gh.token) { log("be-log2", "Para guardar hace falta conectar tu cuenta (pestaña Mi cuenta).", true); return; }
      var btn = this; btn.disabled = true;
      if (editFile.nuevo) {
        editFile.path = ubicEditar.path();
        editFile.titulo = tituloDe($("be-contenido").value) || editFile.titulo || ubicEditar.slug();
        var gg = ubicEditar.group();
        if (gg.nueva && !gg.name) { log("be-log2", "Poné el nombre de la sección nueva.", true); btn.disabled = false; return; }
      }
      var files = [{ path: editFile.path, text: $("be-contenido").value }];
      imgsEdit.forEach(function (im) { files.push({ path: im.repoPath, bytes: im.bytes }); });
      var msg = ($("be-mensaje").value.trim() || (editFile.nuevo ? "Nueva página: " : "Edito ") + editFile.path.replace(/^docs\//, "")) + "\n\nEditado desde la bitácora.";
      var pre = Promise.resolve();
      if (editFile.nuevo) {
        pre = loadNav().then(function () { return gh.exists(editFile.path); }).then(function (exists) {
          if (exists && !confirm("Ya existe " + editFile.path + ". ¿La reemplazo?")) throw new Error("Cancelado.");
          var y = navInsertAt(navYaml, ubicEditar.insertOpts(editFile.titulo, editFile.path.replace(/^docs\//, "")));
          if (y !== navYaml) files.push({ path: "mkdocs.yml", text: y });
        });
      }
      pre.then(function () {
        return gh.commit(files, msg, function (s) { log("be-log2", s + "…"); });
      }).then(function (c) {
        var wasNew = editFile.nuevo;
        editFile.nuevo = false; delete editFile.group;
        showUbic(false);
        setDirty(false);
        log("be-log2", "Guardado en el commit " + c.sha.slice(0, 7) + ". El sitio se reconstruye en uno o dos minutos." + (wasNew ? "\n→ " + pageUrl(cfg.site, editFile.path) : ""));
        if (/\.md$/.test(editFile.path)) { $("be-ver").href = pageUrl(cfg.site, editFile.path); $("be-ver").style.display = "inline-block"; }
        imgsEdit.splice(0, imgsEdit.length); renderImages("be-images2", imgsEdit, "be-contenido");
        if (editFile.path === "mkdocs.yml") navYaml = null;
        navYaml = null;
        return loadTree().then(function () { $("be-archivo").value = editFile.path; });
      }).catch(function (e) {
        log("be-log2", "No se guardó: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    $("be-borrar").addEventListener("click", function () {
      if (!editFile || editFile.nuevo) { log("be-log2", "Elegí una página guardada primero.", true); return; }
      if (editFile.path === "mkdocs.yml" || /\/index\.md$/.test("/" + editFile.path.replace(/^docs\//, ""))) {
        log("be-log2", "Ese archivo no se borra desde acá.", true); return;
      }
      if (!confirm("¿Borrar " + editFile.path + " del repositorio? Si está en el menú, sacalo también de mkdocs.yml.")) return;
      var p = editFile.path, btn = this; btn.disabled = true;
      gh.commit([{ path: p, remove: true }], "Borro " + p + "\n\nEditado desde la bitácora.").then(function (c) {
        log("be-log2", "Borrado en el commit " + c.sha.slice(0, 7) + ".");
        editFile = null; $("be-contenido").value = ""; $("be-archivo").value = ""; setDirty(false); schedulePreview(0);
        return loadTree();
      }).catch(function (e) {
        log("be-log2", "No se borró: " + e.message, true);
      }).then(function () { btn.disabled = false; });
    });

    // Sin token igual se puede explorar: el repositorio es público
    loadTree();
    loadNav().catch(function () { /* sin red: quedan las secciones conocidas */ });

    /* --- gestor de archivos (pestaña Archivos) --- */
    var fm = { carpeta: null, entradas: [], cola: [] };
    var FM_RAICES = ["docs/files", "docs/images"];

    function fmLog(msg, err) { log("fm-log", msg, err); }

    function fmCargar() {
      return gh.treeFull().then(function (entries) {
        fm.entradas = entries.filter(function (e) { return FM_RAICES.some(function (r) { return e.path.indexOf(r + "/") === 0; }); });
        fmDibujarCarpetas();
        fmDibujarLista();
        if (typeof matFill === "function") matFill();
      }).catch(function (e) { $("fm-carpetas").innerHTML = '<p class="be-kv">No pude leer las carpetas: ' + escapeHtml(e.message) + "</p>"; });
    }

    function fmCarpetas() {
      var set = {};
      FM_RAICES.forEach(function (r) { set[r] = true; });
      fm.entradas.forEach(function (e) {
        var parts = e.path.split("/");
        for (var i = 2; i < parts.length; i++) set[parts.slice(0, i).join("/")] = true;
      });
      return Object.keys(set).sort();
    }

    function fmDibujarCarpetas() {
      var box = $("fm-carpetas");
      box.innerHTML = "";
      fmCarpetas().forEach(function (c) {
        var depth = c.split("/").length - 2;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "fm-carpeta" + (c === fm.carpeta ? " activa" : "");
        b.style.paddingLeft = (0.6 + depth * 0.9) + "rem";
        var n = fm.entradas.filter(function (e) { return dirname(e.path) === c && !/\/\.gitkeep$/.test(e.path); }).length;
        b.innerHTML = (depth === 0 ? "▣ " : "▸ ") + escapeHtml(c.replace(/^docs\//, "")) + (n ? ' <span class="tag">' + n + "</span>" : "");
        b.addEventListener("click", function () { fm.carpeta = c; fmDibujarCarpetas(); fmDibujarLista(); });
        box.appendChild(b);
      });
    }

    function fmRelPara(path) {
      // ruta relativa desde una página dentro de una sección, o desde la página abierta en Markdown
      var base = editFile && /^docs\//.test(editFile.path) ? relToImages(editFile.path) : "../";
      return base + path.replace(/^docs\//, "");
    }

    function fmSnippet(path) {
      var rel = fmRelPara(path), name = path.replace(/^.*\//, "");
      if (/\.(jpe?g|png|gif|webp|svg)$/i.test(name)) return "![" + name.replace(/\.[^.]+$/, "").replace(/-/g, " ") + "](" + rel + ")";
      if (/\.stl$/i.test(name)) return '<div class="stl" data-src="' + rel + '" data-nombre="' + name + '" data-pie=""></div>';
      return "[" + name + "](" + rel + ")";
    }

    function fmDibujarLista() {
      var box = $("fm-lista");
      $("fm-ruta").textContent = fm.carpeta ? fm.carpeta.replace(/^docs\//, "") + "/" : "Elegí una carpeta";
      if (!fm.carpeta) { box.innerHTML = '<p class="be-kv">Elegí una carpeta a la izquierda.</p>'; return; }
      var files = fm.entradas.filter(function (e) { return dirname(e.path) === fm.carpeta && !/\/\.gitkeep$/.test(e.path); });
      if (!files.length) { box.innerHTML = '<p class="be-kv">Carpeta vacía. Arrastrá archivos arriba.</p>'; return; }
      box.innerHTML = "";
      files.forEach(function (f) {
        var name = f.path.replace(/^.*\//, "");
        var row = document.createElement("div");
        row.className = "fm-fila";
        var esImg = /\.(jpe?g|png|gif|webp)$/i.test(name);
        row.innerHTML =
          (esImg ? '<img class="fm-mini" src="' + cfg.site + f.path.replace(/^docs\//, "") + '" alt="">' : '<span class="fm-mini fm-ext">' + escapeHtml((name.match(/\.([^.]+)$/) || ["", "?"])[1].toUpperCase().slice(0, 4)) + "</span>") +
          '<span class="fm-nombre">' + escapeHtml(name) + ' <span class="tag">' + fmtSize(f.size) + "</span></span>" +
          '<code class="fm-snippet">' + escapeHtml(fmSnippet(f.path)) + "</code>" +
          '<span class="fm-botones"><button type="button" class="small" data-a="copiar">Copiar</button><button type="button" class="small" data-a="insertar">Insertar</button><a class="small" href="' + cfg.site + f.path.replace(/^docs\//, "") + '" target="_blank" rel="noopener">Ver</a><button type="button" class="small" data-a="borrar" title="Borrar del repositorio">×</button></span>';
        row.querySelector('[data-a="copiar"]').addEventListener("click", function () {
          navigator.clipboard.writeText(fmSnippet(f.path)).then(function () { fmLog("Fragmento copiado: " + fmSnippet(f.path)); }, function () { fmLog("No pude copiar; seleccioná el texto a mano.", true); });
        });
        row.querySelector('[data-a="insertar"]').addEventListener("click", function () {
          if (!editFile) { fmLog("Primero abrí una página en la pestaña Markdown (o creá una nueva); el fragmento se inserta ahí.", true); return; }
          insertAtCursor($("be-contenido"), "\n" + fmSnippet(f.path) + "\n");
          root.querySelector('.be-toolbar [data-panel="editar"]').click();
        });
        row.querySelector('[data-a="borrar"]').addEventListener("click", function () {
          if (!gh.token) { fmLog("Conectá tu cuenta para borrar.", true); return; }
          if (!confirm("¿Borrar " + f.path + " del repositorio? Si alguna página lo usa, va a quedar un enlace roto.")) return;
          gh.commit([{ path: f.path, remove: true }], "Borro " + f.path + "\n\nDesde el gestor de archivos de la bitácora.").then(function () {
            fmLog("Borrado " + name + "."); return fmCargar();
          }).catch(function (e) { fmLog("No se borró: " + e.message, true); });
        });
        box.appendChild(row);
      });
    }

    $("fm-recargar").addEventListener("click", function () { fmCargar().then(function () { fmLog("Carpetas actualizadas."); }); });

    $("fm-crear").addEventListener("click", function () {
      var name = slugify($("fm-nueva-nombre").value);
      if (!name) { fmLog("Poné un nombre para la carpeta.", true); return; }
      if (!gh.token) { fmLog("Conectá tu cuenta (pestaña Mi cuenta) para crear carpetas.", true); return; }
      var files = [];
      if ($("fm-nueva-files").checked) files.push({ path: "docs/files/" + name + "/.gitkeep", text: "" });
      if ($("fm-nueva-images").checked) files.push({ path: "docs/images/" + name + "/.gitkeep", text: "" });
      if (!files.length) { fmLog("Marcá al menos una ubicación.", true); return; }
      var btn = this; btn.disabled = true;
      gh.commit(files, "Carpeta nueva: " + name + "\n\nDesde el gestor de archivos de la bitácora.").then(function () {
        fmLog("Carpeta " + name + " creada. Elegila a la izquierda para subir archivos.");
        $("fm-nueva-nombre").value = "";
        return fmCargar().then(function () { fm.carpeta = ($("fm-nueva-files").checked ? "docs/files/" : "docs/images/") + name; fmDibujarCarpetas(); fmDibujarLista(); });
      }).catch(function (e) { fmLog("No se creó: " + e.message, true); }).then(function () { btn.disabled = false; });
    });

    /* cola de subida */
    function fmDibujarCola() {
      var box = $("fm-pendientes");
      box.innerHTML = "";
      fm.cola.forEach(function (it, i) {
        var row = document.createElement("div");
        row.className = "fm-fila fm-pendiente";
        row.innerHTML = (it.url ? '<img class="fm-mini" src="' + it.url + '" alt="">' : '<span class="fm-mini fm-ext">' + escapeHtml((it.name.match(/\.([^.]+)$/) || ["", "?"])[1].toUpperCase().slice(0, 4)) + "</span>") +
          '<span class="fm-nombre">' + escapeHtml(it.name) + ' <span class="tag">' + fmtSize(it.bytes.length) + (it.original && it.original !== it.bytes.length ? " · antes " + fmtSize(it.original) : "") + "</span></span>" +
          '<span class="fm-botones"><button type="button" class="small">×</button></span>';
        row.querySelector("button").addEventListener("click", function () { fm.cola.splice(i, 1); fmDibujarCola(); });
        box.appendChild(row);
      });
      $("fm-acciones").style.display = fm.cola.length ? "flex" : "none";
    }

    function fmAgregar(files) {
      if (!fm.carpeta) { fmLog("Primero elegí la carpeta de destino a la izquierda.", true); return; }
      Array.prototype.forEach.call(files, function (file) {
        if (file.size > 50 * 1024 * 1024) { alert(file.name + " pesa " + fmtSize(file.size) + ". Más de 50 MB no entra en el repositorio: subilo a Google Drive y enlazalo."); return; }
        if (file.size > 10 * 1024 * 1024 && !confirm(file.name + " pesa " + fmtSize(file.size) + ". La guía pide consultar antes de subir más de 10 MB. ¿Subirlo igual?")) return;
        var esImg = /^image\//.test(file.type) && !/gif|svg/.test(file.type);
        var p = esImg && $("fm-comprimir").checked
          ? processImage(file).then(function (im) { return { name: im.name, bytes: im.bytes, url: im.url, original: file.size }; })
          : file.arrayBuffer().then(function (buf) {
              var name = slugify(file.name.replace(/\.[^.]+$/, "")) + (file.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
              return { name: name, bytes: new Uint8Array(buf), url: /^image\//.test(file.type) ? URL.createObjectURL(file) : null };
            });
        p.then(function (it) {
          if (fm.cola.some(function (x) { return x.name === it.name; })) it.name = it.name.replace(/(\.[^.]+)$/, "-" + Date.now().toString(36) + "$1");
          fm.cola.push(it); fmDibujarCola();
        }).catch(function (e) { alert(e.message); });
      });
    }

    (function () {
      var drop = $("fm-drop"), input = $("fm-files");
      drop.addEventListener("click", function () { input.click(); });
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); fmAgregar(e.dataTransfer.files); });
      input.addEventListener("change", function () { fmAgregar(input.files); input.value = ""; });
    })();

    $("fm-vaciar").addEventListener("click", function () { fm.cola = []; fmDibujarCola(); });

    $("fm-subir").addEventListener("click", function () {
      if (!fm.cola.length || !fm.carpeta) return;
      if (!gh.token) { fmLog("Conectá tu cuenta (pestaña Mi cuenta) para subir.", true); return; }
      var btn = this; btn.disabled = true;
      var existentes = fm.entradas.map(function (e) { return e.path; });
      var files = fm.cola.map(function (it) { return { path: fm.carpeta + "/" + it.name, bytes: it.bytes }; });
      var repetidos = files.filter(function (f) { return existentes.indexOf(f.path) >= 0; }).map(function (f) { return f.path.replace(/^.*\//, ""); });
      if (repetidos.length && !confirm("Ya existen en la carpeta: " + repetidos.join(", ") + ". ¿Reemplazarlos?")) { btn.disabled = false; return; }
      var msg = "Subo " + files.length + (files.length === 1 ? " archivo a " : " archivos a ") + fm.carpeta.replace(/^docs\//, "") + "\n\n" + files.map(function (f) { return "- " + f.path.replace(/^.*\//, ""); }).join("\n") + "\n\nDesde el gestor de archivos de la bitácora.";
      gh.commit(files, msg, function (s) { fmLog(s + "…"); }).then(function (c) {
        fmLog("Subidos en el commit " + c.sha.slice(0, 7) + ". Ya podés copiar o insertar sus fragmentos desde la lista. El sitio los sirve en uno o dos minutos.");
        fm.cola = []; fmDibujarCola();
        return fmCargar();
      }).catch(function (e) { fmLog("No se subió: " + e.message, true); }).then(function () { btn.disabled = false; });
    });

    /* --- materiales: módulos (carpetas) con sus archivos --- */
    function tipoDe(path) {
      if (/\.(jpe?g|png|gif|webp|svg)$/i.test(path)) return "imagen";
      if (/\.stl$/i.test(path)) return "stl";
      return "archivo";
    }
    function modulos() {
      var map = {};
      fm.entradas.forEach(function (e) {
        if (/\/\.gitkeep$/.test(e.path)) return;
        var m = e.path.match(/^docs\/(files|images)\/(.+)\/[^/]+$/);
        if (!m) return;
        var k = m[2];
        (map[k] = map[k] || []).push({ path: e.path, size: e.size, tipo: tipoDe(e.path), name: e.path.replace(/^.*\//, "") });
      });
      return Object.keys(map).sort().map(function (k) { return { nombre: k, items: map[k].sort(function (a, b) { return a.path < b.path ? -1 : 1; }) }; });
    }
    function matRel(path) { return fmRelPara(path); }
    function matFragmento(it, formato) {
      var rel = matRel(it.path), base = it.name.replace(/\.[^.]+$/, "").replace(/-/g, " ");
      switch (formato) {
        case "figura": return "<figure markdown>\n  ![" + base + "](" + rel + ")\n  <figcaption>" + base + "</figcaption>\n</figure>";
        case "linea": return "![" + base + "](" + rel + ")";
        case "hero": return '<figure class="hero-shot" markdown>\n![' + base + "](" + rel + ")\n</figure>";
        case "stl": return '<div class="stl" data-src="' + rel + '" data-nombre="' + it.name + '" data-pie=""></div>';
        default: return "[" + it.name + "](" + rel + ")" + (it.tipo === "stl" ? " · archivo STL para imprimir" : "");
      }
    }
    function matBorrador(mod) {
      var imgs = mod.items.filter(function (i) { return i.tipo === "imagen"; });
      var stls = mod.items.filter(function (i) { return i.tipo === "stl"; });
      var otros = mod.items.filter(function (i) { return i.tipo === "archivo"; });
      var titulo = mod.nombre.replace(/-/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); });
      var out = ["---", "title: " + yamlQuote(titulo), "---", "", "# " + titulo, "", '<p class="meta">' + escapeHtml(mod.nombre.toUpperCase()) + " · " + today() + "</p>", "",
        "## Objetivo", "", "_Qué quería lograr y por qué._", ""];
      if (imgs.length) {
        out.push("## Proceso", "", "_Qué hice, paso a paso. Cambiá los pies de foto._", "");
        if (imgs.length >= 2) { out.push('<div class="carrete" markdown>', ""); imgs.forEach(function (i) { out.push(matFragmento(i, "linea")); }); out.push("", "</div>", ""); }
        else out.push(matFragmento(imgs[0], "figura"), "");
      }
      out.push("## Resultados", "", '<span class="ok">éxito</span> _…_', "", '<span class="fail">falló</span> _…_', "");
      if (stls.length) { out.push("## Pieza 3D", ""); stls.forEach(function (i) { out.push(matFragmento(i, "stl"), "", "- " + matFragmento(i, "enlace"), ""); }); }
      if (otros.length) { out.push("## Archivos", ""); otros.forEach(function (i) { out.push("- " + matFragmento(i, "enlace")); }); out.push(""); }
      out.push("## Reflexión", "", "_Qué aprendí. Qué haría distinto._", "", "## Atribución y uso de IA", "", "_Fuentes, licencias, ayuda recibida._", "");
      return out.join("\n");
    }

    var matBox = $("be-mat");
    function matFill() {
      var sel = $("mat-modulo"), prev = sel.value;
      sel.innerHTML = '<option value="">Elegí una carpeta / módulo…</option>';
      modulos().forEach(function (m) {
        var o = document.createElement("option"); o.value = m.nombre; o.textContent = m.nombre + " · " + m.items.length + (m.items.length === 1 ? " archivo" : " archivos"); sel.appendChild(o);
      });
      if (prev) sel.value = prev;
      matLista();
    }
    function matLista() {
      var box = $("mat-lista"), nombre = $("mat-modulo").value;
      var mod = modulos().filter(function (m) { return m.nombre === nombre; })[0];
      if (!mod) { box.innerHTML = '<p class="be-kv">Elegí una carpeta para ver sus archivos. Cada botón inserta el fragmento en el cursor con la ruta correcta para esta página.</p>'; return; }
      box.innerHTML = "";
      mod.items.forEach(function (it) {
        var card = document.createElement("div");
        card.className = "mat-item";
        var url = cfg.site + it.path.replace(/^docs\//, "");
        var principal = matFragmento(it, it.tipo === "imagen" ? "linea" : it.tipo === "stl" ? "stl" : "enlace");
        card.innerHTML =
          (it.tipo === "imagen" ? '<img class="mat-mini" src="' + url + '" alt="">' : '<span class="mat-mini fm-ext">' + escapeHtml((it.name.match(/\.([^.]+)$/) || ["", "?"])[1].toUpperCase().slice(0, 4)) + "</span>") +
          '<span class="mat-nombre">' + escapeHtml(it.name) + ' <span class="tag">' + fmtSize(it.size) + "</span></span>" +
          '<code class="mat-snippet" title="Clic para copiar">' + escapeHtml(principal) + "</code>" +
          '<span class="mat-botones"></span>';
        card.querySelector(".mat-snippet").addEventListener("click", function () {
          navigator.clipboard.writeText(principal).then(function () { log("be-log2", "Copiado: " + principal); }, function () { log("be-log2", "No pude copiar; seleccioná el texto a mano.", true); });
        });
        var btns = card.querySelector(".mat-botones");
        var cp = document.createElement("button"); cp.type = "button"; cp.className = "small primary"; cp.textContent = "Copiar";
        cp.addEventListener("click", function () { card.querySelector(".mat-snippet").click(); });
        btns.appendChild(cp);
        var formatos = it.tipo === "imagen" ? [["figura", "Imagen"], ["linea", "Carrete / galería"], ["hero", "Hero shot"]] : it.tipo === "stl" ? [["stl", "Visor 3D"], ["enlace", "Enlace"]] : [["enlace", "Enlace"]];
        formatos.forEach(function (f) {
          var b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = f[1];
          b.addEventListener("click", function () {
            if (!editFile) { log("be-log2", "Abrí o creá una página primero; el fragmento se inserta en el cursor.", true); return; }
            insertAtCursor($("be-contenido"), "\n" + matFragmento(it, f[0]) + "\n");
          });
          btns.appendChild(b);
        });
        box.appendChild(card);
      });
    }
    $("be-mat-toggle").addEventListener("click", function () {
      var on = matBox.classList.toggle("abierto");
      this.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) { matFill(); if (!fm.entradas.length) fmCargar().then(matFill); }
    });
    $("mat-cerrar").addEventListener("click", function () { matBox.classList.remove("abierto"); $("be-mat-toggle").setAttribute("aria-pressed", "false"); });
    $("mat-modulo").addEventListener("change", matLista);
    $("mat-copiar-todo").addEventListener("click", function () {
      var mod = modulos().filter(function (m) { return m.nombre === $("mat-modulo").value; })[0];
      if (!mod) { log("be-log2", "Elegí primero la carpeta del módulo.", true); return; }
      var lineas = [];
      mod.items.forEach(function (it) {
        if (it.tipo === "imagen") lineas.push(matFragmento(it, "linea"));
        else if (it.tipo === "stl") { lineas.push(matFragmento(it, "stl")); lineas.push("- " + matFragmento(it, "enlace")); }
        else lineas.push("- " + matFragmento(it, "enlace"));
      });
      var texto = lineas.join("\n");
      navigator.clipboard.writeText(texto).then(function () { log("be-log2", "Copiados " + mod.items.length + " enlaces de " + mod.nombre + ":\n" + texto); }, function () { log("be-log2", "No pude copiar; usá los botones de cada archivo.", true); });
    });
    $("mat-ir-archivos").addEventListener("click", function () {
      var nombre = $("mat-modulo").value;
      root.querySelector('.be-toolbar [data-panel="archivos"]').click();
      if (nombre) { var c = fmCarpetas().filter(function (x) { return x === "docs/images/" + nombre || x === "docs/files/" + nombre; })[0]; if (c) { fm.carpeta = c; fmDibujarCarpetas(); fmDibujarLista(); } }
    });
    $("mat-borrador").addEventListener("click", function () {
      var nombre = $("mat-modulo").value;
      var mod = modulos().filter(function (m) { return m.nombre === nombre; })[0];
      if (!mod) { log("be-log2", "Elegí primero la carpeta del módulo.", true); return; }
      if (dirty && !confirm("Hay cambios sin guardar. ¿Reemplazarlos por el borrador?")) return;
      $("be-np").style.display = "none"; $("be-archivo").value = ""; editFile = null;
      var g = groups.filter(function (x) { return nombre.indexOf(x.folder) === 0; })[0];
      ubicEditar.set(g ? g.name : (groups[0] ? groups[0].name : null), nombre);
      openFile(ubicEditar.path(), matBorrador(mod), null, true);
      log("be-log2", "Borrador armado con " + mod.items.length + " archivos de " + nombre + ". Completá los textos en cursiva, revisá la ubicación en el menú y guardá.");
      $("be-contenido").focus();
    });
    $("be-contenido").addEventListener("focus", function () { if (matBox.classList.contains("abierto")) matLista(); });

    /* selector de material para el constructor */
    function elegirMaterial(opts, cb) {
      var ov = document.createElement("div");
      ov.className = "bc-ajuste";
      ov.innerHTML = '<div class="bc-ajuste-caja"><div class="bc-ajuste-titulo">Elegir del repositorio <span class="bc-ajuste-nombre">' + (opts.tipo === "imagen" ? "fotos" : opts.tipo === "stl" ? "piezas STL" : "archivos") + "</span></div>" +
        '<div class="be-field"><label>Carpeta / módulo</label><select class="sel-mod"></select></div>' +
        '<div class="mat-lista sel-lista"></div>' +
        '<div class="be-actions"><button type="button" class="primary" data-act="ok">Usar seleccionados</button><button type="button" data-act="no">Cancelar</button></div></div>';
      document.body.appendChild(ov);
      var sel = ov.querySelector(".sel-mod"), lista = ov.querySelector(".sel-lista"), elegidos = {};
      function dibujar() {
        var mod = modulos().filter(function (m) { return m.nombre === sel.value; })[0];
        lista.innerHTML = "";
        if (!mod) return;
        mod.items.filter(function (i) { return !opts.tipo || i.tipo === opts.tipo || (opts.tipo === "archivo"); }).forEach(function (it) {
          var card = document.createElement("label");
          card.className = "mat-item sel-item";
          var url = cfg.site + it.path.replace(/^docs\//, "");
          card.innerHTML = '<input type="' + (opts.multiple ? "checkbox" : "radio") + '" name="sel">' +
            (it.tipo === "imagen" ? '<img class="mat-mini" src="' + url + '" alt="">' : '<span class="mat-mini fm-ext">' + escapeHtml((it.name.match(/\.([^.]+)$/) || ["", "?"])[1].toUpperCase().slice(0, 4)) + "</span>") +
            '<span class="mat-nombre">' + escapeHtml(it.name) + ' <span class="tag">' + fmtSize(it.size) + "</span></span>";
          card.querySelector("input").addEventListener("change", function () {
            if (!opts.multiple) elegidos = {};
            if (this.checked) elegidos[it.path] = it; else delete elegidos[it.path];
          });
          lista.appendChild(card);
        });
      }
      function fill() {
        sel.innerHTML = '<option value="">Elegí una carpeta…</option>';
        modulos().forEach(function (m) {
          var n = m.items.filter(function (i) { return !opts.tipo || i.tipo === opts.tipo || opts.tipo === "archivo"; }).length;
          if (!n) return;
          var o = document.createElement("option"); o.value = m.nombre; o.textContent = m.nombre + " · " + n; sel.appendChild(o);
        });
      }
      fill();
      if (!fm.entradas.length) fmCargar().then(fill);
      sel.addEventListener("change", dibujar);
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
      ov.querySelector('[data-act="no"]').addEventListener("click", close);
      ov.querySelector('[data-act="ok"]').addEventListener("click", function () {
        var items = Object.keys(elegidos).map(function (k) { return elegidos[k]; });
        close();
        if (items.length) cb(items.map(function (it) { return { path: it.path, name: it.name, size: it.size, url: cfg.site + it.path.replace(/^docs\//, ""), tipo: it.tipo }; }));
      });
    }

    fmCargar().then(matFill);

    /* --- vista previa como en el sitio (pantalla completa) --- */
    root.querySelectorAll("[data-previa-full]").forEach(function (b) {
      b.addEventListener("click", function () {
        var box = $(b.dataset.previaFull);
        if (!box) return;
        if (box.classList.contains("previa-full")) { cerrarPrevia(box); return; }
        box.classList.add("previa-full");
        var x = document.createElement("button");
        x.type = "button"; x.className = "previa-cerrar"; x.textContent = "× Cerrar vista previa";
        x.addEventListener("click", function () { cerrarPrevia(box); });
        box.__cerrar = x;
        document.body.appendChild(x);
        document.body.style.overflow = "hidden";
      });
    });
    function cerrarPrevia(box) {
      box.classList.remove("previa-full");
      if (box.__cerrar && box.__cerrar.parentNode) box.__cerrar.parentNode.removeChild(box.__cerrar);
      document.body.style.overflow = "";
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") root.querySelectorAll(".be-preview.previa-full").forEach(cerrarPrevia);
    });

    /* --- puente con el constructor (constructor.js) --- */
    function openNewText(path, text, group, titulo, ubicValue) {
      root.querySelector('.be-toolbar [data-panel="editar"]').click();
      editFile = null; $("be-archivo").value = "";
      if (ubicValue) ubicEditar.restore(ubicValue); else ubicEditar.set(group ? group.name : null, path.replace(/^.*\//, "").replace(/\.md$/, ""));
      openFile(ubicEditar.path(), text, null, true);
      editFile.titulo = titulo;
      log("be-log2", "Página lista para retocar. Guardá cuando termines.");
    }
    $("be-contenido").addEventListener("input", function () {
      $("be-al-constructor").style.display = /<!-- bloques:/.test(this.value) ? "inline-block" : "none";
    });
    $("be-archivo").addEventListener("change", function () {
      setTimeout(function () { $("be-al-constructor").style.display = /<!-- bloques:/.test($("be-contenido").value) ? "inline-block" : "none"; }, 1500);
    });
    $("be-al-constructor").addEventListener("click", function () {
      var m = $("be-contenido").value.match(/<!-- bloques:([A-Za-z0-9+/=]+) -->/);
      if (!m || !window.BitacoraConstructor) return;
      try {
        var json = JSON.parse(b64ToUtf8(m[1]));
        window.BitacoraConstructor.load(json, editFile ? editFile.path : null);
        root.querySelector('.be-toolbar [data-panel="armar"]').click();
      } catch (e) { log("be-log2", "No pude leer los bloques: " + e.message, true); }
    });

    window.Bitacora = {
      cfg: cfg, gh: gh, root: root,
      groups: function () { return groups; },
      loadNav: loadNav,
      navYaml: function () { return navYaml; },
      clearNav: function () { navYaml = null; },
      processImage: processImage, slugify: slugify, today: today, yamlQuote: yamlQuote,
      escapeHtml: escapeHtml, renderMd: renderMd, pageUrl: pageUrl, navInsert: navInsert,
      relToImages: relToImages, fmtSize: fmtSize, utf8ToB64: utf8ToB64, b64ToUtf8: b64ToUtf8,
      openNewText: openNewText, reloadTree: loadTree,
      navInsertAt: navInsertAt, navItems: navItems, makeUbicacion: makeUbicacion,
      elegirMaterial: elegirMaterial,
      onNavLoaded: function (fn) { onNavLoaded.push(fn); }
    };
    onNavLoaded.push(function () { ubicEditar.fillSections(); ubicEditar.refresh(); });

    /* --- arranque --- */
    var t = storedToken();
    if (t) { $("be-token").value = t; connect(t); }
  }

  // Arranque. Con la carga instantánea del tema, la página cambia sin
  // recargar: se vuelve a intentar cada medio segundo y init() no hace
  // nada si el editor no está en la página o ya se inicializó.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  if (!window.__bitacoraEditorPoll) {
    window.__bitacoraEditorPoll = setInterval(init, 500);
  }
})();
