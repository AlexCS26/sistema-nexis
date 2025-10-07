// config/deepseek.js
const OpenAI = require("openai");
require("dotenv").config();

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY, // en tu .env
});

module.exports = deepseek;
