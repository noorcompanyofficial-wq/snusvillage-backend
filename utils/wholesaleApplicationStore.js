const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "wholesale-applications.json");

async function readApplications() {
  try {
    const data = await fs.readFile(dataFile, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }

    throw err;
  }
}

async function writeApplications(applications) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(applications, null, 2));
}

exports.findAll = async () => {
  const applications = await readApplications();

  return applications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

exports.upsertPending = async (applicationData) => {
  const applications = await readApplications();
  const existingIndex = applications.findIndex(
    (application) => application.email === applicationData.email && application.status === "pending"
  );

  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    applications[existingIndex] = {
      ...applications[existingIndex],
      ...applicationData,
      updatedAt: now,
    };
  } else {
    applications.push({
      _id: randomUUID(),
      ...applicationData,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeApplications(applications);
};

exports.updateStatus = async (id, status, reviewedBy) => {
  const applications = await readApplications();
  const index = applications.findIndex((application) => application._id === id);

  if (index === -1) {
    return null;
  }

  applications[index] = {
    ...applications[index],
    status,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeApplications(applications);
  return applications[index];
};

exports.findApprovedByEmail = async (email) => {
  const applications = await readApplications();

  return applications.find(
    (application) =>
      application.email === email.toLowerCase().trim() && application.status === "approved"
  );
};
