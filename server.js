import { handler } from './build/handler.js'; // SvelteKit's handler
import express from 'express';
import sirv from 'sirv';

const app = express();
const PORT = process.env.PORT || 3000;

// **FIX**: Explicitly serve the 'uploads' directory for dynamically uploaded files.
// Any request starting with '/uploads' will be handled here and mapped to the 'uploads' folder.
app.use('/uploads', sirv('uploads', {
  maxAge: 31536000, // Cache for 1 year in production
  immutable: true
}));

// Let the default SvelteKit handler manage everything else.
// This includes serving build-time assets from the 'static' directory (e.g., favicon).
app.use(handler);

app.listen(PORT, () => {
  console.log(`> Server listening on http://localhost:${PORT}`);
});