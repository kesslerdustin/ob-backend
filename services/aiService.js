const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize the Gemini API with the new model
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Get the model
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.9,
    }
});

// Regular content generation
async function generateContent(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        const result = await model.generateContent({
            contents: [{
                parts: [{ textPart: fullPrompt }]
            }]
        });
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
        const result = await model.generateContentStream({
            contents: [{
                parts: [{ textPart: fullPrompt }]
            }]
        });
        return result;
    } catch (error) {
        console.error('Gemini API streaming error:', error);
        throw error;
    }
}

module.exports = {
    generateContent,
    generateContentStream
}; 