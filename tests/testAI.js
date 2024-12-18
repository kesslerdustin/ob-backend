const aiService = require('../services/aiService');

async function testAI() {
  const prompt = process.argv[2] || "Tell me a short joke about programming";
  const context = process.argv[3] || "";

  console.log('Testing AI with:');
  console.log('Prompt:', prompt);
  if (context) console.log('Context:', context);
  console.log('\nGenerating response...\n');

  try {
    const response = await aiService.generateContent(prompt, context);
    console.log('AI Response:');
    console.log('------------');
    console.log(response);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAI(); 