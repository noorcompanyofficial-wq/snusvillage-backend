exports.isAuth = (req, res, next) => {
  if (!req.session.user) {
    if (req.method === "GET") {
      req.session.returnTo = req.originalUrl;
    }
    return res.redirect("/auth/login");
  }
  next();
};

exports.isGuest = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/auth/dashboard");
  }
  next();
};
