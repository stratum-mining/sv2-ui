import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SV2 backend listening on port ${PORT}`);
});
