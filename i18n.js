/* Multi-language support for LibraryMS static UI text.
   Book titles, authors, and categories stay as-is (real catalog data) —
   this covers the interface chrome: nav, buttons, labels, headings. */

const translations = {
  en: {
    nav_home: "Home", nav_browse: "Browse", nav_loans: "My Loans", nav_admin: "Admin",
    hero_eyebrow: "Southeast University · Digital Catalog",
    hero_title_1: "Find it on the shelf", hero_title_2: "before you find the stairs.",
    search_placeholder: "Search by title, author, or ISBN…",
    search_btn: "Search",
    search_hint: "Try “algorithms”, “Rabindranath”, or a call number like",
    guide_eyebrow: "Quick guide", guide_title: "How to use LibraryMS", guide_badge: "4 easy steps",
    guide_search_title: "Find a book", guide_search_text: "Search by title, author, ISBN, or browse a department.",
    guide_details_title: "Check details", guide_details_text: "Open a book to see its cover, shelf, copies, and recommendations.",
    guide_borrow_title: "Borrow or reserve", guide_borrow_text: "Log in, then borrow an available copy or join its reservation queue.",
    guide_manage_title: "Manage your library life", guide_manage_text: "Track loans, renew once, return books, pay fines, and book study rooms.",
    stat_titles: "Titles", stat_departments: "Departments", stat_access: "Access", stat_searchtime: "Search time",
    all_books_title: "All books in the library",
    browse_by_department: "Browse by department",
    all_departments: "All departments",
    login_btn: "Log in", logout_btn: "Log out", account: "Account",
    my_loans_title: "My loans",
    my_loans_empty: "Log in to see your borrowed books, due dates, and fines.",
    librarian_dashboard: "Librarian dashboard",
    tab_reports: "Reports", tab_addbook: "Add a book", tab_members: "Members",
    tab_analytics: "Analytics", tab_auditlog: "Activity log", tab_scan: "Scan",
    add_book_title: "Add one book", bulk_import_title: "Bulk import (CSV)",
    add_to_catalog: "Add book to catalog",
    currently_borrowed: "Currently borrowed",
    total_titles: "Total titles", total_copies: "Total copies", outstanding_fines: "Outstanding fines",
    export_catalog: "Export catalog (CSV)", export_fines: "Export fines (CSV)",
    export_catalog_pdf: "Export catalog (PDF)",
    most_borrowed: "Most borrowed books", demand_by_dept: "Demand by department", top_readers: "Top readers",
    close: "Close",
    forgot_password: "Forgot password?",
    new_here: "New here? Switch to Register to create a Student or Librarian account.",
    email_placeholder: "Email", password_placeholder: "Password",
    server: "Server",
  },
  bn: {
    nav_home: "হোম", nav_browse: "খুঁজুন", nav_loans: "আমার বই", nav_admin: "অ্যাডমিন",
    hero_eyebrow: "সাউথইস্ট ইউনিভার্সিটি · ডিজিটাল ক্যাটালগ",
    hero_title_1: "সিঁড়ি খোঁজার আগে,", hero_title_2: "শেলফেই খুঁজে ফেলুন বইটা।",
    search_placeholder: "নাম, লেখক, বা ISBN দিয়ে খুঁজুন…",
    search_btn: "সার্চ",
    search_hint: "চেষ্টা করুন “algorithms”, “রবীন্দ্রনাথ”, অথবা কল নাম্বার যেমন",
    guide_eyebrow: "সহজ নির্দেশিকা", guide_title: "LibraryMS কীভাবে ব্যবহার করবেন", guide_badge: "৪টি সহজ ধাপ",
    guide_search_title: "বই খুঁজুন", guide_search_text: "বইয়ের নাম, লেখক, ISBN দিয়ে সার্চ করুন বা বিভাগ বেছে নিন।",
    guide_details_title: "বিস্তারিত দেখুন", guide_details_text: "বই খুলে কভার, শেলফ, কপি ও সুপারিশ দেখুন।",
    guide_borrow_title: "ধার নিন বা রিজার্ভ করুন", guide_borrow_text: "লগ ইন করে বই ধার নিন বা রিজার্ভ queue-তে যোগ দিন।",
    guide_manage_title: "লাইব্রেরি ব্যবস্থাপনা", guide_manage_text: "ধার করা বই, renewal, return, fine এবং study room booking দেখুন।",
    stat_titles: "বই", stat_departments: "বিভাগ", stat_access: "সময়", stat_searchtime: "সার্চ সময়",
    all_books_title: "লাইব্রেরির সব বই",
    browse_by_department: "বিভাগ অনুযায়ী ব্রাউজ করুন",
    all_departments: "সব বিভাগ",
    login_btn: "লগ ইন", logout_btn: "লগ আউট", account: "অ্যাকাউন্ট",
    my_loans_title: "আমার নেওয়া বই",
    my_loans_empty: "ধার নেওয়া বই, ডিউ ডেট আর ফাইন দেখতে লগ ইন করুন।",
    librarian_dashboard: "লাইব্রেরিয়ান ড্যাশবোর্ড",
    tab_reports: "রিপোর্ট", tab_addbook: "বই যোগ করুন", tab_members: "মেম্বার",
    tab_analytics: "অ্যানালিটিক্স", tab_auditlog: "কার্যক্রম লগ", tab_scan: "স্ক্যান",
    add_book_title: "একটি বই যোগ করুন", bulk_import_title: "বাল্ক ইম্পোর্ট (CSV)",
    add_to_catalog: "ক্যাটালগে বই যোগ করুন",
    currently_borrowed: "বর্তমানে ধার দেওয়া",
    total_titles: "মোট বই", total_copies: "মোট কপি", outstanding_fines: "বাকি ফাইন",
    export_catalog: "ক্যাটালগ এক্সপোর্ট (CSV)", export_fines: "ফাইন এক্সপোর্ট (CSV)",
    export_catalog_pdf: "ক্যাটালগ এক্সপোর্ট (PDF)",
    most_borrowed: "সবচেয়ে বেশি নেওয়া বই", demand_by_dept: "বিভাগ অনুযায়ী চাহিদা", top_readers: "সেরা পাঠক",
    close: "বন্ধ করুন",
    forgot_password: "পাসওয়ার্ড ভুলে গেছেন?",
    new_here: "নতুন? স্টুডেন্ট বা লাইব্রেরিয়ান অ্যাকাউন্ট বানাতে Register-এ যান।",
    email_placeholder: "ইমেইল", password_placeholder: "পাসওয়ার্ড",
    server: "সার্ভার",
  },
};

function t(key) {
  return translations.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = "en";
}

function setLanguage(lang) {
  applyTranslations();
  if (typeof window.onLanguageChange === "function") window.onLanguageChange();
}
