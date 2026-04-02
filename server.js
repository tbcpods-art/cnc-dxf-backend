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