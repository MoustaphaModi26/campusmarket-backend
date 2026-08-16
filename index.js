require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || "";
const NOTCHPAY_PUBLIC_KEY = process.env.NOTCHPAY_PUBLIC_KEY;
const NOTCHPAY_BASE_URL = "https://api.notchpay.co";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Route santé ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "CampusMarket Backend opérationnel",
    notchpay: NOTCHPAY_PUBLIC_KEY ? "configuré" : "MANQUANT",
  });
});

// ─── Initialiser un paiement NotchPay ────────────────────────────────────────

app.post("/api/payment/initialize", async (req, res) => {
  console.log("=== INITIALIZE PAYMENT ===");
  console.log("Body:", JSON.stringify(req.body));

  try {
    const {
      amount,
      phoneNumber,
      description,
      externalReference,
      customerName,
      customerEmail,
    } = req.body;

    if (!amount || !phoneNumber || !description) {
      return res.status(400).json({
        error: "Paramètres manquants : amount, phoneNumber, description requis.",
      });
    }

    const payload = {
      amount,
      currency: "XAF",
      description,
      reference: externalReference || `CM_${Date.now()}`,
      customer: {
        name: customerName || "Client CampusMarket",
        email: customerEmail || "client@campusmarket.cm",
        phone: phoneNumber,
      },
      callback: `${BACKEND_URL}/api/payment/callback`,
    };

    console.log("Payload NotchPay:", JSON.stringify(payload));

    const response = await fetch(`${NOTCHPAY_BASE_URL}/payments/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": NOTCHPAY_PUBLIC_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("Réponse NotchPay:", JSON.stringify(data));

    if (!response.ok || data.code !== 201) {
      return res.status(400).json({
        error: data.message || "Erreur NotchPay",
        details: data,
      });
    }

    return res.json({
      status: "success",
      paymentUrl: data.authorization_url,
      reference: data.transaction.reference,
      transactionId: data.transaction.id,
    });

  } catch (e) {
    console.error("ERREUR initialize:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Vérifier le statut d'un paiement ────────────────────────────────────────

app.get("/api/payment/verify/:reference", async (req, res) => {
  console.log("=== VERIFY PAYMENT ===", req.params.reference);

  try {
    const response = await fetch(
      `${NOTCHPAY_BASE_URL}/payments/${req.params.reference}`,
      {
        method: "GET",
        headers: {
          "Authorization": NOTCHPAY_PUBLIC_KEY,
        },
      }
    );

    const data = await response.json();
    console.log("Réponse verify:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(400).json({ error: data.message || "Erreur vérification" });
    }

    return res.json({
      status: data.transaction?.status ?? "unknown",
      reference: data.transaction?.reference,
      amount: data.transaction?.amount,
      currency: data.transaction?.currency,
    });

  } catch (e) {
    console.error("ERREUR verify:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Callback NotchPay (webhook) ──────────────────────────────────────────────

app.post("/api/payment/callback", (req, res) => {
  console.log("=== CALLBACK NOTCHPAY ===");
  console.log("Body:", JSON.stringify(req.body));
  res.json({ status: "received" });
});

// ─── Auto-ping pour garder le backend éveillé ─────────────────────────────────

if (BACKEND_URL) {
  setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/`);
      console.log(`[PING] ${new Date().toISOString()}`);
    } catch (e) {
      console.error("[PING FAILED]", e.message);
    }
  }, 10 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`=== CampusMarket Backend démarré sur port ${PORT} ===`);
  console.log(`NotchPay: ${NOTCHPAY_PUBLIC_KEY ? "OK" : "MANQUANT"}`);
});