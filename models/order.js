const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  name: String,
  brand: String,
  image: String,
  quantity: {
    type: Number,
    default: 1,
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    sessionId: {
      type: String,
      default: "",
    },

    customer: {
      email: String,
      firstName: String,
      lastName: String,
      phone: String,
    },

    delivery: {
      country: String,
      address: String,
      city: String,
      postcode: String,
    },

    fulfilment: {
      method: {
        type: String,
        enum: ["delivery", "click_collect"],
        default: "delivery",
      },
      collectionBranch: {
        type: String,
        default: "",
      },
      collectionAddress: {
        type: String,
        default: "",
      },
    },

    items: [orderItemSchema],

    subtotal: {
      type: Number,
      required: true,
    },

    shipping: {
      type: Number,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    orderStatus: {
      type: String,
      enum: ["new", "processing", "packed", "shipped", "completed", "cancelled"],
      default: "new",
    },

    sumup: {
      checkoutId: {
        type: String,
        default: "",
      },
      checkoutReference: {
        type: String,
        default: "",
      },
      checkoutUrl: {
        type: String,
        default: "",
      },
      status: {
        type: String,
        default: "",
      },
      paidAt: {
        type: Date,
        default: null,
      },
      error: {
        type: String,
        default: "",
      },
      fulfilmentFinalised: {
        type: Boolean,
        default: false,
      },
    },

    royalMail: {
      synced: {
        type: Boolean,
        default: false,
      },
      orderIdentifier: {
        type: String,
        default: "",
      },
      orderReference: {
        type: String,
        default: "",
      },
      trackingNumber: {
        type: String,
        default: "",
      },
      syncStatus: {
        type: String,
        enum: ["not_sent", "sent", "failed"],
        default: "not_sent",
      },
      syncError: {
        type: String,
        default: "",
      },
      syncedAt: {
        type: Date,
        default: null,
      },
      labelGenerated: {
        type: Boolean,
        default: false,
      },
      labelPath: {
        type: String,
        default: "",
      },
      labelGeneratedAt: {
        type: Date,
        default: null,
      },
      labelError: {
        type: String,
        default: "",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
