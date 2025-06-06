export function schemaResource(server) {
    server.resource(
      "omop-schema",
      "omop://schema/cdm",
      async (uri) => ({
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            version: "6.0",
            tables: ["person", "observation_period", "visit_occurrence", "condition_occurrence"],
            status: "placeholder - full schema not loaded"
          })
        }]
      })
    );
  }