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

// ==========================
// ✅ WEBHOOK
// ==========================
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

    console.log("🔥 Webhook hit:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("✅ Payment received");

      const cart = JSON.parse(session.metadata.cart || "[]");

      const token = crypto.randomBytes(32).toString("hex");

      const files = [];

      cart.forEach((item) => {
        const filePath = productFiles[item.id];
        if (filePath) {
          files.push(filePath);
        } else {
          console.log("❌ Missing product mapping for:", item.id);
        }
      });

      downloads[token] = {
        files,
        expires: Date.now() + 24 * 60 * 60 * 1000,
        sessionId: session.id
      };

      // 🔗 Link token to session

      const downloadLink = `https://cnc-dxf-backend.onrender.com/download?token=${token}`;

      console.log("🔗 Download link:", downloadLink);

      const customerEmail = session.customer_details?.email;

     if (customerEmail) {
  await resend.emails.send({
    from: "sales@cncdxffiles.co.uk",
    to: customerEmail,
    subject: "Your Download Link",
    html: `
      <h2>Thanks for your purchase 🎉</h2>

      <p>Your download link is valid for 24 hours:</p>

      <a href="https://cnc-dxf-backend.onrender.com/download?token=${token}"
         style="display:inline-block;padding:12px 20px;background:#28a745;color:#fff;text-decoration:none;border-radius:6px;">
         ⬇️ Download Your Files
      </a>
    `
  });

        console.log("📩 Email sent to:", customerEmail);
      }
    }

    res.json({ received: true });
  }
);

// ==========================
// ✅ NORMAL MIDDLEWARE
// ==========================
app.use(express.json());
app.use(cors());

// ==========================
// TEST
// ==========================
app.get("/", (req, res) => {
  res.send("Backend is working ✅");
});

// ==========================
// GET TOKEN FROM SESSION
// ==========================
app.get("/get-download-token", (req, res) => {
  const { session_id } = req.query;

  const entry = Object.entries(downloads).find(
    ([token, data]) => data.sessionId === session_id
  );

  if (!entry) {
    return res.status(404).json({ error: "Token not found" });
  }

  const [token] = entry;

  res.json({ token });
});

// ==========================
// DOWNLOAD
// ==========================
import archiver from "archiver";

app.get("/download", (req, res) => {
  const { token } = req.query;

  if (!token || !downloads[token]) {
    return res.status(404).send("Invalid or expired link");
  }

  const record = downloads[token];

  if (Date.now() > record.expires) {
    delete downloads[token];
    return res.status(403).send("Link expired");
  }

  const files = record.files;

  if (!files || files.length === 0) {
    return res.status(500).send("No files found for this order");
  }

  // Set the filename for the zip
  res.setHeader("Content-Disposition", `attachment; filename="cnc-dxf-files.zip"`);

  // Create a zip stream
  const archive = archiver("zip", { zlib: { level: 9 } });

  // Pipe archive data to the response
  archive.pipe(res);

  // Append all files
  files.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: path.basename(file) });
    }
  });

  // Finalize the archive
  archive.finalize();

  archive.on("error", err => {
    console.error("Zip error:", err);
    res.status(500).send("Failed to create zip");
  });
});

// ==========================
// STRIPE CHECKOUT
// ==========================
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

      success_url:
        "https://www.cncdxffiles.co.uk/success.html?session_id={CHECKOUT_SESSION_ID}",

      cancel_url: "https://www.cncdxffiles.co.uk/cart.html",

      metadata: {
        cart: JSON.stringify(cart)
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).send("Checkout failed");
  }
});

// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));