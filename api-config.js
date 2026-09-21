window.LIBRARYMS_IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
// Empty string = same origin. On Netlify the site serves the frontend AND routes
// every /api/* request to the Netlify Function (netlify/functions/api.js), so no
// separate backend URL is needed. Only set a full URL here if you deliberately
// host the API somewhere else (for example "https://my-api.example.com").
window.LIBRARYMS_API_BASE = "";
