require("dotenv").config();

async function main() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!apiKey) throw new Error("SUMUP_API_KEY is missing from .env");
  if (!merchantCode) throw new Error("SUMUP_MERCHANT_CODE is missing from .env");

  const checkoutReference = `SV-TEST-${Date.now()}`;

  const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checkout_reference: checkoutReference,
      amount: 1.00,
      currency: "GBP",
      merchant_code: merchantCode,
      description: "Snus Village Test Checkout",
      redirect_url: `${baseUrl}/checkout`,
      hosted_checkout: {
        enabled: true
      }
    }),
  });

  const data = await response.json().catch(() => ({}));

  console.log("Status:", response.status);
  console.log("Reference:", checkoutReference);
  console.log("Response:");
  console.log(JSON.stringify(data, null, 2));

  if (!response.ok) {
    process.exit(1);
  }

  if (data.hosted_checkout_url) {
    console.log("\nSUCCESS: SumUp hosted checkout URL created.");
    console.log(data.hosted_checkout_url);
  } else {
    console.log("\nWARNING: Request succeeded but no hosted_checkout_url was returned.");
  }
}

main().catch((error) => {
  console.error("SumUp test failed:");
  console.error(error.message);
  process.exit(1);
});
