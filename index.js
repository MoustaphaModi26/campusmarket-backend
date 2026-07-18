require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── Config CamPay ───────────────────────────────────────────────────────────

const CAMPAY_BASE_URL = process.env.CAMPAY_BASE_URL || "https://demo.campay.net/api";
const CAMPAY_USERNAME = process.env.CAMPAY_USERNAME;
const CAMPAY_PASSWORD = process.env.CAMPAY_PASSWORD;

// ─── Obtenir un token CamPay ──────────────────────────────────────────────────

const getCamPayToken = async () => {
  const response = await fetch(`${CAMPAY_BASE_URL}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: CAMPAY_USERNAME,
      password: CAMPAY_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error("Impossible de s'authentifier à CamPay");
  }

  const data = await response.json();
  return data.token;
};

// ─── Route : Vérification que le serveur tourne ───────────────────────────────

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "CampusMarket Backend opérationnel",
    version: "1.0.0",
  });
});

// ─── Route : Initier un paiement ─────────────────────────────────────────────

app.post("/api/payment/collect", async (req, res) => {
  try {
    const { amount, phoneNumber, description, externalReference } = req.body;

    // Validation
    if (!amount || !phoneNumber || !description) {
      return res.status(400).json({
        error: "Paramètres manquants : amount, phoneNumber, description requis.",
      });
    }

    if (!CAMPAY_USERNAME || !CAMPAY_PASSWORD) {
      return res.status(500).json({
        error: "Clés CamPay non configurées sur le serveur.",
      });
    }

    const token = await getCamPayToken();

    const response = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: "XAF",
        from: phoneNumber,
        description,
        external_reference: externalReference || `CM_${Date.now()}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Erreur CamPay lors de la collecte.",
      });
    }

    return res.json({
      reference: data.reference,
      ussd_code: data.ussd_code,
      operator: data.operator,
    });

  } catch (e) {
    console.error("Erreur collect:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Route : Vérifier le statut d'un paiement ────────────────────────────────

app.get("/api/payment/status/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: "Référence manquante." });
    }

    const token = await getCamPayToken();

    const response = await fetch(
      `${CAMPAY_BASE_URL}/transaction/${reference}/`,
      {
        method: "GET",
        headers: { Authorization: `Token ${token}` },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Erreur lors de la vérification.",
      });
    }

    return res.json({
      status: data.status,
      reference: data.reference,
      amount: data.amount,
      operator: data.operator,
      external_reference: data.external_reference,
    });

  } catch (e) {
    console.error("Erreur status:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Route : Initier un boost ─────────────────────────────────────────────────

app.post("/api/payment/boost", async (req, res) => {
  try {
    const { amount, phoneNumber, planId, listingId, sellerName } = req.body;

    if (!amount || !phoneNumber || !planId || !listingId) {
      return res.status(400).json({ error: "Paramètres manquants." });
    }

    const token = await getCamPayToken();

    const response = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: "XAF",
        from: phoneNumber,
        description: `CampusMarket — Boost annonce ${planId}`,
        external_reference: `BOOST_${listingId}_${Date.now()}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Erreur CamPay boost.",
      });
    }

    return res.json({
      reference: data.reference,
      operator: data.operator,
    });

  } catch (e) {
    console.error("Erreur boost:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Démarrer le serveur ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`CampusMarket Backend démarré sur le port ${PORT}`);
});