/* ===================== STATE ===================== */
function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

let storedUser = null;
try {
  storedUser = JSON.parse(localStorage.getItem("librarims_user") || "null");
} catch {
  localStorage.removeItem("librarims_user");
}

// Where the API lives:
//  - Local development: the Express server on :5000 (unless the page itself is
//    served by Express on :5000 or by `netlify dev` on :8888 - then same origin).
//  - Everywhere else (Netlify): same origin. The site serves the frontend and the
//    /api/* backend together, so there is nothing to configure.
function defaultApiBase() {
  if (window.LIBRARYMS_IS_LOCAL && !["5000", "8888"].includes(window.location.port)) {
    return "http://localhost:5000";
  }
  return window.LIBRARYMS_API_BASE || "";
}
// Forget any old "Server" URL that an earlier version saved in this browser.
try {
  localStorage.removeItem("librarims_api");
  localStorage.removeItem("libraryms_api_override");
} catch {}

const state = {
  apiBase: normalizeApiBase(defaultApiBase()),
  token: localStorage.getItem("librarims_token") || null,
  user: storedUser,
  currentView: "home",
  browsePage: 1,
  browseQuery: "",
  browseCategory: "",
  browseBranch: "",
  categories: [],
  homeCatalogPage: 1,
  homeCatalogLoading: false,
  homeCatalogDone: false,
  adminBooksPage: 1,
  adminBooksQuery: "",
  adminBooksCategory: "",
  editingBookId: null,
};

function api(path) {
  return `${state.apiBase}/api${path}`;
}

async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(api(path), { ...opts, headers });
  } catch (networkErr) {
    throw new Error("Can't reach the server right now. Check your internet and try again in a moment.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) {
    logout();
    throw new Error(data.error || "Your session has expired. Please log in again.");
  }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status}). Please try again.`);
  return data;
}

/* ===================== TOAST ===================== */
let toastTimer;
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

/* ===================== NAVIGATION ===================== */
function navigate(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  document.getElementById(`view-${view}`).hidden = false;

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === view);
  });

  if (view === "browse") loadBrowse();
  if (view === "loans") loadLoans();
  if (view === "admin") loadAdminReports();
  if (view === "rooms") loadRoomsView();

  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => navigate(el.dataset.nav));
});

/* ===================== LANGUAGE ===================== */
applyTranslations();
window.onLanguageChange = () => {
  if (state.currentView === "home") loadHome();
};

/* ===================== BOOK COVER (real image when available, colored initials fallback) ===================== */
const coverPalette = ["#7A3B2E","#2E5339","#1D4ED8","#6D28D9","#B0472F","#0F766E","#854F0B","#993556"];
function coverColorFor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return coverPalette[Math.abs(hash) % coverPalette.length];
}
function bookCoverHtml(book, heightPx) {
  const color = coverColorFor(book.category || book.title);
  const words = book.title.split(" ").slice(0, 4).join(" ");
  const sizeStyle = heightPx ? `height:${heightPx}px;aspect-ratio:auto;` : "";
  if (book.coverImage) {
    return `<div class="book-cover book-cover-img" data-cover-id="${book._id}" style="${sizeStyle}background-image:url('${book.coverImage}');"></div>`;
  }
  return `<div class="book-cover" data-cover-id="${book._id}" data-cover-title="${escapeHtml(words)}" style="--cover-color:${color};${sizeStyle}">${escapeHtml(words)}</div>`;
}

// After a page of book cards renders, fetch real covers in one batch call
// and swap in any that Open Library actually has — no layout shift, just a
// fade from the colored placeholder to the real cover when one is found.
async function upgradeCoversForVisibleBooks(books) {
  const ids = books.map((b) => b._id).filter(Boolean);
  if (!ids.length) return;
  try {
    const covers = await apiFetch("/books/covers/batch", { method: "POST", body: JSON.stringify({ ids }) });
    Object.entries(covers).forEach(([id, url]) => {
      if (!url) return;
      document.querySelectorAll(`[data-cover-id="${id}"]`).forEach((el) => {
        el.style.backgroundImage = `url('${url}')`;
        el.classList.add("book-cover-img");
        el.textContent = "";
      });
    });
  } catch (e) {
    /* covers are a nice-to-have — silently keep the colored placeholders */
  }
}

/* ===================== AUTH ===================== */
const authModal = document.getElementById("authModalOverlay");

function openAuthModal() {
  authModal.classList.add("open");
}
function closeAuthModal() {
  authModal.classList.remove("open");
}

document.querySelectorAll("[data-authtab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-authtab]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const which = tab.dataset.authtab;
    document.getElementById("loginForm").hidden = which !== "login";
    document.getElementById("studentRegisterForm").hidden = which !== "registerStudent";
    document.getElementById("librarianRegisterForm").hidden = which !== "registerLibrarian";
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const statusEl = document.getElementById("loginStatus");
  statusEl.textContent = "Logging in…";
  statusEl.className = "modal-status";
  try {
    const data = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password }) });
    if (data.twoFactorRequired) {
      const code = window.prompt(data.message || "Enter your 6-digit authenticator code.");
      if (!code) throw new Error("Authenticator code is required.");
      const verified = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password, twoFactorToken: code.trim() }),
      });
      setSession(verified.token, verified.user);
      statusEl.textContent = "";
      closeAuthModal();
      showToast(`Welcome back, ${verified.user.name.split(" ")[0]}`, "success");
      renderAuthArea();
      return;
    }
    setSession(data.token, data.user);
    statusEl.textContent = "";
    closeAuthModal();
    showToast(`Welcome back, ${data.user.name.split(" ")[0]}`, "success");
    renderAuthArea();
    if (state.currentView === "loans") loadLoans();
    if (state.currentView === "admin") loadAdminReports();
  } catch (err) {
    statusEl.textContent = err.message === "Invalid email or password"
      ? "Invalid email or password. Register first if you are a new user; password is case-sensitive."
      : err.message;
    statusEl.className = "modal-status error";
  }
});

// Student registration — always sends role: "student". This form has no
// librarian code field at all, so there's nothing for a student to fill in
// that could accidentally (or deliberately) get them librarian access; the
// backend independently re-checks role === "student" regardless either way.
document.getElementById("studentRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("stuRegName").value.trim();
  const email = document.getElementById("stuRegEmail").value.trim();
  const password = document.getElementById("stuRegPassword").value;
  const studentId = document.getElementById("stuRegStudentId").value.trim();
  const statusEl = document.getElementById("studentRegisterStatus");
  statusEl.textContent = "Creating account…";
  statusEl.className = "modal-status";
  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, studentId, role: "student" }),
    });
    statusEl.textContent = "";
    closeAuthModal();
    showToast(data.message || "Account created successfully. You can log in now.", "success");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

// Librarian registration — a completely separate form/flow.
document.getElementById("librarianRegisterForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("libRegName").value.trim();
  const email = document.getElementById("libRegEmail").value.trim();
  const password = document.getElementById("libRegPassword").value;
  const statusEl = document.getElementById("librarianRegisterStatus");
  statusEl.textContent = "Creating account…";
  statusEl.className = "modal-status";
  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role: "librarian" }),
    });
    statusEl.textContent = "";
    closeAuthModal();
    showToast(data.message || "Account created successfully. You can log in now.", "success");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("librarims_token", token);
  localStorage.setItem("librarims_user", JSON.stringify(user));
  renderAuthArea();
  renderVerifyBanner();
  refreshNotifBell();
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("librarims_token");
  localStorage.removeItem("librarims_user");
  const banner = document.getElementById("verifyBanner");
  if (banner) banner.remove();
  renderAuthArea();
  navigate("home");
  showToast("Logged out");
  document.getElementById("notifBellBtn").hidden = true;
  document.getElementById("notifPanel").hidden = true;
}

function renderAuthArea() {
  const el = document.getElementById("authArea");
  const isAdmin = state.user && ["librarian", "admin"].includes(state.user.role);
  document.getElementById("adminNavBtn").hidden = !isAdmin;
  document.getElementById("adminBottomBtn").hidden = !isAdmin;

  if (state.user) {
    el.innerHTML = `
      <div class="profile-menu-wrap">
        <button class="auth-pill logged-in" id="profileMenuBtn" aria-expanded="false">📚 ${escapeHtml(state.user.name.split(" ")[0])} <span class="profile-caret">⌄</span></button>
        <div class="profile-menu" id="profileMenu" hidden>
          <div class="profile-menu-head"><strong>${escapeHtml(state.user.name)}</strong><span>${escapeHtml(state.user.role)}</span></div>
          <button id="profileSettingsBtn">⚙ Account settings</button>
          <button id="logoutBtn">↪ Log out</button>
        </div>
      </div>`;
    document.getElementById("profileMenuBtn").addEventListener("click", () => {
      const menu = document.getElementById("profileMenu");
      menu.hidden = !menu.hidden;
      document.getElementById("profileMenuBtn").setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("profileSettingsBtn").addEventListener("click", openSettingsModal);
    document.getElementById("accountLabel").textContent = state.user.name.split(" ")[0];
    renderVerifyBanner();
  } else {
    el.innerHTML = `<button class="auth-pill" id="loginBtn">Log in</button>`;
    document.getElementById("loginBtn").addEventListener("click", openAuthModal);
    document.getElementById("accountLabel").textContent = "Account";
  }
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".profile-menu-wrap")) {
    const menu = document.getElementById("profileMenu");
    if (menu) menu.hidden = true;
  }
});

document.getElementById("accountBottomBtn").addEventListener("click", () => {
  if (state.user) navigate("loans");
  else openAuthModal();
});
document.getElementById("loansLoginBtn").addEventListener("click", openAuthModal);

/* ===================== HOME VIEW ===================== */
async function loadHome() {
  try {
    const data = await apiFetch("/books/search?limit=1");
    document.getElementById("statsStrip").innerHTML = `
      <div class="stat-box"><div class="num">${data.total.toLocaleString()}</div><div class="lbl">${t("stat_titles")}</div></div>
      <div class="stat-box"><div class="num">${state.categories.length || 30}</div><div class="lbl">${t("stat_departments")}</div></div>
      <div class="stat-box"><div class="num">24/7</div><div class="lbl">${t("stat_access")}</div></div>
      <div class="stat-box"><div class="num">&lt;2s</div><div class="lbl">${t("stat_searchtime")}</div></div>
    `;
  } catch (e) {
    document.getElementById("statsStrip").innerHTML = `<div class="stat-box"><div class="num">—</div><div class="lbl">Server not reachable — please refresh in a moment</div></div>`;
  }

  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = state.categories
    .map((c) => `<button class="cat-chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
    .join("");
  grid.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.browseCategory = chip.dataset.cat;
      state.browseQuery = "";
      navigate("browse");
    });
  });

  loadAnnouncements();
  loadNewArrivals();
  loadTrending();

  state.homeCatalogPage = 1;
  state.homeCatalogDone = false;
  document.getElementById("homeCatalogGrid").innerHTML = "";
  document.getElementById("homeCatalogEnd").hidden = true;
  loadHomeCatalog();
}

