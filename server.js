require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.static(__dirname));

// Verify the logged-in user's Supabase access token.
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Please login first." });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Session invalid. Please login again." });
    }

    req.user = data.user;
    next();

  } catch (error) {
    console.error("Authentication error:", error.message);
    res.status(401).json({ error: "Authentication failed." });
  }
}

// Protected YouTube channel API
app.get("/api/channel", requireAuth, async (req, res) => {
  try {
    const handle = req.query.handle;

    if (!handle) {
      return res.status(400).json({ error: "YouTube handle required" });
    }

    if (!API_KEY) {
      return res.status(500).json({ error: "YouTube API key missing" });
    }

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels" +
      `?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${API_KEY}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "YouTube API error"
      });
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const channel = data.items[0];

    const subscribers = channel.statistics.hiddenSubscriberCount
      ? null
      : Number(channel.statistics.subscriberCount);

    if (subscribers !== null) {
      const { data: recent, error: readError } = await supabase
        .from("subscriber_history")
        .select("recorded_at")
        .eq("channel_id", channel.id)
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (readError) throw readError;

      const lastSaved = recent?.[0]?.recorded_at;
      const oneHour = 60 * 60 * 1000;

      if (!lastSaved || Date.now() - new Date(lastSaved).getTime() >= oneHour) {
        const { error: insertError } = await supabase
          .from("subscriber_history")
          .insert({
            channel_id: channel.id,
            channel_name: channel.snippet.title,
            subscriber_count: subscribers
          });

        if (insertError) throw insertError;
      }
    }

    res.json({
      channelId: channel.id,
      name: channel.snippet.title,
      subscribers: subscribers ?? "Hidden",
      views: channel.statistics.viewCount,
      videos: channel.statistics.videoCount,
      thumbnail: channel.snippet.thumbnails.default.url
    });

  } catch (error) {
    console.error("Channel error:", error.message);
    res.status(500).json({ error: "Unable to fetch or save channel data" });
  }
});

// Protected subscriber history API
app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const channelId = req.query.channelId;

    if (!channelId) {
      return res.status(400).json({ error: "Channel ID required" });
    }

    const { data, error } = await supabase
      .from("subscriber_history")
      .select("subscriber_count, recorded_at")
      .eq("channel_id", channelId)
      .order("recorded_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    res.json(data);

  } catch (error) {
    console.error("History error:", error.message);
    res.status(500).json({ error: "Unable to fetch history" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
