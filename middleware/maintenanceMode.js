function maintenanceMode(req, res, next) {
  const enabled = process.env.MAINTENANCE_MODE === "true";

  if (!enabled) {
    return next();
  }

  const previewPassword = process.env.PREVIEW_PASSWORD || "";
  const previewQuery = req.query.preview;

  if (previewPassword && previewQuery && previewQuery === previewPassword) {
    req.session.maintenancePreview = true;
    return res.redirect(req.path === "/" ? "/" : req.path);
  }

  if (req.session?.maintenancePreview === true) {
    return next();
  }

  const allowedPaths = [
    "/maintenance",
    "/auth",
    "/admin",
    "/css",
    "/js",
    "/images",
    "/uploads",
    "/favicon.ico",
  ];

  const isAllowed = allowedPaths.some((path) => req.path.startsWith(path));

  if (isAllowed) {
    return next();
  }

  return res.status(503).render("maintenance/maintenance", {
    layout: false,
    title: "Snus Village Coming Soon",
  });
}

module.exports = maintenanceMode;
