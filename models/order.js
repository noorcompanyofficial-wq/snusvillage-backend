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
      deliveryService: {
        type: String,
        enum: ["standard", "next_day", "collection"],
        default: "standard",
      },
      deliveryServiceLabel: {
        type: String,
        default: "Standard Delivery",
      },
      deliveryCutoff: {
        type: String,
        default: "",
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

    discount: {
      code: {
        type: String,
        default: "",
      },
      type: {
        type: String,
        default: "",
      },
      value: {
        type: Number,
        default: 0,
      },
      amount: {
        type: Number,
        default: 0,
      },
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

    adminNotes: {
      type: String,
      default: "",
    },

    fulfilmentChecklist: {
      paymentChecked: {
        type: Boolean,
        default: false,
      },
      stockChecked: {
        type: Boolean,
        default: false,
      },
      packed: {
        type: Boolean,
        default: false,
      },
      labelReady: {
        type: Boolean,
        default: false,
      },
      customerNotified: {
        type: Boolean,
        default: false,
      },
    },

    emailNotifications: {
      orderConfirmationSent: {
        type: Boolean,
        default: false,
      },
      orderConfirmationSentAt: {
        type: Date,
        default: null,
      },
      shippingEmailSent: {
        type: Boolean,
        default: false,
      },
      shippingEmailSentAt: {
        type: Date,
        default: null,
      },
      lastOrderEmailError: {
        type: String,
        default: "",
      },
      lastShippingEmailError: {
        type: String,
        default: "",
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
