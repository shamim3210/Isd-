const axios = require("axios");

/**
 * bKash Tokenized Checkout (Sandbox) integration.
 *
 * This follows bKash's official documented flow: grant token → create
 * payment → execute payment. To actually run this, you need your own
 * sandbox credentials from https://developer.bka.sh (free signup, no real
 * money moves in sandbox mode). Without credentials configured, fine
 * payment falls back to the existing "mark as paid by librarian" flow —
 * this integration is additive, not a replacement.
 *
 * Docs: https://developer.bka.sh/docs/tokenized-checkout-introduction
 */

const BKASH_BASE_URL = process.env.BKASH_BASE_URL || "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

function isBkashConfigured() {
  return !!(process.env.BKASH_APP_KEY && process.env.BKASH_APP_SECRET && process.env.BKASH_USERNAME && process.env.BKASH_PASSWORD);
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getBkashToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await axios.post(
    `${BKASH_BASE_URL}/tokenized/checkout/token/grant`,
    {
      app_key: process.env.BKASH_APP_KEY,
      app_secret: process.env.BKASH_APP_SECRET,
    },
    {
      headers: {
        username: process.env.BKASH_USERNAME,
        password: process.env.BKASH_PASSWORD,
        "Content-Type": "application/json",
      },
    }
  );

  cachedToken = res.data.id_token;
  // bKash tokens are valid ~1 hour; refresh a little early to be safe.
  tokenExpiresAt = Date.now() + (res.data.expires_in ? res.data.expires_in * 1000 - 60_000 : 55 * 60 * 1000);
  return cachedToken;
}

async function createPayment({ amount, invoiceNumber, callbackURL }) {
  const token = await getBkashToken();
  const res = await axios.post(
    `${BKASH_BASE_URL}/tokenized/checkout/create`,
    {
      mode: "0011",
      payerReference: invoiceNumber,
      callbackURL,
      amount: String(amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: invoiceNumber,
    },
    {
      headers: {
        Authorization: token,
        "X-App-Key": process.env.BKASH_APP_KEY,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data; // includes paymentID and bkashURL to redirect the user to
}

async function executePayment(paymentID) {
  const token = await getBkashToken();
  const res = await axios.post(
    `${BKASH_BASE_URL}/tokenized/checkout/execute`,
    { paymentID },
    {
      headers: {
        Authorization: token,
        "X-App-Key": process.env.BKASH_APP_KEY,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data; // includes transactionStatus: "Completed" on success
}

module.exports = { isBkashConfigured, createPayment, executePayment };
