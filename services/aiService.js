const { spawn } = require('child_process');
const path = require('path');
const rateLimiter = require('./rateLimiter');

async function generateContent(prompt, context = '') {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const pythonProcess = spawn('python', [pythonScript, 'text', fullPrompt]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function generateContentStream(prompt, context = '') {
    // For now, we'll use non-streaming version as base implementation
    const response = await generateContent(prompt, context);
    return {
        stream: [{
            text: () => response
        }]
    };
}

async function searchAndGenerate(prompt) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const pythonProcess = spawn('python', [pythonScript, 'search', prompt]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(JSON.stringify(response));
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeImage(prompt, imageUrl, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = typeof options === 'string' ? options : JSON.stringify(options);
            console.log('aiService sending options:', optionsStr);
            
            const pythonProcess = spawn('python', [
                pythonScript, 
                'vision', 
                prompt, 
                imageUrl,
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    resolve(dataString);
                }
            });
        });
    });
}

async function flashChat(prompt, language = 'en', context = '', imageUri = null) {
    console.log('aiService - Flash Chat:', {
        prompt,
        language,
        contextLength: context?.length || 0,
        contextPreview: context?.substring(0, 200) + '...',
        hasImage: !!imageUri
    });

    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const options = JSON.stringify({ language, context });
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'flash',
                prompt,
                imageUri, // Pass the image URI
                options
            ]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    console.error('Parse error:', error, 'Raw data:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeBiome(location, coordinates, language = 'en') {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const options = JSON.stringify({
                language,
                type: 'biome_analysis',
                coordinates
            });
            
            const prompt = `Location: ${location}\nCoordinates: ${coordinates.latitude}, ${coordinates.longitude}`;
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'biome',
                prompt,
                'null',  // no image
                options
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyze_weather(prompt, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending weather analysis request:', {
                prompt: prompt.substring(0, 100) + '...',
                options
            });
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'weather',
                prompt,
                'null',  // Add this placeholder for image parameter
                JSON.stringify(options)  // Pass options as the last parameter
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    // Find the last JSON object in the output
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/g);
                    if (jsonMatch) {
                        const lastJson = jsonMatch[jsonMatch.length - 1];
                        const response = JSON.parse(lastJson);
                        if (response.success) {
                            resolve(response.text);
                        } else {
                            reject(new Error(response.error));
                        }
                    } else {
                        reject(new Error('No valid JSON found in Python response'));
                    }
                } catch (error) {
                    console.error('Failed to parse Python response:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeInfo(prompt, options = {}) {
    console.log('aiService.analyzeInfo called with:', {
        prompt,
        options
    });
    
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = JSON.stringify(options);
            console.log('aiService sending options to Python:', optionsStr);
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'info',
                prompt,
                'null',  // no image
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function generateScenarios(locationInfo, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = JSON.stringify(options);
            console.log('aiService generating scenarios for location:', locationInfo);
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'scenarios',
                locationInfo,
                'null',  // no image
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function gameSetup(settings, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            // Clean and prepare the settings object with minimal data
            const cleanSettings = {
                datetime: settings.datetime ? new Date(settings.datetime).toISOString() : new Date().toISOString(),
                location: {
                    name: settings.location?.name || 'Unknown',
                    coordinates: {
                        latitude: Number(settings.location?.coordinates?.latitude || 0),
                        longitude: Number(settings.location?.coordinates?.longitude || 0)
                    },
                    elevation: Number(settings.elevation || 0)
                },
                weather: {
                    current: {
                        temp: settings.weather?.currentWeather?.main?.temp || 20,
                        humidity: settings.weather?.currentWeather?.main?.humidity || 50,
                        visibility: settings.weather?.currentWeather?.visibility || 10000,
                        wind: {
                            speed: settings.weather?.currentWeather?.wind?.speed || 0,
                            deg: settings.weather?.currentWeather?.wind?.deg || 0
                        },
                        condition: settings.weather?.currentWeather?.weather?.[0]?.main || 'Clear',
                        description: settings.weather?.currentWeather?.weather?.[0]?.description || 'Clear sky'
                    }
                },
                // Simplify difficulty to just the level string
                difficulty: settings.difficulty?.level || 'normal',
                scenario: settings.scenario || 'forest',
                language: settings.language || 'en'
            };

            console.log('aiService sending game setup request:', JSON.stringify(cleanSettings));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_setup',
                JSON.stringify(cleanSettings),
                'null',  // no image
                JSON.stringify(options)
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error || 'Unknown error in game setup'));
                    }
                } catch (error) {
                    console.error('Parse error:', error, 'Raw data:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

module.exports = {
    generateContent,
    generateContentStream,
    searchAndGenerate,
    analyzeImage,
    flashChat,
    analyzeBiome,
    analyze_weather,
    analyzeInfo,
    generateScenarios,
    gameSetup
}; 