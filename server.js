import express from "express";
import Stripe from "stripe";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";
import { Resend } from "resend";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ Webhook
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

      const token = crypto.randomBytes(32).toString("hex");

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
          `
        });

        console.log("📩 Email sent to:", customerEmail);
      }
    }

    // ✅ THIS WAS MISSING
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

// Download endpoint
app.get("/download", (req, res) => {
  res.send("Download endpoint reached");
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