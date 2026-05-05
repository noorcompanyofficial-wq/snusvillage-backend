require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function makeAdmin() {
  try {
    const email = process.argv[2];

    if (!email) {
      console.log("Please provide an email address.");
      console.log("Example: node scripts/makeAdmin.js your@email.com");
      process.exit(1);
    }

    if (!process.env.MONGO_URI) {
      console.log("MONGO_URI is missing in .env");
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const user = await User.findOne({ email });

    if (!user) {
      console.log(`No user found with email: ${email}`);
      process.exit(1);
    }

    user.role = "admin";
    await user.save();

    console.log(`${email} is now an admin`);
    process.exit(0);
  } catch (error) {
    console.error("Error making admin:", error.message);
    process.exit(1);
  }
}

makeAdmin();
