const aiService = require('../services/aiService');

async function testAI() {
  const mode = process.argv[2] || "text"; // text, vision, search
  const prompt = process.argv[3] || "Tell me a short joke about programming";
  const imageUrl = process.argv[4] || ""; // Only used for vision mode

  console.log('Testing AI with:');
  console.log('Mode:', mode);
  console.log('Prompt:', prompt);
  if (imageUrl) console.log('Image URL:', imageUrl);
  console.log('\nGenerating response...\n');

  try {
    let response;
    switch (mode) {
      case 'vision':
        response = await aiService.analyzeImage(prompt, imageUrl);
        break;
      case 'search':
        const searchResponse = await aiService.searchAndGenerate(prompt);
        const searchData = JSON.parse(searchResponse).data;
        console.log('AI Response:');
        console.log('------------');
        console.log(searchData.text);
        console.log('\nSearch Results:');
        console.log('---------------');
        console.log(searchData.search_data);
        return; // Early return to avoid duplicate logging
      default: // text
        response = await aiService.generateContent(prompt);
    }

    console.log('AI Response:');
    console.log('------------');
    console.log(response);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAI(); 