import express from "express";
import Stripe from "stripe";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";
import { Resend } from "resend";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// 🔐 Temporary in-memory store
const downloads = {};

// 📦 Load product → file mapping
const productFiles = JSON.parse(fs.readFileSync("./products.json"));

// ✅ Webhook (RAW body must be first)
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("❌ Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("🔥 Webhook hit");
    console.log("Event type:", event.type);

    if (event.type === "checkout.session.completed") {
      console.log("✅ Payment received");

      const session = event.data.object;

      // 🧾 Get cart from metadata
      const cart = JSON.parse(session.metadata.cart);

      const token = crypto.randomBytes(32).toString("hex");

      const files = [];

      // 🔗 Map cart items → files
      cart.forEach((item) => {
        const fileName = productFiles[item.id];
        if (fileName) {
          files.push(`./files/${productFiles[item.id]}`);
        }
      });

      downloads[token] = {
        files,
        expires: Date.now() + 24 * 60 * 60 * 1000
      };

      const downloadLink = `https://cnc-dxf-backend.onrender.com/download?token=${token}`;

      console.log("Download link:", downloadLink);

      const customerEmail = session.customer_details?.email;

      if (customerEmail) {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: customerEmail,
          subject: "Your Download Link",
          html: `
            <h2>Thanks for your purchase</h2>
            <p>Your download link (valid 24 hours):</p>
            <a href="${downloadLink}">${downloadLink}</a>
            <p>This link contains all your purchased files.</p>
          `
        });

        console.log("📩 Email sent to:", customerEmail);
      }
    }

    res.json({ received: true });
  }
);

// ✅ Middleware AFTER webhook
app.use(express.json());
app.use(cors());

// Test route
app.get("/", (req, res) => {
  res.send("Backend is working ✅");
});

// 🔐 SECURE DOWNLOAD ROUTE
app.get("/download", (req, res) => {
  const { token } = req.query;

  if (!token || !downloads[token]) {
    return res.status(404).send("Invalid or expired link");
  }

  const record = downloads[token];

  // ⏳ Expiry check
  if (Date.now() > record.expires) {
    delete downloads[token];
    return res.status(403).send("Link expired");
  }

  // 🔥 For now: send first file (we can upgrade to ZIP next)
  const filePath = path.resolve(record.files[0]);

  res.download(filePath, (err) => {
    if (err) {
      console.error("Download error:", err);
      res.status(500).send("Download failed");
    }
  });
});

// Checkout session
app.post("/create-checkout-session", async (req, res) => {
  const cart = req.body.cart;

  const line_items = cart.map((item) => ({
    price_data: {
      currency: "gbp",
      product_data: { name: item.name },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      success_url: "https://www.cncdxffiles.co.uk/success.html",
      cancel_url: "https://www.cncdxffiles.co.uk/cart.html",

      // 🔥 Store cart for webhook
      metadata: {
        cart: JSON.stringify(cart)
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err.message);
    res.status(500).send("Checkout session failed");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));