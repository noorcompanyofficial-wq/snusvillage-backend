require("dotenv").config();

const axios = require("axios");

const AUTH_BASE_URL = "https://apx.didit.me";

async function main() {
  const command = process.argv[2];
  const email = process.env.DIDIT_ACCOUNT_EMAIL;
  const password = process.env.DIDIT_ACCOUNT_PASSWORD;

  if (!command || !["register", "verify"].includes(command)) {
    throw new Error("Usage: npm run didit:account -- register|verify");
  }

  if (!email || !password) {
    throw new Error("Set DIDIT_ACCOUNT_EMAIL and DIDIT_ACCOUNT_PASSWORD first.");
  }

  if (command === "register") {
    await axios.post(`${AUTH_BASE_URL}/auth/v2/programmatic/register/`, {
      email,
      password,
    });

    console.log(`Didit sent a verification code to ${email}.`);
    return;
  }

  const code = process.env.DIDIT_EMAIL_CODE;
  if (!code) {
    throw new Error("Set DIDIT_EMAIL_CODE to the 6-character code from the inbox.");
  }

  const { data } = await axios.post(`${AUTH_BASE_URL}/auth/v2/programmatic/verify-email/`, {
    email,
    code,
  });

  const apiKey = data?.application?.api_key;
  if (!apiKey) {
    throw new Error("Didit did not return application.api_key.");
  }

  console.log("DIDIT_API_KEY=" + apiKey);
}

main().catch((error) => {
  console.error(error.response?.data || error.message);
  process.exit(1);
});
