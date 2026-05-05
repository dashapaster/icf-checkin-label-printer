const https = require("https");
const { AppError } = require("../errors/AppError");

class ElvantoClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new AppError(
        "Elvanto API key is missing. Please set ELVANTO_SECRET_API_KEY.",
        { code: "MISSING_API_KEY" }
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || "https://api.elvanto.com/v1";
  }

  requestJson(methodPath, payload = null) {
    const endpoint = new URL(`${this.baseUrl.replace(/\/$/, "")}/${methodPath.replace(/^\//, "")}`);
    const body = payload ? JSON.stringify(payload) : "";

    return new Promise((resolve, reject) => {
      const req = https.request(
        endpoint,
        {
          method: payload ? "POST" : "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.apiKey}:x`).toString("base64")}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const responseText = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new AppError("Failed to fetch templates from Elvanto API. Using fallback.", {
                  code: "TEMPLATE_FETCH_FAILED",
                  details: { statusCode: res.statusCode, body: responseText },
                })
              );
              return;
            }

            try {
              resolve(JSON.parse(responseText));
            } catch (error) {
              reject(
                new AppError("Elvanto API unavailable.", {
                  code: "ELVANTO_API_UNAVAILABLE",
                  cause: error,
                })
              );
            }
          });
        }
      );

      req.on("error", (error) => {
        reject(
          new AppError("Elvanto API unavailable.", {
            code: "ELVANTO_API_UNAVAILABLE",
            cause: error,
          })
        );
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  async fetchCheckInLabelTemplates() {
    return {
      supported: false,
      reason:
        "No documented Elvanto API endpoint for Check-In label templates was found in the official API docs.",
      templates: null,
    };
  }
}

module.exports = {
  ElvantoClient,
};
