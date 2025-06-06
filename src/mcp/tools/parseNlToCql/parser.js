import llmService from '../../../services/llmService.js';

export async function parseToCql(query) {
  try {
    const messages = [
      { 
        role: "system", 
        content: "You are a medical query parser. Convert the natural language medical query to a valid CQL (Clinical Quality Language) query. Return only the CQL code without any explanation."
      },
      { role: "user", content: query }
    ];
    
    const response = await llmService.createCompletion(messages);
    return response.content;
  } catch (error) {
    console.error("Error parsing to CQL:", error);
    throw new Error("Failed to parse natural language to CQL");
  }
}