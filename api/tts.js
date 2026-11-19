import crypto from "crypto";

const EDGE_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const VOICE_PROFILES = {
  cloud_lea: { edge: "fr-FR-DeniseNeural", pitch: "+2Hz", lang: "fr-FR" },
  cloud_celine: { edge: "fr-FR-EloiseNeural", pitch: "+4Hz", lang: "fr-FR" },
  cloud_henri: { edge: "fr-FR-HenriNeural", pitch: "-2Hz", lang: "fr-FR" },
  cloud_lucas: { edge: "fr-FR-RemyMultilingualNeural", pitch: "-5Hz", lang: "fr-FR" },
  cloud_mathieu: { edge: "fr-CA-AntoineNeural", pitch: "-2Hz", lang: "fr-FR" },
  pt_antonio: { edge: "pt-BR-AntonioNeural", pitch: "0Hz", lang: "pt-BR" },
  pt_francisca: { edge: "pt-BR-FranciscaNeural", pitch: "+2Hz", lang: "pt-BR" }
};

function synthesizeViaEdgeWebSocket(text, voiceName, rateStr, pitchStr, langCode) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      return reject(new Error("WebSocket not available in runtime"));
    }

    const reqId = crypto.randomBytes(16).toString("hex");
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_TOKEN}&ConnectionId=${reqId}`;

    let ws;
    const chunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws && ws.close(); } catch (e) {}
        reject(new Error("Edge TTS WebSocket timeout"));
      }
    }, 6500);

    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
    } catch (err) {
      clearTimeout(timer);
      return reject(err);
    }

    ws.onopen = () => {
      const ts = new Date().toISOString();
      const configMsg =
        `X-Timestamp:${ts}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });
      ws.send(configMsg);

      const escapedText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'><voice name='${voiceName}'><prosody rate='${rateStr}' pitch='${pitchStr}'>${escapedText}</prosody></voice></speak>`;
      const ssmlMsg =
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${ts}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === "string") {
        if (data.includes("Path:turn.end")) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch (e) {}
            const total = Buffer.concat(chunks);
            if (total.length > 200) resolve(total);
            else reject(new Error("Empty Edge audio stream"));
          }
        }
      } else if (data instanceof ArrayBuffer) {
        const buf = Buffer.from(data);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          const audioStart = 2 + headerLen;
          if (audioStart < buf.length) {
            chunks.push(buf.subarray(audioStart));
          }
        }
      }
    };

    ws.onerror = (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err || new Error("Edge WebSocket error"));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const total = Buffer.concat(chunks);
        if (total.length > 200) resolve(total);
        else reject(new Error("Edge WebSocket closed early"));
      }
    };
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const text = String(req.query.text || "").trim().slice(0, 450);
  const voiceKey = String(req.query.voice || "cloud_lea");
  const rateNum = parseFloat(req.query.rate || "0.95");

  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  const profile = VOICE_PROFILES[voiceKey] || VOICE_PROFILES.cloud_lea;

  let rateOffset = Math.round((rateNum - 0.96) * 90);
  rateOffset = Math.max(-45, Math.min(35, rateOffset));
  const rateStr = (rateOffset >= 0 ? "+" : "") + rateOffset + "%";

  try {
    const mp3Buffer = await synthesizeViaEdgeWebSocket(text, profile.edge, rateStr, profile.pitch, profile.lang);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-TTS-Engine", "edge-neural-ws");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    return res.status(200).send(mp3Buffer);
  } catch (e) {}

  // Fallback Google Translate
  try {
    const slowFlag = rateNum < 0.78 ? "&ttsspeed=0.35" : "";
    const gUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${profile.lang}${slowFlag}&q=${encodeURIComponent(text)}`;
    const gResp = await fetch(gUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://translate.google.com/"
      }
    });
    if (gResp.ok) {
      const gBuf = await gResp.arrayBuffer();
      if (gBuf && gBuf.byteLength > 200) {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Engine", "google-neural-tts");
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
        return res.status(200).send(Buffer.from(gBuf));
      }
    }
  } catch (e) {}

  return res.status(502).json({ error: "TTS upstream unavailable" });
}