/* ===================== HOME "ALL BOOKS" CATALOG (paginated, ~50k books) =====================
   The home page previously only showed New Arrivals / Trending shelves and stats — no way to
   actually see the catalog without going to Browse. This renders a real, paginated grid of the
   full catalog right on the home page. It never loads everything at once: each "Load more" click
   (or scroll-to-bottom) fetches one more page of 24 from the existing /books/search endpoint,
   which is already indexed and paginated server-side. */
async function loadHomeCatalog() {
  if (state.homeCatalogLoading || state.homeCatalogDone) return;
  state.homeCatalogLoading = true;

  const btn = document.getElementById("homeLoadMoreBtn");
  const grid = document.getElementById("homeCatalogGrid");
  const meta = document.getElementById("homeCatalogMeta");
  if (btn) { btn.hidden = false; btn.disabled = true; btn.textContent = "Loading…"; }
  if (state.homeCatalogPage === 1 && !grid.children.length) {
    grid.innerHTML = Array.from({ length: 8 }, () => `<div class="skeleton-card" aria-hidden="true"><div class="skeleton-cover"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line tiny"></div></div>`).join("");
  }

  try {
    const data = await apiFetch(`/books/search?page=${state.homeCatalogPage}&limit=24`);
    if (state.homeCatalogPage === 1) grid.innerHTML = "";
    meta.textContent = `${data.total.toLocaleString()} books across ${state.categories.length || 30} departments`;

    data.books.forEach((book) => {
      const isAvail = book.availableCopies > 0;
      const card = document.createElement("button");
      card.className = "book-card";
      card.innerHTML = `
        ${bookCoverHtml(book, 90)}
        <span class="cat-tag">${escapeHtml(book.category)}</span>
        <h3>${escapeHtml(book.title)}</h3>
        <div class="author">by ${escapeHtml(book.author)}</div>
        <div class="meta-row">
          <span class="mono">${escapeHtml(book.shelfLocation || "—")}</span>
          <span class="avail ${isAvail ? "yes" : "no"}">${isAvail ? book.availableCopies + " available" : "checked out"}</span>
        </div>
      `;
      card.addEventListener("click", () => openBookModal(book));
      grid.appendChild(card);
    });
    upgradeCoversForVisibleBooks(data.books);

    const totalPages = Math.ceil(data.total / data.limit) || 1;
    if (state.homeCatalogPage >= totalPages) {
      state.homeCatalogDone = true;
      if (btn) btn.hidden = true;
      document.getElementById("homeCatalogEnd").hidden = false;
    } else {
      state.homeCatalogPage += 1;
      if (btn) { btn.hidden = false; btn.disabled = false; btn.textContent = "Load more books"; }
    }
  } catch (e) {
    if (state.homeCatalogPage === 1) grid.innerHTML = "";
    meta.textContent = "Couldn't load the catalog. Check the server connection (top right).";
    if (btn) btn.hidden = true;
  } finally {
    state.homeCatalogLoading = false;
  }
}

document.getElementById("homeLoadMoreBtn").addEventListener("click", loadHomeCatalog);

// Infinite scroll: also auto-load the next page once the button scrolls into view,
// so most people never have to click it on a long home page.
const homeLoadMoreObserver = new IntersectionObserver(
  (entries) => { if (entries[0].isIntersecting && state.currentView === "home") loadHomeCatalog(); },
  { rootMargin: "400px" }
);
homeLoadMoreObserver.observe(document.getElementById("homeLoadMoreBtn"));

document.getElementById("homeSearchBtn").addEventListener("click", () => {
  state.browseQuery = document.getElementById("homeSearchInput").value.trim();
  state.browseCategory = "";
  navigate("browse");
});
document.getElementById("homeSearchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("homeSearchBtn").click();
});

/* ===================== CATEGORIES ===================== */
async function loadCategories() {
  try {
    const cats = await apiFetch("/books/categories");
    state.categories = cats;
    const selects = [document.getElementById("browseCategorySelect"), document.getElementById("abCategory"), document.getElementById("adminBookCategorySelect")];
    selects.forEach((sel) => {
      if (!sel) return;
      const keepFirst = sel.id === "browseCategorySelect" || sel.id === "adminBookCategorySelect";
      sel.innerHTML = (keepFirst ? '<option value="">All departments</option>' : "") +
        cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    });
  } catch (e) {
    /* server offline — leave empty, home view will show the offline hint */
  }
}

async function loadBranches() {
  try {
    const branches = await apiFetch("/books/branches");
    const sel = document.getElementById("browseBranchSelect");
    if (sel) sel.innerHTML = '<option value="">All branches</option>' + branches.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  } catch (e) {
    /* ignore */
  }
}

/* ===================== BROWSE / SEARCH ===================== */
document.getElementById("browseSearchBtn").addEventListener("click", () => {
  state.browseQuery = document.getElementById("browseSearchInput").value.trim();
  state.browseCategory = document.getElementById("browseCategorySelect").value;
  state.browsePage = 1;
  loadBrowse();
});
document.getElementById("browseSearchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("browseSearchBtn").click();
});
document.getElementById("browseCategorySelect").addEventListener("change", () => {
  state.browseCategory = document.getElementById("browseCategorySelect").value;
  state.browsePage = 1;
  loadBrowse();
});
document.getElementById("browseBranchSelect").addEventListener("change", () => {
  state.browseBranch = document.getElementById("browseBranchSelect").value;
  state.browsePage = 1;
  loadBrowse();
});

async function loadBrowse() {
  document.getElementById("browseSearchInput").value = state.browseQuery;
  document.getElementById("browseCategorySelect").value = state.browseCategory;
  document.getElementById("browseBranchSelect").value = state.browseBranch;

  const params = new URLSearchParams({ page: state.browsePage, limit: 20 });
  if (state.browseQuery) params.set("q", state.browseQuery);
  if (state.browseCategory) params.set("category", state.browseCategory);
  if (state.browseBranch) params.set("branch", state.browseBranch);

  const grid = document.getElementById("results");
  grid.innerHTML = `<p class="hint">Loading…</p>`;

  try {
    const data = await apiFetch(`/books/search?${params}`);
    renderResults(data);
  } catch (e) {
    grid.innerHTML = `<p class="hint">Couldn't load books. Check the server connection (top right).</p>`;
  }
}

function renderResults(data) {
  document.getElementById("resultsMeta").textContent = `${data.total.toLocaleString()} result${data.total === 1 ? "" : "s"} — page ${data.page}`;
  const grid = document.getElementById("results");
  grid.innerHTML = "";

  data.books.forEach((book) => {
    const isAvail = book.availableCopies > 0;
    const card = document.createElement("button");
    card.className = "book-card";
    card.innerHTML = `
      ${bookCoverHtml(book, 90)}
      <span class="cat-tag">${escapeHtml(book.category)}</span>
      <h3>${escapeHtml(book.title)}</h3>
      <div class="author">by ${escapeHtml(book.author)}</div>
      <div class="meta-row">
        <span class="mono">${escapeHtml(book.shelfLocation || "—")}</span>
        <span class="avail ${isAvail ? "yes" : "no"}">${isAvail ? book.availableCopies + " available" : "checked out"}</span>
      </div>
    `;
    card.addEventListener("click", () => openBookModal(book));
    grid.appendChild(card);
  });

  const totalPages = Math.ceil(data.total / data.limit) || 1;
  const pager = document.getElementById("pager");
  pager.innerHTML = "";
  if (totalPages > 1) {
    const prev = document.createElement("button");
    prev.textContent = "← Prev";
    prev.disabled = data.page <= 1;
    prev.addEventListener("click", () => { state.browsePage = data.page - 1; loadBrowse(); });
    const next = document.createElement("button");
    next.textContent = "Next →";
    next.disabled = data.page >= totalPages;
    next.addEventListener("click", () => { state.browsePage = data.page + 1; loadBrowse(); });
    pager.append(prev, next);
  }

  upgradeCoversForVisibleBooks(data.books);
}

