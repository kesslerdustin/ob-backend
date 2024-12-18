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
        
        // Log the request payload
        const requestPayload = {
            contents: [{
                parts: [{ text: fullPrompt }]
            }]
        };
        console.log('Request payload:', JSON.stringify(requestPayload, null, 2));

        const result = await model.generateContent(requestPayload);
        
        // Log the raw response
        console.log('Raw response:', JSON.stringify(result, null, 2));
        
        const response = await result.response;
        console.log('Processed response:', JSON.stringify(response, null, 2));
        
        return response.text();
    } catch (error) {
        console.error('Gemini API error:', error);
        // Log the full error object
        console.error('Full error details:', JSON.stringify(error, null, 2));
        throw error;
    }
}

// Streaming content generation
async function generateContentStream(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        const requestPayload = {
            contents: [{
                parts: [{ text: fullPrompt }]
            }]
        };
        console.log('Stream request payload:', JSON.stringify(requestPayload, null, 2));
        
        const result = await model.generateContentStream(requestPayload);
        return result;
    } catch (error) {
        console.error('Gemini API streaming error:', error);
        console.error('Full stream error details:', JSON.stringify(error, null, 2));
        throw error;
    }
}

module.exports = {
    generateContent,
    generateContentStream
}; 