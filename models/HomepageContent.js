const mongoose = require("mongoose");

const heroSlideSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  bgImageSrc: {
    type: String,
    default: "",
  },
});


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


const locationCardSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "London Branch",
    },
    title: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    mapUrl: {
      type: String,
      default: "",
    },
    mapTitle: {
      type: String,
      default: "",
    },
    buttonText: {
      type: String,
      default: "Ask About Stock",
    },
    buttonLink: {
      type: String,
      default: "/contact",
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
        default: [],
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
            title: "Tobacco-Free Pouches",
            text: "Explore Tobacco-Free Nicotine Pouches And Modern Nicotine Alternatives For Adult Customers.",
            linkText: "Shop Pouches",
            linkUrl: "/shop?category=Nicotine%20Pouches",
            imageSrc: "/images/social/s-4.jpeg",
            darkCard: false,
          },
        ],
      },
    },

    locations: {
      eyebrow: {
        type: String,
        default: "Location",
      },
      heading: {
        type: String,
        default: "Find Snus Village In London",
      },
      description: {
        type: String,
        default:
          "Visit One Of Our London Locations Or Contact The Team Before You Travel For Stock Questions.",
      },
      buttonText: {
        type: String,
        default: "Contact Us",
      },
      buttonLink: {
        type: String,
        default: "/contact",
      },
      cards: {
        type: [locationCardSchema],
        default: [
          {
            label: "London Branch",
            title: "Camden Town",
            description:
              "Central North London Access With A Strong Range Of Best-Selling Products.",
            mapUrl: "https://www.google.com/maps?q=Camden+Town+London&output=embed",
            mapTitle: "Camden Town",
            buttonText: "Ask About Stock",
            buttonLink: "/contact",
          },
          {
            label: "London Branch",
            title: "Oxford Street",
            description:
              "Easy Access For Shoppers Near One Of London’s Busiest Retail Destinations.",
            mapUrl: "https://www.google.com/maps?q=Oxford+Street+London&output=embed",
            mapTitle: "Oxford Street",
            buttonText: "Ask About Stock",
            buttonLink: "/contact",
          },
          {
            label: "London Branch",
            title: "Edgware Road",
            description:
              "Convenient West London Area For Quick Visits And Product Enquiries.",
            mapUrl: "https://www.google.com/maps?q=Edgware+Road+London&output=embed",
            mapTitle: "Edgware Road",
            buttonText: "Ask About Stock",
            buttonLink: "/contact",
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