/* ===================== BOOK DETAIL MODAL ===================== */
const bookModal = document.getElementById("bookModalOverlay");
function openBookModal(book) {
  const isAvail = book.availableCopies > 0;
  document.getElementById("bookModalContent").innerHTML = `
    ${bookCoverHtml(book, 140)}
    <span class="bm-cat">${escapeHtml(book.category)}</span>
    <h2>${escapeHtml(book.title)}</h2>
    <div class="bm-author">by ${escapeHtml(book.author)}</div>
    <dl class="bm-grid">
      <dt>ISBN</dt><dd class="mono">${escapeHtml(book.isbn)}</dd>
      <dt>Publisher</dt><dd>${escapeHtml(book.publisher || "—")}</dd>
      <dt>Year</dt><dd>${book.publishedYear || "—"}</dd>
      <dt>Edition</dt><dd>${escapeHtml(book.edition || "—")}</dd>
      <dt>Shelf</dt><dd class="mono">${escapeHtml(book.shelfLocation || "—")}</dd>
      <dt>Rating</dt><dd>${book.rating ? "★ " + book.rating : "Not yet rated"}</dd>
      <dt>Availability</dt><dd class="${isAvail ? "avail yes" : "avail no"}">${isAvail ? book.availableCopies + " of " + book.totalCopies + " available" : "All copies checked out"}</dd>
    </dl>
    ${book.description ? `<p class="bm-desc">${escapeHtml(book.description)}</p>` : ""}
    <div class="modal-actions" style="justify-content:flex-start;">
      ${isAvail
        ? `<button class="btn-primary" id="borrowBtn">Borrow this book</button>`
        : `<button class="btn-primary" id="reserveBtn">Reserve this book</button>`}
      <button class="btn-ghost" id="closeBookModalBtn">Close</button>
    </div>
    <p class="modal-status" id="borrowStatus"></p>
    <div id="bookQrArea"></div>
    ${
      state.user && ["librarian", "admin"].includes(state.user.role)
        ? `<div class="cover-upload-box">
             <label class="field-label" for="coverUploadInput">Replace cover image (librarian only)</label>
             <input type="file" id="coverUploadInput" accept="image/png,image/jpeg,image/webp" />
             <p class="modal-status" id="coverUploadStatus"></p>
           </div>`
        : ""
    }
    <h3 class="sub-title" style="margin-top:24px;">You might also like</h3>
    <div class="card-grid" id="similarBooksGrid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));"></div>
  `;
  bookModal.classList.add("open");
  document.getElementById("closeBookModalBtn").addEventListener("click", () => bookModal.classList.remove("open"));

  loadSimilarBooks(book._id);
  loadBookQr(book._id);
  upgradeCoversForVisibleBooks([book]);

  const coverInput = document.getElementById("coverUploadInput");
  if (coverInput) {
    coverInput.addEventListener("change", async () => {
      const file = coverInput.files[0];
      if (!file) return;
      const statusEl = document.getElementById("coverUploadStatus");
      statusEl.textContent = "Uploading…";
      statusEl.className = "modal-status";
      try {
        const dataUrl = await fileToDataUrl(file);
        await apiFetch(`/books/${book._id}/cover`, { method: "PUT", body: JSON.stringify({ imageDataUrl: dataUrl }) });
        statusEl.textContent = "Cover updated.";
        statusEl.className = "modal-status success";
        book.coverImage = dataUrl;
        document.querySelectorAll(`[data-cover-id="${book._id}"]`).forEach((el) => {
          el.style.backgroundImage = `url('${dataUrl}')`;
          el.classList.add("book-cover-img");
          el.textContent = "";
        });
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "modal-status error";
      }
    });
  }

  const borrowBtn = document.getElementById("borrowBtn");
  if (borrowBtn) {
    borrowBtn.addEventListener("click", async () => {
      if (!state.user) { bookModal.classList.remove("open"); openAuthModal(); return; }
      const statusEl = document.getElementById("borrowStatus");
      statusEl.textContent = "Borrowing…";
      statusEl.className = "modal-status";
      try {
        await apiFetch("/transactions/borrow", { method: "POST", body: JSON.stringify({ bookId: book._id }) });
        statusEl.textContent = "Borrowed! Due in 14 days. Check My Loans.";
        statusEl.className = "modal-status success";
        showToast("Book borrowed successfully", "success");
        setTimeout(() => bookModal.classList.remove("open"), 1200);
        loadBrowse();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "modal-status error";
      }
    });
  }

  const reserveBtn = document.getElementById("reserveBtn");
  if (reserveBtn) {
    reserveBtn.addEventListener("click", async () => {
      if (!state.user) { bookModal.classList.remove("open"); openAuthModal(); return; }
      const statusEl = document.getElementById("borrowStatus");
      statusEl.textContent = "Reserving…";
      statusEl.className = "modal-status";
      try {
        await apiFetch("/transactions/reserve", { method: "POST", body: JSON.stringify({ bookId: book._id }) });
        statusEl.textContent = "Reserved — you'll be first in line when it's returned.";
        statusEl.className = "modal-status success";
        showToast("Book reserved", "success");
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "modal-status error";
      }
    });
  }
}

async function loadSimilarBooks(bookId) {
  const grid = document.getElementById("similarBooksGrid");
  try {
    const similar = await apiFetch(`/books/${bookId}/similar`);
    if (!similar.length) { grid.innerHTML = `<p class="hint">No similar titles found.</p>`; return; }
    grid.innerHTML = similar
      .map(
        (b) => `<button class="book-card" data-similar="${b._id}" style="padding:10px;">
          ${bookCoverHtml(b, 70)}
          <h3 style="font-size:13px;margin:4px 0 2px;">${escapeHtml(b.title)}</h3>
          <div class="author" style="font-size:11px;margin-bottom:0;">${escapeHtml(b.author)}</div>
        </button>`
      )
      .join("");
    grid.querySelectorAll("[data-similar]").forEach((el, i) => {
      el.addEventListener("click", () => openBookModal(similar[i]));
    });
    upgradeCoversForVisibleBooks(similar);
  } catch (e) {
    grid.innerHTML = "";
  }
}
document.getElementById("bookModalOverlay").addEventListener("click", (e) => {
  if (e.target === bookModal) bookModal.classList.remove("open");
});
[authModal, document.getElementById("memberModalOverlay")].forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); });
});

/* ===================== MY LOANS ===================== */
async function loadLoans() {
  const loggedOut = document.getElementById("loansLoggedOut");
  const content = document.getElementById("loansContent");
  if (!state.user) {
    loggedOut.hidden = false;
    content.hidden = true;
    return;
  }
  loggedOut.hidden = true;
  content.hidden = false;

  try {
    const history = await apiFetch("/transactions/my-history");
    const fineBanner = document.getElementById("fineBanner");
    const totalFine = history.reduce((sum, t) => sum + (t.fineAmount && !t.finePaid ? t.fineAmount : 0), 0);
    if (totalFine > 0) {
      fineBanner.hidden = false;
      fineBanner.innerHTML = `You have an outstanding fine of ৳${totalFine}. <button class="btn-ghost" id="payFineBtn" style="margin-left:8px;">Pay now</button>`;
      document.getElementById("payFineBtn").addEventListener("click", () => openPaymentModal(totalFine));
    } else {
      fineBanner.hidden = true;
    }

    const list = document.getElementById("loansList");
    if (history.length === 0) {
      list.innerHTML = `<p class="hint">No borrow history yet. Go find a book in Browse!</p>`;
    } else {
    list.innerHTML = history
      .map((tx) => {
        const due = new Date(tx.dueDate);
        const isOverdue = tx.status === "borrowed" && due < new Date();
        const badgeClass = tx.status === "returned" ? "returned" : tx.status === "reserved" ? "borrowed" : tx.status === "lost" ? "overdue" : isOverdue ? "overdue" : "borrowed";
        const badgeText = tx.status === "returned" ? "Returned" : tx.status === "reserved" ? "Reserved" : tx.status === "lost" ? "Lost" : isOverdue ? "Overdue" : "Borrowed";
        const canRenew = tx.status === "borrowed" && !isOverdue && (tx.renewCount || 0) < 1;
        const subLine = tx.status === "reserved"
          ? `Reserved ${new Date(tx.reservedAt || tx.createdAt).toLocaleDateString()}${tx.queuePosition ? ` · #${tx.queuePosition} in line` : ""}`
          : `Due ${due.toLocaleDateString()} ${tx.fineAmount ? `· Fine ৳${tx.fineAmount}${tx.finePaid ? " (paid)" : ""}` : ""}`;
        return `
        <div class="loan-row">
          <div>
            <div class="lr-title">${escapeHtml(tx.book?.title || "Unknown title")}</div>
            <div class="lr-sub">${subLine}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="loan-badge ${badgeClass}">${badgeText}</span>
            ${tx.status === "borrowed" ? `<button class="btn-ghost" data-return="${tx._id}">Return</button>` : ""}
            ${canRenew ? `<button class="btn-ghost" data-renew="${tx._id}">Renew</button>` : ""}
            ${tx.status === "borrowed" ? `<button class="btn-ghost" data-report-lost="${tx._id}" style="color:var(--danger);">Report lost</button>` : ""}
            ${tx.status === "reserved" ? `<button class="btn-ghost" data-cancel-reserve="${tx._id}">Cancel</button>` : ""}
          </div>
        </div>`;
      })
      .join("");

    list.querySelectorAll("[data-renew]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const data = await apiFetch(`/transactions/${btn.dataset.renew}/renew`, { method: "POST" });
          showToast(data.message, "success");
          loadLoans();
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
        }
      });
    });

    list.querySelectorAll("[data-report-lost]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Report this book as lost? A replacement fee will be added to your account.")) return;
        btn.disabled = true;
        try {
          const data = await apiFetch(`/transactions/${btn.dataset.reportLost}/report-lost`, { method: "POST" });
          showToast(data.message, "success");
          loadLoans();
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
        }
      });
    });

    list.querySelectorAll("[data-cancel-reserve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await apiFetch(`/transactions/reserve/${btn.dataset.cancelReserve}/cancel`, { method: "POST" });
          showToast("Reservation cancelled", "success");
          loadLoans();
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
        }
      });
    });
    }

    list.querySelectorAll("[data-return]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Returning…";
        try {
          await apiFetch("/transactions/return", {
            method: "POST",
            body: JSON.stringify({ transactionId: btn.dataset.return }),
          });
          showToast("Book returned", "success");
          loadLoans();
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
          btn.textContent = "Return";
        }
      });
    });
  } catch (e) {
    document.getElementById("loansList").innerHTML = `<p class="hint">Couldn't load your loans. ${escapeHtml(e.message)}</p>`;
  }

  loadMySuggestions();
}

