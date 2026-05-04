const User = require("../models/User");

module.exports = async function isAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/auth/login");
  }

  try {
    const user = await User.findById(req.session.user._id);

    if (!user) {
      return res.redirect("/auth/login");
    }

    req.session.user = user;
    res.locals.user = user;

    if (user.role !== "admin") {
      return res.status(403).send("403 Forbidden - Admins only");
    }

    next();
  } catch (err) {
    console.log("Admin check error:", err.message);
    res.status(500).send("Admin check failed");
  }
};
