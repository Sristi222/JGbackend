const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

//------------------------------
// 🔐 ENVIRONMENT VARIABLES
//------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "mysecret";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ecommerce";

//------------------------------
// 🧠 MONGOOSE MODELS
//------------------------------
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});
const User = mongoose.model("User", userSchema);

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  image: String,
  date: { type: Date, default: Date.now },
});
const Product = mongoose.model("Product", productSchema);

//------------------------------
// 🔌 CONNECT TO MONGODB
//------------------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

//------------------------------
// 📁 MULTER SETUP
//------------------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//------------------------------
// 🔐 AUTH ROUTES
//------------------------------
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: "User already exists" });
  const hashed = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashed });
  await newUser.save();
  res.status(201).json({ message: "User registered" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Wrong password" });
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, user: { id: user._id, username: user.username } });
});

//------------------------------
// 🛍 PRODUCT ROUTES
//------------------------------
app.get("/api/products", async (req, res) => {
  const products = await Product.find().sort({ date: -1 });
  res.json(products);
});

app.post("/api/products", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const priceNumber = parseFloat(price);
    if (isNaN(priceNumber)) {
      return res.status(400).json({ error: "Price must be a valid number" });
    }

    const image = req.file ? `/uploads/${req.file.filename}` : "";
    const newProduct = new Product({ name, description, price: priceNumber, image });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    console.error("❌ Error adding product:", err.message);
    res.status(500).json({ error: "Error adding product" });
  }
});

// DELETE product by ID
app.delete("/api/products/:id", async (req, res) => {
    try {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Product not found" });
      res.json({ message: "Product deleted" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });
  

//------------------------------
// 🌟 SEED ADMIN USER
//------------------------------
const seedAdmin = async () => {
  const email = "admin@gmail.com";
  const exists = await User.findOne({ email });
  if (!exists) {
    const hashed = await bcrypt.hash("admin123", 10);
    const admin = new User({ username: "Admin", email, password: hashed });
    await admin.save();
    console.log("✅ Admin user created");
  } else {
    console.log("✅ Admin already exists");
  }
};
seedAdmin();

//------------------------------
// 🚀 START SERVER
//------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
