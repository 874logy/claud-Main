(function () {
  'use strict';

  // ---------- Speicher ----------
  const KEYS = {
    settings: 'meinwiki.settings',
    bookmarks: 'meinwiki.bookmarks',
    history: 'meinwiki.history',
    notes: 'meinwiki.notes',
  };

  const DEFAULTS = {
    lang: 'de',
    theme: 'light',
    font: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    width: 760,
    showToc: true,
    showImages: true,
    showInfobox: true,
    showReferences: true,
    showNavboxes: false,
  };

  const HISTORY_LIMIT = 50;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Speicher voll oder gesperrt – die App funktioniert trotzdem weiter.
    }
  }

  let settings = Object.assign({}, DEFAULTS, load(KEYS.settings, {}));
  let bookmarks = load(KEYS.bookmarks, []);
  let history = load(KEYS.history, []);
  let notes = load(KEYS.notes, {});

  // Aktuell angezeigter Artikel: { lang, title }
  let current = null;

  const $ = (id) => document.getElementById(id);

  // ---------- Wikipedia-API ----------
  // Der Sprachcode landet im Hostnamen, deshalb nur echte Sprachcodes zulassen.
  const LANG_PATTERN = /^[a-z][a-z-]{1,15}$/;

  function validLang(lang) {
    return LANG_PATTERN.test(lang) ? lang : DEFAULTS.lang;
  }

  async function api(lang, params) {
    const url = new URL('https://' + validLang(lang) + '.wikipedia.org/w/api.php');
    const all = Object.assign({ format: 'json', formatversion: '2', origin: '*' }, params);
    Object.keys(all).forEach((k) => url.searchParams.set(k, all[k]));
    const res = await fetch(url);
    if (!res.ok) throw new Error('Wikipedia antwortet mit Fehler ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.info || data.error.code);
    return data;
  }

  function searchArticles(lang, query) {
    return api(lang, { action: 'query', list: 'search', srsearch: query, srlimit: '20', srprop: 'snippet' })
      .then((d) => d.query.search);
  }

  function fetchArticle(lang, title) {
    return api(lang, {
      action: 'parse',
      page: title,
      prop: 'text|sections|langlinks',
      redirects: '1',
      disableeditsection: '1',
      disabletoc: '1',
    }).then((d) => d.parse);
  }

  function randomTitle(lang) {
    return api(lang, { action: 'query', list: 'random', rnnamespace: '0', rnlimit: '1' })
      .then((d) => d.query.random[0].title);
  }

  // ---------- Hilfsfunktionen ----------
  function articleHash(lang, title) {
    return '#/wiki/' + lang + '/' + encodeURIComponent(title);
  }

  function noteKey(lang, title) {
    return lang + ':' + title;
  }

  function wikipediaUrl(lang, title) {
    return 'https://' + validLang(lang) + '.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function stripTags(html) {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent;
  }

  // Entfernt alles Ausführbare aus fremdem HTML.
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) el.removeAttribute(attr.name);
      });
    });
    return doc.body;
  }

  function setStatus(text, isError) {
    const el = $('status');
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function showView(name) {
    ['home', 'search', 'article'].forEach((v) => { $('view-' + v).hidden = v !== name; });
    $('toc').hidden = name !== 'article' || !settings.showToc;
  }

  // ---------- Einstellungen anwenden ----------
  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.style.setProperty('--font-size', settings.fontSize + 'px');
    root.style.setProperty('--line-height', settings.lineHeight);
    root.style.setProperty('--width', settings.width + 'px');
    root.lang = settings.lang === 'simple' ? 'en' : settings.lang;

    const content = $('article-content');
    content.classList.toggle('hide-images', !settings.showImages);
    content.classList.toggle('hide-infobox', !settings.showInfobox);
    content.classList.toggle('hide-references', !settings.showReferences);
    content.classList.toggle('hide-navboxes', !settings.showNavboxes);
    $('toc').hidden = $('view-article').hidden || !settings.showToc;

    document.querySelectorAll('output[data-for]').forEach((out) => {
      const key = out.dataset.for;
      out.textContent = key === 'lineHeight' ? settings[key].toFixed(1) : settings[key] + ' px';
    });
  }

  function fillSettingsForm() {
    document.querySelectorAll('[data-setting]').forEach((input) => {
      const value = settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
    });
  }

  function onSettingChange(event) {
    const input = event.target;
    const key = input && input.dataset.setting;
    if (!key) return;
    if (input.type === 'checkbox') settings[key] = input.checked;
    else if (input.type === 'range') settings[key] = Number(input.value);
    else settings[key] = input.value;
    save(KEYS.settings, settings);
    applySettings();
  }

  // ---------- Leseliste & Verlauf ----------
  function isBookmarked(lang, title) {
    return bookmarks.some((b) => b.lang === lang && b.title === title);
  }

  function toggleBookmark() {
    if (!current) return;
    if (isBookmarked(current.lang, current.title)) {
      bookmarks = bookmarks.filter((b) => !(b.lang === current.lang && b.title === current.title));
    } else {
      bookmarks.unshift({ lang: current.lang, title: current.title, time: Date.now() });
    }
    save(KEYS.bookmarks, bookmarks);
    updateBookmarkButton();
  }

  function updateBookmarkButton() {
    const saved = current && isBookmarked(current.lang, current.title);
    $('btn-bookmark').textContent = saved ? '🔖 In der Leseliste' : '＋ Zur Leseliste';
  }

  function addToHistory(lang, title) {
    history = history.filter((h) => !(h.lang === lang && h.title === title));
    history.unshift({ lang: lang, title: title, time: Date.now() });
    history = history.slice(0, HISTORY_LIMIT);
    save(KEYS.history, history);
  }

  function renderItemList(listEl, items, onRemove) {
    listEl.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Noch keine Einträge.';
      listEl.appendChild(li);
      return;
    }
    items.forEach((item, index) => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      const link = document.createElement('a');
      link.href = articleHash(item.lang, item.title);
      link.textContent = item.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = item.lang.toUpperCase() + ' · ' + formatDate(item.time);
      left.append(link, meta);
      li.appendChild(left);
      if (onRemove) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '✕';
        remove.title = 'Entfernen';
        remove.addEventListener('click', () => onRemove(index));
        li.appendChild(remove);
      }
      listEl.appendChild(li);
    });
  }

  function renderHomeBookmarks() {
    renderItemList($('home-bookmarks'), bookmarks, (i) => {
      bookmarks.splice(i, 1);
      save(KEYS.bookmarks, bookmarks);
      renderHomeBookmarks();
    });
  }

  function openPanel(kind) {
    const isBookmarks = kind === 'bookmarks';
    $('panel-title').textContent = isBookmarks ? 'Leseliste' : 'Verlauf';
    const refresh = () => {
      const items = isBookmarks ? bookmarks : history;
      renderItemList($('panel-list'), items, (i) => {
        items.splice(i, 1);
        save(isBookmarks ? KEYS.bookmarks : KEYS.history, items);
        refresh();
        if (isBookmarks) updateBookmarkButton();
      });
    };
    $('panel-clear').onclick = () => {
      if (!confirm('Wirklich alle Einträge löschen?')) return;
      if (isBookmarks) { bookmarks = []; save(KEYS.bookmarks, bookmarks); updateBookmarkButton(); }
      else { history = []; save(KEYS.history, history); }
      refresh();
    };
    refresh();
    $('panel').showModal();
  }

  // ---------- Ansichten ----------
  function renderHome() {
    current = null;
    document.title = 'Mein Wiki';
    setStatus('');
    renderHomeBookmarks();
    showView('home');
  }

  async function renderSearch(lang, query) {
    current = null;
    document.title = query + ' – Suche – Mein Wiki';
    $('search-input').value = query;
    $('search-title').textContent = 'Suchergebnisse für „' + query + '“';
    $('search-results').innerHTML = '';
    showView('search');
    setStatus('Suche läuft …');
    try {
      const results = await searchArticles(lang, query);
      setStatus(results.length ? '' : 'Keine Treffer gefunden.');
      results.forEach((r) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = articleHash(lang, r.title);
        link.textContent = r.title;
        const snippet = document.createElement('p');
        snippet.append(...sanitize(r.snippet).childNodes);
        li.append(link, snippet);
        $('search-results').appendChild(li);
      });
    } catch (e) {
      setStatus('Suche fehlgeschlagen: ' + e.message, true);
    }
  }

  // Passt Links und Bilder im Artikel an, damit sie in der App funktionieren.
  function prepareContent(body, lang) {
    body.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href.startsWith('/wiki/')) {
        const [path, fragment] = href.slice(6).split('#');
        const title = decodeURIComponent(path).replace(/_/g, ' ');
        // Seiten mit Namensraum (Datei:, Kategorie: …) direkt bei Wikipedia öffnen.
        if (title.includes(':')) {
          a.href = 'https://' + lang + '.wikipedia.org' + href;
          a.target = '_blank';
          a.rel = 'noopener';
        } else {
          a.href = articleHash(lang, fragment ? title + '#' + decodeURIComponent(fragment) : title);
        }
      } else if (href.startsWith('//') || href.startsWith('/w/')) {
        a.href = (href.startsWith('//') ? 'https:' : 'https://' + lang + '.wikipedia.org') + href;
        a.target = '_blank';
        a.rel = 'noopener';
      } else if (/^https?:/.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });
    body.querySelectorAll('img').forEach((img) => {
      ['src', 'srcset'].forEach((attr) => {
        const value = img.getAttribute(attr);
        if (value) img.setAttribute(attr, value.replace(/(^|\s|,)\/\//g, '$1https://'));
      });
      img.loading = 'lazy';
    });
  }

  function renderToc(sections) {
    const list = $('toc-list');
    list.innerHTML = '';
    sections.forEach((s) => {
      const li = document.createElement('li');
      li.dataset.level = s.toclevel;
      const link = document.createElement('a');
      link.href = '#' + s.anchor;
      link.textContent = stripTags(s.line);
      li.appendChild(link);
      list.appendChild(li);
    });
  }

  function renderLangLinks(langlinks) {
    const select = $('article-langs');
    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = langlinks.length ? '🌐 Andere Sprache (' + langlinks.length + ')' : '🌐 Keine anderen Sprachen';
    select.appendChild(first);
    langlinks
      .slice()
      .sort((a, b) => (a.autonym || a.lang).localeCompare(b.autonym || b.lang))
      .forEach((l) => {
        const opt = document.createElement('option');
        opt.value = articleHash(l.lang, l.title);
        opt.textContent = (l.autonym || l.lang) + ' – ' + l.title;
        select.appendChild(opt);
      });
    select.disabled = !langlinks.length;
  }

  async function renderArticle(lang, title, anchor) {
    showView('article');
    $('article-title').textContent = title;
    $('article-content').innerHTML = '';
    $('toc-list').innerHTML = '';
    setStatus('Artikel wird geladen …');
    try {
      const page = await fetchArticle(lang, title);
      current = { lang: lang, title: page.title };
      document.title = page.title + ' – Mein Wiki';
      $('article-title').textContent = page.title;
      $('article-source').href = wikipediaUrl(lang, page.title);

      const body = sanitize(page.text);
      prepareContent(body, lang);
      $('article-content').append(...body.childNodes);
      renderToc(page.sections || []);
      renderLangLinks(page.langlinks || []);

      $('notes-text').value = notes[noteKey(lang, page.title)] || '';
      $('notes').open = !!$('notes-text').value;
      updateBookmarkButton();
      addToHistory(lang, page.title);
      setStatus('');

      if (anchor) scrollToAnchor(anchor);
      else window.scrollTo(0, 0);
    } catch (e) {
      current = null;
      setStatus('Artikel konnte nicht geladen werden: ' + e.message, true);
    }
  }

  function scrollToAnchor(anchor) {
    const target = document.getElementById(anchor);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Navigation (Hash-Routing) ----------
  // #/                      → Startseite
  // #/suche/<sprache>/<q>   → Suche
  // #/wiki/<sprache>/<titel>→ Artikel
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const view = parts[0];
    const lang = validLang(parts[1] || settings.lang);
    const rest = decodeURIComponent(parts.slice(2).join('/'));
    if (view === 'suche' && rest) return renderSearch(lang, rest);
    if (view === 'wiki' && rest) {
      const hashIndex = rest.indexOf('#');
      const title = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
      const anchor = hashIndex >= 0 ? rest.slice(hashIndex + 1) : '';
      return renderArticle(lang, title, anchor);
    }
    renderHome();
  }

  // ---------- Datenexport ----------
  function exportData() {
    const data = { settings: settings, bookmarks: bookmarks, history: history, notes: notes, exported: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mein-wiki-daten.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.settings) settings = Object.assign({}, DEFAULTS, data.settings);
        if (Array.isArray(data.bookmarks)) bookmarks = data.bookmarks;
        if (Array.isArray(data.history)) history = data.history;
        if (data.notes && typeof data.notes === 'object') notes = data.notes;
        save(KEYS.settings, settings);
        save(KEYS.bookmarks, bookmarks);
        save(KEYS.history, history);
        save(KEYS.notes, notes);
        fillSettingsForm();
        applySettings();
        route();
        alert('Daten wurden importiert.');
      } catch (e) {
        alert('Die Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Ereignisse ----------
  function bindEvents() {
    window.addEventListener('hashchange', route);

    $('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('search-input').value.trim();
      if (q) location.hash = '#/suche/' + settings.lang + '/' + encodeURIComponent(q);
    });

    $('btn-random').addEventListener('click', async () => {
      try {
        location.hash = articleHash(settings.lang, await randomTitle(settings.lang));
      } catch (e) {
        setStatus('Zufallsartikel fehlgeschlagen: ' + e.message, true);
      }
    });

    $('btn-bookmarks').addEventListener('click', () => openPanel('bookmarks'));
    $('btn-history').addEventListener('click', () => openPanel('history'));
    $('panel-close').addEventListener('click', () => $('panel').close());
    $('panel-list').addEventListener('click', (e) => { if (e.target.closest('a')) $('panel').close(); });

    $('btn-settings').addEventListener('click', () => { fillSettingsForm(); $('settings').showModal(); });
    $('settings-close').addEventListener('click', () => $('settings').close());
    $('settings-form').addEventListener('input', onSettingChange);
    $('settings-form').addEventListener('change', onSettingChange);
    $('btn-reset').addEventListener('click', () => {
      settings = Object.assign({}, DEFAULTS);
      save(KEYS.settings, settings);
      fillSettingsForm();
      applySettings();
    });
    $('btn-export').addEventListener('click', exportData);
    $('import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });

    $('btn-bookmark').addEventListener('click', toggleBookmark);
    $('article-langs').addEventListener('change', (e) => { if (e.target.value) location.hash = e.target.value; });

    let noteTimer = null;
    $('notes-text').addEventListener('input', (e) => {
      if (!current) return;
      const key = noteKey(current.lang, current.title);
      const text = e.target.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        if (text.trim()) notes[key] = text;
        else delete notes[key];
        save(KEYS.notes, notes);
      }, 300);
    });

    // Sprungmarken innerhalb eines Artikels (z. B. „#Geschichte“) dürfen das Routing nicht stören.
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (href.startsWith('#/')) return;
      e.preventDefault();
      scrollToAnchor(decodeURIComponent(href.slice(1)));
    });
  }

  applySettings();
  bindEvents();
  route();
})();
