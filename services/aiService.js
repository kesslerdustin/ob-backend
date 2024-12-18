const { genai } = require('@google/generative-ai');
require('dotenv').config();

// Initialize the new Gen AI SDK client
const client = new genai.Client({
    apiKey: process.env.GOOGLE_API_KEY
});

// Regular content generation
async function generateContent(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: fullPrompt
        });
        return response.text;
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

// Streaming content generation
async function generateContentStream(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        return await client.models.generateContentStream({
            model: 'gemini-2.0-flash-exp',
            contents: fullPrompt
        });
    } catch (error) {
        console.error('Gemini API streaming error:', error);
        throw error;
    }
}

module.exports = {
    generateContent,
    generateContentStream
}; 