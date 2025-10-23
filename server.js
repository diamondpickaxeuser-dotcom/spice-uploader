const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

// Load Firebase service account
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_BUCKET,
});

const bucket = admin.storage().bucket();

// Environment variables
const PROXMOX_HOST = process.env.PRODIGY_4XIST;
const PROXMOX_TOKEN = process.env.PRODIGY_TOKEN;

app.get("/spice", async (req, res) => {
  const { node, vmid } = req.query;
  if (!node || !vmid) return res.status(400).send("Missing node or vmid");

  try {
    // Request SPICE proxy info from Proxmox
    const spiceRes = await axios.post(
      `${PROXMOX_HOST}/api2/json/nodes/${node}/qemu/${vmid}/spiceproxy`,
      {},
      { headers: { Authorization: PROXMOX_TOKEN } }
    );

    const spiceData = `[virt-viewer]
type=spice
host=${spiceRes.data.data.host}
proxy=${spiceRes.data.data.proxy}
tls-port=${spiceRes.data.data["tls-port"]}
vmname=${spiceRes.data.data.vmname}
`;

    const filename = `vm-${vmid}.spice`;
    const localPath = path.join(__dirname, filename);
    fs.writeFileSync(localPath, spiceData);

    // Upload to Firebase Storage
    await bucket.upload(localPath, {
      destination: `spice-files/${filename}`,
      public: true,
    });

    fs.unlinkSync(localPath); // Clean up local file

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/spice-files/${filename}`;
    res.json({ downloadUrl: publicUrl });
  } catch (err) {
    console.error("SPICE generation failed:", err.message);
    res.status(500).send("Failed to generate SPICE file");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
