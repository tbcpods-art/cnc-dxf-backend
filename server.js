import Stripe from "stripe";
import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Payment successful
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // 24-hour expiry
    const expiry = Date.now() + 24 * 60 * 60 * 1000;

    console.log("✅ Payment received");
    console.log("Token:", token);

    // TEMP: just log download link for now
    console.log(
      "Download link:",
      `https://your-app.onrender.com/download?token=${token}`
    );

    // NOTE: DB saving will come next step
  }

  res.json({ received: true });
});

app.get("/download", (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Missing token");
  }

  res.send("Download endpoint reached with token: " + token);
});

const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");
require("dotenv").config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  origin: "https://www.cncdxffiles.co.uk",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
  try {
    const cart = req.body.cart;

    const line_items = cart.map(item => ({
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.name
        },
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
    console.error(err);
    res.status(500).send("Error creating checkout session");
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

app.get("/", (req, res) => {
  res.send("Backend is working ✅");
});
