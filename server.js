require("dotenv").config();

const express = require("express");
const app = express();

const PORT = 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.static(__dirname));

app.get("/api/channel", async (req, res) => {
  try {
    const handle = req.query.handle;

    if (!handle) {
      return res.status(400).json({
        error: "YouTube channel handle required"
      });
    }

    if (!API_KEY) {
      return res.status(500).json({
        error: "API key not configured"
      });
    }

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels" +
      `?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${API_KEY}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({
        error: "Channel not found"
      });
    }

    const channel = data.items[0];

    res.json({
      name: channel.snippet.title,
      subscribers: channel.statistics.subscriberCount ?? "Hidden",
      views: channel.statistics.viewCount,
      videos: channel.statistics.videoCount,
      thumbnail: channel.snippet.thumbnails.default.url
    });

  } catch (error) {
    res.status(500).json({
      error: "Something went wrong"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});