require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------
// ☁️ Cloudinary Config
// ------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ------------------------------
// 🧠 MongoDB Models
// ------------------------------
const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model("User", userSchema);

const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  date: { type: Date, default: Date.now },
});
const Product = mongoose.model("Product", productSchema);

// ------------------------------
// 🔐 Auth Routes
// ------------------------------
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashed });
    await newUser.save();
    res.status(201).json({ message: "User registered" });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------
// 🛒 Product Routes
// ------------------------------
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ date: -1 });
    res.json(products);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: "products" }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

app.post("/api/products", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, category } = req.body;
    const priceNumber = parseFloat(price);
    if (isNaN(priceNumber)) return res.status(400).json({ error: "Price must be a valid number" });

    let imageUrl = "";
    if (req.file) {
      const cloudResult = await uploadToCloudinary(req.file.buffer);
      imageUrl = cloudResult.secure_url;
    }

    const newProduct = new Product({ name, description, price: priceNumber, category, image: imageUrl });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    console.error("❌ Error adding product:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/products/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, category } = req.body;
    const priceNumber = parseFloat(price);
    if (isNaN(priceNumber)) return res.status(400).json({ error: "Price must be a valid number" });

    const updateData = { name, description, price: priceNumber, category };

    if (req.file) {
      const cloudResult = await uploadToCloudinary(req.file.buffer);
      updateData.image = cloudResult.secure_url;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ------------------------------
// 🌟 Admin Seeding
// ------------------------------
const seedAdmin = async () => {
  const email = "admin@gmail.com";
  const exists = await User.findOne({ email });
  if (!exists) {
    const hashed = await bcrypt.hash("admin123", 10);
    await new User({ username: "Admin", email, password: hashed }).save();
    console.log("✅ Admin user created");
  }
};

// ------------------------------
// 🚀 Connect to MongoDB Atlas and Start Server
// ------------------------------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("✅ Connected to MongoDB Atlas");
    await seedAdmin();
    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => console.error("❌ MongoDB Atlas connection error:", err));
