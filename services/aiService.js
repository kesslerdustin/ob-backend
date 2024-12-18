const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize with specific API version for Gemini 2.0
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY, {
    apiVersion: 'v1alpha'
});

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    config: {
        responseModalities: ["TEXT"]
    }
});

async function generateContent(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        console.log('Sending prompt:', fullPrompt);

        const result = await model.generateContent(fullPrompt);
        console.log('Raw response:', result);
        
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

async function generateContentStream(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        console.log('Sending stream prompt:', fullPrompt);
        
        const result = await model.generateContentStream(fullPrompt);
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