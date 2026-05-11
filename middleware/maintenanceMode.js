function maintenanceMode(req, res, next) {
  const enabled = process.env.MAINTENANCE_MODE === "true";

  if (!enabled) {
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