/* ===================== SUGGEST A BOOK ===================== */
document.getElementById("suggestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("suggestStatus");
  statusEl.textContent = "Sending…";
  statusEl.className = "modal-status";
  try {
    await apiFetch("/suggestions", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("sugTitle").value.trim(),
        author: document.getElementById("sugAuthor").value.trim(),
        reason: document.getElementById("sugReason").value.trim(),
      }),
    });
    statusEl.textContent = "Suggestion sent — thanks!";
    statusEl.className = "modal-status success";
    document.getElementById("suggestForm").reset();
    loadMySuggestions();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

async function loadMySuggestions() {
  const el = document.getElementById("mySuggestionsList");
  if (!el || !state.user) return;
  try {
    const suggestions = await apiFetch("/suggestions/mine");
    if (!suggestions.length) { el.innerHTML = ""; return; }
    el.innerHTML = `<h4 style="font-size:13px;color:var(--ink-soft);margin-bottom:8px;">Your suggestions</h4>` + suggestions
      .map((s) => `<div class="loan-row"><div><div class="lr-title">${escapeHtml(s.title)}</div><div class="lr-sub">${escapeHtml(s.author || "")}</div></div><span class="loan-badge ${s.status === "approved" ? "returned" : s.status === "rejected" ? "overdue" : "borrowed"}">${s.status}</span></div>`)
      .join("");
  } catch (e) {
    el.innerHTML = "";
  }
}

/* ===================== ROOMS ===================== */
let roomsList = [];
async function loadRoomsView() {
  const loggedOut = document.getElementById("roomsLoggedOut");
  const content = document.getElementById("roomsContent");
  if (!state.user) {
    loggedOut.hidden = false;
    content.hidden = true;
    return;
  }
  loggedOut.hidden = true;
  content.hidden = false;

  const dateInput = document.getElementById("roomDateInput");
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  dateInput.min = new Date().toISOString().slice(0, 10);

  try {
    roomsList = await apiFetch("/rooms");
    const sel = document.getElementById("roomSelect");
    sel.innerHTML = roomsList.map((r) => `<option value="${r._id}">${escapeHtml(r.name)} · seats ${r.capacity}</option>`).join("");
    if (roomsList.length) loadRoomSlots();
    else document.getElementById("roomSlots").innerHTML = `<p class="hint">No rooms have been added yet.</p>`;
  } catch (e) {
    document.getElementById("roomSlots").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
  loadMyRoomBookings();
}
document.getElementById("roomSelect").addEventListener("change", loadRoomSlots);
document.getElementById("roomDateInput").addEventListener("change", loadRoomSlots);

async function loadRoomSlots() {
  const roomId = document.getElementById("roomSelect").value;
  const date = document.getElementById("roomDateInput").value;
  const grid = document.getElementById("roomSlots");
  if (!roomId || !date) return;
  grid.innerHTML = `<p class="hint">Loading…</p>`;
  try {
    const data = await apiFetch(`/rooms/${roomId}/availability?date=${date}`);
    grid.innerHTML = data.slots
      .map((s) => `<button class="slot-btn ${s.available ? "available" : "booked"}" ${s.available ? `data-book-hour="${s.hour}"` : "disabled"}>${String(s.hour).padStart(2, "0")}:00</button>`)
      .join("");
    grid.querySelectorAll("[data-book-hour]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiFetch(`/rooms/${roomId}/book`, {
            method: "POST",
            body: JSON.stringify({ date, startHour: Number(btn.dataset.bookHour), durationHours: 1 }),
          });
          showToast("Room booked!", "success");
          loadRoomSlots();
          loadMyRoomBookings();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (e) {
    grid.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

async function loadMyRoomBookings() {
  const el = document.getElementById("myRoomBookings");
  try {
    const bookings = await apiFetch("/rooms/bookings/mine");
    if (!bookings.length) { el.innerHTML = `<p class="hint">No upcoming bookings.</p>`; return; }
    el.innerHTML = bookings
      .map(
        (b) => `<div class="room-booking-row">
          <span>${escapeHtml(b.room?.name || "Room")} · ${b.date} · ${String(b.startHour).padStart(2, "0")}:00–${String(b.startHour + b.durationHours).padStart(2, "0")}:00</span>
          <button class="btn-ghost" data-cancel-room="${b._id}">Cancel</button>
        </div>`
      )
      .join("");
    el.querySelectorAll("[data-cancel-room]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiFetch(`/rooms/bookings/${btn.dataset.cancelRoom}/cancel`, { method: "POST" });
          showToast("Booking cancelled", "success");
          loadRoomsView();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}
document.getElementById("roomsLoginBtn").addEventListener("click", openAuthModal);

/* ===================== NOTIFICATIONS ===================== */
const notifPanel = document.getElementById("notifPanel");
async function refreshNotifBell() {
  const bellBtn = document.getElementById("notifBellBtn");
  if (!state.user) { bellBtn.hidden = true; notifPanel.hidden = true; return; }
  bellBtn.hidden = false;
  try {
    const data = await apiFetch("/notifications");
    const badge = document.getElementById("notifBadge");
    if (data.unreadCount > 0) {
      badge.hidden = false;
      badge.textContent = data.unreadCount > 9 ? "9+" : data.unreadCount;
    } else {
      badge.hidden = true;
    }
    renderNotifList(data.notifications);
  } catch (e) {
    /* silently skip — notification bell is a nice-to-have */
  }
}
function renderNotifList(notifications) {
  const list = document.getElementById("notifList");
  if (!notifications.length) {
    list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
    return;
  }
  list.innerHTML = notifications
    .map(
      (n) => `<div class="notif-item ${n.read ? "" : "unread"}" data-notif-id="${n._id}">
        ${escapeHtml(n.message)}
        <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
      </div>`
    )
    .join("");
  list.querySelectorAll("[data-notif-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      try {
        await apiFetch(`/notifications/${el.dataset.notifId}/read`, { method: "PATCH" });
        el.classList.remove("unread");
        refreshNotifBell();
      } catch (err) { /* ignore */ }
    });
  });
}
document.getElementById("notifBellBtn").addEventListener("click", () => {
  notifPanel.hidden = !notifPanel.hidden;
});
document.getElementById("markAllReadBtn").addEventListener("click", async () => {
  try {
    await apiFetch("/notifications/read-all", { method: "POST" });
    refreshNotifBell();
  } catch (e) { /* ignore */ }
});
document.addEventListener("click", (e) => {
  if (!notifPanel.hidden && !notifPanel.contains(e.target) && e.target.id !== "notifBellBtn") {
    notifPanel.hidden = true;
  }
});

/* ===================== ANNOUNCEMENTS + NEW ARRIVALS + TRENDING (Home) ===================== */
async function loadAnnouncements() {
  const el = document.getElementById("announcementsBanner");
  try {
    const announcements = await apiFetch("/announcements");
    el.innerHTML = announcements
      .map((a) => `<div class="announcement-card"><h4>📣 ${escapeHtml(a.title)}</h4><p>${escapeHtml(a.message)}</p></div>`)
      .join("");
  } catch (e) {
    el.innerHTML = "";
  }
}

async function loadNewArrivals() {
  const section = document.getElementById("newArrivalsSection");
  const row = document.getElementById("newArrivalsRow");
  try {
    const books = await apiFetch("/books/new-arrivals");
    if (!books.length) { section.hidden = true; return; }
    section.hidden = false;
    row.innerHTML = books
      .map((b) => `<button class="book-card" data-arrival="${b._id}">${bookCoverHtml(b, 130)}<h3 style="font-size:13px;">${escapeHtml(b.title)}</h3><div class="author" style="font-size:11px;">${escapeHtml(b.author)}</div></button>`)
      .join("");
    row.querySelectorAll("[data-arrival]").forEach((el, i) => el.addEventListener("click", () => openBookModal(books[i])));
    upgradeCoversForVisibleBooks(books);
  } catch (e) {
    section.hidden = true;
  }
}

async function loadTrending() {
  const section = document.getElementById("trendingSection");
  const row = document.getElementById("trendingRow");
  try {
    const books = await apiFetch("/reports/trending");
    if (!books.length) { section.hidden = true; return; }
    section.hidden = false;
    row.innerHTML = books
      .map((b) => `<button class="book-card" data-trend="${b._id}">${bookCoverHtml(b, 130)}<h3 style="font-size:13px;">${escapeHtml(b.title)}</h3><div class="author" style="font-size:11px;">${escapeHtml(b.author)}</div></button>`)
      .join("");
    row.querySelectorAll("[data-trend]").forEach((el, i) => el.addEventListener("click", () => openBookModal(books[i])));
    upgradeCoversForVisibleBooks(books);
  } catch (e) {
    section.hidden = true;
  }
}

/* ===================== ASK A LIBRARIAN ===================== */
const contactModal = document.getElementById("contactModalOverlay");
document.getElementById("askLibrarianLink").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("contactStatus").textContent = "";
  if (state.user) {
    document.getElementById("contactName").value = state.user.name;
    document.getElementById("contactEmail").value = state.user.email;
  }
  contactModal.classList.add("open");
});
document.getElementById("contactModalCancel").addEventListener("click", () => contactModal.classList.remove("open"));
contactModal.addEventListener("click", (e) => { if (e.target === contactModal) contactModal.classList.remove("open"); });
document.getElementById("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("contactStatus");
  statusEl.textContent = "Sending…";
  statusEl.className = "modal-status";
  try {
    const data = await apiFetch("/contact", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("contactName").value.trim(),
        email: document.getElementById("contactEmail").value.trim(),
        message: document.getElementById("contactMessage").value.trim(),
      }),
    });
    statusEl.textContent = data.message;
    statusEl.className = "modal-status success";
    setTimeout(() => contactModal.classList.remove("open"), 1500);
    document.getElementById("contactForm").reset();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

