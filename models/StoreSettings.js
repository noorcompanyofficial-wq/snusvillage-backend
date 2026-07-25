const mongoose = require("mongoose");

const storeSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "store",
      unique: true,
      index: true,
    },

    storeName: {
      type: String,
      default: "Snus Village",
    },

    storeEmail: {
      type: String,
      default: "info@snusvillage.co.uk",
    },

    storePhone: {
      type: String,
      default: "+44 7777 222771",
    },

    instagramUrl: {
      type: String,
      default: "https://www.instagram.com/snusvillage.uk/",
    },

    deliveryPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    freeDeliveryThreshold: {
      type: Number,
      default: 0,
      min: 0,
    },

    checkoutNotice: {
      type: String,
      default: "You Will Be Redirected To SumUp To Complete Your Card Payment Securely.",
    },

    ageGateMessage: {
      type: String,
      default: "You Must Be 18+ To Enter This Website.",
    },

    clickCollectBranch: {
      type: String,
      default: "Edgware Road",
    },

    clickCollectAddress: {
      type: String,
      default: "SNUS VILLAGE, EDGWARE ROAD, TYBURNIA, London, W2 2HX",
    },

    clickCollectCity: {
      type: String,
      default: "London",
    },

    clickCollectPostcode: {
      type: String,
      default: "W2 2HX",
    },

    maintenanceMode: {
      type: Boolean,
      default: false,
    },

    hideVapesCategory: {
      type: Boolean,
      default: true,
    },

    maintenanceMessage: {
      type: String,
      default: "Snus Village is currently updating the website. Please check back soon.",
    },

    promoPopupEnabled: {
      type: Boolean,
      default: true,
    },

    promoPopupDelaySeconds: {
      type: Number,
      default: 20,
      min: 0,
    },

    promoPopupHeading: {
      type: String,
      default: "Welcome to Snus Village!",
    },

    promoPopupBody: {
      type: String,
      default: "Enjoy 10% off your first order, on us.",
    },

    promoPopupCode: {
      type: String,
      default: "WELCOME10",
    },

    promoPopupButtonText: {
      type: String,
      default: "Shop Now",
    },

    promoPopupButtonLink: {
      type: String,
      default: "/shop",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.StoreSettings ||
  mongoose.model("StoreSettings", storeSettingsSchema);
