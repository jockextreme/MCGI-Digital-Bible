const express = require('express');
const os = require('os');

const router = express.Router();

// GET /api/network-info — LAN addresses this server is reachable at, so the
// operator can open the presenter view on a second device on the same WiFi.
router.get('/', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  res.json({ port: process.env.PORT || 3000, addresses });
});

module.exports = router;