/* ===================== ADMIN: ROOMS ===================== */
document.getElementById("addRoomForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("addRoomStatus");
  try {
    await apiFetch("/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("roomName").value.trim(),
        branch: document.getElementById("roomBranch").value.trim() || "Main Campus",
        capacity: Number(document.getElementById("roomCapacity").value) || 4,
      }),
    });
    statusEl.textContent = "Room added.";
    statusEl.className = "modal-status success";
    document.getElementById("addRoomForm").reset();
    document.getElementById("roomCapacity").value = 4;
    loadAdminRooms();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});
async function loadAdminRooms() {
  try {
    const rooms = await apiFetch("/rooms");
    const rows = rooms.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.branch)}</td><td>${r.capacity}</td></tr>`).join("");
    document.getElementById("adminRoomsTable").innerHTML = rooms.length
      ? `<table class="data-table"><thead><tr><th>Name</th><th>Branch</th><th>Capacity</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">No rooms yet.</p>`;
  } catch (e) {
    document.getElementById("adminRoomsTable").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

/* ===================== ADMIN: SUGGESTIONS ===================== */
async function loadAdminSuggestions() {
  try {
    const suggestions = await apiFetch("/suggestions?status=pending");
    const rows = suggestions
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.title)}</td>
          <td>${escapeHtml(s.author || "—")}</td>
          <td>${escapeHtml(s.suggestedBy?.name || "—")}</td>
          <td>${escapeHtml(s.reason || "—")}</td>
          <td>
            <button class="btn-ghost" data-approve="${s._id}">Approve</button>
            <button class="btn-ghost" data-reject="${s._id}" style="color:var(--danger);">Reject</button>
          </td>
        </tr>`
      )
      .join("");
    document.getElementById("suggestionsTable").innerHTML = suggestions.length
      ? `<table class="data-table"><thead><tr><th>Title</th><th>Author</th><th>From</th><th>Reason</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">No pending suggestions.</p>`;

    document.querySelectorAll("[data-approve], [data-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.approve || btn.dataset.reject;
        const status = btn.dataset.approve ? "approved" : "rejected";
        try {
          await apiFetch(`/suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
          showToast(`Suggestion ${status}`, "success");
          loadAdminSuggestions();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (e) {
    document.getElementById("suggestionsTable").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

/* ===================== ADMIN: ANNOUNCEMENTS ===================== */
document.getElementById("postAnnouncementForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("announcementStatus");
  try {
    await apiFetch("/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("annTitle").value.trim(),
        message: document.getElementById("annMessage").value.trim(),
      }),
    });
    statusEl.textContent = "Posted.";
    statusEl.className = "modal-status success";
    document.getElementById("postAnnouncementForm").reset();
    loadAdminAnnouncements();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});
async function loadAdminAnnouncements() {
  try {
    const announcements = await apiFetch("/announcements/all");
    const active = announcements.filter((a) => a.isActive);
    document.getElementById("adminAnnouncementsList").innerHTML = active.length
      ? active
          .map(
            (a) => `<div class="loan-row"><div><div class="lr-title">${escapeHtml(a.title)}</div><div class="lr-sub">${escapeHtml(a.message)}</div></div><button class="btn-ghost" data-remove-ann="${a._id}">Take down</button></div>`
          )
          .join("")
      : `<p class="hint">No active announcements.</p>`;
    document.querySelectorAll("[data-remove-ann]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiFetch(`/announcements/${btn.dataset.removeAnn}`, { method: "DELETE" });
          showToast("Announcement removed", "success");
          loadAdminAnnouncements();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (e) {
    document.getElementById("adminAnnouncementsList").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

/* ===================== ADMIN (existing tabs continue below) ===================== */
document.querySelectorAll("[data-admintab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-admintab]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    ["reports", "books", "addbook", "members", "analytics", "auditlog", "scan", "rooms", "suggestions", "announcements"].forEach((p) => {
      document.getElementById(`panel-${p}`).hidden = p !== tab.dataset.admintab;
    });
    if (tab.dataset.admintab === "books") loadAdminBooks(1);
    if (tab.dataset.admintab === "members") loadMembers();
    if (tab.dataset.admintab === "analytics") loadAnalytics();
    if (tab.dataset.admintab === "auditlog") loadAuditLog();
    if (tab.dataset.admintab === "rooms") loadAdminRooms();
    if (tab.dataset.admintab === "suggestions") loadAdminSuggestions();
    if (tab.dataset.admintab === "announcements") loadAdminAnnouncements();
  });
});

document.querySelectorAll("[data-addmode]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-addmode]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll("[data-addmode-panel]").forEach((p) => {
      p.hidden = p.dataset.addmodePanel !== tab.dataset.addmode;
    });
  });
});

async function loadAdminReports() {
  if (!state.user || !["librarian", "admin"].includes(state.user.role)) return;
  try {
    const [inv, borrowed, fines, payments, lost, paymentRequests] = await Promise.all([
      apiFetch("/reports/inventory"),
      apiFetch("/reports/borrowed"),
      apiFetch("/reports/fines"),
      apiFetch("/reports/payments"),
      apiFetch("/reports/lost"),
      apiFetch("/payments/requests/pending"),
    ]);

    document.getElementById("reportMetrics").innerHTML = `
      <div class="metric-card"><div class="m-num">${inv.totalTitles.toLocaleString()}</div><div class="m-lbl">Total titles</div></div>
      <div class="metric-card"><div class="m-num">${inv.totalCopies.toLocaleString()}</div><div class="m-lbl">Total copies</div></div>
      <div class="metric-card"><div class="m-num">${borrowed.count}</div><div class="m-lbl">Currently borrowed</div></div>
      <div class="metric-card"><div class="m-num">৳${fines.totalFines}</div><div class="m-lbl">Outstanding fines</div></div>
    `;

    const rows = borrowed.borrowed
      .slice(0, 50)
      .map(
        (t) => `<tr>
          <td>${escapeHtml(t.book?.title || "—")}</td>
          <td>${escapeHtml(t.user?.name || "—")}</td>
          <td>${new Date(t.dueDate).toLocaleDateString()}</td>
          <td>${t.status}</td>
        </tr>`
      )
      .join("");
    document.getElementById("borrowedTable").innerHTML = borrowed.count
      ? `<table class="data-table"><thead><tr><th>Book</th><th>Borrower</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">Nothing currently borrowed.</p>`;

    document.getElementById("paymentRequestsList").innerHTML = paymentRequests.length
      ? paymentRequests
          .map(
            (request) => `<div class="loan-row">
              <div>
                <div class="lr-title">${escapeHtml(request.user?.name || "Unknown member")} — ৳${request.amount}</div>
                <div class="lr-sub">${escapeHtml(request.user?.email || "")} · requested ${new Date(request.createdAt).toLocaleString()}</div>
              </div>
              <button class="btn-primary" data-approve-payment="${request._id}">Receive payment</button>
            </div>`
          )
          .join("")
      : `<p class="hint">No pending payment requests.</p>`;
    document.querySelectorAll("[data-approve-payment]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Recording…";
        try {
          await apiFetch(`/payments/requests/${button.dataset.approvePayment}/approve`, { method: "PATCH" });
          showToast("Payment received and recorded", "success");
          loadAdminReports();
        } catch (err) {
          showToast(err.message, "error");
          button.disabled = false;
          button.textContent = "Receive payment";
        }
      });
    });

    document.getElementById("paymentsSummary").innerHTML = `<strong>৳${payments.totalPaid.toLocaleString()}</strong> collected across ${payments.count} payment${payments.count === 1 ? "" : "s"}`;
    document.getElementById("paymentsTable").innerHTML = payments.payments.length
      ? `<table class="data-table"><thead><tr><th>Date</th><th>Borrower</th><th>Amount</th><th>Method</th></tr></thead><tbody>${payments.payments.slice(0, 20).map((p) => `<tr><td>${new Date(p.createdAt).toLocaleDateString()}</td><td>${escapeHtml(p.user?.name || "—")}</td><td>৳${p.amount}</td><td>${escapeHtml(p.method)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="hint">No manual payments recorded yet.</p>`;
    document.getElementById("lostBooksTable").innerHTML = lost.lost.length
      ? `<table class="data-table"><thead><tr><th>Book</th><th>Borrower</th><th>Replacement fee</th><th>Payment</th></tr></thead><tbody>${lost.lost.map((t) => `<tr><td>${escapeHtml(t.book?.title || "—")}</td><td>${escapeHtml(t.user?.name || "—")}</td><td>৳${t.fineAmount || 0}</td><td>${t.finePaid ? "Paid" : "Unpaid"}</td></tr>`).join("")}</tbody></table>`
      : `<p class="hint">No lost books reported.</p>`;
  } catch (e) {
    document.getElementById("reportMetrics").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

document.getElementById("exportPaymentsBtn").addEventListener("click", () => downloadWithAuth("/reports/payments/export", "libraryms_payment_report.csv"));

document.getElementById("addBookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("addBookStatus");
  const editingId = state.editingBookId;
  statusEl.textContent = editingId ? "Saving changes…" : "Adding…";
  statusEl.className = "modal-status";
  const payload = {
    title: document.getElementById("abTitle").value.trim(),
    author: document.getElementById("abAuthor").value.trim(),
    isbn: document.getElementById("abIsbn").value.trim(),
    category: document.getElementById("abCategory").value,
    branch: document.getElementById("abBranch").value.trim() || undefined,
    publisher: document.getElementById("abPublisher").value.trim(),
    publishedYear: Number(document.getElementById("abYear").value) || undefined,
    totalCopies: Number(document.getElementById("abCopies").value) || 1,
    shelfLocation: document.getElementById("abShelf").value.trim(),
  };
  // Only set availableCopies on create — editing totalCopies shouldn't silently
  // reset how many copies are currently checked out.
  if (!editingId) payload.availableCopies = payload.totalCopies;

  try {
    if (editingId) {
      await apiFetch(`/books/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      statusEl.textContent = "Book updated.";
      statusEl.className = "modal-status success";
      showToast("Book updated", "success");
      exitBookEditMode();
      loadAdminBooks(state.adminBooksPage);
    } else {
      await apiFetch("/books", { method: "POST", body: JSON.stringify(payload) });
      statusEl.textContent = "Book added to catalog.";
      statusEl.className = "modal-status success";
      showToast("Book added", "success");
      document.getElementById("addBookForm").reset();
      document.getElementById("abCopies").value = 1;
    }
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

function enterBookEditMode(book) {
  state.editingBookId = book._id;
  document.getElementById("abTitle").value = book.title || "";
  document.getElementById("abAuthor").value = book.author || "";
  document.getElementById("abIsbn").value = book.isbn || "";
  document.getElementById("abCategory").value = book.category || "";
  document.getElementById("abBranch").value = book.branch || "";
  document.getElementById("abPublisher").value = book.publisher || "";
  document.getElementById("abYear").value = book.publishedYear || "";
  document.getElementById("abCopies").value = book.totalCopies || 1;
  document.getElementById("abShelf").value = book.shelfLocation || "";
  document.getElementById("addBookModeHint").hidden = false;
  document.getElementById("addBookSubmitBtn").textContent = "Save changes";
  document.getElementById("addBookCancelEditBtn").hidden = false;
  document.getElementById("addBookStatus").textContent = "";
  // Switch to the "Add a book" tab so the populated form is visible.
  document.querySelector('[data-admintab="addbook"]').click();
}

function exitBookEditMode() {
  state.editingBookId = null;
  document.getElementById("addBookForm").reset();
  document.getElementById("abCopies").value = 1;
  document.getElementById("addBookModeHint").hidden = true;
  document.getElementById("addBookSubmitBtn").textContent = "Add book to catalog";
  document.getElementById("addBookCancelEditBtn").hidden = true;
}

document.getElementById("addBookCancelEditBtn").addEventListener("click", exitBookEditMode);

/* ===================== ADMIN: BOOKS (view/search/edit/delete the catalog) =====================
   Previously the dashboard could add a book and see aggregate counts, but there was no way to
   actually see, search, edit, or delete individual books from inside the dashboard. */
async function loadAdminBooks(page = 1) {
  state.adminBooksPage = page;
  const container = document.getElementById("adminBooksTable");
  const meta = document.getElementById("adminBooksMeta");
  container.innerHTML = `<p class="hint">Loading…</p>`;

  const params = new URLSearchParams({ page, limit: 20 });
  if (state.adminBooksQuery) params.set("q", state.adminBooksQuery);
  if (state.adminBooksCategory) params.set("category", state.adminBooksCategory);

  try {
    const data = await apiFetch(`/books/search?${params}`);
    meta.textContent = `${data.total.toLocaleString()} book${data.total === 1 ? "" : "s"} in the catalog`;

    if (!data.books.length) {
      container.innerHTML = `<p class="hint">No books match that search.</p>`;
      document.getElementById("adminBooksPager").innerHTML = "";
      return;
    }

    const rows = data.books
      .map(
        (b) => `<tr>
          <td>${escapeHtml(b.title)}</td>
          <td>${escapeHtml(b.author)}</td>
          <td>${escapeHtml(b.category)}</td>
          <td class="mono">${escapeHtml(b.shelfLocation || "—")}</td>
          <td>${b.availableCopies}/${b.totalCopies}</td>
          <td>
            <button class="btn-ghost" data-editbook="${b._id}">Edit</button>
            <button class="btn-danger" data-deletebook="${b._id}" data-title="${escapeHtml(b.title)}">Delete</button>
          </td>
        </tr>`
      )
      .join("");
    container.innerHTML = `<table class="data-table"><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Shelf</th><th>Copies</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

    container.querySelectorAll("[data-editbook]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const book = data.books.find((b) => b._id === btn.dataset.editbook);
        if (book) enterBookEditMode(book);
      });
    });
    container.querySelectorAll("[data-deletebook]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Remove "${btn.dataset.title}" from the catalog? This can't be undone.`)) return;
        try {
          await apiFetch(`/books/${btn.dataset.deletebook}`, { method: "DELETE" });
          showToast("Book removed", "success");
          loadAdminBooks(state.adminBooksPage);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });

    const totalPages = Math.ceil(data.total / data.limit) || 1;
    const pager = document.getElementById("adminBooksPager");
    pager.innerHTML = "";
    if (totalPages > 1) {
      const prev = document.createElement("button");
      prev.textContent = "← Prev";
      prev.disabled = data.page <= 1;
      prev.addEventListener("click", () => loadAdminBooks(data.page - 1));
      const next = document.createElement("button");
      next.textContent = "Next →";
      next.disabled = data.page >= totalPages;
      next.addEventListener("click", () => loadAdminBooks(data.page + 1));
      pager.append(prev, next);
    }
  } catch (e) {
    container.innerHTML = `<p class="hint">Couldn't load the catalog. Check the server connection (top right).</p>`;
  }
}

