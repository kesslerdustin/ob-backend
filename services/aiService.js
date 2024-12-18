const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Regular content generation
async function generateContent(prompt, context = '') {
  try {
    const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

// Streaming content generation
async function generateContentStream(prompt, context = '') {
  try {
    const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
    return await model.generateContentStream(fullPrompt);
  } catch (error) {
    console.error('Gemini API streaming error:', error);
    throw error;
  }
}

module.exports = {
  generateContent,
  generateContentStream
}; 