const { v4: uuidv4 } = require("uuid");

module.exports = (req, res, next) => {
  if (!req.session.cartId) {
    req.session.cartId = uuidv4();
  }
  next();
};