document.getElementById("adminBookSearchBtn").addEventListener("click", () => {
  state.adminBooksQuery = document.getElementById("adminBookSearchInput").value.trim();
  state.adminBooksCategory = document.getElementById("adminBookCategorySelect").value;
  loadAdminBooks(1);
});
document.getElementById("adminBookSearchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("adminBookSearchBtn").click();
});
document.getElementById("adminBookCategorySelect").addEventListener("change", () => {
  state.adminBooksCategory = document.getElementById("adminBookCategorySelect").value;
  loadAdminBooks(1);
});

async function loadMembers(q = "") {
  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const users = await apiFetch(`/users${params}`);
    const rows = users
      .map(
        (u) => `<tr class="clickable" data-member="${u._id}">
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.studentId || "—")}</td>
          <td>${u.role}</td>
          <td>${u.isActive ? "Active" : "Deactivated"}</td>
          <td><button class="btn-ghost" data-toggle="${u._id}" data-active="${u.isActive}">${u.isActive ? "Deactivate" : "Reactivate"}</button></td>
        </tr>`
      )
      .join("");
    document.getElementById("membersTable").innerHTML = users.length
      ? `<table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Student ID</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">No members found.</p>`;

    document.querySelectorAll("tr[data-member]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-toggle]")) return; // don't open detail when clicking the status button
        openMemberModal(row.dataset.member);
      });
    });

    document.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const isActive = btn.dataset.active === "true";
        try {
          await apiFetch(`/users/${btn.dataset.toggle}/status`, {
            method: "PATCH",
            body: JSON.stringify({ isActive: !isActive }),
          });
          showToast("Member status updated", "success");
          loadMembers(document.getElementById("memberSearchInput").value.trim());
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (e) {
    document.getElementById("membersTable").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

let memberSearchDebounce;
document.getElementById("memberSearchInput").addEventListener("input", (e) => {
  clearTimeout(memberSearchDebounce);
  memberSearchDebounce = setTimeout(() => loadMembers(e.target.value.trim()), 300);
});

/* ===================== MEMBER DETAIL MODAL — "কে কোন বই নিয়েছে" ===================== */
const memberModal = document.getElementById("memberModalOverlay");
async function openMemberModal(userId) {
  const content = document.getElementById("memberModalContent");
  content.innerHTML = `<p class="hint">Loading member details…</p>`;
  memberModal.classList.add("open");
  try {
    const data = await apiFetch(`/users/${userId}/detail`);
    const { user, history, currentlyBorrowed, lostBooks = [], unpaidFines, unpaidFineTxns } = data;
    const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    const currentRows = currentlyBorrowed.length
      ? currentlyBorrowed
          .map(
            (t) => `<div class="mm-history-item">
              <span>${escapeHtml(t.book?.title || "—")}</span>
              <span class="mono">${t.status === "overdue" ? "OVERDUE" : "due " + new Date(t.dueDate).toLocaleDateString()}</span>
              <button class="btn-ghost" data-process-return="${t._id}">Process return</button>
            </div>`
          )
          .join("")
      : `<p class="hint">Nothing currently borrowed.</p>`;

    const pastRows = history
      .filter((t) => t.status === "returned")
      .slice(0, 10)
      .map(
        (t) => `<div class="mm-history-item">
          <span>${escapeHtml(t.book?.title || "—")}</span>
          <span class="mono">${t.fineAmount ? "fine ৳" + t.fineAmount + (t.finePaid ? " (paid)" : "") : "returned on time"}</span>
        </div>`
      )
      .join("") || `<p class="hint">No return history yet.</p>`;

    const lostRows = lostBooks.length
      ? lostBooks.map((t) => `<div class="mm-history-item"><span>${escapeHtml(t.book?.title || "—")}</span><span class="mono">lost · ৳${t.fineAmount || 0}${t.finePaid ? " (paid)" : " (unpaid)"}</span></div>`).join("")
      : `<p class="hint">No lost books reported.</p>`;

    // Unpaid fines with a cash "mark as paid" action — this was previously
    // missing entirely from the dashboard, so a librarian had no way to record
    // a cash payment even though the backend endpoint (mark-paid) already existed.
    const unpaidRows = unpaidFineTxns.length
      ? unpaidFineTxns
          .map(
            (t) => `<div class="mm-history-item">
              <span>${escapeHtml(t.book?.title || "—")} — ৳${t.fineAmount}</span>
              <button class="btn-primary" data-markpaid="${t._id}">Mark as paid (cash)</button>
            </div>`
          )
          .join("")
      : `<p class="hint">No unpaid fines.</p>`;

    content.innerHTML = `
      <div class="mm-header">
        <div class="mm-avatar">${escapeHtml(initials)}</div>
        <div>
          <div class="mm-name">${escapeHtml(user.name)}</div>
          <div class="mm-sub">${escapeHtml(user.email)} ${user.studentId ? "· " + escapeHtml(user.studentId) : ""} · ${user.role}</div>
        </div>
      </div>
      <div class="mm-stats">
        <div class="mm-stat"><div class="n">${data.totalBorrowedEver}</div><div class="l">Total borrows</div></div>
        <div class="mm-stat"><div class="n">${currentlyBorrowed.length}</div><div class="l">Currently out</div></div>
        <div class="mm-stat"><div class="n">৳${unpaidFines}</div><div class="l">Unpaid fines</div></div>
      </div>
      <h3 class="sub-title" style="margin-top:0;">Currently borrowed</h3>
      ${currentRows}
      <h3 class="sub-title">Unpaid fines</h3>
      ${unpaidRows}
      <h3 class="sub-title">Lost books</h3>
      ${lostRows}
      <h3 class="sub-title">Return history</h3>
      ${pastRows}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn-ghost" id="closeMemberModalBtn">Close</button>
      </div>
    `;
    document.getElementById("closeMemberModalBtn").addEventListener("click", () => memberModal.classList.remove("open"));

    content.querySelectorAll("[data-markpaid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Recording…";
        try {
          await apiFetch(`/transactions/${btn.dataset.markpaid}/mark-paid`, { method: "PATCH" });
          showToast("Payment recorded", "success");
          openMemberModal(userId); // refresh the modal with updated fine status
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
          btn.textContent = "Mark as paid (cash)";
        }
      });
    });

    content.querySelectorAll("[data-process-return]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Returning…";
        try {
          await apiFetch("/transactions/return", {
            method: "POST",
            body: JSON.stringify({ transactionId: btn.dataset.processReturn }),
          });
          showToast("Book returned", "success");
          openMemberModal(userId); // refresh with updated loans/fines
        } catch (err) {
          showToast(err.message, "error");
          btn.disabled = false;
          btn.textContent = "Process return";
        }
      });
    });
  } catch (e) {
    content.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p><div class="modal-actions"><button class="btn-ghost" id="closeMemberModalBtn2">Close</button></div>`;
    document.getElementById("closeMemberModalBtn2").addEventListener("click", () => memberModal.classList.remove("open"));
  }
}

/* ===================== ANALYTICS ===================== */
let mostBorrowedChartInstance = null;
let categoryChartInstance = null;

function themeChartColors() {
  return {
    text: "#405765",
    grid: "#B9D0D8",
    accent: "#C45C3B",
    palette: ["#C45C3B", "#0F766E", "#2B6F9B", "#C28A2C", "#7A4D9B", "#3B7D5E", "#B34E62", "#506A7A"],
  };
}

async function loadAnalytics() {
  try {
    const data = await apiFetch("/reports/analytics");
    const colors = themeChartColors();

    if (typeof Chart === "undefined") {
      document.getElementById("mostBorrowedChart").parentElement.innerHTML = `<p class="hint">Chart library failed to load — check your internet connection.</p>`;
    } else {
      if (mostBorrowedChartInstance) mostBorrowedChartInstance.destroy();
      if (categoryChartInstance) categoryChartInstance.destroy();

      const mbCtx = document.getElementById("mostBorrowedChart");
      mostBorrowedChartInstance = new Chart(mbCtx, {
        type: "bar",
        data: {
          labels: data.mostBorrowed.map((b) => b.title),
          datasets: [{ label: "Times borrowed", data: data.mostBorrowed.map((b) => b.count), backgroundColor: colors.accent, borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: colors.text, autoSkip: false, maxRotation: 30, minRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: colors.text, precision: 0 }, grid: { color: colors.grid } },
          },
        },
      });

      const catCtx = document.getElementById("categoryChart");
      categoryChartInstance = new Chart(catCtx, {
        type: "doughnut",
        data: {
          labels: data.categoryDemand.map((c) => c._id),
          datasets: [{ data: data.categoryDemand.map((c) => c.count), backgroundColor: colors.palette }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: colors.text, boxWidth: 12, font: { size: 11 } } } },
        },
      });
    }

    const rows = data.topReaders
      .map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.count}</td></tr>`)
      .join("");
    document.getElementById("topReadersTable").innerHTML = data.topReaders.length
      ? `<table class="data-table"><thead><tr><th>#</th><th>Reader</th><th>Books borrowed</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">Not enough data yet.</p>`;
  } catch (e) {
    document.getElementById("mostBorrowedChart").parentElement.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

/* ===================== BULK CSV IMPORT ===================== */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  if (quoted) throw new Error("Invalid CSV: an opening quote was not closed.");
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i]));
    if (obj.publishedYear) obj.publishedYear = Number(obj.publishedYear);
    if (obj.totalCopies) {
      obj.totalCopies = Number(obj.totalCopies);
      obj.availableCopies = obj.totalCopies;
    }
    return obj;
  });
}

