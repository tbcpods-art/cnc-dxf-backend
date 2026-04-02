import Stripe from "stripe";
import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// JSON middleware (for normal routes)
app.use(express.json());

// CORS (optional if needed)
import cors from "cors";
app.use(cors({
  origin: "https://www.cncdxffiles.co.uk",
  methods: ["GET", "POST"]
}));

// Checkout session route
app.post("/create-checkout-session", async (req, res) => {
  try {
    const cart = req.body.cart;

    const line_items = cart.map(item => ({
      price_data: {
        currency: "gbp",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.qty
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: "https://www.cncdxffiles.co.uk/success.html",
      cancel_url: "https://www.cncdxffiles.co.uk/cart.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).send("Error creating checkout session");
  }
});

// Webhook (MUST use raw body)
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = Date.now() + 24 * 60 * 60 * 1000;

    console.log("Payment received");
    console.log("Token:", token);
  }

  res.json({ received: true });
});

// Download route
app.get("/download", (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).send("Missing token");

  res.send("Token: " + token);
});

// Test route
app.get("/", (req, res) => {
  res.send("Backend is working ✅");
});

app.listen(3000, () => console.log("Server running on port 3000"));