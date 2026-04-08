module.exports = function isAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/auth/login");
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).send("403 Forbidden - Admins only");
  }

  next();
};