document.getElementById("bulkImportBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("bulkCsvFile");
  const statusEl = document.getElementById("bulkImportStatus");
  if (!fileInput.files.length) {
    statusEl.textContent = "Choose a CSV file first.";
    statusEl.className = "modal-status error";
    return;
  }
  statusEl.textContent = "Importing…";
  statusEl.className = "modal-status";
  try {
    const text = await fileInput.files[0].text();
    const books = parseCsv(text);
    const result = await apiFetch("/books/bulk-import", { method: "POST", body: JSON.stringify({ books }) });
    statusEl.textContent = `Imported ${result.inserted} of ${result.total} books.`;
    statusEl.className = "modal-status success";
    showToast(`${result.inserted} books imported`, "success");
    fileInput.value = "";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

/* ===================== FORGOT PASSWORD ===================== */
const forgotModal = document.getElementById("forgotModalOverlay");
document.getElementById("forgotPasswordLink").addEventListener("click", (e) => {
  e.preventDefault();
  closeAuthModal();
  document.getElementById("forgotStatus").textContent = "";
  forgotModal.classList.add("open");
});
document.getElementById("forgotModalCancel").addEventListener("click", () => forgotModal.classList.remove("open"));
forgotModal.addEventListener("click", (e) => { if (e.target === forgotModal) forgotModal.classList.remove("open"); });

document.getElementById("forgotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("forgotEmail").value.trim();
  const statusEl = document.getElementById("forgotStatus");
  statusEl.textContent = "Sending…";
  statusEl.className = "modal-status";
  try {
    const data = await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    statusEl.textContent = data.message;
    statusEl.className = "modal-status success";
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "modal-status error";
  }
});

/* ===================== EMAIL VERIFICATION BANNER ===================== */
function renderVerifyBanner() {
  const existing = document.getElementById("verifyBanner");
  if (existing) existing.remove();
  if (!state.user || state.user.emailVerified) return;

  const banner = document.createElement("div");
  banner.className = "verify-banner";
  banner.id = "verifyBanner";
  banner.innerHTML = `<span>Please verify your email (${escapeHtml(state.user.email)}) to unlock all features.</span> <button id="resendVerifyBtn">Resend verification email</button>`;
  document.getElementById("app").prepend(banner);
  document.getElementById("resendVerifyBtn").addEventListener("click", async () => {
    try {
      const data = await apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: state.user.email }) });
      showToast(data.message, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

/* ===================== AUDIT LOG ===================== */
async function loadAuditLog() {
  try {
    const logs = await apiFetch("/reports/audit-log");
    const rows = logs
      .map(
        (l) => `<tr>
          <td>${new Date(l.createdAt).toLocaleString()}</td>
          <td>${escapeHtml(l.actorName || "—")}</td>
          <td>${escapeHtml(l.action)}</td>
          <td>${escapeHtml(l.details || "—")}</td>
        </tr>`
      )
      .join("");
    document.getElementById("auditLogTable").innerHTML = logs.length
      ? `<table class="data-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="hint">No activity logged yet.</p>`;
  } catch (e) {
    document.getElementById("auditLogTable").innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

/* ===================== CSV EXPORTS ===================== */
function downloadWithAuth(path, filename) {
  fetch(api(path), { headers: { Authorization: `Bearer ${state.token}` } })
    .then((res) => {
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => showToast(err.message, "error"));
}
document.getElementById("exportCatalogBtn").addEventListener("click", () => downloadWithAuth("/books/export/csv", "libraryms_catalog.csv"));
document.getElementById("exportFinesBtn").addEventListener("click", () => downloadWithAuth("/reports/fines/export", "libraryms_fines.csv"));

/* ===================== ACCOUNT SETTINGS (2FA) ===================== */
const settingsModal = document.getElementById("settingsModalOverlay");
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("open"); });

function openSettingsModal() {
  renderSettingsModal();
  settingsModal.classList.add("open");
}

function renderSettingsModal() {
  const content = document.getElementById("settingsModalContent");
  const enabled = !!state.user?.twoFactorEnabled;
  content.innerHTML = `
    <h3>Account settings</h3>
    <p class="modal-hint">${escapeHtml(state.user.name)} · ${escapeHtml(state.user.email)}</p>
    <h3 class="sub-title" style="margin-top:16px;">Two-factor authentication</h3>
    <p class="modal-hint">${enabled ? "2FA is currently ON. You'll need an authenticator code every time you log in." : "Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.)."}</p>
    <div id="twoFaArea"></div>
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn-ghost" id="closeSettingsBtn">Close</button>
      ${enabled ? `<button class="btn-primary" id="disable2faBtn" style="background:var(--danger);">Disable 2FA</button>` : `<button class="btn-primary" id="setup2faBtn">Set up 2FA</button>`}
    </div>
  `;
  document.getElementById("closeSettingsBtn").addEventListener("click", () => settingsModal.classList.remove("open"));

  if (enabled) {
    document.getElementById("disable2faBtn").addEventListener("click", async () => {
      try {
        await apiFetch("/auth/2fa/disable", { method: "POST" });
        state.user.twoFactorEnabled = false;
        localStorage.setItem("librarims_user", JSON.stringify(state.user));
        showToast("2FA disabled", "success");
        renderSettingsModal();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  } else {
    document.getElementById("setup2faBtn").addEventListener("click", async () => {
      const area = document.getElementById("twoFaArea");
      area.innerHTML = `<p class="hint">Generating your QR code…</p>`;
      try {
        const data = await apiFetch("/auth/2fa/setup", { method: "POST" });
        area.innerHTML = `
          <div class="qr-block">
            <img src="${data.qrDataUrl}" alt="2FA setup QR code" />
            <p>Scan with your authenticator app, or enter this key manually: <span class="mono">${escapeHtml(data.manualEntryKey)}</span></p>
          </div>
          <input type="text" id="twoFaConfirmCode" placeholder="Enter the 6-digit code" maxlength="6" style="width:100%;padding:10px;border:1px solid var(--rule);border-radius:6px;margin-top:8px;" />
          <button class="btn-primary full" id="confirm2faBtn" style="margin-top:10px;">Confirm & enable</button>
          <p class="modal-status" id="twoFaStatus"></p>
        `;
        document.getElementById("confirm2faBtn").addEventListener("click", async () => {
          const token = document.getElementById("twoFaConfirmCode").value.trim();
          const statusEl = document.getElementById("twoFaStatus");
          try {
            await apiFetch("/auth/2fa/confirm", { method: "POST", body: JSON.stringify({ token }) });
            state.user.twoFactorEnabled = true;
            localStorage.setItem("librarims_user", JSON.stringify(state.user));
            showToast("2FA enabled", "success");
            renderSettingsModal();
          } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = "modal-status error";
          }
        });
      } catch (err) {
        area.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      }
    });
  }
}

/* ===================== QR CODE + SCANNER ===================== */
async function loadBookQr(bookId) {
  const el = document.getElementById("bookQrArea");
  if (!el) return;
  try {
    const data = await apiFetch(`/books/${bookId}/qrcode`);
    el.innerHTML = `<div class="qr-block"><img src="${data.qrDataUrl}" alt="QR code for ${escapeHtml(data.title)}" /><p>Scan at the desk to borrow/return instantly</p></div>`;
  } catch (e) {
    el.innerHTML = "";
  }
}

let html5QrInstance = null;
document.getElementById("startScanBtn").addEventListener("click", async () => {
  const resultEl = document.getElementById("scanResult");
  resultEl.innerHTML = "";
  if (typeof Html5Qrcode === "undefined") {
    resultEl.innerHTML = `<p class="hint">Camera scanner library failed to load — check your internet connection.</p>`;
    return;
  }
  if (html5QrInstance) return;
  html5QrInstance = new Html5Qrcode("qrReader");
  try {
    await html5QrInstance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        try {
          const payload = JSON.parse(decodedText);
          if (payload.type !== "libraryms_book") throw new Error("Not a LibraryMS book code");
          const book = await apiFetch(`/books/${payload.id}`);
          resultEl.innerHTML = `
            <div class="scan-hit">
              <strong>${escapeHtml(book.title)}</strong><br/>
              <span class="mono">${escapeHtml(book.isbn)}</span> · ${book.availableCopies}/${book.totalCopies} available
            </div>`;
          await html5QrInstance.stop();
          html5QrInstance = null;
        } catch (err) {
          resultEl.innerHTML = `<p class="hint">Couldn't read that code: ${escapeHtml(err.message)}</p>`;
        }
      },
      () => {} // ignore per-frame decode failures
    );
  } catch (err) {
    resultEl.innerHTML = `<p class="hint">Couldn't access the camera: ${escapeHtml(err.message)}</p>`;
  }
});

/* ===================== PAY FINE (bKash sandbox, with desk fallback) ===================== */
const paymentModal = document.getElementById("paymentModalOverlay");
paymentModal.addEventListener("click", (e) => { if (e.target === paymentModal) paymentModal.classList.remove("open"); });

async function openPaymentModal(amount) {
  const content = document.getElementById("paymentModalContent");
  content.innerHTML = `<h3>Pay your fine</h3><p class="modal-hint">Checking payment options…</p>`;
  paymentModal.classList.add("open");

  try {
    const balance = await apiFetch("/payments/my-balance");
    if (!balance.bkashAvailable) {
      content.innerHTML = `
        <h3>Pay your fine</h3>
        <p class="modal-hint">You owe ৳${balance.total}. Online payment isn't set up on this server yet — please settle it with the librarian at the desk.</p>
        <div class="modal-actions">
          <button class="btn-ghost" id="closePaymentBtn">Close</button>
          <button class="btn-primary" id="requestPaymentBtn">Request desk payment</button>
        </div>
        <p class="modal-status" id="paymentRequestStatus"></p>
      `;
      document.getElementById("closePaymentBtn").addEventListener("click", () => paymentModal.classList.remove("open"));
      document.getElementById("requestPaymentBtn").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const statusEl = document.getElementById("paymentRequestStatus");
        button.disabled = true;
        button.textContent = "Sending…";
        try {
          const result = await apiFetch("/payments/requests", { method: "POST" });
          statusEl.textContent = result.message;
          statusEl.className = "modal-status success";
          button.textContent = "Request sent";
        } catch (err) {
          statusEl.textContent = err.message;
          statusEl.className = "modal-status error";
          button.disabled = false;
          button.textContent = "Request desk payment";
        }
      });
      return;
    }

    content.innerHTML = `
      <h3>Pay your fine</h3>
      <p class="modal-hint">You owe ৳${balance.total}. You'll be redirected to bKash to complete payment (sandbox — no real money moves).</p>
      <div class="modal-actions">
        <button class="btn-ghost" id="closePaymentBtn">Cancel</button>
        <button class="btn-primary" id="startBkashBtn">Pay with bKash</button>
      </div>
      <p class="modal-status" id="paymentStatus"></p>
    `;
    document.getElementById("closePaymentBtn").addEventListener("click", () => paymentModal.classList.remove("open"));
    document.getElementById("startBkashBtn").addEventListener("click", async () => {
      const statusEl = document.getElementById("paymentStatus");
      statusEl.textContent = "Starting payment…";
      statusEl.className = "modal-status";
      try {
        const data = await apiFetch("/payments/bkash/start", { method: "POST" });
        localStorage.setItem("librarims_pending_payment", data.paymentID);
        window.location.href = data.bkashURL;
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = "modal-status error";
      }
    });
  } catch (err) {
    content.innerHTML = `<h3>Pay your fine</h3><p class="modal-hint">${escapeHtml(err.message)}</p><div class="modal-actions"><button class="btn-ghost" id="closePaymentBtn2">Close</button></div>`;
    document.getElementById("closePaymentBtn2").addEventListener("click", () => paymentModal.classList.remove("open"));
  }
}

/* ===================== UTIL ===================== */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ===================== INIT ===================== */
async function init() {
  renderAuthArea();
  renderVerifyBanner();
  refreshNotifBell();
  await loadCategories();
  await loadBranches();
  await loadHome();
  navigate("home");
}

init();
setInterval(() => { if (state.user) refreshNotifBell(); }, 30000);
