const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Hello from inside the container!' });
});

app.listen(PORT, () => {
  console.log(`Application listening on port ${PORT}`);
});
