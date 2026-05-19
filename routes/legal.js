const express = require("express");
const router = express.Router();

const company = {
  businessName: "Snus Village",
  legalName: "X London Group Ltd",
  companyNumber: "16386545",
  registeredOffice: "339 Oxford Street, London, England, W1S 1SQ",
  email: "hello@snusvillage.com",
  effectiveDate: "19 May 2026",
};

const pages = {
  "/terms-and-conditions": {
    title: "Terms and Conditions",
    intro:
      "These Terms and Conditions apply to the Snus Village website and online store operated by X London Group Ltd.",
    sections: [
      {
        heading: "1. About these Terms",
        body: [
          "By accessing the website, creating an account, placing an order or purchasing from us, you agree to be bound by these Terms and Conditions.",
          "In these Terms, Snus Village, we, us and our mean X London Group Ltd. You and your mean the customer, account holder or website user.",
          "If you do not agree to these Terms, you must not use the website or place an order.",
        ],
      },
      {
        heading: "2. Adult-only products and age restriction",
        body: [
          "Snus Village sells nicotine products and related adult-use products. Our website and products are intended only for adults aged 18 years or over.",
        ],
        list: [
          "By using our website or placing an order, you confirm that you are at least 18 years old.",
          "You must not purchase, attempt to purchase, receive or supply products from us on behalf of anyone under 18.",
          "You must not allow anyone under 18 to access your account, use your payment method, or receive products ordered from us.",
          "Nicotine is addictive. Our products are not suitable for minors, non-nicotine users, pregnant or breastfeeding persons, or anyone advised by a healthcare professional not to use nicotine.",
        ],
        after: [
          "We reserve the right to refuse access, refuse service, cancel orders, suspend accounts or request further information where age, identity, payment, fraud, misuse or compliance checks are required.",
        ],
      },
      {
        heading: "3. Age verification through Didit",
        body: [
          "We use Didit as our age verification provider. You may be required to complete an age or identity verification check before we accept, process, dispatch or deliver your order.",
          "Didit may process personal information required to verify your age and identity. Verification may involve date of birth checks, identity document checks, biometric or liveness checks, database checks, or other verification methods made available by Didit.",
          "If verification is incomplete, fails, or we reasonably believe an order may involve an underage person or misuse, we may cancel the order and refund any eligible payment to the original payment method.",
        ],
      },
      {
        heading: "4. Product information and nicotine warning",
        body: [
          "We aim to ensure product descriptions, strengths, flavours, images, prices and availability are accurate. Manufacturers may change packaging, ingredients, labelling, warnings, cans, pouches, flavours or presentation without notice.",
          "Images are for illustration purposes only and may differ from the product received. You are responsible for reading all product packaging, ingredients, warnings, nicotine strength information and usage guidance before using any product.",
          "Our products are not medicines, medical devices or smoking cessation products unless expressly stated. We do not provide medical advice. Products must be kept out of reach of children and pets.",
        ],
      },
      {
        heading: "5. Orders and acceptance",
        body: [
          "When you place an order, you make an offer to buy the products in your basket. An order is accepted only when we confirm acceptance or dispatch. Automated acknowledgements do not always mean your order has been accepted.",
        ],
        list: [
          "We may refuse, cancel or limit an order if age verification is incomplete or fails.",
          "We may refuse, cancel or limit an order if payment is declined, reversed, flagged or suspected to be unauthorised.",
          "We may refuse, cancel or limit an order if stock is unavailable, pricing is incorrect, product information contains an error, or delivery restrictions apply.",
          "We may refuse, cancel or limit an order where we suspect fraud, resale abuse, unlawful activity, misuse of the website or breach of these Terms.",
        ],
      },
      {
        heading: "6. Prices, payment and SumUp",
        body: [
          "Prices are shown in pounds sterling and include VAT where applicable unless stated otherwise. Delivery charges are displayed at checkout before payment is completed.",
          "We use SumUp as our payment gateway. Payment processing is handled securely by SumUp and/or the relevant card or payment network. We do not store full card details on our website.",
          "You confirm that the payment method used belongs to you or that you have permission to use it. We may carry out fraud-prevention checks and may refuse or cancel orders if payment cannot be verified.",
        ],
      },
      {
        heading: "7. Discount codes and promotions",
        body: [
          "Discount codes, offers and promotions may be changed, suspended or withdrawn at any time. Unless expressly stated, discounts cannot be exchanged for cash, may not be combined with other offers, may not apply to all products, and may be limited to selected customers, products or order values.",
          "We reserve the right to cancel orders or remove discounts where a promotion is used in error, fraudulently, unfairly or contrary to its terms.",
        ],
      },
      {
        heading: "8. Delivery through Royal Mail",
        body: [
          "We use Royal Mail as our delivery service. Delivery options, estimated delivery times and delivery charges will be shown at checkout where available.",
          "Delivery times are estimates and are not guaranteed unless expressly stated. Orders may be delayed by age verification, payment review, stock checks, incorrect address details, courier disruption, weather, strikes, public holidays, customs, or events outside our reasonable control.",
          "Risk in the products passes to you once Royal Mail or another authorised delivery partner confirms delivery, collection, handover or completion of the delivery process at the address or collection point provided.",
        ],
      },
      {
        heading: "9. Failed delivery, incorrect addresses and uncollected parcels",
        body: [
          "You are responsible for providing a complete and accurate delivery address and for monitoring tracking updates. If a parcel cannot be delivered, is refused, is not collected, is returned to sender, or fails because of incomplete information or failed age checks, we may deduct reasonable delivery, return, handling and administration costs from any refund.",
          "An uncollected or refused parcel is not automatically treated as a valid cancellation or return request. If a parcel is delivered to the address provided or lost because the delivery information supplied was incorrect, we may not be able to refund or replace the order.",
        ],
      },
      {
        heading: "10. International orders",
        body: [
          "Where international delivery is offered, you are responsible for checking whether the products can legally be imported, purchased, possessed, supplied or used in the destination country or region.",
          "You are responsible for customs duties, import VAT, taxes, clearance charges, local compliance requirements and any other fees payable in the destination country. We are not responsible if products are delayed, seized, destroyed, returned or refused by customs or local authorities because of destination-country rules.",
        ],
      },
      {
        heading: "11. Cancellations, returns and hygiene-sensitive goods",
        body: [
          "You may have statutory cancellation rights for certain online purchases. However, because our products are nicotine products and may be sealed, consumable, hygiene-sensitive or age-restricted, returns may be limited where products have been opened, used, unsealed, damaged, tampered with or made unsuitable for resale.",
          "To request a return, email hello@snusvillage.com with your order number and reason for return. Returned products must be unopened, unused, sealed where applicable, in original packaging, in resaleable condition and accompanied by proof of purchase.",
          "Unless the product is faulty or incorrect due to our error, you are responsible for return postage. We reserve the right to refuse returns that do not meet this policy or applicable law.",
        ],
      },
      {
        heading: "12. Faulty, damaged or incorrect items",
        body: [
          "If you receive a faulty, damaged or incorrect item, email hello@snusvillage.com as soon as possible with your order number, photos of the item and packaging, and a description of the issue.",
          "If we confirm that the item is faulty, damaged in transit or incorrect due to our error, we may offer a refund, replacement or other appropriate remedy. We may ask you to return the item or keep the packaging while the issue is investigated with Royal Mail or another relevant party.",
        ],
      },
      {
        heading: "13. Refunds",
        body: [
          "Approved refunds are normally issued to the original payment method through SumUp or the relevant payment process. Refund timing may depend on SumUp, your bank, your card provider or your payment method.",
          "We may deduct delivery charges, return costs, handling costs or administration costs where permitted by law, including for failed deliveries, refused parcels, uncollected parcels, incorrect addresses or returns not caused by our error.",
        ],
      },
      {
        heading: "14. Account security and website use",
        body: ["You are responsible for keeping your account login details secure and for all activity under your account. You must not share your account with anyone under 18."],
        list: [
          "You must not use the website for unlawful purposes or to purchase products if you are under 18.",
          "You must not provide false age, identity, payment or delivery information.",
          "You must not interfere with website security or attempt unauthorised access to our systems.",
          "You must not copy, scrape, reproduce or misuse website content without permission.",
        ],
        after: ["We may block access, suspend accounts, cancel orders or take other action where we believe these rules have been breached."],
      },
      {
        heading: "15. Intellectual property",
        body: [
          "All website content, including the Snus Village name, branding, logos, text, images, graphics, page layouts and design elements, belongs to X London Group Ltd, our suppliers or licensors. You may not copy, reproduce, modify, sell, distribute or use our content without written permission.",
        ],
      },
      {
        heading: "16. Liability",
        body: [
          "Nothing in these Terms limits or excludes liability where it would be unlawful to do so. To the fullest extent permitted by law, we are not responsible for indirect losses, loss of profit, loss of business, courier delays, website downtime, incorrect use of products, failure to follow product warnings or instructions, or legal issues caused by importing products into restricted countries.",
          "Our total liability for an order will not exceed the amount paid for that order, except where the law requires otherwise.",
        ],
      },
      {
        heading: "17. Changes to these Terms",
        body: [
          "We may update these Terms from time to time. The latest version will be published on our website with the effective date. Your continued use of the website after changes are published means you accept the updated Terms.",
        ],
      },
      {
        heading: "18. Governing law",
        body: [
          "These Terms are governed by the laws of England and Wales. Any disputes will be subject to the courts of England and Wales, unless consumer protection law gives you the right to bring a claim elsewhere in the UK.",
        ],
      },
      {
        heading: "19. Contact",
        body: ["For questions about these Terms, orders, returns or customer support, contact Snus Village at hello@snusvillage.com."],
      },
    ],
  },
  "/privacy-policy": {
    title: "Privacy Policy",
    intro:
      "This Privacy Policy explains how X London Group Ltd, trading as Snus Village, collects, uses, stores, shares and protects personal information.",
    sections: [
      {
        heading: "1. About this Privacy Policy",
        body: [
          "This Privacy Policy applies when you use our website, create an account, place an order, contact us or interact with our services.",
          "For UK data protection purposes, X London Group Ltd is the controller of the personal information described in this Privacy Policy.",
        ],
      },
      {
        heading: "2. Contact details for privacy matters",
        body: [
          "If you have any questions about this Privacy Policy or wish to exercise your data protection rights, contact us at hello@snusvillage.com or write to X London Group Ltd, 339 Oxford Street, London, England, W1S 1SQ.",
        ],
      },
      {
        heading: "3. Personal information we collect",
        list: [
          "Account, identity and contact details, including name, date of birth, billing address, delivery address, email address, phone number, login details and customer reference details.",
          "Order and transaction information, including order history, products ordered, basket contents, payment status, delivery tracking, returns, refunds, customer service messages and complaint records.",
          "Age verification information required to verify age and identity through Didit, including verification result, identity document information, liveness or biometric check results, audit logs and compliance evidence where needed.",
          "Payment information processed through SumUp. We do not store full card numbers on our website.",
          "Delivery information shared with Royal Mail where needed to deliver your order.",
          "Technical and usage information including IP address, browser type, device type, operating system, pages viewed, referring pages, approximate location, cookie identifiers and session data.",
          "Marketing information, where you subscribe or where the law allows.",
        ],
      },
      {
        heading: "4. How we use personal information",
        list: [
          "To operate the website, manage accounts and provide customer service.",
          "To process orders, take payment through SumUp, dispatch orders and manage delivery through Royal Mail.",
          "To verify age and identity through Didit and prevent underage sales.",
          "To prevent fraud, misuse, unauthorised payments and unlawful activity.",
          "To handle returns, refunds, complaints, disputes and product issues.",
          "To send order confirmations, service messages, delivery updates and customer support replies.",
          "To comply with legal, tax, accounting, age-restriction and regulatory obligations.",
          "To improve our website, products, customer experience, security and business operations.",
          "To send marketing where permitted by law and in line with your preferences.",
        ],
      },
      {
        heading: "5. Lawful bases for processing",
        body: [
          "We process information where necessary for contract performance, legal obligations, legitimate business interests and consent where required.",
          "Legitimate interests may include fraud prevention, website security, customer support, record-keeping, service improvement and protection of our legal position.",
          "You can withdraw consent for certain marketing communications and non-essential cookies at any time.",
        ],
      },
      {
        heading: "6. Age verification through Didit",
        body: [
          "We use Didit to help confirm that customers are aged 18 or over. Didit may process information directly as part of the verification flow and may have its own privacy information explaining how it handles personal data.",
          "We may receive and store the verification outcome and limited audit information needed to prove that a check was completed, failed or requires review.",
          "If verification is incomplete or fails, we may refuse access, cancel an order, request further information or suspend an account.",
        ],
      },
      {
        heading: "7. Payments through SumUp",
        body: [
          "Payments are processed through SumUp. SumUp may collect and process payment information, transaction information, fraud-prevention information and related technical data as necessary to process payments and comply with financial laws.",
          "We receive payment confirmation, transaction references and payment status information. We do not store full payment card details on our website.",
        ],
      },
      {
        heading: "8. Delivery through Royal Mail",
        body: [
          "We share information with Royal Mail where necessary to dispatch, track, deliver, investigate or resolve delivery issues. This may include your name, delivery address, contact details, order reference, tracking details and any delivery instructions.",
        ],
      },
      {
        heading: "9. Marketing",
        body: [
          "We may send marketing emails or messages where you have opted in or where the law allows us to contact existing customers about similar products and services.",
          "You can unsubscribe at any time using the unsubscribe link in our messages or by contacting hello@snusvillage.com. We do not sell personal information to advertisers.",
        ],
      },
      {
        heading: "10. Cookies and similar technologies",
        body: [
          "Our website may use cookies and similar technologies to keep the site working, remember basket and login details, understand site performance, improve user experience, support security and, where permitted, support marketing or analytics.",
          "You can manage cookies through your browser settings and through any cookie controls made available on our website.",
        ],
      },
      {
        heading: "11. Sharing personal information",
        body: [
          "We may share personal information with trusted service providers and third parties where necessary, including Didit, SumUp, Royal Mail, website hosting providers, IT and security providers, analytics providers, email/SMS providers, fraud-prevention services, professional advisers, insurers, regulators, courts, law enforcement and public authorities where required.",
          "We require service providers to handle personal information appropriately and only for authorised purposes.",
        ],
      },
      {
        heading: "12. International transfers",
        body: [
          "Some providers may process personal information outside the UK. Where this happens, we will take appropriate steps designed to protect the information, such as using UK-approved contractual safeguards, adequacy arrangements or other lawful transfer mechanisms where required.",
        ],
      },
      {
        heading: "13. How long we keep information",
        body: [
          "We keep personal information only for as long as necessary for the purposes described in this Privacy Policy, including to fulfil orders, provide support, comply with legal obligations, resolve disputes, prevent fraud and protect our legal position.",
        ],
        list: [
          "Order, tax and accounting records may be kept for up to 6 years or longer if required by law.",
          "Customer service and complaint records may be kept for as long as needed to resolve the issue and protect our legal position.",
          "Age verification records are kept only as long as necessary for compliance, audit, fraud prevention and legal defence.",
          "Marketing records are kept until you unsubscribe, withdraw consent or the information is no longer needed.",
          "Technical logs and analytics records are kept according to operational and security needs.",
        ],
      },
      {
        heading: "14. Security",
        body: [
          "We use reasonable technical and organisational measures designed to protect personal information against unauthorised access, loss, misuse, alteration or disclosure. No website, payment system or online service can be guaranteed to be completely secure, but we work to keep our systems and providers secure.",
        ],
      },
      {
        heading: "15. Your data protection rights",
        body: [
          "Under UK data protection law, you may have rights to access your personal information, request correction, request deletion, restrict processing, object to processing, request data portability, withdraw consent and complain to the Information Commissioner's Office.",
          "These rights do not always apply in every situation. To exercise your rights, contact hello@snusvillage.com. We may need to verify your identity before responding.",
        ],
      },
      {
        heading: "16. Children",
        body: [
          "Our website and products are not intended for anyone under 18. We do not knowingly sell to under-18s. If we believe a person under 18 has used our website, created an account or placed an order, we may delete relevant information, cancel the order and take steps to prevent further access.",
        ],
      },
      {
        heading: "17. Changes to this Privacy Policy",
        body: ["We may update this Privacy Policy from time to time. The latest version will be published on our website with the effective date."],
      },
    ],
  },
  "/shipping-policy": {
    title: "Shipping Policy",
    intro:
      "This Shipping Policy explains how Snus Village handles dispatch, delivery, tracking, failed deliveries, international orders and delivery-related issues.",
    sections: [
      {
        heading: "1. Overview",
        body: [
          "Snus Village is operated by X London Group Ltd. By placing an order, you agree to this Shipping Policy.",
        ],
      },
      {
        heading: "2. Delivery service",
        body: [
          "We use Royal Mail as our delivery service. Delivery options, estimated delivery times and delivery charges will be shown at checkout where available.",
          "Royal Mail delivery times are estimates only and are not guaranteed unless expressly stated. Delivery may be affected by age verification checks, payment review, stock availability, public holidays, courier disruption, weather, strikes, incorrect address details, or events outside our reasonable control.",
        ],
      },
      {
        heading: "3. Order processing and dispatch",
        body: ["We aim to process orders promptly. Orders may be processed on working days and may be delayed if placed after a daily cut-off time, during weekends, during bank holidays, or during periods of high demand."],
        list: [
          "Orders may not be dispatched until payment has been authorised through SumUp.",
          "Orders may not be dispatched until age verification has been completed through Didit where required.",
          "Orders may be delayed if address details are incomplete, stock needs to be checked, or fraud-prevention review is required.",
        ],
      },
      {
        heading: "4. Delivery charges",
        body: [
          "Delivery charges are displayed at checkout before you complete payment. Charges may vary depending on order value, parcel weight, delivery location, selected service and any special handling or age-verification requirements.",
          "Free delivery offers may be introduced, changed or withdrawn and may be subject to minimum order values, product exclusions or promotional conditions.",
        ],
      },
      {
        heading: "5. Age-restricted delivery and verification",
        body: [
          "Because our products are intended only for adults aged 18 or over, orders may be subject to online age verification through Didit and/or delivery checks.",
          "Royal Mail or another delivery agent may refuse delivery if age or identity checks cannot be completed, if no eligible adult is available, if suitable identification cannot be provided where requested, or if delivery would breach courier requirements or applicable law.",
          "If delivery fails because age verification is not completed, we may deduct reasonable delivery, return, handling and administration costs from any refund where permitted by law.",
        ],
      },
      {
        heading: "6. Tracking",
        body: [
          "Where tracking is available, we will send tracking information by email, SMS, website account update or another appropriate method. You are responsible for monitoring tracking updates and following Royal Mail instructions for redelivery, collection or delivery changes.",
        ],
      },
      {
        heading: "7. Delivery address",
        body: [
          "You must provide a complete and accurate delivery address at checkout. We are not responsible for delays, failed deliveries, lost parcels, incorrect delivery or additional costs caused by incorrect, incomplete or outdated address details supplied by you.",
          "If a parcel is returned to us because of an incorrect or incomplete address, we may deduct original delivery, return delivery, handling and administration costs from any refund.",
        ],
      },
      {
        heading: "8. Missed deliveries and collection points",
        body: [
          "If Royal Mail cannot deliver your parcel, it may attempt redelivery, leave instructions, hold the parcel at a collection point or return the parcel to us. You are responsible for arranging redelivery or collecting the parcel within the time stated by Royal Mail.",
          "If you do not collect the parcel and it is returned to us, we may treat it as an uncollected parcel and deduct reasonable costs from any refund.",
        ],
      },
      {
        heading: "9. Uncollected, refused or returned parcels",
        body: [
          "If a parcel is uncollected, refused, rejected, returned to sender or not deliverable, we may deduct reasonable costs from any refund, including original delivery cost, return delivery cost, Royal Mail charges, handling costs and administration costs.",
          "An uncollected or refused parcel is not automatically treated as a valid cancellation or return request.",
        ],
      },
      {
        heading: "10. Lost parcels",
        body: [
          "If you believe your parcel is lost, contact hello@snusvillage.com with your order number and tracking details. We may need to investigate with Royal Mail before issuing any refund or replacement.",
          "If Royal Mail confirms delivery to the address provided, we may not be able to refund or replace the order unless there is evidence of courier error or another issue for which we are responsible.",
        ],
      },
      {
        heading: "11. Damaged parcels",
        body: [
          "If your parcel arrives damaged, contact hello@snusvillage.com as soon as possible with your order number, photos of the outer packaging, photos of the damaged product and a description of the issue.",
          "Please keep the product and packaging until we confirm the next step, as Royal Mail may require evidence during investigation.",
        ],
      },
      {
        heading: "12. Incorrect items",
        body: [
          "If you receive the wrong item, contact hello@snusvillage.com as soon as possible with your order number, photos of the item received and details of what you ordered. If the error is confirmed, we may offer a replacement, refund or another appropriate solution.",
        ],
      },
      {
        heading: "13. International delivery",
        body: [
          "Where international delivery is available, you are responsible for checking that the products can legally be imported, purchased, possessed, supplied and used in the destination country or region.",
          "You are responsible for customs duties, import VAT, taxes, clearance fees, local rules and any documents required by the destination country. We are not responsible if products are delayed, seized, destroyed, returned or refused by customs or local authorities.",
          "If an international parcel is returned to us, we may deduct delivery, return, customs, handling and administration costs from any refund where permitted by law.",
        ],
      },
      {
        heading: "14. Order changes and cancellations before dispatch",
        body: [
          "If you need to cancel or change an order, contact hello@snusvillage.com immediately. We process orders quickly and cannot guarantee that changes or cancellations can be made once an order has been placed, packed, dispatched or handed to Royal Mail.",
          "If your order has already been dispatched, you may need to follow our returns process.",
        ],
      },
      {
        heading: "15. Contact for shipping support",
        body: ["For delivery questions, tracking issues, damaged parcels, missing parcels or incorrect orders, contact Snus Village customer service at hello@snusvillage.com."],
      },
    ],
  },
};

Object.entries(pages).forEach(([path, page]) => {
  router.get(path, (req, res) => {
    res.render("legal/policy", {
      title: page.title,
      page,
      company,
    });
  });
});

module.exports = router;
