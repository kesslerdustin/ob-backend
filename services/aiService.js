const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize with v2 API version
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY, {
    apiEndpoint: 'https://generativelanguage.googleapis.com/v2',
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
        console.log('Sending prompt to v2 API:', fullPrompt);

        const result = await model.generateContent({
            contents: [{ text: fullPrompt }]
        });
        console.log('Raw response:', JSON.stringify(result, null, 2));
        
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API error:', error);
        // Log the full error for debugging
        console.error('Full error:', JSON.stringify(error, null, 2));
        throw error;
    }
}

async function generateContentStream(prompt, context = '') {
    try {
        const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
        console.log('Sending stream prompt to v2 API:', fullPrompt);
        
        const result = await model.generateContentStream({
            contents: [{ text: fullPrompt }]
        });
        return result;
    } catch (error) {
        console.error('Gemini API streaming error:', error);
        console.error('Full stream error:', JSON.stringify(error, null, 2));
        throw error;
    }
}

module.exports = {
    generateContent,
    generateContentStream
}; 