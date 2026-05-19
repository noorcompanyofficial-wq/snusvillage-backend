const mongoose = require("mongoose");

const heroSlideSchema = new mongoose.Schema(
  {
    kicker: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    buttonText: {
      type: String,
      default: "",
    },
    buttonLink: {
      type: String,
      default: "",
    },
    imageSrc: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);


const collectionCardSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    text: {
      type: String,
      default: "",
    },
    linkText: {
      type: String,
      default: "",
    },
    linkUrl: {
      type: String,
      default: "",
    },
    imageSrc: {
      type: String,
      default: "",
    },
    darkCard: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

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

const distroImageSchema = new mongoose.Schema(
  {
    imageSrc: {
      type: String,
      default: "",
    },
    alt: {
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

    hero: {
      slides: {
        type: [heroSlideSchema],
        default: [
          {
            kicker: "Featured Collection",
            title: "White Fox",
            buttonText: "Shop White Fox",
            buttonLink: "/shop?brand=White%20Fox",
            imageSrc: "/images/header/h-1.jpeg",
          },
          {
            kicker: "Best Sellers",
            title: "Premium Brands",
            buttonText: "Browse Brands",
            buttonLink: "/shop",
            imageSrc: "/images/header/h-2.jpeg",
          },
          {
            kicker: "London Retail",
            title: "Visit Our Stores",
            buttonText: "Find Branches",
            buttonLink: "#shops",
            imageSrc: "/images/delivery/delivery.jpg",
          },
        ],
      },
    },

    distro: {
      kicker: {
        type: String,
        default: "Distribution Hub",
      },
      title: {
        type: String,
        default: "SVG Distro",
      },
      address: {
        type: String,
        default: "Snus Village Charles House, Southall",
      },
      description: {
        type: String,
        default:
          "Our Southall Location Supports Stock Availability, Trade Enquiries, Local Distribution, And Product Support For Adult Customers And Approved Traders.",
      },
      buttonText: {
        type: String,
        default: "Contact For Details",
      },
      buttonLink: {
        type: String,
        default: "/contact",
      },
      badges: {
        type: [String],
        default: ["Stock Support", "Trade Enquiries", "Southall", "18+ Only"],
      },
      images: {
        type: [distroImageSchema],
        default: [
          {
            imageSrc: "/images/header/h-1.jpeg",
            alt: "SVG Distro Location Image 1",
          },
          {
            imageSrc: "/images/header/h-2.jpeg",
            alt: "SVG Distro Location Image 2",
          },
          {
            imageSrc: "/images/delivery/delivery.jpg",
            alt: "SVG Distro Location Image 3",
          },
        ],
      },
    },

    collections: {
      eyebrow: {
        type: String,
        default: "Collections",
      },
      heading: {
        type: String,
        default: "Shop By Strength, Flavour, And Brand",
      },
      description: {
        type: String,
        default:
          "Move Quickly From Your Preferred Flavour To The Strength, Brand, And Product Type That Fits Your Preference.",
      },
      buttonText: {
        type: String,
        default: "Open Shop",
      },
      buttonLink: {
        type: String,
        default: "/shop",
      },
      cards: {
        type: [collectionCardSchema],
        default: [
          {
            number: "01",
            title: "Mint Favourites",
            text: "Clean, Cool, And Reliable Flavour Profiles From Leading Nicotine Pouch Brands.",
            linkText: "Shop Mint",
            linkUrl: "/shop?flavour=mint",
            imageSrc: "/images/social/s-1.jpeg",
            darkCard: false,
          },
          {
            number: "02",
            title: "Strong Selections",
            text: "Higher Strength Products For Adult Customers Who Know Exactly What They Want.",
            linkText: "Shop Strong",
            linkUrl: "/shop?strength=STRONG",
            imageSrc: "/images/social/s-6.jpeg",
            darkCard: false,
          },
          {
            number: "03",
            title: "Fruity Flavours",
            text: "Berry, Citrus, Cola, Tropical, And Sweet Profiles For A Brighter Choice.",
            linkText: "Shop Flavours",
            linkUrl: "/shop",
            imageSrc: "/images/social/s-10.jpeg",
            darkCard: false,
          },
          {
            number: "04",
            title: "Vape Range",
            text: "Explore Vape Products, New Arrivals, And Fast-Moving Stock From Snus Village.",
            linkText: "Shop Vape",
            linkUrl: "/collections/vapes",
            imageSrc: "",
            darkCard: true,
          },
        ],
      },
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
