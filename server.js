const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Serve the main player app from /docs
app.use(express.static(path.join(__dirname, 'docs')));

// SPA fallback — unknown paths return index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rocket Crown running on port ${PORT}`);
});
