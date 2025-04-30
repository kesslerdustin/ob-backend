const { spawn } = require('child_process');
const path = require('path');
const rateLimiter = require('./rateLimiter');

async function generateContent(prompt, context = '') {
    return rateLimiter.enqueue('chat', () => {
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
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate summary'));
                        return;
                    }
                    
                    // Pass through the entire response object
                    resolve(response);  // Changed from response.text
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error('Failed to parse response'));
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
    return rateLimiter.enqueue('chat', () => {
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
    return rateLimiter.enqueue('vision', async () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = typeof options === 'string' ? options : JSON.stringify(options);
            console.log('Analyzing image:', {
                prompt,
                imageUrl,
                options: optionsStr
            });
            
            const pythonProcess = spawn('python', [
                pythonScript, 
                'vision', 
                prompt, 
                imageUrl,
                optionsStr
            ]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
                errorString += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('Process error:', errorString);
                    reject(new Error(`Failed to analyze image: ${errorString}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Analysis failed'));
                        return;
                    }

                    // Parse the inner text as JSON if it's a string
                    let parsedText = response.text;
                    if (typeof response.text === 'string') {
                        try {
                            parsedText = JSON.parse(response.text);
                        } catch (e) {
                            console.warn('Could not parse inner text as JSON:', e);
                        }
                    }

                    resolve(parsedText);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse analysis response'));
                }
            });
        });
    });
}

async function flashChat(prompt, language = 'en', context = '', imagePath = null) {
    return rateLimiter.enqueue('chat', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const options = JSON.stringify({ language, context });
            
            console.log('Executing flash chat with:', {
                prompt,
                language,
                contextLength: context?.length || 0,
                hasImage: !!imagePath
            });

            const pythonProcess = spawn('python', [
                pythonScript,
                'flash',
                prompt,
                imagePath || 'NONE',
                options
            ]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
                errorString += data.toString();
            });

            pythonProcess.on('close', (code) => {
                // Log the raw response BEFORE trying to parse it
                console.log('Raw flashChat response from Python:\n--START--\n', dataString, '\n--END--');
                if (code !== 0) {
                    reject(new Error(`Process failed: ${errorString}`));
                    return;
                }

                try {
                    const response = JSON.parse(dataString);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate response'));
                        return;
                    }
                    resolve(response.text);
                } catch (error) {
                    // Log the parsing error along with the raw data
                    console.error('Flash chat parse error:', error);
                    console.error('Raw data causing parse error:', dataString);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function analyzeBiome(location, coordinates, language = 'en') {
    return rateLimiter.enqueue('analysis', () => {
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
    return rateLimiter.enqueue('analysis', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            let retryCount = 0;
            const maxRetries = 3;
            
            const tryGenerate = () => {
                console.log(`Weather analysis attempt ${retryCount + 1}/${maxRetries}`);
                
                const pythonProcess = spawn('python', [
                    pythonScript,
                    'weather',
                    prompt,
                    'null',
                    JSON.stringify(options)
                ]);

                let dataString = '';
                let errorString = '';

                pythonProcess.stdout.on('data', (data) => {
                    dataString += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    console.error(`Python Error: ${data}`);
                    errorString += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code !== 0) {
                        const error = new Error(`Process failed: ${errorString}`);
                        handleError(error);
                        return;
                    }

                    try {
                        // Check if response contains overload error
                        if (dataString.includes('503 UNAVAILABLE') || 
                            dataString.includes('overloaded')) {
                            throw new Error('Model overloaded');
                        }

                        // Try to parse JSON response
                        const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) {
                            throw new Error('Invalid response format');
                        }
                        
                        const response = JSON.parse(jsonMatch[0]);
                        if (!response.success) {
                            throw new Error(response.error || 'Failed to analyze weather');
                        }
                        
                        resolve(response.text);
                    } catch (error) {
                        handleError(error);
                    }
                });
            };

            const handleError = (error) => {
                console.error(`Attempt ${retryCount + 1} failed:`, error.message);
                
                if (error.message.includes('overloaded') && retryCount < maxRetries) {
                    retryCount++;
                    // Exponential backoff: 2s, 4s, 8s
                    const delay = Math.pow(2, retryCount) * 1000;
                    console.log(`Retrying in ${delay/1000} seconds...`);
                    setTimeout(tryGenerate, delay);
                } else {
                    reject(new Error('Weather analysis failed after retries'));
                }
            };

            // Start first attempt
            tryGenerate();
        });
    });
}

async function analyzeInfo(prompt, options = {}) {
    console.log('aiService.analyzeInfo called with:', {
        prompt,
        options
    });
    
    return rateLimiter.enqueue('analysis', () => {
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

async function generateScenarios(location, options = {}) {
    return rateLimiter.enqueue('game', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('Generating scenarios:', {
                location,
                options
            });

            const pythonProcess = spawn('python', [
                pythonScript,
                'scenarios',
                JSON.stringify(location),
                'null',
                JSON.stringify(options)
            ]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
                errorString += data.toString();
            });

            pythonProcess.on('close', (code) => {
                // Log the raw response BEFORE trying to parse it
                console.log('Raw generateScenarios response from Python:\n--START--\n', dataString, '\n--END--');
                if (code !== 0) {
                    reject(new Error(`Process failed: ${errorString}`));
                    return;
                }

                try {
                    const response = JSON.parse(dataString);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate scenarios'));
                        return;
                    }
                    resolve(response.text);
                } catch (error) {
                    // Log the parsing error along with the raw data
                    console.error('Scenario generation parse error:', error);
                    console.error('Raw data causing parse error:', dataString);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function gameSetup(settings, options = {}) {
    console.log('AI Service gameSetup - Language:', settings.language, 'Options:', options);
    
    return rateLimiter.enqueue('game', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            // Clean and prepare the settings object
            const cleanSettings = {
                settings: {
                    datetime: settings.settings.datetime,
                    location: {
                        name: settings.settings.location?.name || 'Unknown',
                        coordinates: {
                            latitude: Number(settings.settings.location?.coordinates?.latitude || 0),
                            longitude: Number(settings.settings.location?.coordinates?.longitude || 0)
                        },
                        elevation: Number(settings.settings.location?.elevation || 0)
                    },
                    weather: settings.settings.weather,
                    difficulty: settings.settings.difficulty,
                    scenario: settings.settings.scenario,
                    environmentalContext: settings.settings.environmentalContext,
                    customRules: settings.settings.customRules
                },
                language: settings.language || options.language || 'en'
            };

            console.log('Sending to Python with language:', cleanSettings.language);
            console.log('aiService sending game setup request:', JSON.stringify(cleanSettings));
            console.log('aiService options:', JSON.stringify(options));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_setup',
                JSON.stringify(cleanSettings),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stdout chunk:', chunk);
                dataString += chunk;
            });

            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stderr chunk:', chunk);
                errorString += chunk;
            });

            pythonProcess.on('close', (code) => {
                console.log('Python process closed with code:', code);
                console.log('Final stdout:', dataString);
                console.log('Final stderr:', errorString);
                
                if (code !== 0) {
                    console.error('Python process error:', errorString);
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    // Try to find and parse only the JSON part of the response
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.error('No JSON found in response. Full response:', dataString);
                        throw new Error('No JSON found in response');
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    console.log('Parsed response:', response);
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate game setup'));
                        return;
                    }
                    resolve(response);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function gameMaster(context, options = {}) {
    return rateLimiter.enqueue('game', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending game master request:', JSON.stringify(context));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_master',
                JSON.stringify(context),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stdout:', chunk);
                dataString += chunk;
            });

            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.error('Python stderr:', chunk);
                errorString += chunk;
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('Process exited with code', code);
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.error('No JSON found in response:', dataString);
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to process game turn'));
                        return;
                    }
                    
                    resolve(response.text);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function gameSummary(context, options = {}) {
    return rateLimiter.enqueue('game', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending game summary request:', JSON.stringify(context));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_summary',
                JSON.stringify(context),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString('utf-8');
            });

            pythonProcess.stderr.on('data', (data) => {
                errorString += data.toString('utf-8');
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate summary'));
                        return;
                    }
                    
                    resolve(response);
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function generateQuiz(prompt, options = {}) {
    return rateLimiter.enqueue('quiz', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('Generating quiz:', {
                prompt,
                options
            });

            const pythonProcess = spawn('python', [
                pythonScript,
                'quiz',
                prompt,
                'null',
                JSON.stringify(options)
            ]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
                errorString += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process failed: ${errorString}`));
                    return;
                }

                try {
                    const response = JSON.parse(dataString);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate quiz'));
                        return;
                    }
                    resolve(response.text);
                } catch (error) {
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function checkImageAppropriate(imagePath, options = {}) {
    return rateLimiter.enqueue('vision', () => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('Checking image appropriateness:', {
                imagePath,
                options
            });

            const pythonProcess = spawn('python', [
                pythonScript,
                'check_appropriate',
                'null',
                imagePath,
                JSON.stringify(options)
            ]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
                errorString += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process failed: ${errorString}`));
                    return;
                }

                try {
                    const response = JSON.parse(dataString);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to check image'));
                        return;
                    }
                    resolve(response);
                } catch (error) {
                    reject(new Error('Failed to parse response'));
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
    gameSetup,
    gameMaster,
    gameSummary,
    generateQuiz,
    checkImageAppropriate
}; 