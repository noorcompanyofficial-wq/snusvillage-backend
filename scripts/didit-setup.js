require("dotenv").config();

const axios = require("axios");

const API_BASE_URL = "https://verification.didit.me";
const WORKFLOW_LABEL = process.env.DIDIT_WORKFLOW_LABEL || "Standard KYC";

function getClient() {
  if (!process.env.DIDIT_API_KEY) {
    throw new Error("Set DIDIT_API_KEY first.");
  }

  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      "x-api-key": process.env.DIDIT_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function findOrCreateWorkflow(client) {
  const { data } = await client.get("/v3/workflows/");
  const workflows = Array.isArray(data) ? data : data?.results || [];
  const existing = workflows.find((workflow) => workflow.workflow_label === WORKFLOW_LABEL);

  if (existing?.uuid) {
    return existing;
  }

  const response = await client.post("/v3/workflows/", {
    workflow_label: WORKFLOW_LABEL,
    features: [
      { feature: "OCR" },
      { feature: "LIVENESS", config: { face_liveness_method: "PASSIVE" } },
      { feature: "FACE_MATCH" },
      { feature: "IP_ANALYSIS" },
    ],
  });

  return response.data;
}

async function createWebhookDestination(client) {
  if (!process.env.DIDIT_WEBHOOK_URL) {
    return null;
  }

  const { data } = await client.post("/v3/webhook/destinations/", {
    url: process.env.DIDIT_WEBHOOK_URL,
    label: process.env.DIDIT_WEBHOOK_LABEL || "production",
    subscribed_events: ["status.updated", "data.updated"],
  });

  return data;
}

async function main() {
  const client = getClient();
  const workflow = await findOrCreateWorkflow(client);

  console.log("DIDIT_WORKFLOW_ID=" + workflow.uuid);

  const webhook = await createWebhookDestination(client);
  if (webhook?.secret_shared_key) {
    console.log("DIDIT_WEBHOOK_SECRET=" + webhook.secret_shared_key);
  } else {
    console.log("Set DIDIT_WEBHOOK_URL to register /api/webhooks/didit.");
  }
}

main().catch((error) => {
  console.error(error.response?.data || error.message);
  process.exit(1);
});
