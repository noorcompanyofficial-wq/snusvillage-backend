const mongoose = require("mongoose");

const socialSlideSchema = new mongoose.Schema(
  {
    videoSrc: {
      type: String,
      default: "",
    },
    posterSrc: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    subtitle: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const homepageContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "homepage",
      unique: true,
      index: true,
    },

    social: {
      eyebrow: {
        type: String,
        default: "Social Media",
      },
      heading: {
        type: String,
        default: "See Snus Village In Action",
      },
      description: {
        type: String,
        default:
          "Follow Our Latest Product Drops, In-Store Moments, Promotions, And London Updates Through Our Social Content.",
      },
      instagramUrl: {
        type: String,
        default: "https://www.instagram.com/snusvillage.uk/",
      },
      cardTitle: {
        type: String,
        default: "Follow Our Socials",
      },
      cardText: {
        type: String,
        default:
          "Discover New Stock, Best Sellers, Promotions, Branch Updates, And Behind-The-Scenes Clips From Snus Village.",
      },
      slides: {
        type: [socialSlideSchema],
        default: [
          {
            videoSrc: "/videos/social/social-1.mp4",
            posterSrc: "/images/header/h-1.jpeg",
            title: "New Stock Arrival",
            subtitle: "Latest Product Highlights From Snus Village",
          },
          {
            videoSrc: "/videos/social/social-2.mp4",
            posterSrc: "/images/header/h-2.jpeg",
            title: "In-Store Content",
            subtitle: "Store Moments, Promotions, And Customer Favourites",
          },
          {
            videoSrc: "/videos/social/social-3.mp4",
            posterSrc: "/images/delivery/delivery.jpg",
            title: "London Updates",
            subtitle: "See What Is Happening Across Our Locations",
          },
        ],
      },
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.HomepageContent ||
  mongoose.model("HomepageContent", homepageContentSchema);
