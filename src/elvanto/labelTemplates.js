const { AppError } = require("../errors/AppError");
const { ElvantoClient } = require("./client");

const FALLBACK_TEMPLATES = {
  volunteer: {
    labelName: "Volunteers Only Label",
    template:
      "[b][size=25][firstname][/size][/b][size=40]\n[custom_2e7042fd-2632-4312-83a2-48324dc4394f]",
  },
  child: {
    labelName: "Children Only Label",
    template:
      "[b][fullname][/b] [size=16]#[security_code][/size]\n[age]years [mobile]\n[checkin_room]\n[checkin_service_date]",
  },
  parent: {
    labelName: "Children Only Parent Label",
    template:
      "[b][fullname][/b] [size=16]#[security_code][/size]\nPray and Play 17:30 pick up\n\n2nd service 19:15 pick up\n[checkin_room]\n[checkin_service_date][checkin_service_time]",
  },
};

let cachedTemplates = null;

async function loadLabelTemplates(options = {}) {
  if (cachedTemplates) {
    return cachedTemplates;
  }

  const logger = options.logger || console;
  const apiKey = options.apiKey || process.env.ELVANTO_SECRET_API_KEY;
  if (!apiKey) {
    logger.log("Using fallback templates");
    cachedTemplates = {
      source: "fallback",
      templates: FALLBACK_TEMPLATES,
    };
    return cachedTemplates;
  }

  const client = new ElvantoClient(apiKey, options.clientOptions);

  try {
    const result = await client.fetchCheckInLabelTemplates();
    if (
      result &&
      result.supported &&
      result.templates &&
      result.templates.volunteer &&
      result.templates.child &&
      result.templates.parent
    ) {
      logger.log("Templates loaded from Elvanto API");
      cachedTemplates = {
        source: "api",
        templates: result.templates,
      };
      return cachedTemplates;
    }
  } catch (error) {
    if (logger.warn) {
      logger.warn("Failed to fetch templates from Elvanto API. Using fallback.");
    }
  }

  logger.log("Using fallback templates");
  cachedTemplates = {
    source: "fallback",
    templates: FALLBACK_TEMPLATES,
  };
  return cachedTemplates;
}

module.exports = {
  FALLBACK_TEMPLATES,
  loadLabelTemplates,
};
